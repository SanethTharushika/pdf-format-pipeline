import express from "express";
import multer from "multer";
import cors from "cors";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractLines, processLines } from "./core/pipeline.js";
import { ocrImage } from "./core/ocr.js";
import { renderPagesToImages } from "./core/pdfImages.js";

const app = express();
app.use(cors());
app.set("json spaces", 2); // readable JSON, one item per line

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.post("/api/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Send a file in the 'file' field" });
    }

    const type = req.file.mimetype;
    const isPdf = type === "application/pdf";
    const isImage = ["image/jpeg", "image/png"].includes(type);
    if (!isPdf && !isImage) {
      return res.status(400).json({ error: "Only PDF, JPG or PNG files are allowed" });
    }

    let lines = [];
    let method = "text";

    if (isPdf) {
      // 1. try the normal text layer first (fast and accurate)
      lines = await extractLines(pdfjsLib, new Uint8Array(req.file.buffer));

      // 2. no text found, so it's an image-only PDF: render pages and OCR them
      if (lines.length === 0) {
        method = "ocr";
        const images = await renderPagesToImages(
          pdfjsLib,
          new Uint8Array(req.file.buffer)
        );
        for (const img of images) {
          lines.push(...(await ocrImage(img)));
        }
      }
    } else {
      method = "ocr";
      lines = await ocrImage(req.file.buffer);
    }

    if (lines.length === 0) {
      return res.status(422).json({ error: "No readable text found in this file" });
    }

    const { fields, missing, pairs } = processLines(lines);
    const response = { success: true, method, data: fields, missing };

    if (req.query.debug) {
      response.pairs = pairs; // every label:value found (stage 1)
      response.lines = lines; // raw lines
    }

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Could not process this file",
      detail: req.query.debug ? String(err.stack || err) : undefined,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));