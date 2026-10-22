# menu-images-app

Point your phone camera at a menu and see pictures of the dishes,
like Google Translate's camera mode but for food photos.

It's a PWA (a web app you can add to your home screen), so it works on both iPhone and Android
with no app store, Mac, or Apple account.
If the web version turns out to be too limited, the fallback is a Flutter app.

## How it works

1. Tap the shutter (or pick a photo) to freeze a frame of the menu.
2. PaddleOCR (PP-OCRv4, via `@gutenye/ocr-browser` and ONNX Runtime Web) reads the text on the phone itself.
3. `src/dishes.ts` drops prices, section headers, and descriptions, keeping the dish names.
4. `src/images.ts` finds a photo of each dish:
   its Wikipedia article's photo, else a Wikimedia Commons photo search,
   then both again with words like "House" or "Grandma's" left out.
   No API key or server needed.
5. A photo appears next to each dish and in a list; tap one for a bigger photo and a description.

The OCR models and runtime (about 30 MB) download the first time, then stay cached, so scanning works offline.

## Setup

```sh
mise install
npm install
pre-commit install
```

`npm install` also copies the OCR models and runtime into `public/` (`scripts/copy-assets.js`).

- `npm run dev`: serve locally (`--host`, so a phone on the same Wi-Fi can open it;
  the camera needs HTTPS there, so use "Photo" or the deployed site).
- `npm run check`: type-check with `tsrs` and lint/format-check with `biome`.
- `npm run build`: build into `dist/`.

CI runs the checks and deploys `main` to GitHub Pages.

## Plans

- Live mode: scan continuously instead of on tap, like Translate.
- A real image search API behind a small server, if Wikipedia and Commons miss too many dishes.
