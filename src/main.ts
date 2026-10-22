import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { openCamera, takePicture } from "./camera";
import { type Dish, findDishes } from "./dishes";
import { type DishInfo, lookUpDish } from "./images";

// Check for a new version at every launch, and reload into it as soon as it's downloaded,
// rather than running the saved old version until the app is next opened.
registerSW({ immediate: true });

// Loaded separately, since the OCR library bundles OpenCV and is over 10 MB.
const ocr = import("./ocr");

/**
 * Captured frames are scaled down to this many pixels on their longest side, to keep OCR fast.
 * The OCR reads text at the size it's given, so scaling down much further makes small print unreadable.
 */
const MAX_FRAME_SIZE = 2048;

function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const camera = element<HTMLVideoElement>("camera");
const frame = element<HTMLCanvasElement>("frame");
const overlay = element<HTMLDivElement>("overlay");
const status = element<HTMLParagraphElement>("status");
const results = element<HTMLElement>("results");
const dishList = element<HTMLUListElement>("dish-list");
const capture = element<HTMLButtonElement>("capture");
const retake = element<HTMLButtonElement>("retake");
const upload = element<HTMLInputElement>("upload");
const details = element<HTMLDialogElement>("details");

let scanId = 0;
let stream: MediaStream | undefined;

function setStatus(text: string) {
  status.textContent = text;
  status.hidden = !text;
}

async function startCamera() {
  try {
    stream = await openCamera();
    camera.srcObject = stream;
    setStatus("");
  } catch (error) {
    console.error(error);
    setStatus('Camera unavailable. Use "Photo" to pick a picture of a menu instead.');
    capture.disabled = true;
  }
}

function showLive() {
  scanId++;
  frame.hidden = true;
  camera.hidden = false;
  overlay.replaceChildren();
  dishList.replaceChildren();
  results.hidden = true;
  retake.hidden = true;
  capture.hidden = false;
  setStatus("");
}

/** Draws `source` onto the frame canvas, scaled down to at most `MAX_FRAME_SIZE`, and freezes the view on it. */
function freeze(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, MAX_FRAME_SIZE / Math.max(width, height));
  frame.width = Math.round(width * scale);
  frame.height = Math.round(height * scale);
  frame.getContext("2d")?.drawImage(source, 0, 0, frame.width, frame.height);
  frame.hidden = false;
  camera.hidden = true;
  capture.hidden = true;
  retake.hidden = false;
}

async function scan() {
  const id = ++scanId;
  overlay.replaceChildren();
  dishList.replaceChildren();
  setStatus("Reading menu…");
  let dishes: Dish[];
  const start = performance.now();
  try {
    dishes = findDishes(await (await ocr).readText(frame));
  } catch (error) {
    console.error(error);
    setStatus("Could not read the menu. Try again.");
    return;
  }
  if (id !== scanId) {
    return;
  }
  // Shown while we find the best image size for reading small text quickly on real phones.
  const timing = `Read ${frame.width}×${frame.height} in ${((performance.now() - start) / 1000).toFixed(1)} s.`;
  if (dishes.length === 0) {
    setStatus(`No dishes found. Try getting closer or holding the phone steadier. ${timing}`);
    return;
  }
  setStatus(`Found ${dishes.length} dishes. ${timing}`);
  results.hidden = false;
  for (const dish of dishes) {
    showDish(dish, id);
  }
}

/** Adds a marker over `dish` in the frame and a row for it in the list, then fills in its picture. */
function showDish(dish: Dish, id: number) {
  const marker = document.createElement("button");
  marker.className = "marker loading";
  marker.setAttribute("aria-label", dish.name);
  positionMarker(marker, dish);
  overlay.append(marker);

  const row = document.createElement("li");
  const rowButton = document.createElement("button");
  const thumbnail = document.createElement("img");
  thumbnail.alt = "";
  const name = document.createElement("span");
  name.textContent = dish.name;
  rowButton.append(thumbnail, name);
  row.append(rowButton);
  row.className = "loading";
  dishList.append(row);

  lookUpDish(dish.name).then(
    (info) => {
      if (id !== scanId) {
        return;
      }
      marker.classList.remove("loading");
      row.classList.remove("loading");
      if (!info) {
        marker.remove();
        row.classList.add("missing");
        rowButton.addEventListener("click", () => showDetails(dish, undefined));
        return;
      }
      const markerImage = document.createElement("img");
      markerImage.src = info.imageUrl;
      markerImage.alt = "";
      marker.append(markerImage);
      thumbnail.src = info.imageUrl;
      const open = () => showDetails(dish, info);
      marker.addEventListener("click", open);
      rowButton.addEventListener("click", open);
    },
    (error) => {
      console.error(error);
      marker.remove();
      row.classList.replace("loading", "missing");
      rowButton.addEventListener("click", () => showDetails(dish, undefined));
    },
  );
}

/** Width of a marker, which `style.css` sets too. */
const MARKER_SIZE = 44;

/**
 * Places `marker` just right of the dish's line, but still on screen,
 * mapping frame pixels to where the frame is shown.
 */
function positionMarker(marker: HTMLElement, dish: Dish) {
  const rect = frame.getBoundingClientRect();
  const scale = Math.min(rect.width / frame.width, rect.height / frame.height);
  const offsetX = (rect.width - frame.width * scale) / 2;
  const offsetY = (rect.height - frame.height * scale) / 2;
  const { left, top, width, height } = dish.line.box;
  const x = offsetX + (left + width) * scale + 4;
  marker.style.left = `${Math.min(x, rect.width - MARKER_SIZE - 4)}px`;
  marker.style.top = `${offsetY + (top + height / 2) * scale}px`;
}

/** Shows a dish's photo and description, or just its name when no photo was found. */
function showDetails(dish: Dish, info: DishInfo | undefined) {
  const image = element<HTMLImageElement>("details-image");
  const link = element<HTMLAnchorElement>("details-link");
  image.hidden = !info;
  link.hidden = !info;
  if (info) {
    image.src = info.imageUrl;
    link.href = info.pageUrl;
  }
  element<HTMLHeadingElement>("details-title").textContent =
    !info || info.title.toLowerCase() === dish.name.toLowerCase()
      ? (info?.title ?? dish.name)
      : `${dish.name} (${info.title})`;
  element<HTMLParagraphElement>("details-summary").textContent = info?.summary ?? "No photo found.";
  // A search the viewer opens themselves, which needs no API, unlike showing Google's results here.
  element<HTMLAnchorElement>("details-google").href =
    `https://www.google.com/search?${new URLSearchParams({ q: dish.name, udm: "2" })}`;
  details.showModal();
}

capture.addEventListener("click", async () => {
  if (!stream || !camera.videoWidth) {
    return;
  }
  capture.disabled = true;
  try {
    const picture = await takePicture(stream, camera);
    freeze(picture, picture.width, picture.height);
    picture.close();
  } finally {
    capture.disabled = false;
  }
  void scan();
});

retake.addEventListener("click", showLive);

upload.addEventListener("change", async () => {
  const file = upload.files?.[0];
  upload.value = "";
  if (!file) {
    return;
  }
  const image = await createImageBitmap(file);
  freeze(image, image.width, image.height);
  image.close();
  void scan();
});

details.addEventListener("click", (event) => {
  if (event.target === details) {
    details.close(); // tapped the backdrop
  }
});

void startCamera();
ocr
  .then(({ loadOcr }) => loadOcr())
  .catch((error) => {
    console.error(error);
    setStatus("Could not load the text reader. Check your connection and reload.");
  });
