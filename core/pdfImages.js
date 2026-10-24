import { createCanvas } from "@napi-rs/canvas";

// Tells PDF.js how to create canvases (used for the page and for inline images)
class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

// Draw each PDF page into a PNG image so OCR can read it
export async function renderPagesToImages(pdfjsLib, data, scale = 3) {
  const pdf = await pdfjsLib.getDocument({
    data,
    CanvasFactory: NodeCanvasFactory,
  }).promise;
  const images = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height)
    );
    const context = canvas.getContext("2d");

    // white background, so transparent areas don't turn black for OCR
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport }).promise;
    images.push(canvas.toBuffer("image/png"));
  }
  return images;
}