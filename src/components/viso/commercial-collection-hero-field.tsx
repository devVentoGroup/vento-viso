"use client";

import { useRef, useState } from "react";

type Props = { initialUrl?: string | null; ownerId: string; className?: string };

export function CommercialCollectionHeroField({ initialUrl, ownerId, className }: Props) {
  const [heroImageUrl, setHeroImageUrl] = useState(initialUrl ?? "");
  const [status, setStatus] = useState<"idle" | "uploading" | "error" | "done">("idle");
  const [error, setError] = useState("");
  const [broken, setBroken] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setStatus("error"); setError("Selecciona un JPG, PNG o WebP de máximo 5 MB."); return;
    }
    setStatus("uploading"); setError("");
    const body = new FormData(); body.set("kind", "collection-hero"); body.set("ownerId", ownerId); body.set("file", file);
    try {
      const response = await fetch("/api/viso/upload-commercial-menu-image", { method: "POST", body });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || "No se pudo subir la imagen.");
      setHeroImageUrl(data.url); setBroken(false); setStatus("done");
    } catch (reason) { setStatus("error"); setError(reason instanceof Error ? reason.message : "No se pudo subir la imagen."); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  return <div className={`space-y-2 ${className ?? ""}`}>
    <div><span className="ui-label">Imagen hero</span><p className="ui-caption">Banner horizontal para la portada del menú o temporada. JPG, PNG o WebP. Máximo 5 MB.</p></div>
    <div className="aspect-video overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)]">{heroImageUrl && !broken ? <img src={heroImageUrl} alt="Vista previa de imagen hero" className="h-full w-full object-cover" onError={() => setBroken(true)} /> : <div className="flex h-full items-center justify-center text-sm text-[var(--ui-muted)]">{heroImageUrl ? "No se pudo cargar la imagen" : "Sin imagen hero"}</div>}</div>
    <input name="hero_image_url" value={heroImageUrl} onChange={(event) => { setHeroImageUrl(event.target.value); setBroken(false); }} className="ui-input" placeholder="https://..." />
    <div className="flex flex-wrap items-center gap-2"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /><button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => { setHeroImageUrl(""); setBroken(false); setStatus("idle"); }}>Quitar imagen</button><span className="text-xs text-[var(--ui-muted)]">{status === "uploading" ? "Subiendo…" : status === "done" ? "Imagen cargada" : error}</span></div>
  </div>;
}
