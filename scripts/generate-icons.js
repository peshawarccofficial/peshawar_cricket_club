"use strict";

async function main() {
  const [{ default: sharp }, fs, path] = await Promise.all([
    import("sharp"),
    import("node:fs/promises"),
    import("node:path")
  ]);
  const publicDir = path.resolve(process.cwd(), "public");
  const logoPath = path.join(publicDir, "logo.png");
  const appIconPath = path.join(publicDir, "app-icon-512.png");

  if (process.argv[2]) {
    const sourcePath = path.resolve(process.argv[2]);
    const metadata = await sharp(sourcePath).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 1152 || metadata.height < 768) {
      throw new Error("Provide the original 1152x768 PCC crest and app-icon artwork.");
    }

    const logo = await cutOut(sharp, sourcePath, { left: 0, top: 0, width: 686, height: 768 });
    await fs.writeFile(logoPath, logo);
  }

  const logo = await fs.readFile(logoPath);
  const iconSizes = [
    ["icon-512.png", 512],
    ["icon-192.png", 192],
    ["icon-96.png", 96],
    ["icon-48.png", 48],
    ["favicon.png", 64],
    ["favicon-32.png", 32],
    ["apple-touch-icon.png", 180],
    ["app-icon-512.png", 512],
    ["app-icon-192.png", 192]
  ];

  for (const [filename, size] of iconSizes) {
    const icon = await makeCircularIcon(sharp, logo, size);
    await fs.writeFile(path.join(publicDir, filename), icon);
  }

  for (const size of [512, 192]) {
    const maskable = await makeCircularIcon(sharp, logo, size, true);
    await fs.writeFile(path.join(publicDir, `icon-maskable-${size}.png`), maskable);
  }

  const appIcon = await fs.readFile(appIconPath);
  const maskable512 = await fs.readFile(path.join(publicDir, "icon-maskable-512.png"));
  await writeSvg(sharp, fs, path.join(publicDir, "logo.svg"), "Peshawar Cricket Club shield logo", logoPath);
  await writeSvg(sharp, fs, path.join(publicDir, "icon.svg"), "Peshawar Cricket Club app icon", path.join(publicDir, "icon-512.png"));
  await writeSvg(sharp, fs, path.join(publicDir, "icon-maskable.svg"), "Peshawar Cricket Club maskable app icon", path.join(publicDir, "icon-maskable-512.png"));
  await writeBadge(sharp, path, publicDir);
  await fs.writeFile(appIconPath, appIcon);
  await fs.writeFile(path.join(publicDir, "icon-maskable-512.png"), maskable512);
}

async function cutOut(sharp, sourcePath, crop) {
  const { data, info } = await sharp(sourcePath).extract(crop).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  function isBackground(index) {
    const offset = index * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    return Math.min(red, green, blue) >= 190 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 32;
  }

  function add(index) {
    if (!visited[index] && isBackground(index)) {
      visited[index] = 1;
      queue[tail++] = index;
    }
  }

  for (let x = 0; x < info.width; x += 1) {
    add(x);
    add((info.height - 1) * info.width + x);
  }
  for (let y = 0; y < info.height; y += 1) {
    add(y * info.width);
    add(y * info.width + info.width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    if (x > 0) add(index - 1);
    if (x + 1 < info.width) add(index + 1);
    if (y > 0) add(index - info.width);
    if (y + 1 < info.height) add(index + info.width);
  }

  for (let index = 0; index < pixelCount; index += 1) {
    if (visited[index]) data[index * 4 + 3] = 0;
  }

  return sharp(data, { raw: info }).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 }).toBuffer();
}

async function makeCircularIcon(sharp, logo, size, maskable = false) {
  const diameter = Math.round(size * (maskable ? 0.8 : 0.96));
  const strokeWidth = Math.max(2, Math.round(size * 0.018));
  const radius = diameter / 2 - strokeWidth / 2;
  const center = size / 2;
  const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><radialGradient id="navy" cx="48%" cy="35%" r="70%"><stop offset="0" stop-color="#123e64"/><stop offset="1" stop-color="#071b36"/></radialGradient></defs><circle cx="${center}" cy="${center}" r="${radius}" fill="url(#navy)" stroke="#d4af37" stroke-width="${strokeWidth}"/><circle cx="${center}" cy="${center}" r="${radius - strokeWidth * 1.7}" fill="none" stroke="#d4af37" stroke-opacity=".48" stroke-width="${Math.max(1, Math.round(strokeWidth / 3))}"/></svg>`);
  const artworkSize = Math.round(diameter * 0.94);
  const artwork = await sharp(logo)
    .resize(artworkSize, artworkSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const background = maskable
    ? { r: 7, g: 27, b: 54, alpha: 1 }
    : { r: 0, g: 0, b: 0, alpha: 0 };
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: circle }, { input: artwork, gravity: "centre" }])
    .png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
    .toBuffer();
}

async function writeSvg(sharp, fs, outputPath, title, imagePath) {
  const { width, height } = await sharp(imagePath).metadata();
  const imageName = imagePath.split(/[\\/]/).pop();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><image href="/${imageName}" width="${width}" height="${height}"/></svg>`;
  await fs.writeFile(outputPath, svg, "utf8");
}

async function writeBadge(sharp, path, publicDir) {
  const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 5 82 18v28c0 23-14 38-34 46C28 84 14 69 14 46V18z" fill="#fff"/><path d="m48 28 5 12 13 1-10 9 3 13-11-7-11 7 3-13-10-9 13-1z" fill="#071b36"/></svg>`;
  for (const size of [96, 72]) {
    await sharp(Buffer.from(badgeSvg)).resize(size, size).png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 }).toFile(path.join(publicDir, `badge-${size}.png`));
  }
}

main().catch(error => {
  console.error("Could not generate PCC brand icons:", error);
  process.exitCode = 1;
});
