import { useEffect, useState, type RefObject } from "react";

export function useVideoClock(ref: RefObject<HTMLVideoElement | null>) {
  const [time, setTime] = useState<number | null>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let frame: number | undefined;
    let animation: number | undefined;
    const sync = () => setTime(video.currentTime);
    const stop = () => {
      if (frame !== undefined) video.cancelVideoFrameCallback(frame);
      if (animation !== undefined) cancelAnimationFrame(animation);
      frame = undefined;
      animation = undefined;
    };
    const tick = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      setTime(metadata.mediaTime);
      if (!video.paused && !video.ended) frame = video.requestVideoFrameCallback(tick);
    };
    const fallback = () => {
      sync();
      if (!video.paused && !video.ended) animation = requestAnimationFrame(fallback);
    };
    const start = () => {
      stop();
      sync();
      if (typeof video.requestVideoFrameCallback === "function") {
        frame = video.requestVideoFrameCallback(tick);
      } else {
        animation = requestAnimationFrame(fallback);
      }
    };
    const pause = () => { stop(); sync(); };
    video.addEventListener("playing", start);
    video.addEventListener("pause", pause);
    video.addEventListener("ended", pause);
    video.addEventListener("seeked", sync);
    video.addEventListener("loadedmetadata", sync);
    sync();
    if (!video.paused) start();
    return () => {
      stop();
      video.removeEventListener("playing", start);
      video.removeEventListener("pause", pause);
      video.removeEventListener("ended", pause);
      video.removeEventListener("seeked", sync);
      video.removeEventListener("loadedmetadata", sync);
    };
  }, [ref]);
  return time;
}
