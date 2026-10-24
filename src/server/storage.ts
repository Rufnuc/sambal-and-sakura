import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { PHOTO_WIDTHS, photoAtWidth } from "@/lib/photo";

// Pluggable image storage.
//   - Default (free, works immediately on a VPS / self-host): saves to /public/uploads
//     and returns a site-relative URL like /uploads/menu/abc.webp
//   - Cloudinary (cheapest + best for photos: free 25GB tier, CDN + auto-optimise):
//     set CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET (signed uploads: only
//     this server can upload), or the older CLOUDINARY_UPLOAD_PRESET (unsigned: anyone who learns the
//     preset name can upload to your account, so prefer the signed keys).
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

/** Check the file really is the image type it claims to be (the browser-sent type can be faked). */
export async function looksLikeImage(file: File): Promise<boolean> {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  switch (file.type) {
    case "image/jpeg": return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png": return b[0] === 0x89 && ascii(1, 4) === "PNG";
    case "image/webp": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "image/avif": return ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12));
    default: return false;
  }
}

const signedCloudinary = () => Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
function cloudinaryConfigured() {
  return signedCloudinary() || Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_UPLOAD_PRESET);
}

// Where uploads go: menu photos, pictures for promotional emails, and files (PDF) linked from them.
export type UploadKind = "menu" | "campaign" | "campaign-file";
const FOLDER: Record<UploadKind, string> = { menu: "menu", campaign: "campaign", "campaign-file": "files" };

async function toCloudinary(file: File, kind: UploadKind = "menu"): Promise<StoredImage> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME!;
  const form = new FormData();
  form.append("file", file);
  const folder = `sambal-sakura/${FOLDER[kind]}`;
  form.append("folder", folder);
  if (signedCloudinary()) {
    // Signed upload: SHA-1 of the sorted parameters + the API secret (Cloudinary's scheme).
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`).digest("hex");
    form.append("api_key", process.env.CLOUDINARY_API_KEY!);
    form.append("timestamp", timestamp);
    form.append("signature", signature);
  } else {
    form.append("upload_preset", process.env.CLOUDINARY_UPLOAD_PRESET!);
  }
  // PDFs are stored as "raw" files (delivered exactly as uploaded); pictures as images.
  const resource = kind === "campaign-file" ? "raw" : "image";
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${resource}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status})`);
  const data = (await res.json()) as { secure_url: string; public_id: string };
  if (resource === "raw") return { url: data.secure_url, via: "cloudinary" };
  // Deliver an auto-optimised, width-capped version: 900px for the menu grid, 1200px for email pictures.
  // Emails get a fixed format (jpg), because some email apps can't show WebP/AVIF.
  const transform = kind === "campaign" ? "f_jpg,q_auto,w_1200,c_limit" : "f_auto,q_auto,w_900,c_limit";
  const url = data.secure_url.replace("/upload/", `/upload/${transform}/`);
  if (kind !== "campaign") warmPhotoSizes(url);
  return { url, via: "cloudinary" };
}

/**
 * Cloudinary makes each size of a photo the first time it's asked for (about a second). Ask for every
 * size the menu uses straight after upload, in the formats browsers request, so customers get them
 * already made. Fire-and-forget: a failure only means the first viewer waits a moment.
 */
function warmPhotoSizes(url: string): void {
  for (const width of PHOTO_WIDTHS) {
    for (const accept of ["image/avif,image/webp,*/*", "image/webp,*/*", "image/*"]) {
      void fetch(photoAtWidth(url, width), { headers: { Accept: accept } }).then((r) => r.body?.cancel()).catch(() => {});
    }
  }
}

async function toLocalDisk(file: File, kind: UploadKind = "menu"): Promise<StoredImage> {
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/avif" ? "avif" : file.type === "image/webp" ? "webp" : "jpg";
  const name = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}.${ext}`;
  const dir = join(process.cwd(), "public", "uploads", FOLDER[kind]);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), buf);
  return { url: `/uploads/${FOLDER[kind]}/${name}`, via: "local" };
}

export class StorageNotConfiguredError extends Error {}
export class InvalidImageError extends Error {}

export async function storeImage(file: File, kind: Exclude<UploadKind, "campaign-file"> = "menu"): Promise<StoredImage> {
  if (!(await looksLikeImage(file))) throw new InvalidImageError("That file isn't a real JPG, PNG, WebP or AVIF image.");
  if (cloudinaryConfigured()) return toCloudinary(file, kind);
  // Production hosts (e.g. Render) have an ephemeral disk: files saved locally vanish on the next
  // deploy. Refuse rather than silently losing the restaurant's photos.
  if (process.env.NODE_ENV === "production") {
    throw new StorageNotConfiguredError("Photo storage isn't set up yet. Add the Cloudinary keys in the server settings.");
  }
  return toLocalDisk(file, kind);
}

/* ---- Files linked from promotional emails (PDF only: menus, flyers) ---- */
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export function fileUploadError(file: File): string | null {
  if (!file || typeof file.size !== "number") return "No file received.";
  if (file.type !== "application/pdf") return "Use a PDF file (e.g. a menu or flyer).";
  if (file.size > MAX_FILE_BYTES) return "The file must be 10MB or smaller.";
  return null;
}

export async function storeFile(file: File): Promise<StoredImage> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...head) !== "%PDF-") throw new InvalidImageError("That file isn't a real PDF.");
  if (cloudinaryConfigured()) return toCloudinary(file, "campaign-file");
  if (process.env.NODE_ENV === "production") {
    throw new StorageNotConfiguredError("File storage isn't set up yet. Add the Cloudinary keys in the server settings.");
  }
  return toLocalDisk(file, "campaign-file");
}
