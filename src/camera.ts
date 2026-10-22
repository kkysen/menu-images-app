/**
 * Camera features Chrome on Android has but TypeScript's DOM types don't:
 * focus modes, and `ImageCapture` for taking a full-resolution photo.
 */
type FocusCapabilities = MediaTrackCapabilities & { focusMode?: string[] };
type FocusConstraints = MediaTrackConstraintSet & { focusMode?: string };
type FocusSettings = MediaTrackSettings & { focusMode?: string };
type ImageCaptureConstructor = new (
  track: MediaStreamTrack,
) => {
  takePhoto(): Promise<Blob>;
};

/** Asks for the sharpest video the camera has, so small text is still readable. */
const RESOLUTION = { width: { ideal: 3840 }, height: { ideal: 2160 } };

/**
 * Opens the phone's main back camera.
 * Asking for just the back camera often gets a phone's ultrawide instead,
 * which on many phones (e.g. Samsung's) has fixed focus, so it's blurry up close.
 */
export async function openCamera(): Promise<MediaStream> {
  const backCamera = { facingMode: "environment", ...RESOLUTION };
  let stream = await getVideo(backCamera);
  // Camera labels are only readable once the camera's been allowed, so look after opening one.
  const main = await findMainBackCamera();
  const [track] = stream.getVideoTracks();
  if (main && track && track.getSettings().deviceId !== main.deviceId) {
    stopStream(stream);
    try {
      stream = await getVideo({ deviceId: { exact: main.deviceId }, ...RESOLUTION });
    } catch (error) {
      // Android may not have let go of the camera just closed yet, so give it a moment.
      console.warn("Could not open the main camera, so retrying", error);
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        stream = await getVideo({ deviceId: { exact: main.deviceId }, ...RESOLUTION });
      } catch (error) {
        // A blurry camera beats none at all.
        console.warn("Could not open the main camera, so using the default one", error);
        stream = await getVideo(backCamera);
      }
    }
  }
  const [newTrack] = stream.getVideoTracks();
  if (newTrack) {
    await enableAutofocus(newTrack);
  }
  return stream;
}

function getVideo(video: MediaTrackConstraints): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

/**
 * Chrome on Android labels cameras like `camera2 0, facing back`,
 * and the main back camera has the lowest number.
 * Elsewhere (e.g. iPhones), labels differ, so leave the choice to `facingMode`.
 */
async function findMainBackCamera(): Promise<MediaDeviceInfo | undefined> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  let best: { device: MediaDeviceInfo; number: number } | undefined;
  for (const device of devices) {
    const match = /^camera2 (\d+), facing back$/.exec(device.label);
    if (device.kind !== "videoinput" || !match) {
      continue;
    }
    const number = Number(match[1]);
    if (!best || number < best.number) {
      best = { device, number };
    }
  }
  return best?.device;
}

/** Describes the open camera, e.g. `camera2 0, facing back · 3840×2160 · focus continuous`. */
export function describeCamera(stream: MediaStream): string {
  const [track] = stream.getVideoTracks();
  if (!track) {
    return "no camera";
  }
  const settings: FocusSettings = track.getSettings();
  return [
    track.label || "camera",
    `${settings.width}×${settings.height}`,
    `focus ${settings.focusMode ?? "unknown"}`,
  ].join(" · ");
}

async function enableAutofocus(track: MediaStreamTrack) {
  const capabilities = track.getCapabilities?.() as FocusCapabilities | undefined;
  if (!capabilities?.focusMode?.includes("continuous")) {
    return;
  }
  const focus: FocusConstraints = { focusMode: "continuous" };
  try {
    await track.applyConstraints({ advanced: [focus] });
  } catch (error) {
    console.warn("Could not turn on autofocus", error);
  }
}

/**
 * Takes a full-resolution photo where the browser can (Chrome on Android),
 * which is sharper than a frame of the video; elsewhere, uses the current frame.
 */
export async function takePicture(
  stream: MediaStream,
  video: HTMLVideoElement,
): Promise<ImageBitmap> {
  const ImageCapture = (window as { ImageCapture?: ImageCaptureConstructor }).ImageCapture;
  const [track] = stream.getVideoTracks();
  if (ImageCapture && track) {
    try {
      return await createImageBitmap(await new ImageCapture(track).takePhoto());
    } catch (error) {
      console.warn("Could not take a photo, so using a video frame instead", error);
    }
  }
  return await createImageBitmap(video);
}
