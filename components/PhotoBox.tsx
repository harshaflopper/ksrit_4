"use client";

import { useState } from "react";
import { shrinkPhoto } from "@/lib/image";
import { CameraIcon, Spinner } from "./ui";

export interface Photo {
  full: string; // sent to Gemini (~1280px)
  thumb: string; // stored with the item (~640px)
}

export function PhotoBox({ title, photo, onPhoto }: { title: string; photo: Photo | null; onPhoto: (p: Photo | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError(false);
    try {
      onPhoto({ full: await shrinkPhoto(file, 1280, 0.82), thumb: await shrinkPhoto(file, 640, 0.72) });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {photo ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.thumb} alt={title} className="aspect-square w-full rounded-card bg-leaf-50 object-cover shadow-card" />
          <button
            type="button"
            onClick={() => onPhoto(null)}
            className="absolute right-2 top-2 min-h-9 rounded-full bg-ink/75 px-3.5 text-[14px] font-semibold text-white backdrop-blur transition-colors duration-200 hover:bg-ink"
          >
            Retake
          </button>
        </div>
      ) : (
        <label className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-leaf-200 bg-leaf-50 text-leaf transition-colors duration-200 hover:border-leaf hover:bg-leaf-soft">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-card">
            {busy ? <Spinner className="h-7 w-7" /> : <CameraIcon className="h-7 w-7" />}
          </span>
          <span className="font-semibold">{title}</span>
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      )}
      {error ? <p className="mt-2 text-[14px] text-chilli">Couldn&apos;t open that photo. Try again.</p> : null}
    </div>
  );
}
