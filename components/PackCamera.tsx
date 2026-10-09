"use client";

// Live camera for adding a pack: opens the back camera straight away, takes the front of
// the pack, then the back. Falls back to the photo pickers (PhotoBox) when the browser can't
// open the camera: permission denied, no camera, or the page isn't on https / localhost.

import { useEffect, useRef, useState } from "react";
import { shrinkPhoto, shrinkSource } from "@/lib/image";
import { PhotoBox, type Photo } from "./PhotoBox";
import { CameraIcon, Spinner, btnPrimary } from "./ui";

type Side = "front" | "back";
const LABEL: Record<Side, string> = { front: "Front of the pack", back: "Back of the pack (expiry and MRP)" };

export function PackCamera({
  front,
  back,
  onFront,
  onBack,
}: {
  front: Photo | null;
  back: Photo | null;
  onFront: (p: Photo | null) => void;
  onBack: (p: Photo | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"starting" | "live" | "unavailable">("starting");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const side: Side | null = !front ? "front" : !back ? "back" : null;
  const setPhoto = (s: Side, p: Photo | null) => (s === "front" ? onFront(p) : onBack(p));

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Camera is on while a side still needs a photo, off once both are taken.
  useEffect(() => {
    if (!side) {
      stopCamera();
      setStatus("starting");
      return;
    }
    if (streamRef.current || status === "unavailable") return;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          window.isSecureContext
            ? "This browser can't open the camera. Use the photo buttons."
            : "The camera only opens on a secure (https) page. Use the photo buttons.",
        );
        setStatus("unavailable");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus("live");
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in the browser settings, or use the photo buttons."
            : name === "NotFoundError"
              ? "No camera found on this device. Use the photo buttons."
              : "Couldn't open the camera. Use the photo buttons.",
        );
        setStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [side, status]);

  useEffect(() => stopCamera, []);

  function snap() {
    const v = videoRef.current;
    if (!side || !v || !v.videoWidth) return;
    setPhoto(side, {
      full: shrinkSource(v, v.videoWidth, v.videoHeight, 1280, 0.82),
      thumb: shrinkSource(v, v.videoWidth, v.videoHeight, 640, 0.72),
    });
  }

  async function upload(file?: File) {
    if (!file || !side) return;
    setBusy(true);
    try {
      setPhoto(side, { full: await shrinkPhoto(file, 1280, 0.82), thumb: await shrinkPhoto(file, 640, 0.72) });
    } catch {
      setError("Couldn't open that photo. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "unavailable") {
    return (
      <div>
        {error ? <p className="mb-2 text-[14.5px] text-chilli">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <PhotoBox title="Front" photo={front} onPhoto={onFront} />
          <PhotoBox title="Back" photo={back} onPhoto={onBack} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {side ? (
        <div>
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-ink sm:aspect-[4/3]">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-[10%] rounded-xl border-2 border-white/70" aria-hidden />
            <p className="absolute left-3 top-3 rounded-full bg-ink/75 px-3 py-1 text-[14.5px] font-semibold text-white">
              {side === "front" ? "1 of 2" : "2 of 2"}: {LABEL[side]}
            </p>
            {status === "starting" ? (
              <span className="absolute inset-0 flex items-center justify-center text-white">
                <Spinner className="h-8 w-8" />
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={snap} disabled={status !== "live"} className={`${btnPrimary} flex-1 py-3 text-[17px]`}>
              <CameraIcon /> Take {side} photo
            </button>
            <label className="cursor-pointer rounded-lg bg-page px-3 py-3 font-semibold text-ink hover:bg-line">
              {busy ? <Spinner /> : "Upload"}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
            </label>
          </div>
          {side === "back" ? (
            <p className="mt-1 text-[14.5px] text-mute">Show the side with the expiry date and MRP printed on it.</p>
          ) : null}
        </div>
      ) : null}

      {front || back ? (
        <div className="grid grid-cols-2 gap-3">
          {(["front", "back"] as const).map((s) => {
            const p = s === "front" ? front : back;
            return p ? (
              <div key={s} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt={`${s} of the pack`} className="aspect-square w-full rounded-lg bg-page object-cover" />
                <button
                  type="button"
                  onClick={() => setPhoto(s, null)}
                  className="absolute right-2 top-2 rounded-full bg-ink/80 px-3 py-1 text-[14px] font-semibold text-white"
                >
                  Retake
                </button>
              </div>
            ) : (
              <span key={s} className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-line bg-page text-mute">
                {s === "front" ? "Front" : "Back"}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
