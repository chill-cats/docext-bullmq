import { Queue } from "bullmq"
import { connection } from "./client"

export const ocrQueueName = 'ocr'
export const ocrQueue = new Queue(ocrQueueName, { connection });

// export const storingQueueName = 'storing';
// export const storingQueue = new Queue(storingQueueName, { connection });