type WorkerRuleRow = {
  employeeId: string
  employeeName: string
  targetWeeklyMinutes: number
  maxWeeklyMinutes: number
  prefersMorning: boolean
  prefersAfternoon: boolean
  prefersEvening: boolean
  avoidOpening: boolean
  avoidClosing: boolean
}

type EmployeeOption = {
  id: string
  label: string
}

type PlanningWorkerRulesPanelProps = {
  siteId: string
  weekStartIso: string
  returnTo: string
  employees: EmployeeOption[]
  rows: WorkerRuleRow[]
  saveAction: (formData: FormData) => Promise<void>
}

function formatMinutesAsHours(value: number) {
  return `${Math.round(value / 60)}h`
}

export function PlanningWorkerRulesPanel({
  siteId,
  weekStartIso,
  returnTo,
  employees,
  rows,
  saveAction,
}: PlanningWorkerRulesPanelProps) {
  return (
    <div className="ui-panel space-y-4">
      <div>
        <div className="ui-h3">Límites y preferencias por trabajador</div>
        <p className="mt-1 text-sm text-[var(--ui-muted)]">
          Ajusta objetivo semanal, tope y preferencias de franja para mejorar la calidad del borrador sugerido.
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="max-h-80 space-y-2 overflow-auto pr-1">
          {rows.map((row) => {
            const preferences = [
              row.prefersMorning ? "mañana" : null,
              row.prefersAfternoon ? "tarde" : null,
              row.prefersEvening ? "noche" : null,
              row.avoidOpening ? "evita apertura" : null,
              row.avoidClosing ? "evita cierre" : null,
            ].filter(Boolean)

            return (
              <div
                key={row.employeeId}
                className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-3"
              >
                <div className="text-sm font-semibold text-[var(--ui-text)]">{row.employeeName}</div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  Objetivo {formatMinutesAsHours(row.targetWeeklyMinutes)} · Tope {formatMinutesAsHours(row.maxWeeklyMinutes)}
                </div>
                {preferences.length > 0 ? (
                  <div className="mt-2 text-xs text-[var(--ui-muted)]">{preferences.join(" · ")}</div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}

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
          <span className="ui-label">Objetivo semanal</span>
          <input name="target_weekly_minutes" type="number" min={0} className="ui-input" defaultValue="2400" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Máximo semanal</span>
          <input name="max_weekly_minutes" type="number" min={0} className="ui-input" defaultValue="2880" />
        </label>

        <div className="md:col-span-2 grid grid-cols-2 gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
            <input type="checkbox" name="prefers_morning" value="1" className="rounded border-[var(--ui-border)]" />
            Prefiere mañana
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
            <input type="checkbox" name="prefers_afternoon" value="1" className="rounded border-[var(--ui-border)]" />
            Prefiere tarde
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
            <input type="checkbox" name="prefers_evening" value="1" className="rounded border-[var(--ui-border)]" />
            Prefiere noche
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
            <input type="checkbox" name="avoid_opening" value="1" className="rounded border-[var(--ui-border)]" />
            Evita apertura
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)] md:col-span-2">
            <input type="checkbox" name="avoid_closing" value="1" className="rounded border-[var(--ui-border)]" />
            Evita cierre
          </label>
        </div>

        <div className="md:col-span-6 flex justify-end">
          <button type="submit" className="ui-btn ui-btn--brand">
            Guardar reglas del trabajador
          </button>
        </div>
      </form>
    </div>
  )
}
