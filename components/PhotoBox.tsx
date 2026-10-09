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
          <img src={photo.thumb} alt={title} className="aspect-square w-full rounded-lg bg-page object-cover" />
          <button
            type="button"
            onClick={() => onPhoto(null)}
            className="absolute right-2 top-2 rounded-full bg-ink/80 px-3 py-1 text-[14px] font-semibold text-white"
          >
            Retake
          </button>
        </div>
      ) : (
        <label className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line bg-page text-leaf hover:border-leaf">
          {busy ? <Spinner className="h-7 w-7" /> : <CameraIcon className="h-8 w-8" />}
          <span className="font-semibold">{title}</span>
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      )}
      {error ? <p className="mt-1 text-[14px] text-chilli">Couldn&apos;t open that photo. Try again.</p> : null}
    </div>
  );
}
