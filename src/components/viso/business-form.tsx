"use client";

import { useState } from "react";

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

export function BusinessForm({ mode, initial, action }: BusinessFormProps) {
  const [name, setName] = useState(initial.name);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [tags, setTags] = useState(initial.tags);
  const [code, setCode] = useState(initial.code);
  const [logoUrl, setLogoUrl] = useState(initial.logo_url);
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
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState("");

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setUploadStatus("uploading");
    setUploadMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (code) {
        formData.append("code", code);
      }
      const response = await fetch(LOGO_UPLOAD_ENDPOINT, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error subiendo logo.");
      }
      setLogoUrl(payload.url || "");
      setUploadStatus("done");
      setUploadMessage("Logo cargado.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error subiendo logo.";
      setUploadStatus("error");
      setUploadMessage(message);
    }
  };

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="id" value={initial.id ?? ""} />
      <input type="hidden" name="site_id" value={initial.site_id ?? ""} />

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
              placeholder="viso_cafe"
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
              placeholder="cafe, brunch, bakery"
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Orden</span>
            <input
              name="sort_order"
              type="number"
              className="ui-input"
              defaultValue={initial.sort_order}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
            <input type="checkbox" name="is_active" defaultChecked={initial.is_active} />
            Activo
          </label>
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
        <div className="ui-h3">Branding Vento Pass</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Logo URL</span>
            <input
              name="logo_url"
              className="ui-input"
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
              placeholder="https://..."
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Subir logo</span>
            <input
              type="file"
              accept="image/*"
              className="ui-input"
              onChange={(event) => handleUpload(event.target.files?.[0] ?? null)}
            />
          </label>
          <div className="flex items-center text-sm">
            {uploadStatus === "uploading" ? "Subiendo logo..." : uploadMessage}
          </div>
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
          <div className="grid gap-3 sm:grid-cols-2 sm:col-span-2">
            <label className="space-y-2">
              <span className="ui-label">Gradient start</span>
              <input
                name="gradient_start"
                type="color"
                className="ui-input"
                value={gradientStart}
                onChange={(event) => setGradientStart(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Gradient end</span>
              <input
                name="gradient_end"
                type="color"
                className="ui-input"
                value={gradientEnd}
                onChange={(event) => setGradientEnd(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Accent color</span>
              <input
                name="accent_color"
                type="color"
                className="ui-input"
                value={accentColor}
                onChange={(event) => setAccentColor(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Text color</span>
              <input
                name="text_color"
                type="color"
                className="ui-input"
                value={textColor}
                onChange={(event) => setTextColor(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Text secondary</span>
              <input
                name="text_secondary_color"
                type="color"
                className="ui-input"
                value={textSecondaryColor}
                onChange={(event) => setTextSecondaryColor(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Primary color</span>
              <input
                name="primary_color"
                type="color"
                className="ui-input"
                value={primaryColor}
                onChange={(event) => setPrimaryColor(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Background color</span>
              <input
                name="background_color"
                type="color"
                className="ui-input"
                value={backgroundColor}
                onChange={(event) => setBackgroundColor(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Indicator color</span>
              <input
                name="indicator_color"
                type="color"
                className="ui-input"
                value={indicatorColor}
                onChange={(event) => setIndicatorColor(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Loading color</span>
              <input
                name="loading_color"
                type="color"
                className="ui-input"
                value={loadingColor}
                onChange={(event) => setLoadingColor(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Card color</span>
              <input
                name="card_color"
                type="color"
                className="ui-input"
                value={cardColor}
                onChange={(event) => setCardColor(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Border color</span>
              <input
                name="border_color"
                type="color"
                className="ui-input"
                value={borderColor}
                onChange={(event) => setBorderColor(event.target.value)}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="ui-panel space-y-6">
        <div className="ui-h3">Links y overrides</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="ui-label">Review URL</span>
            <input name="review_url" className="ui-input" defaultValue={initial.review_url} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Maps URL</span>
            <input name="maps_url" className="ui-input" defaultValue={initial.maps_url} />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Direccion override</span>
            <input name="address_override" className="ui-input" defaultValue={initial.address_override} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Lat override</span>
            <input name="latitude_override" className="ui-input" defaultValue={initial.latitude_override} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Lng override</span>
            <input name="longitude_override" className="ui-input" defaultValue={initial.longitude_override} />
          </label>
        </div>
      </div>

      <PassStylePreview
        name={name}
        subtitle={subtitle}
        tags={tags}
        logoUrl={logoUrl}
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

      <div className="flex items-center gap-3">
        <button type="submit" className="ui-btn ui-btn--brand">
          {mode === "create" ? "Crear negocio" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
