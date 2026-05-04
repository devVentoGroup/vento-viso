"use client";

import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";

export type StaffPermissionOption = {
  id: string;
  appCode: string;
  code: string;
  name: string | null;
};

export type StaffEmployeePermission = {
  id: string;
  isAllowed: boolean;
  scopeType: string;
  permission: StaffPermissionOption;
};

type StaffPermissionsPanelProps = {
  employeeId: string;
  availablePermissions: StaffPermissionOption[];
  employeePermissions: StaffEmployeePermission[];
  canManagePermissions: boolean;
  grantPermissionAction: (formData: FormData) => Promise<void>;
  removePermissionAction: (formData: FormData) => Promise<void>;
};

export function StaffPermissionsPanel({
  employeeId,
  availablePermissions,
  employeePermissions,
  canManagePermissions,
  grantPermissionAction,
  removePermissionAction,
}: StaffPermissionsPanelProps) {
  return (
    <div className="ui-panel ui-panel--accent-brand space-y-4">
      <div>
        <h3 className="ui-h3">Permisos puntuales</h3>
        <p className="ui-caption mt-1">
          Usa permisos por trabajador para funciones temporales o administrativas sin cambiar el rol base.
        </p>
      </div>

      {employeePermissions.length === 0 ? (
        <div className="ui-empty">Sin permisos puntuales asignados.</div>
      ) : (
        <Table className="ui-table--accent">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Permiso</TableHeaderCell>
              <TableHeaderCell>Alcance</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
              {canManagePermissions ? <TableHeaderCell></TableHeaderCell> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {employeePermissions.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">
                    {item.permission.name ?? `${item.permission.appCode}.${item.permission.code}`}
                  </div>
                  <div className="ui-caption">
                    {item.permission.appCode}.{item.permission.code}
                  </div>
                </TableCell>
                <TableCell>{item.scopeType}</TableCell>
                <TableCell>
                  <span className={`ui-chip ${item.isAllowed ? "ui-chip--success" : "ui-chip--danger"}`}>
                    {item.isAllowed ? "Permitido" : "Denegado"}
                  </span>
                </TableCell>
                {canManagePermissions ? (
                  <TableCell className="text-right">
                    <form action={removePermissionAction}>
                      <input type="hidden" name="employee_id" value={employeeId} />
                      <input type="hidden" name="permission_row_id" value={item.id} />
                      <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                        Quitar
                      </button>
                    </form>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canManagePermissions ? (
        <form action={grantPermissionAction} className="grid gap-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 md:grid-cols-[1fr_auto_auto_auto]">
          <input type="hidden" name="employee_id" value={employeeId} />
          <label className="space-y-1">
            <span className="ui-label block">Permiso</span>
            <select name="permission_id" className="ui-input w-full" required>
              <option value="">Seleccionar</option>
              {availablePermissions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name ?? `${item.appCode}.${item.code}`} ({item.appCode}.{item.code})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="ui-label block">Alcance</span>
            <select name="scope_type" className="ui-input" defaultValue="global">
              <option value="global">Global</option>
              <option value="site">Sede principal</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="ui-label block">Estado</span>
            <select name="is_allowed" className="ui-input" defaultValue="true">
              <option value="true">Permitir</option>
              <option value="false">Denegar</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="ui-btn ui-btn--brand">
              Guardar
            </button>
          </div>
        </form>
      ) : (
        <p className="ui-caption">No tienes permiso para asignar permisos puntuales.</p>
      )}
    </div>
  );
}
