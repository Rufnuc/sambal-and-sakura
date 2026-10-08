import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { storeImage, uploadError, StorageNotConfiguredError } from "@/server/storage";

// Admin-only image upload for menu photos. Returns { url, via }.
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

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
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
