type AvailabilityRowView = {
  id: string
  employeeId: string
  employeeName: string
  dayOfWeek: number
  availableFrom: string
  availableTo: string
  availabilityKind: "preferred" | "allowed" | "blocked"
}

type EmployeeOption = {
  id: string
  label: string
}

type PlanningAvailabilityPanelProps = {
  siteId: string
  weekStartIso: string
  returnTo: string
  employees: EmployeeOption[]
  rows: AvailabilityRowView[]
  saveAction: (formData: FormData) => Promise<void>
  deleteAction: (formData: FormData) => Promise<void>
}

const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

const KIND_LABELS: Record<AvailabilityRowView["availabilityKind"], string> = {
  preferred: "Preferido",
  allowed: "Permitido",
  blocked: "Bloqueado",
}

export function PlanningAvailabilityPanel({
  siteId,
  weekStartIso,
  returnTo,
  employees,
  rows,
  saveAction,
  deleteAction,
}: PlanningAvailabilityPanelProps) {
  return (
    <div className="ui-panel space-y-4">
      <div>
        <div className="ui-h3">Disponibilidad del equipo</div>
        <p className="mt-1 text-sm text-[var(--ui-muted)]">
          Úsala para bloquear o permitir franjas por trabajador. La sugerencia automática respeta estos rangos.
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="max-h-80 space-y-2 overflow-auto pr-1">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[var(--ui-text)]">{row.employeeName}</div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  {DAY_LABELS[row.dayOfWeek]} · {row.availableFrom.slice(0, 5)} - {row.availableTo.slice(0, 5)} · {KIND_LABELS[row.availabilityKind]}
                </div>
              </div>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="site_id" value={siteId} />
                <input type="hidden" name="week_start" value={weekStartIso} />
                <input type="hidden" name="return_to" value={returnTo} />
                <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm text-[var(--ui-danger)]">
                  Quitar
                </button>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-5 text-sm text-[var(--ui-muted)]">
          Aún no hay disponibilidad configurada. Si no agregas nada, la sugerencia asume que el trabajador está disponible.
        </div>
      )}

      <form action={saveAction} className="grid gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 md:grid-cols-6">
        <input type="hidden" name="site_id" value={siteId} />
        <input type="hidden" name="week_start" value={weekStartIso} />
        <input type="hidden" name="return_to" value={returnTo} />

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="ui-label">Trabajador</span>
          <select name="employee_id" className="ui-input" required defaultValue="">
            <option value="" disabled>
              Seleccionar
            </option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Día</span>
          <select name="day_of_week" className="ui-input" defaultValue="1">
            {DAY_LABELS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Desde</span>
          <input name="available_from" type="time" className="ui-input" required defaultValue="06:00" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Hasta</span>
          <input name="available_to" type="time" className="ui-input" required defaultValue="14:00" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Tipo</span>
          <select name="availability_kind" className="ui-input" defaultValue="blocked">
            <option value="blocked">Bloqueado</option>
            <option value="allowed">Permitido</option>
            <option value="preferred">Preferido</option>
          </select>
        </label>

        <div className="md:col-span-6 flex justify-end">
          <button type="submit" className="ui-btn ui-btn--brand">
            Guardar disponibilidad
          </button>
        </div>
      </form>
    </div>
  )
}
