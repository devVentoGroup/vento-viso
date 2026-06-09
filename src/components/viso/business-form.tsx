"use client";

import { useMemo, useState } from "react";

import { PassStylePreview } from "./pass-style-preview";

type BusinessFormValues = {
  id?: string | null;
  site_id?: string | null;
  code: string;
  name: string;
  subtitle: string;
  tags: string;
  sort_order: number;
  is_active: boolean;
  logo_url: string;
  card_logo_url: string;
  header_logo_url: string;
  watermark_icon: string;
  gradient_start: string;
  gradient_end: string;
  accent_color: string;
  text_color: string;
  text_secondary_color: string;
  primary_color: string;
  background_color: string;
  indicator_color: string;
  loading_color: string;
  border_color: string;
  card_color: string;
  review_url: string;
  maps_url: string;
  address_override: string;
  latitude_override: string;
  longitude_override: string;
  site_code: string;
  site_name: string;
  site_type: string;
  site_address: string;
  site_latitude: string;
  site_longitude: string;
  site_is_public: boolean;
  site_is_active: boolean;
};

type BusinessFormProps = {
  mode: "create" | "edit";
  initial: BusinessFormValues;
  action: (formData: FormData) => void | Promise<void>;
};

const LOGO_UPLOAD_ENDPOINT = "/api/viso/upload-logo";

type UploadTarget = "card" | "header";

function LogoField({
  title,
  hint,
  value,
  onChange,
  onUpload,
  uploadLabel,
}: {
  title: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  onUpload: (file: File | null) => void;
  uploadLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 space-y-3">
      <div>
        <div className="ui-h3">{title}</div>
        <div className="ui-caption">{hint}</div>
      </div>

      <div className="h-16 w-full rounded-xl border border-[var(--ui-border)] bg-white px-3 flex items-center overflow-hidden">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={title} className="h-12 w-full object-contain object-left" />
        ) : (
          <span className="ui-caption">Sin logo cargado</span>
        )}
      </div>

      <label className="space-y-2 block">
        <span className="ui-label">Subir archivo</span>
        <input type="file" accept="image/*" className="ui-input" onChange={(event) => onUpload(event.target.files?.[0] ?? null)} />
      </label>

      <label className="space-y-2 block">
        <span className="ui-label">URL manual (opcional)</span>
        <input
          className="ui-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://..."
        />
      </label>

      <div className="ui-caption">{uploadLabel}</div>
    </div>
  );
}

export function BusinessForm({ mode, initial, action }: BusinessFormProps) {
  const [name, setName] = useState(initial.name);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [tags, setTags] = useState(initial.tags);
  const [code, setCode] = useState(initial.code);
  const [cardLogoUrl, setCardLogoUrl] = useState(initial.card_logo_url || initial.logo_url);
  const [headerLogoUrl, setHeaderLogoUrl] = useState(initial.header_logo_url || initial.logo_url);
  const [gradientStart, setGradientStart] = useState(initial.gradient_start);
  const [gradientEnd, setGradientEnd] = useState(initial.gradient_end);
  const [accentColor, setAccentColor] = useState(initial.accent_color);
  const [textColor, setTextColor] = useState(initial.text_color);
  const [textSecondaryColor, setTextSecondaryColor] = useState(initial.text_secondary_color);
  const [primaryColor, setPrimaryColor] = useState(initial.primary_color);
  const [backgroundColor, setBackgroundColor] = useState(initial.background_color);
  const [indicatorColor, setIndicatorColor] = useState(initial.indicator_color);
  const [loadingColor, setLoadingColor] = useState(initial.loading_color);
  const [cardColor, setCardColor] = useState(initial.card_color);
  const [borderColor, setBorderColor] = useState(initial.border_color);
  const [uploadStatus, setUploadStatus] = useState<Record<UploadTarget, "idle" | "uploading" | "done" | "error">>({ card: "idle", header: "idle" });
  const [uploadMessage, setUploadMessage] = useState<Record<UploadTarget, string>>({ card: "", header: "" });

  const legacyLogo = useMemo(() => cardLogoUrl || headerLogoUrl || initial.logo_url || "", [cardLogoUrl, headerLogoUrl, initial.logo_url]);
  const logoDiagnostics = useMemo(() => {
    const savedCard = initial.card_logo_url?.trim() || "";
    const savedHeader = initial.header_logo_url?.trim() || "";
    const savedLegacy = initial.logo_url?.trim() || "";
    const hasSavedLogo = Boolean(savedCard || savedHeader || savedLegacy);

    return {
      savedCard,
      savedHeader,
      savedLegacy,
      hasSavedLogo,
    };
  }, [initial.card_logo_url, initial.header_logo_url, initial.logo_url]);

  const handleUpload = async (file: File | null, target: UploadTarget) => {
    if (!file) return;
    setUploadStatus((prev) => ({ ...prev, [target]: "uploading" }));
    setUploadMessage((prev) => ({ ...prev, [target]: "" }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (code) {
        formData.append("code", code);
      }
      formData.append("kind", target === "card" ? "card" : "header");

      const response = await fetch(LOGO_UPLOAD_ENDPOINT, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error subiendo logo.");
      }

      if (target === "card") setCardLogoUrl(payload.url || "");
      if (target === "header") setHeaderLogoUrl(payload.url || "");

      setUploadStatus((prev) => ({ ...prev, [target]: "done" }));
      setUploadMessage((prev) => ({ ...prev, [target]: "Logo cargado." }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error subiendo logo.";
      setUploadStatus((prev) => ({ ...prev, [target]: "error" }));
      setUploadMessage((prev) => ({ ...prev, [target]: message }));
    }
  };

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="id" value={initial.id ?? ""} />
      <input type="hidden" name="site_id" value={initial.site_id ?? ""} />
      <input type="hidden" name="logo_url" value={legacyLogo} />

      <div className="ui-panel space-y-6">
        <div className="ui-h3">Datos del negocio</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="ui-label">Codigo negocio</span>
            <input
              name="code"
              className="ui-input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="molka"
              required
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Nombre</span>
            <input
              name="name"
              className="ui-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre del negocio"
              required
            />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Subtitulo</span>
            <input
              name="subtitle"
              className="ui-input"
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="Experiencia gastronomica"
            />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Tags (separados por coma)</span>
            <input
              name="tags"
              className="ui-input"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="amasijos colombianos, panaderia, pasteleria"
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Orden en Home</span>
            <input name="sort_order" type="number" className="ui-input" defaultValue={initial.sort_order} />
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
            <input type="checkbox" name="is_active" defaultChecked={initial.is_active} />
            Negocio activo
          </label>
        </div>
      </div>

      <div className="ui-panel space-y-6">
        <div>
          <div className="ui-h3">Logos Vento Pass</div>
          <p className="ui-caption">Usa un logo cuadrado para la tarjeta en Home y uno horizontal para el header interno.</p>
        </div>

        <div className={`rounded-2xl border p-4 ${logoDiagnostics.hasSavedLogo ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/80"}`}>
          <div className="ui-label">Diagnóstico de logos guardados</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--ui-border)] bg-white px-3 py-2">
              <div className="ui-caption">Card logo URL</div>
              <div className="mt-1 break-all text-xs text-[var(--ui-text)]">
                {logoDiagnostics.savedCard || "Vacío"}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-white px-3 py-2">
              <div className="ui-caption">Header logo URL</div>
              <div className="mt-1 break-all text-xs text-[var(--ui-text)]">
                {logoDiagnostics.savedHeader || "Vacío"}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-white px-3 py-2">
              <div className="ui-caption">Legacy logo URL</div>
              <div className="mt-1 break-all text-xs text-[var(--ui-text)]">
                {logoDiagnostics.savedLegacy || "Vacío"}
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm text-[var(--ui-text)]">
            {logoDiagnostics.hasSavedLogo
              ? "VISO detectó URLs guardadas en base de datos. Si no se ven arriba, el problema sería de acceso a la URL o render del archivo."
              : "VISO no detectó ninguna URL de logo guardada en base de datos. Si en Vento Pass ves la card, muy probablemente se está mostrando el fallback local de la app y no un archivo del bucket."}
          </p>
        </div>

        <input type="hidden" name="card_logo_url" value={cardLogoUrl} />
        <input type="hidden" name="header_logo_url" value={headerLogoUrl} />

        <div className="grid gap-4 lg:grid-cols-2">
          <LogoField
            title="Logo de tarjeta (cuadrado)"
            hint="Se muestra en la tarjeta de Home. Ideal 512x512 PNG o SVG."
            value={cardLogoUrl}
            onChange={setCardLogoUrl}
            onUpload={(file) => handleUpload(file, "card")}
            uploadLabel={uploadStatus.card === "uploading" ? "Subiendo logo..." : uploadMessage.card}
          />

          <LogoField
            title="Logo interno (horizontal)"
            hint="Se muestra en la pantalla interna. Ideal 1200x320 PNG o SVG."
            value={headerLogoUrl}
            onChange={setHeaderLogoUrl}
            onUpload={(file) => handleUpload(file, "header")}
            uploadLabel={uploadStatus.header === "uploading" ? "Subiendo logo..." : uploadMessage.header}
          />
        </div>
      </div>

      <div className="ui-panel space-y-6">
        <div className="ui-h3">Sede (sites)</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="ui-label">Codigo sede</span>
            <input name="site_code" className="ui-input" defaultValue={initial.site_code} required />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Nombre sede</span>
            <input name="site_name" className="ui-input" defaultValue={initial.site_name} required />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Tipo sede</span>
            <select name="site_type" className="ui-input" defaultValue={initial.site_type || "satellite"}>
              <option value="satellite">Satellite</option>
              <option value="production_center">Production center</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="ui-label">Direccion</span>
            <input name="site_address" className="ui-input" defaultValue={initial.site_address} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Latitud</span>
            <input name="site_latitude" className="ui-input" defaultValue={initial.site_latitude} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Longitud</span>
            <input name="site_longitude" className="ui-input" defaultValue={initial.site_longitude} />
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
            <input type="checkbox" name="site_is_public" defaultChecked={initial.site_is_public} />
            Visible en Pass
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
            <input type="checkbox" name="site_is_active" defaultChecked={initial.site_is_active} />
            Sede activa
          </label>
        </div>
      </div>

      <div className="ui-panel space-y-6">
        <div className="ui-h3">Estilo de la experiencia</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="ui-label">Icono watermark</span>
            <select name="watermark_icon" className="ui-input" defaultValue={initial.watermark_icon}>
              <option value="">Sin icono</option>
              <option value="utensils">utensils</option>
              <option value="pizza">pizza</option>
              <option value="shopping-bag">shopping-bag</option>
              <option value="coffee">coffee</option>
              <option value="chef-hat">chef-hat</option>
              <option value="ice-cream">ice-cream</option>
              <option value="sandwich">sandwich</option>
              <option value="cup-soda">cup-soda</option>
              <option value="beef">beef</option>
              <option value="fish">fish</option>
              <option value="cookie">cookie</option>
              <option value="drumstick">drumstick</option>
            </select>
          </label>
          <div className="ui-caption flex items-center">Este icono se usa como marca de agua suave en la tarjeta.</div>

          <div className="grid gap-3 sm:grid-cols-2 sm:col-span-2">
            <label className="space-y-2">
              <span className="ui-label">Gradient start</span>
              <input name="gradient_start" type="color" className="ui-input" value={gradientStart} onChange={(event) => setGradientStart(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Gradient end</span>
              <input name="gradient_end" type="color" className="ui-input" value={gradientEnd} onChange={(event) => setGradientEnd(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Accent color</span>
              <input name="accent_color" type="color" className="ui-input" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Text color</span>
              <input name="text_color" type="color" className="ui-input" value={textColor} onChange={(event) => setTextColor(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Text secondary</span>
              <input name="text_secondary_color" type="color" className="ui-input" value={textSecondaryColor} onChange={(event) => setTextSecondaryColor(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Primary color</span>
              <input name="primary_color" type="color" className="ui-input" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Background color</span>
              <input name="background_color" type="color" className="ui-input" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Indicator color</span>
              <input name="indicator_color" type="color" className="ui-input" value={indicatorColor} onChange={(event) => setIndicatorColor(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Loading color</span>
              <input name="loading_color" type="color" className="ui-input" value={loadingColor} onChange={(event) => setLoadingColor(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Card color</span>
              <input name="card_color" type="color" className="ui-input" value={cardColor} onChange={(event) => setCardColor(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Border color</span>
              <input name="border_color" type="color" className="ui-input" value={borderColor} onChange={(event) => setBorderColor(event.target.value)} />
            </label>
          </div>
        </div>
      </div>

      <div className="ui-panel space-y-6">
        <div className="ui-h3">Links principales</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="ui-label">Review URL</span>
            <input name="review_url" className="ui-input" defaultValue={initial.review_url} placeholder="Link de reseñas (Google, etc.)" />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Maps URL</span>
            <input name="maps_url" className="ui-input" defaultValue={initial.maps_url} placeholder="Link de ubicación (Google Maps, Waze, etc.)" />
          </label>
        </div>
      </div>

      <div className="ui-panel space-y-4">
        <div className="ui-h3">Ubicación avanzada (opcional)</div>
        <p className="ui-caption">Solo usa estos campos si quieres forzar una direccion o coordenadas distintas a las de la sede.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Direccion personalizada</span>
            <input name="address_override" className="ui-input" defaultValue={initial.address_override} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Latitud personalizada</span>
            <input name="latitude_override" className="ui-input" defaultValue={initial.latitude_override} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Longitud personalizada</span>
            <input name="longitude_override" className="ui-input" defaultValue={initial.longitude_override} />
          </label>
        </div>
      </div>

      <PassStylePreview
        name={name}
        subtitle={subtitle}
        tags={tags}
        cardLogoUrl={cardLogoUrl}
        headerLogoUrl={headerLogoUrl}
        gradientStart={gradientStart}
        gradientEnd={gradientEnd}
        accentColor={accentColor}
        textColor={textColor}
        textSecondaryColor={textSecondaryColor}
        primaryColor={primaryColor}
        backgroundColor={backgroundColor}
        indicatorColor={indicatorColor}
        cardColor={cardColor}
        borderColor={borderColor}
      />

      <div className="ui-mobile-sticky-footer flex flex-wrap items-center gap-3">
        <button type="submit" className="ui-btn ui-btn--brand">
          {mode === "create" ? "Crear negocio" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
