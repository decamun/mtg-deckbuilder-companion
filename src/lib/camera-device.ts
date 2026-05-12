/**
 * getUserMedia helpers: autofocus / constraint fallbacks for card scanning.
 * focusMode is not in all TypeScript DOM lib versions but is supported on many mobile cameras.
 */

type VideoConstraintCompat = MediaTrackConstraints & {
  focusMode?: ConstrainDOMString
}

const BASE_VIDEO: VideoConstraintCompat = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
}

function videoWithAutofocus(): VideoConstraintCompat {
  return {
    ...BASE_VIDEO,
    focusMode: { ideal: "continuous" },
  }
}

export async function openCardCameraStream(): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: videoWithAutofocus() as MediaTrackConstraints },
    { audio: false, video: BASE_VIDEO as MediaTrackConstraints },
    { audio: false, video: { facingMode: { ideal: "environment" } } },
  ]
  let last: unknown
  for (const c of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(c)
    } catch (e) {
      last = e
    }
  }
  throw last
}

export type AutofocusApplyResult = "continuous" | "single-shot" | "unchanged" | "unsupported"

/**
 * Prefer continuous CAF when the device exposes it; otherwise try single-shot.
 */
export async function applyPreferredAutofocus(stream: MediaStream): Promise<AutofocusApplyResult> {
  const track = stream.getVideoTracks()[0]
  if (!track?.applyConstraints) return "unsupported"

  const caps = track.getCapabilities?.() as MediaTrackCapabilities & { focusMode?: string[] }
  const modes = caps?.focusMode
  if (!modes?.length) return "unsupported"

  try {
    if (modes.includes("continuous")) {
      await track.applyConstraints({ focusMode: "continuous" } as MediaTrackConstraints)
      return "continuous"
    }
    if (modes.includes("single-shot")) {
      await track.applyConstraints({ focusMode: "single-shot" } as MediaTrackConstraints)
      return "single-shot"
    }
  } catch {
    /* device rejected focus constraint */
  }
  return "unchanged"
}

/**
 * Fire a focus cycle before grabbing a frame (helps when continuous AF is weak or unset).
 */
export async function nudgeAutofocusBeforeCapture(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0]
  if (!track?.applyConstraints) return

  const caps = track.getCapabilities?.() as MediaTrackCapabilities & { focusMode?: string[] }
  const modes = caps?.focusMode
  if (!modes?.length) return

  try {
    if (modes.includes("single-shot")) {
      await track.applyConstraints({ focusMode: "single-shot" } as MediaTrackConstraints)
      return
    }
    if (modes.includes("continuous")) {
      await track.applyConstraints({ focusMode: "continuous" } as MediaTrackConstraints)
    }
  } catch {
    /* ignore */
  }
}

export function describeCameraFocusCapabilities(stream: MediaStream | null): string {
  const track = stream?.getVideoTracks()[0]
  if (!track?.getCapabilities) return "—"
  const caps = track.getCapabilities() as MediaTrackCapabilities & { focusMode?: string[] }
  const modes = caps.focusMode
  if (!modes?.length) return "focusMode not listed (desktop or older driver)"
  return modes.join(", ")
}

export function readCameraFocusSetting(stream: MediaStream | null): string {
  const track = stream?.getVideoTracks()[0]
  if (!track?.getSettings) return "—"
  const s = track.getSettings() as MediaTrackSettings & { focusMode?: string }
  return s.focusMode ?? "—"
}
