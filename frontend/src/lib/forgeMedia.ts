const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";

type ForgeMediaUpload = { url: string; path: string };

async function uploadBlob(blob: Blob, projectId: string, filename: string, variant: "original" | "thumbnail"): Promise<ForgeMediaUpload> {
  const query = new URLSearchParams({ project_id: projectId, filename, variant });
  const response = await fetch(`${API_BASE}/forge/media?${query}`, {
    method: "POST",
    headers: { "content-type": blob.type || "application/octet-stream", "x-api-key": API_KEY },
    body: blob,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Local Forge media upload failed.");
  return data;
}

async function makeThumbnail(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("image/")) return null;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 640 / bitmap.width, 420 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.76));
  } finally {
    bitmap.close();
  }
}

export async function uploadForgeMedia(file: File, projectId: string) {
  const original = await uploadBlob(file, projectId, file.name, "original");
  const thumbnailBlob = await makeThumbnail(file);
  const thumbnail = thumbnailBlob
    ? await uploadBlob(thumbnailBlob, projectId, `${file.name.replace(/\.[^.]+$/, "")}-thumb.webp`, "thumbnail")
    : null;
  return { originalUrl: original.url, thumbnailUrl: thumbnail?.url || null };
}
