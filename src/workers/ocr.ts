import { childSend, Job } from "bullmq";
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises'
import path from 'node:path'
import { EOL } from 'node:os';
import naturalCompare from "string-natural-compare";
// import { storingQueue } from "../queue";
import { redis } from "../client";
/**
 * OCR worker
 *
 * This worker is responsible for scanning OCR
 *
 */
const documentRegex =
    /(điểm\s([a-z]|\u0111)\s)*(khoản\s(\d+)\s)*(Điều\s(\d+)\s)*((Nghị quyết|Nghị định|Thông tư|Thông tư liên tịch|Quyết định|Luật|Luật Tổ chức Quốc hội|Tờ trình|Báo cáo thẩm tra|Báo cáo)\ssố\s)*\d{2,5}(\/\d*)*(\/|-)([A-Za-z]*(Đ)*[A-Za-z]*(-|\/)*)+(\d*)(,|\s)/g;

export default async function (
    job: Job<{ tempDir: string; pdfFile: string; fileHash: string }>,
) {
    await job.log("Start processing job");
    await job.log(`Storing files into folder ${job.data.tempDir}`);
    await job.log('Starting ghostscripts')
    // PDF to image(s)
    await new Promise<void>((res, rej) => {
        const ghostScriptProcess = spawn(
            "gs",
            [
                "-q",
                "-sDEVICE=png16m",
                "-o",
                `${job.data.tempDir}/%d.png`,
                "-r300",
                job.data.pdfFile,
            ],
            { stdio: ['ignore', "ignore", "pipe"] },
        );

        ghostScriptProcess.on('exit', () => { res(); })
        ghostScriptProcess.stderr.on('data', (data) => {
            rej(data);
        })
    });
    await job.log('Finished ghostscripts')

    const imagesFiles = (await fs.readdir(job.data.tempDir)).filter((file) => file !== 'file.pdf').sort(naturalCompare).join(EOL);
    await fs.writeFile(path.join(job.data.tempDir, 'imageFiles.txt'), imagesFiles);

    await job.log('Starting OCR');
    const ocrText = await new Promise<string>((res, rej) => {
        let ocrTexts = String()
        const tesseractProcess = spawn("tesseract", [
            "imageFiles.txt",
            "-",
            "-l",
            "vie",
            "quiet",
            "stdout"
        ],
        {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: job.data.tempDir,
        });

        tesseractProcess.stderr.on('data', (data) => {
            rej(data);
        });

        tesseractProcess.stdout.on('data', (data: string) => {
            ocrTexts += data;
        });

        tesseractProcess.on('exit', () => {
            res(ocrTexts);
        });
    })
    await job.log('Finished OCR');
    // await job.log(`OCR Texts: ${ocrText}`)

    const filteredTexts = ocrText
        .replaceAll(/\n/g, " ")
        .match(documentRegex)
        ?.filter((element) => /[a-zA-Z]/.test(element));
    const uniqueTexts = Array.from(new Set(filteredTexts));


    await fs.rm(job.data.tempDir, { recursive: true, force: true});

    await job.log("Finished");
    await job.log("Add result to storing queue into redis");

    // await storingQueue.add("store", {
    //     fileHash: job.data.fileHash,
    //     result: JSON.stringify(uniqueTexts),
    // });
    await job.log("Starting store job");
    await redis.set(
        `ocr:completed:${job.data.fileHash}`,
        JSON.stringify({ result: uniqueTexts }),
    );
}
