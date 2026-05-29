"use client";

import { useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type SiteOption = {
  id: string;
  name: string | null;
};

type RoleOption = {
  code: string;
  name: string;
};

type StaffInviteFormProps = {
  sites: SiteOption[];
  roles: RoleOption[];
};

export function StaffInviteForm({ sites, roles }: StaffInviteFormProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [siteId, setSiteId] = useState("");
  const [role, setRole] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const inFlightRef = useRef(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setStatus("saving");
    setMessage("");

    const supabase = createClient();
    try {
      const { data, error } = await supabase.functions.invoke("staff-invitations-create", {
        body: {
          email: email.trim(),
          full_name: fullName.trim() || null,
          site_id: siteId,
          role,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        },
      });

      if (error) {
        let detail = error.message || "No se pudo crear la invitacion.";
        const context = (error as { context?: unknown }).context;
        if (context && typeof (context as Response).clone === "function") {
          try {
            const payload = await (context as Response).clone().json();
            detail = payload?.error || payload?.message || payload?.details || detail;
          } catch {
            // Non-JSON function error.
          }
        }
        setStatus("error");
        setMessage(detail);
        return;
      }

      const response = data as { message?: string; invited?: boolean; added_to_team?: boolean; error?: string } | null;
      if (response?.error || (!response?.invited && !response?.added_to_team)) {
        setStatus("error");
        setMessage(response?.error || "No se pudo completar la invitacion.");
        return;
      }

      setStatus("done");
      setMessage(response.message || "Invitacion enviada. El trabajador recibira un correo para crear contrasena.");
    } finally {
      inFlightRef.current = false;
    }
  };

  const canSubmit = email.trim() && siteId && role;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="ui-label">Email</span>
          <input
            className="ui-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="correo@dominio.com"
            required
          />
        </label>
        <label className="space-y-2">
          <span className="ui-label">Nombre completo</span>
          <input
            className="ui-input"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Nombre y apellido"
          />
        </label>
        <label className="space-y-2">
          <span className="ui-label">Sede</span>
          <select
            className="ui-input"
            value={siteId}
            onChange={(event) => setSiteId(event.target.value)}
            required
          >
            <option value="">Selecciona una sede</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name ?? site.id}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="ui-label">Rol</span>
          <select
            className="ui-input"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            required
          >
            <option value="">Selecciona un rol</option>
            {roles.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="ui-label">Expira</span>
          <input
            className="ui-input"
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </label>
      </div>

      {status === "error" ? <div className="ui-alert ui-alert--error">{message}</div> : null}
      {status === "done" ? <div className="ui-alert ui-alert--success">{message}</div> : null}

      <div className="flex gap-3">
        <button
          type="submit"
          className="ui-btn ui-btn--brand"
          disabled={!canSubmit || status === "saving"}
        >
          {status === "saving" ? "Guardando..." : "Crear invitacion"}
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--ghost"
          onClick={() => {
            setEmail("");
            setFullName("");
            setSiteId("");
            setRole("");
            setExpiresAt("");
            setStatus("idle");
            setMessage("");
          }}
        >
          Limpiar
        </button>
      </div>
    </form>
  );
}
