import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase-server";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const ACCEPTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const bucketName =
  process.env.NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET ||
  process.env.SUPABASE_AVATAR_BUCKET ||
  "avatars";

export async function POST(req: Request) {
  if (!bucketName) {
    return NextResponse.json(
      { error: "Avatar bucket not configured." },
      { status: 500 },
    );
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const fileEntry = form.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const { size, type } = fileEntry;
  if (size <= 0) {
    return NextResponse.json({ error: "Empty file uploaded." }, { status: 400 });
  }
  if (size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large. Max size is 4MB." },
      { status: 413 },
    );
  }
  if (type && !ACCEPTED_MIME_TYPES.has(type)) {
    return NextResponse.json(
      { error: "Unsupported file type." },
      { status: 415 },
    );
  }

  const extension = (() => {
    const name = fileEntry.name || "";
    const dotIndex = name.lastIndexOf(".");
    if (dotIndex === -1) return type === "image/png" ? "png" : "jpg";
    const rawExt = name.slice(dotIndex + 1).trim().toLowerCase();
    if (!rawExt) return type === "image/png" ? "png" : "jpg";
    return rawExt.replace(/[^a-z0-9]/g, "") || "jpg";
  })();

  const fileName = `${user.id}/${randomUUID()}.${extension}`;

  let buffer: Buffer;
  try {
    const arrayBuffer = await fileEntry.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json(
      { error: "Unable to read uploaded file." },
      { status: 400 },
    );
  }

  const uploadResult = await supabase.storage
    .from(bucketName)
    .upload(fileName, buffer, {
      cacheControl: "3600",
      contentType: type || "image/jpeg",
      upsert: true,
    });

  if (uploadResult.error) {
    return NextResponse.json(
      { error: uploadResult.error.message },
      { status: 500 },
    );
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucketName)
    .getPublicUrl(uploadResult.data.path, { download: false });

  if (!publicUrlData?.publicUrl) {
    return NextResponse.json(
      { error: "Unable to generate public URL." },
      { status: 500 },
    );
  }

  const publicUrl = publicUrlData.publicUrl;
  const timestampedUrl = `${publicUrl}?t=${Date.now()}`;

  const [{ error: profileError }, { error: authError }] = await Promise.all([
    supabase
      .from("profiles")
      .update({
        avatar_url: timestampedUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id),
    supabase.auth.updateUser({ data: { avatar_url: timestampedUrl } }),
  ]);

  if (profileError || authError) {
    return NextResponse.json(
      { error: profileError?.message || authError?.message || "Failed to persist avatar." },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: timestampedUrl, path: uploadResult.data.path });
}
