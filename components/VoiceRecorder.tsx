"use client";

// Records the shopkeeper's voice note as audio. The recording itself is sent to Gemini with
// the pack photos (Gemini listens to it) and saved with the item. The shopkeeper can play it
// back before sending, and record again.

import { useEffect, useRef, useState } from "react";
import { blobToDataUrl, toWavDataUrl } from "@/lib/audio";
import { Spinner } from "./ui";

const MAX_SECONDS = 60;

export function VoiceRecorder({ audio, onAudio }: { audio: string | null; onAudio: (dataUrl: string | null) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "saving">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);

  useEffect(
    () => () => {
      if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    },
    [],
  );

  async function start() {
    setError(null);
    if (!window.isSecureContext) {
      setError("Recording only works on a secure (https) page. Type the note below, or open the app over https.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record. Type the note below instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("Microphone is blocked. Allow it for this site in the browser settings.");
      return;
    }
    const media = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS && media.state === "recording") media.stop();
    }, 250);
    media.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    media.onstop = async () => {
      clearInterval(tick);
      stream.getTracks().forEach((t) => t.stop());
      mediaRef.current = null;
      if (chunks.length === 0 || Date.now() - startedAt < 700) {
        setError("That was too short. Hold on and speak for a few seconds.");
        setState("idle");
        return;
      }
      setState("saving");
      const blob = new Blob(chunks, { type: media.mimeType || "audio/webm" });
      // WAV is a format Gemini always accepts; keep the original if this browser can't convert.
      onAudio(await toWavDataUrl(blob).catch(() => blobToDataUrl(blob)));
      setState("idle");
    };
    mediaRef.current = media;
    media.start();
    setSeconds(0);
    setState("recording");
  }

  function stop() {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
  }

  return (
    <div>
      <p className="mb-1 font-semibold">Voice note</p>
      <p className="mb-2 text-[14.5px] text-mute">Say how many packs you have and the expiry date. For example: 24 packets, expiry 20 October.</p>
      {audio && state === "idle" ? (
        <div className="space-y-2 rounded-lg bg-leaf-soft p-3">
          <audio controls src={audio} className="w-full" />
          <div className="flex gap-2">
            <button type="button" onClick={start} className="rounded-full bg-card px-4 py-2 font-semibold text-leaf hover:bg-line">
              Record again
            </button>
            <button type="button" onClick={() => onAudio(null)} className="rounded-full px-4 py-2 font-semibold text-mute hover:bg-card">
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={state === "recording" ? stop : start}
            disabled={state === "saving"}
            aria-pressed={state === "recording"}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold ${
              state === "recording" ? "bg-chilli text-white" : "bg-leaf-soft text-leaf hover:bg-leaf hover:text-white"
            }`}
          >
            {state === "saving" ? (
              <Spinner />
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
              </svg>
            )}
            {state === "recording" ? "Stop" : state === "saving" ? "Saving" : "Record voice note"}
          </button>
          {state === "recording" ? (
            <span className="text-[14.5px] text-chilli">
              Recording 0:{String(seconds).padStart(2, "0")}, tap Stop when done
            </span>
          ) : null}
        </div>
      )}
      {error ? <p className="mt-1 text-[14.5px] text-chilli">{error}</p> : null}
    </div>
  );
}
