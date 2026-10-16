import { NextResponse } from "next/server";
import { adminUser } from "@/server/auth";
import { log, errInfo } from "@/server/log";
import { storeImage, storeFile, uploadError, fileUploadError, StorageNotConfiguredError, InvalidImageError } from "@/server/storage";

// Admin-only uploads: menu photos (default), pictures for promotional emails (kind=campaign), and
// PDFs linked from promotional emails (kind=campaign-file). Returns { url, via }.
export async function POST(req: Request) {
  const u = await adminUser();
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });

  const kind = form?.get("kind");
  const isFile = kind === "campaign-file";
  const err = isFile ? fileUploadError(file) : uploadError(file);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  try {
    const stored = isFile ? await storeFile(file) : await storeImage(file, kind === "campaign" ? "campaign" : "menu");
    return NextResponse.json(stored);
  } catch (e) {
    if (e instanceof StorageNotConfiguredError) return NextResponse.json({ error: e.message }, { status: 503 });
    if (e instanceof InvalidImageError) return NextResponse.json({ error: e.message }, { status: 400 });
    log.error("upload_failed", errInfo(e));
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
