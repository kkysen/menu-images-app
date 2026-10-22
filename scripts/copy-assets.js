// Copies the OCR models and ONNX Runtime WebAssembly files into `public/`,
// since neither package exports them in a way Vite can import.

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nodeModules = join(root, "node_modules");

const copies = {
  models: [
    join(nodeModules, "@gutenye/ocr-models/assets/ch_PP-OCRv4_det_infer.onnx"),
    join(nodeModules, "@gutenye/ocr-models/assets/ch_PP-OCRv4_rec_infer.onnx"),
    join(nodeModules, "@gutenye/ocr-models/assets/ppocr_keys_v1.txt"),
  ],
  ort: [
    join(nodeModules, "onnxruntime-web/dist/ort-wasm-simd-threaded.mjs"),
    join(nodeModules, "onnxruntime-web/dist/ort-wasm-simd-threaded.wasm"),
  ],
};

for (const [dir, files] of Object.entries(copies)) {
  const outDir = join(root, "public", dir);
  mkdirSync(outDir, { recursive: true });
  for (const file of files) {
    copyFileSync(file, join(outDir, file.split("/").pop()));
  }
}
