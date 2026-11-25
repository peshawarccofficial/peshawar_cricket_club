import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const OUTPUT_SIZE = 320;
const MAX_OUTPUT_BYTES = 180 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "avif"]);

type CropOptions = {
  zoom: number;
  x: number;
  y: number;
};

function isCropOptions(value: unknown): value is CropOptions {
  if (!value || typeof value !== "object") return false;
  const crop = value as Record<string, unknown>;
  return (
    typeof crop.zoom === "number" &&
    Number.isFinite(crop.zoom) &&
    crop.zoom >= 1 &&
    crop.zoom <= 3 &&
    typeof crop.x === "number" &&
    Number.isFinite(crop.x) &&
    crop.x >= 0 &&
    crop.x <= 1 &&
    typeof crop.y === "number" &&
    Number.isFinite(crop.y) &&
    crop.y >= 0 &&
    crop.y <= 1
  );
}

async function encodeWebp(source: Buffer, crop: CropOptions) {
  const oriented = await sharp(source, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    .rotate()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = oriented.info;
  const squareSize = Math.max(1, Math.floor(Math.min(width, height) / crop.zoom));
  const left = Math.round((width - squareSize) * crop.x);
  const top = Math.round((height - squareSize) * crop.y);
  let quality = 82;
  let result = await sharp(oriented.data)
    .extract({ left, top, width: squareSize, height: squareSize })
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover" })
    .webp({ quality, effort: 5 })
    .toBuffer();

  while (result.byteLength > MAX_OUTPUT_BYTES && quality > 40) {
    quality -= 8;
    result = await sharp(oriented.data)
      .extract({ left, top, width: squareSize, height: squareSize })
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover" })
      .webp({ quality, effort: 5 })
      .toBuffer();
  }

  if (result.byteLength > MAX_OUTPUT_BYTES) {
    throw new Error("The selected image cannot be compressed to the required size.");
  }

  return result;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_BYTES + 32 * 1024) {
    return NextResponse.json({ error: "The image is too large." }, { status: 413 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Image uploads are not configured." }, { status: 503 });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Sign in before uploading a photo." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "The upload request is invalid." }, { status: 400 });
  }

  const file = formData.get("file");
  const folder = formData.get("folder");
  let crop: unknown;
  try {
    crop = JSON.parse(String(formData.get("crop") ?? ""));
  } catch {
    return NextResponse.json({ error: "The image crop settings are invalid." }, { status: 400 });
  }

  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > MAX_SOURCE_BYTES ||
    typeof folder !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(folder) ||
    !isCropOptions(crop)
  ) {
    return NextResponse.json({ error: "The image upload details are invalid." }, { status: 400 });
  }

  const source = Buffer.from(await file.arrayBuffer());
  if (source.byteLength !== file.size) {
    return NextResponse.json({ error: "The image data is incomplete." }, { status: 400 });
  }

  let output: Buffer;
  try {
    const metadata = await sharp(source, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
    if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
      return NextResponse.json({ error: "Use a JPEG, PNG, WebP or AVIF image." }, { status: 415 });
    }
    if (!metadata.width || !metadata.height || metadata.width < 32 || metadata.height < 32) {
      return NextResponse.json({ error: "The image dimensions are too small." }, { status: 400 });
    }
    output = await encodeWebp(source, crop);
  } catch (error) {
    console.error("Profile photo processing failed.", error);
    return NextResponse.json({ error: "The image could not be decoded or processed." }, { status: 400 });
  }

  const objectPath = `${user.id}/${folder}/${randomUUID()}.webp`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(objectPath, output, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) {
    console.error("Profile photo storage upload failed.", uploadError);
    return NextResponse.json({ error: "The image could not be saved. Please try again." }, { status: 502 });
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(objectPath);
  return NextResponse.json({ url: data.publicUrl }, { status: 201 });
}
