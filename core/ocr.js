import { createWorker } from "tesseract.js";

let workerPromise;
function getWorker() {
  // create once and reuse, because starting OCR is slow
  return (workerPromise ||= createWorker("eng"));
}

export async function ocrImage(buffer) {
  const worker = await getWorker();
  const { data } = await worker.recognize(buffer);
  return data.text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}