import Ocr from "@gutenye/ocr-browser";
import { env } from "onnxruntime-web";

// Absolute, since ONNX Runtime resolves a relative path against its own script in `assets/`.
const base = new URL(import.meta.env.BASE_URL, document.baseURI).href;

env.wasm.wasmPaths = `${base}ort/`;

/** A line of text found in an image, with its bounding box in that image's pixels. */
export type TextLine = {
  text: string;
  confidence: number;
  box: { left: number; top: number; width: number; height: number };
};

let ocrPromise: Promise<Ocr> | undefined;

/** Loads the OCR models; the first call downloads about 16 MB, later ones are cached. */
export function loadOcr(): Promise<Ocr> {
  ocrPromise ??= Ocr.create({
    models: {
      detectionPath: `${base}models/ch_PP-OCRv4_det_infer.onnx`,
      recognitionPath: `${base}models/ch_PP-OCRv4_rec_infer.onnx`,
      dictionaryPath: `${base}models/ppocr_keys_v1.txt`,
    },
  });
  return ocrPromise;
}

/** Gets `canvas`'s 2D context, which only fails if it already has a different kind. */
export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas has no 2D context");
  }
  return context;
}

/** Finds the lines of text in `canvas`. */
export async function readText(canvas: HTMLCanvasElement): Promise<TextLine[]> {
  const ocr = await loadOcr();
  const { width, height } = canvas;
  const { data } = context2d(canvas).getImageData(0, 0, width, height);
  const { texts, resizedImageWidth, resizedImageHeight } = await ocr.detect({
    data,
    width,
    height,
  });
  // Boxes come back in the coordinates of the image the model resized internally.
  const scaleX = width / resizedImageWidth;
  const scaleY = height / resizedImageHeight;
  return texts.flatMap(({ text, mean, box }) => {
    if (!box) {
      return [];
    }
    const xs = box.map(([x = 0]) => x * scaleX);
    const ys = box.map(([, y = 0]) => y * scaleY);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return [
      {
        text: text.trim(),
        confidence: mean,
        box: { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top },
      },
    ];
  });
}
