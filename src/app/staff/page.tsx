import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type EmployeeRow = {
  id: string;
  full_name: string | null;
  alias: string | null;
  role: string | null;
  is_active: boolean | null;
  site?: { id: string; name: string | null } | null;
};

export default async function StaffPage() {
  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: "/staff",
  });

  const { data } = await supabase
    .from("employees")
    .select("id,full_name,alias,role,is_active,site:sites(id,name)")
    .order("full_name", { ascending: true });

  const employees = (data ?? []) as EmployeeRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trabajadores"
        subtitle="Gestiona empleados, roles y estado."
        actions={
          <Link href="/staff/new" className="ui-btn ui-btn--brand">
            Invitar trabajador
          </Link>
        }
      />

      <div className="ui-panel">
        {employees.length === 0 ? (
          <div className="ui-empty">No hay trabajadores registrados.</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Rol</TableHeaderCell>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <div className="font-semibold">{employee.full_name ?? "Sin nombre"}</div>
                    <div className="ui-caption">{employee.alias ?? employee.id}</div>
                  </TableCell>
                  <TableCell>{employee.role ?? ""}</TableCell>
                  <TableCell>{employee.site?.name ?? "Sin sede"}</TableCell>
                  <TableCell>
                    <span className={`ui-chip ${employee.is_active ? "ui-chip--success" : ""}`}>
                      {employee.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/staff/${employee.id}`} className="ui-btn ui-btn--ghost">
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
