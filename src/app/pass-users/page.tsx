import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  loyalty_points: number | null;
  is_active: boolean | null;
  created_at: string | null;
};

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function PassUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const q = String(sp.q ?? "").trim();
  const status = String(sp.status ?? "").trim();
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: "/pass-users",
  });

  let query = supabase
    .from("users")
    .select("id,full_name,email,phone,loyalty_points,is_active,created_at")
    .eq("is_client", true)
    .order("created_at", { ascending: false })
    .limit(200);

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  if (status === "active") {
    query = query.eq("is_active", true);
  }

  if (status === "inactive") {
    query = query.eq("is_active", false);
  }

  const { data } = await query;
  const users = (data ?? []) as UserRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios Vento Pass"
        subtitle="Clientes, puntos y estado de la cuenta."
        actions={
          <Link href="/pass-users/new" className="ui-btn ui-btn--brand">
            Crear usuario
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="ui-panel space-y-4">
        <form className="flex flex-wrap gap-3" action="/pass-users" method="get">
          <input
            name="q"
            className="ui-input min-w-[220px]"
            placeholder="Buscar por nombre, email o telefono"
            defaultValue={q}
          />
          <select name="status" className="ui-input w-40" defaultValue={status}>
            <option value="">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
          <button type="submit" className="ui-btn ui-btn--ghost">
            Filtrar
          </button>
        </form>

        {users.length === 0 ? (
          <div className="ui-empty">No hay usuarios registrados.</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Telefono</TableHeaderCell>
                <TableHeaderCell>Puntos</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="font-semibold">{user.full_name ?? "Sin nombre"}</div>
                    <div className="ui-caption">{user.id}</div>
                  </TableCell>
                  <TableCell>{user.email ?? "-"}</TableCell>
                  <TableCell>{user.phone ?? "-"}</TableCell>
                  <TableCell>{user.loyalty_points ?? 0}</TableCell>
                  <TableCell>
                    <span className={`ui-chip ${user.is_active ? "ui-chip--success" : ""}`}>
                      {user.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/pass-users/${user.id}`} className="ui-btn ui-btn--ghost">
                      Editar
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}