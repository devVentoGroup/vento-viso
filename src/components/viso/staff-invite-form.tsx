"use client";

import { useMemo, useState } from "react";

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

const INVITE_BASE_URL =
  process.env.NEXT_PUBLIC_STAFF_INVITE_BASE_URL ||
  "https://os.ventogroup.co/invite";

function buildInviteUrl(token: string) {
  if (!token) return "";
  if (INVITE_BASE_URL.includes(":token")) {
    return INVITE_BASE_URL.replace(":token", token);
  }
  const url = new URL(INVITE_BASE_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

export function StaffInviteForm({ sites, roles }: StaffInviteFormProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [siteId, setSiteId] = useState("");
  const [role, setRole] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");

  const inviteUrl = useMemo(() => buildInviteUrl(token), [token]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setStatus("saving");
    setMessage("");

    const supabase = createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;

    const inviteToken = crypto.randomUUID();
    const payload = {
      token: inviteToken,
      email: email.trim() || null,
      full_name: fullName.trim() || null,
      staff_site_id: siteId || null,
      staff_role: role || null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      created_by: userId,
      status: "pending",
    };

    const { error } = await supabase.from("staff_invitations").insert(payload);

    if (error) {
      setStatus("error");
      setMessage(error.message || "No se pudo crear la invitacion.");
      return;
    }

    setStatus("done");
    setMessage("Invitacion creada.");
    setToken(inviteToken);
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

      {token ? (
        <div className="ui-panel-soft space-y-2">
          <div className="ui-label">Link de invitacion</div>
          <div className="ui-code break-all">{inviteUrl || token}</div>
          <button
            type="button"
            className="ui-btn ui-btn--ghost"
            onClick={() => {
              if (inviteUrl) {
                void navigator.clipboard.writeText(inviteUrl);
              }
            }}
          >
            Copiar link
          </button>
        </div>
      ) : null}

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
            setToken("");
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
