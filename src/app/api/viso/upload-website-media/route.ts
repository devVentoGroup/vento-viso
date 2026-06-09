import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const BUCKET = process.env.NEXT_PUBLIC_VISO_WEBSITE_MEDIA_BUCKET || "website-media";
const MAX_SIZE_MB = Number(process.env.NEXT_PUBLIC_VISO_WEBSITE_MEDIA_MAX_MB || 40);
const MAX_SIZE = Math.max(1, MAX_SIZE_MB) * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["image/", "video/"];
const ALLOWED_EXACT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

function getExt(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/svg+xml") return "svg";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  return "bin";
}

function sanitizePathToken(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
  return sanitized || fallback;
}

function isAllowedMime(mime: string) {
  if (ALLOWED_EXACT.includes(mime)) return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
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
    return NextResponse.json({ error: "Sin permisos para subir archivos" }, { status: 403 });
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
    return NextResponse.json(
      { error: `El archivo supera el limite de ${MAX_SIZE_MB} MB.` },
      { status: 400 },
    );
  }

  const mime = file.type?.toLowerCase() ?? "";
  if (!isAllowedMime(mime)) {
    return NextResponse.json({ error: "Tipo de archivo no permitido." }, { status: 400 });
  }

  const scopeRaw = (formData.get("scope") as string)?.trim() || "website";
  const scope = sanitizePathToken(scopeRaw, "website");
  const ext = getExt(mime);
  const path = `${scope}/asset-${Date.now()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: true,
  });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message || "Error de Storage" }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl, mimeType: mime });
}
