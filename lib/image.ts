// Browser-side photo shrinking. Phone photos are 3-8 MB; Gemini reads labels fine at
// ~1280px, and the feed only needs a small thumbnail.

async function loadImage(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Fallback for browsers without createImageBitmap support for this file type.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Draws `source` (a photo or a live camera frame) as a JPEG data URL no larger than `maxSide` px. */
export function shrinkSource(source: CanvasImageSource, width: number, height: number, maxSide: number, quality: number): string {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process photos.");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Returns a JPEG data URL no larger than `maxSide` px on its longest side. */
export async function shrinkPhoto(file: File, maxSide: number, quality: number): Promise<string> {
  const img = await loadImage(file);
  return shrinkSource(img, img.width, img.height, maxSide, quality);
}
