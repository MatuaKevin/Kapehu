export interface EncodedImage {
  mediaType: "image/jpeg";
  base64: string;
  previewUrl: string;
}

// Claude reads images well up to this edge length; anything bigger costs more
// tokens for no quality gain, and a full-res screenshot can be several MB.
const MAX_DIMENSION = 1568;

export async function encodeImageFile(file: File): Promise<EncodedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const base64 = dataUrl.split(",")[1] ?? "";
  return { mediaType: "image/jpeg", base64, previewUrl: dataUrl };
}

export function firstImageFromClipboard(clipboardData: DataTransfer | null): File | null {
  if (!clipboardData) return null;
  for (const item of clipboardData.items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}
