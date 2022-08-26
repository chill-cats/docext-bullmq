import { Queue, Worker, Job } from "bullmq";
import express from "express";
import { connection, redis } from "./client";
import multer from "multer";
import hasha from "hasha";
import { ocrQueue, ocrQueueName } from "./queue";
import path from 'node:path';
import fs from "node:fs/promises";
import os from 'node:os';

const CPU_CORE_COUNT = os.cpus().length

const expressApp = express();


const ocrWorker = new Worker<{ document: string }>(
    ocrQueueName,
    `${__dirname}/workers/ocr.ts`,
    {
        connection,
        concurrency: CPU_CORE_COUNT,
    },
);

const fileUploadMiddleware = multer().single("document");

expressApp.post('/submit', fileUploadMiddleware, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status: 'ERROR', error: "document file is required" });
    }
    console.log("Recieved a file");

    if (req.file.mimetype !== 'application/pdf') { // file is not pdf
        console.log("File is not pdf!");
        return res.status(400).json({ status: 'ERROR', error: "document file must be a PDF" });
    }

    const tempDir = await fs.mkdtemp(await fs.realpath(os.tmpdir()) + path.sep);
    const tempPDFFilePath = path.join(tempDir, "file.pdf");
    const fileHash = await hasha.async(req.file.buffer, { algorithm: "sha1" });

    // check if redis has result
    const result = await redis.get(`ocr:completed:${fileHash}`);
    if (result) {
        const resultJson = JSON.parse(result);
        return res.status(200).json({ status: 'COMPLETED', documentId: fileHash, result: resultJson.result});
    }

    await fs.writeFile(tempPDFFilePath, req.file.buffer);
    await ocrQueue.add(
        "processing",
        {
            tempDir,
            pdfFile: tempPDFFilePath,
            fileHash,
        },
        { jobId: fileHash, removeOnComplete: true },
    );

    console.log("Added file with hash: ", fileHash);

    return res.status(202).json({ status: 'PENDING', documentId: fileHash });
});

expressApp.get('/query/:id', async (req, res) => {
    // first check in redis if the document is already in cache 
    const documentId = req.params.id;
    const result = await redis.get(`ocr:completed:${documentId}`);
    if (result) {
        const resultJson = JSON.parse(result)
        return res
            .status(200)
            .send({ status: "COMPLETED", result: resultJson.result });
    }

    // if the result is not in redis, then check in queue
    const ocrJob = await ocrQueue.getJob(documentId);
    if (!ocrJob) {
        return res.status(404).send({ status: "NOT_FOUND" });
    }

    if (await ocrJob.isFailed()) {
        const failReason = ocrJob.failedReason;
        return res.status(200).send({ status: "FAILED", failReason });
    }

    if (!(await ocrJob.isCompleted())) {
        return res.status(200).send({ status: "PENDING" });
    }

    res.status(500).send({ status: 'ERROR' })
});

expressApp.listen(2510, () => console.log("I'm sorry!🥺🥺🥺🥺🥺"));