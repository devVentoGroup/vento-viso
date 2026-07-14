import { NextResponse } from "next/server";
import sharp from "sharp";

import { createClient } from "@/lib/supabase/server";

const BUCKET = process.env.NEXT_PUBLIC_VISO_LOGO_BUCKET || "pass-satellite-logos";
const MAX_SIZE = 5 * 1024 * 1024;
const CACHE_SECONDS = 60 * 60 * 24 * 365;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);
const MAX_EDGE_BY_KIND = {
  card: 512,
  header: 1024,
  legacy: 1024,
} as const;

function sanitizePathToken(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || fallback;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: employee } = await supabase.from("employees").select("role").eq("id", userData.user.id).maybeSingle();
  const role = String(employee?.role ?? "").toLowerCase();
  if (!["propietario", "gerente_general"].includes(role)) {
    return NextResponse.json({ error: "Sin permisos para subir imagenes" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formato de solicitud inválido" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "El archivo no puede superar 5 MB" }, { status: 400 });
  }

  const mime = file.type?.toLowerCase() ?? "";
  if (!ALLOWED_TYPES.has(mime)) {
    return NextResponse.json({ error: "Solo se permiten imagenes JPG, PNG, WebP o SVG" }, { status: 400 });
  }

  const rawCode = (formData.get("code") as string)?.trim() || "satellite";
  const code = sanitizePathToken(rawCode, "satellite");
  const rawKind = String(formData.get("kind") ?? "legacy").toLowerCase();
  const kind = rawKind === "card" || rawKind === "header" ? rawKind : "legacy";
  const maxEdge = MAX_EDGE_BY_KIND[kind];
  const path = `${code}/${kind}-logo-${Date.now()}.webp`;
  const buffer = Buffer.from(await file.arrayBuffer());
  let optimized: Buffer;

  try {
    optimized = await sharp(buffer, {
      failOn: "none",
      density: 192,
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        lossless: true,
        effort: 5,
      })
      .toBuffer();

    await sharp(optimized).metadata();
  } catch {
    return NextResponse.json({ error: "No se pudo optimizar el logo" }, { status: 400 });
  }

  const uploadBody = new Blob([new Uint8Array(optimized)], { type: "image/webp" });

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, uploadBody, {
      contentType: "image/webp",
      cacheControl: String(CACHE_SECONDS),
      upsert: false,
    });

  if (uploadErr) {
    const message = String(uploadErr.message ?? "");
    return NextResponse.json({ error: message || "Error de Storage" }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({
    url: urlData.publicUrl,
    path,
    bytes: optimized.byteLength,
    format: "webp",
  });
}
