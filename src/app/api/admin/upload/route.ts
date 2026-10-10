import { NextResponse } from "next/server";
import { adminUser } from "@/server/auth";
import { log, errInfo } from "@/server/log";
import { storeImage, uploadError, StorageNotConfiguredError, InvalidImageError } from "@/server/storage";

// Admin-only image upload for menu photos. Returns { url, via }.
export async function POST(req: Request) {
  const u = await adminUser();
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });

  const err = uploadError(file);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  try {
    const stored = await storeImage(file);
    return NextResponse.json(stored);
  } catch (e) {
    if (e instanceof StorageNotConfiguredError) return NextResponse.json({ error: e.message }, { status: 503 });
    if (e instanceof InvalidImageError) return NextResponse.json({ error: e.message }, { status: 400 });
    log.error("upload_failed", errInfo(e));
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
