import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// Pluggable image storage.
//   - Default (free, works immediately on a VPS / self-host): saves to /public/uploads
//     and returns a site-relative URL like /uploads/menu/abc.webp
//   - Cloudinary (cheapest + best for photos: free 25GB tier, CDN + auto-optimise):
//     set CLOUDINARY_CLOUD_NAME + CLOUDINARY_UPLOAD_PRESET (unsigned) in .env and
//     uploads are pushed there instead, returning a transforming CDN URL.
// No secrets are hard-coded; the operator drops their own keys in .env.

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_BYTES = 6 * 1024 * 1024; // 6MB

export interface StoredImage { url: string; via: "local" | "cloudinary" }

export function uploadError(file: File): string | null {
  if (!file || typeof file.size !== "number") return "No file received.";
  if (!ALLOWED.has(file.type)) return "Use a JPG, PNG, WebP or AVIF image.";
  if (file.size > MAX_BYTES) return "Image must be 6MB or smaller.";
  return null;
}

function cloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_UPLOAD_PRESET);
}

async function toCloudinary(file: File): Promise<StoredImage> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME!;
  const preset = process.env.CLOUDINARY_UPLOAD_PRESET!;
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", preset);
  form.append("folder", "sambal-sakura/menu");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status})`);
  const data = (await res.json()) as { secure_url: string; public_id: string };
  // Deliver an auto-optimised, auto-format, width-capped version for the menu grid.
  const optimised = data.secure_url.replace("/upload/", "/upload/f_auto,q_auto,w_900,c_limit/");
  return { url: optimised, via: "cloudinary" };
}

async function toLocalDisk(file: File): Promise<StoredImage> {
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/png" ? "png" : file.type === "image/avif" ? "avif" : file.type === "image/webp" ? "webp" : "jpg";
  const name = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}.${ext}`;
  const dir = join(process.cwd(), "public", "uploads", "menu");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), buf);
  return { url: `/uploads/menu/${name}`, via: "local" };
}

export class StorageNotConfiguredError extends Error {}

export async function storeImage(file: File): Promise<StoredImage> {
  if (cloudinaryConfigured()) return toCloudinary(file);
  // Production hosts (e.g. Render) have an ephemeral disk: files saved locally vanish on the next
  // deploy. Refuse rather than silently losing the restaurant's photos.
  if (process.env.NODE_ENV === "production") {
    throw new StorageNotConfiguredError("Photo storage isn't set up yet. Add the Cloudinary keys in the server settings.");
  }
  return toLocalDisk(file);
}
