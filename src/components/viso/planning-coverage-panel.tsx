type CoverageRequirement = {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  minHeadcount: number
  idealHeadcount: number
  maxHeadcount: number | null
  requiredRoleCode: string | null
}

type PlanningCoveragePanelProps = {
  siteId: string
  weekStartIso: string
  returnTo: string
  requirements: CoverageRequirement[]
  roleOptions: string[]
  saveAction: (formData: FormData) => Promise<void>
  deleteAction: (formData: FormData) => Promise<void>
}

const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

export function PlanningCoveragePanel({
  siteId,
  weekStartIso,
  returnTo,
  requirements,
  roleOptions,
  saveAction,
  deleteAction,
}: PlanningCoveragePanelProps) {
  const grouped = DAY_LABELS.map((label, dayOfWeek) => ({
    label,
    dayOfWeek,
    items: requirements.filter((item) => item.dayOfWeek === dayOfWeek),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="ui-panel space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="ui-h3">Cobertura mínima por franja</div>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Esta es la base que usa VISO para sugerir borradores. Empieza por definir el mínimo por día y horario.
          </p>
        </div>
      </div>

      {grouped.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {grouped.map((group) => (
            <div key={group.dayOfWeek} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
              <div className="mb-3 text-sm font-semibold text-[var(--ui-text)]">{group.label}</div>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[var(--ui-text)]">
                        {item.startTime.slice(0, 5)} - {item.endTime.slice(0, 5)}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        Mínimo {item.minHeadcount}
                        {item.idealHeadcount > item.minHeadcount ? ` · Ideal ${item.idealHeadcount}` : ""}
                        {item.requiredRoleCode ? ` · ${item.requiredRoleCode}` : " · cualquier rol"}
                      </div>
                    </div>
                    <form action={deleteAction}>
                      <input type="hidden" name="id" value={item.id} />
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
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-5 text-sm text-[var(--ui-muted)]">
          Aún no hay reglas de cobertura para esta sede. Agrega al menos una franja para usar la sugerencia automática.
        </div>
      )}

      <form action={saveAction} className="grid gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 md:grid-cols-7">
        <input type="hidden" name="site_id" value={siteId} />
        <input type="hidden" name="week_start" value={weekStartIso} />
        <input type="hidden" name="return_to" value={returnTo} />

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
          <span className="ui-label">Inicio</span>
          <input name="start_time" type="time" className="ui-input" required defaultValue="06:00" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Fin</span>
          <input name="end_time" type="time" className="ui-input" required defaultValue="14:00" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Mínimo</span>
          <input name="min_headcount" type="number" min={1} className="ui-input" required defaultValue="1" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Ideal</span>
          <input name="ideal_headcount" type="number" min={1} className="ui-input" required defaultValue="1" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Rol</span>
          <select name="required_role_code" className="ui-input" defaultValue="">
            <option value="">Cualquier rol</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button type="submit" className="ui-btn ui-btn--brand w-full">
            Guardar franja
          </button>
        </div>
      </form>
    </div>
  )
}
