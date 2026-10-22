import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Relative, so the same build works at a domain root or under a GitHub Pages repo path.
  base: "./",
  // The OCR chunk bundles OpenCV, which can't be split, so only warn about chunks bigger than it.
  resolve: {
    // Just ONNX Runtime's WebAssembly (CPU) backend, which `scripts/copy-assets.js` copies:
    // the default build also has WebGPU, which needs a different, larger WebAssembly file.
    alias: [{ find: /^onnxruntime-web$/, replacement: "onnxruntime-web/wasm" }],
  },
  build: { chunkSizeWarningLimit: 12 * 1024 },
  plugins: [
    latin1JsClipper(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Menu Images",
        short_name: "Menu Images",
        description: "Point your camera at a menu and see pictures of the dishes.",
        display: "standalone",
        orientation: "portrait",
        background_color: "#111111",
        theme_color: "#111111",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        // The OCR script bundles OpenCV, so it's over the 2 MiB default; precache it anyway, for offline use.
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        // The OCR models and runtime are too big to precache, so cache them the first time they load.
        runtimeCaching: [
          {
            urlPattern: /\/(models|ort)\//,
            handler: "CacheFirst",
            options: { cacheName: "ocr-assets" },
          },
          {
            urlPattern: /^https:\/\/(en\.wikipedia\.org|commons\.wikimedia\.org|upload\.wikimedia\.org)\//,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "dish-info",
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});

/**
 * Loads `js-clipper`, which the OCR library uses, as Latin-1:
 * a comment in it has Latin-1 superscripts, which aren't valid UTF-8, so the bundler can't read it.
 */
function latin1JsClipper(): Plugin {
  return {
    name: "latin1-js-clipper",
    enforce: "pre",
    load(id) {
      if (id.endsWith("/js-clipper/clipper.js")) {
        return readFileSync(id, "latin1");
      }
      return undefined;
    },
  };
}
