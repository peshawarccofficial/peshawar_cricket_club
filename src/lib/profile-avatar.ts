import type { SupabaseClient, User } from "@supabase/supabase-js";

const PENDING_PHOTO_KEY = "pcc.pendingProfilePhoto";
const MAX_COMPRESSED_BYTES = 180 * 1024;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const pendingUploads = new Map<string, Promise<string | null>>();

export type ImageCrop = { zoom: number; x: number; y: number };

function actualImageType(header: Uint8Array) {
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47 &&
      header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a) return "image/png";
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
      header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50) return "image/webp";
  return null;
}

async function compressPhoto(file: File, crop: ImageCrop = { zoom: 1, x: 0.5, y: 0.5 }): Promise<Blob> {
  if (file.size < 1 || file.size > MAX_SOURCE_BYTES) {
    throw new Error("Choose an image smaller than 10 MB.");
  }
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const detectedType = actualImageType(header);
  if (!detectedType || file.type.toLowerCase() !== detectedType) {
    throw new Error("Choose a valid JPEG, PNG, or WebP image file.");
  }

  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error("The selected image is corrupted or could not be decoded.");
  }
  if (image.width < 32 || image.height < 32 || image.width * image.height > MAX_IMAGE_PIXELS) {
    image.close();
    throw new Error("Image dimensions must be at least 32 × 32 and no larger than 40 megapixels.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 320;
  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    throw new Error("This browser cannot process the selected image.");
  }

  const cropSize = Math.min(image.width, image.height) / Math.min(3, Math.max(1, crop.zoom));
  const maxX = image.width - cropSize;
  const maxY = image.height - cropSize;
  const x = Math.min(1, Math.max(0, crop.x));
  const y = Math.min(1, Math.max(0, crop.y));
  context.drawImage(
    image,
    maxX * x,
    maxY * y,
    cropSize,
    cropSize,
    0,
    0,
    canvas.width,
    canvas.height
  );
  image.close();

  let quality = 0.8;
  let blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
  while (blob && blob.size > MAX_COMPRESSED_BYTES && quality > 0.35) {
    quality -= 0.1;
    blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
  }
  if (!blob) throw new Error("Could not process the selected profile picture.");
  if (blob.size > MAX_COMPRESSED_BYTES) throw new Error("Choose a smaller or simpler profile picture.");
  return blob;
}

export async function compressAndUploadImage(
  supabase: SupabaseClient,
  user: Pick<User, "id">,
  file: File,
  folder: string,
  crop?: ImageCrop
): Promise<string> {
  const { data: { user: authenticatedUser }, error: authError } = await supabase.auth.getUser();
  if (authError || authenticatedUser?.id !== user.id) {
    throw new Error("Your session expired. Please sign in again before uploading a photo.");
  }

  const formData = new FormData();
  formData.set("file", file);
  formData.set("folder", folder);
  formData.set("crop", JSON.stringify(crop ?? { zoom: 1, x: 0.5, y: 0.5 }));
  const response = await fetch("/api/media/upload", { method: "POST", body: formData });
  const result = await response.json() as { url?: unknown; error?: unknown };
  if (!response.ok || typeof result.url !== "string") {
    throw new Error(typeof result.error === "string" ? result.error : "Could not upload the selected image.");
  }
  return result.url;
}

function blobFromDataUrl(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then(response => {
    if (!response.ok) throw new Error("The saved profile photo could not be read.");
    return response.blob();
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the selected photo."));
    reader.onerror = () => reject(new Error("Could not read the selected photo."));
    reader.readAsDataURL(blob);
  });
}

export async function preparePendingProfilePhoto(file: File, email: string, crop?: ImageCrop): Promise<void> {
  const photo = await compressPhoto(file, crop);
  const dataUrl = await blobToDataUrl(photo);
  sessionStorage.setItem(PENDING_PHOTO_KEY, JSON.stringify({ email, dataUrl }));
}

export function discardPendingProfilePhoto(): void {
  sessionStorage.removeItem(PENDING_PHOTO_KEY);
}

export async function uploadPendingProfilePhoto(
  supabase: SupabaseClient,
  user: User
): Promise<string | null> {
  const existing = pendingUploads.get(user.id);
  if (existing) return existing;

  const upload = uploadPhoto(supabase, user);
  pendingUploads.set(user.id, upload);
  try {
    return await upload;
  } finally {
    pendingUploads.delete(user.id);
  }
}

async function uploadPhoto(supabase: SupabaseClient, user: User): Promise<string | null> {
  const serialized = sessionStorage.getItem(PENDING_PHOTO_KEY);
  if (!serialized) return null;

  let pending: { email?: unknown; dataUrl?: unknown };
  try {
    pending = JSON.parse(serialized) as { email?: unknown; dataUrl?: unknown };
  } catch {
    throw new Error("The saved profile photo could not be read. Please choose it again.");
  }

  if (typeof pending.email !== "string" || pending.email.toLowerCase() !== user.email?.toLowerCase()) return null;
  if (typeof pending.dataUrl !== "string" || !/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(pending.dataUrl)) {
    throw new Error("The saved profile photo is invalid. Please choose it again.");
  }

  const photo = await blobFromDataUrl(pending.dataUrl);
  const avatarUrl = await compressAndUploadImage(
    supabase,
    user,
    new File([photo], "profile.webp", { type: "image/webp" }),
    "profile"
  );
  const { error: profileError } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
  if (profileError) throw new Error(`Could not save your profile photo: ${profileError.message}`);

  const { error: metadataError } = await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
  if (metadataError) throw new Error(`Could not update your account photo: ${metadataError.message}`);

  sessionStorage.removeItem(PENDING_PHOTO_KEY);
  return avatarUrl;
}
