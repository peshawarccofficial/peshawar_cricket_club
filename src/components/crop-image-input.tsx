"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { ImageCrop } from "@/lib/profile-avatar";
import styles from "./crop-image-input.module.css";

export function CropImageInput({
  id,
  label,
  shape,
  file,
  crop,
  onFileChange,
  onCropChange
}: {
  id: string;
  label: string;
  shape: "circle" | "square";
  file: File | null;
  crop: ImageCrop;
  onFileChange: (file: File | null) => void;
  onCropChange: (crop: ImageCrop) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => onFileChange(event.target.files?.[0] ?? null)}/>
    {file && previewUrl && <div className={styles.editor}>
      <div className={`${styles.preview} ${shape === "circle" ? styles.circle : styles.square}`}>
        <Image
          src={previewUrl}
          alt={`${label} crop preview`}
          width={160}
          height={160}
          unoptimized
          style={{ objectPosition: `${crop.x * 100}% ${crop.y * 100}%`, transform: `scale(${crop.zoom})` }}
        />
      </div>
      <div className={styles.sliders}>
        <label>Zoom <output>{crop.zoom.toFixed(1)}×</output>
          <input type="range" min={1} max={3} step={0.1} value={crop.zoom} onChange={event => onCropChange({ ...crop, zoom: Number(event.target.value) })}/>
        </label>
        <label>Horizontal position
          <input type="range" min={0} max={1} step={0.01} value={crop.x} onChange={event => onCropChange({ ...crop, x: Number(event.target.value) })}/>
        </label>
        <label>Vertical position
          <input type="range" min={0} max={1} step={0.01} value={crop.y} onChange={event => onCropChange({ ...crop, y: Number(event.target.value) })}/>
        </label>
      </div>
    </div>}
  </div>;
}
