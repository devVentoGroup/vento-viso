import { NextResponse } from "next/server";
import sharp from "sharp";

import { createClient } from "@/lib/supabase/server";

const BUCKET = process.env.NEXT_PUBLIC_VISO_COMMERCIAL_MENU_IMAGE_BUCKET || "commercial-menu-images";
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const CACHE_SECONDS = 60 * 60 * 24 * 365;

function sanitizePathToken(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

  const { data: canManageImages, error: permissionErr } = await supabase.rpc("has_permission", {
    p_permission_code: "viso.menu.images.manage",
  });

  if (permissionErr || !canManageImages) {
    return NextResponse.json({ error: "Sin permisos para subir imagenes" }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Formato de solicitud inválido" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "La imagen no puede superar 5 MB" }, { status: 400 });
  }

  const mime = file.type?.toLowerCase() ?? "";
  if (!ALLOWED_TYPES.has(mime)) {
    return NextResponse.json({ error: "Solo se permiten imagenes JPG, PNG o WebP" }, { status: 400 });
  }

  const kind = sanitizePathToken(String(formData.get("kind") || ""), "catalog-item");
  const ownerId = sanitizePathToken(String(formData.get("ownerId") || ""), "pending");
  const prefix = kind === "option-asset" ? `option-assets/${ownerId}` : `catalog-items/${ownerId}`;
  const maxWidth = kind === "option-asset" ? 640 : 1280;
  const path = `${prefix}/cover-${Date.now()}.webp`;
  const buffer = Buffer.from(await file.arrayBuffer());
  let optimized: Buffer;

  try {
    optimized = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({
        width: maxWidth,
        height: maxWidth,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: kind === "option-asset" ? 74 : 78,
        effort: 4,
        smartSubsample: true,
      })
      .toBuffer();

    await sharp(optimized).metadata();
  } catch {
    return NextResponse.json({ error: "No se pudo optimizar la imagen" }, { status: 400 });
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
    return NextResponse.json({ error: uploadErr.message || "Error de Storage" }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({
    url: urlData.publicUrl,
    path,
    bytes: optimized.byteLength,
    width: maxWidth,
    format: "webp",
  });
}
