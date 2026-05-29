import type {
  PlanningGenerationInput,
  PlanningScoreBreakdown,
  PlanningSuggestion,
} from "./types"

function getShiftMinutes(startTime: string, endTime: string) {
  const [startHours, startMinutes] = startTime.slice(0, 5).split(":").map(Number)
  const [endHours, endMinutes] = endTime.slice(0, 5).split(":").map(Number)
  return Math.max(0, endHours * 60 + endMinutes - (startHours * 60 + startMinutes))
}

export function scoreSuggestion(
  suggestion: Pick<PlanningSuggestion, "shifts">,
  input: PlanningGenerationInput,
) {
  const coveredRequirements = input.requirements.filter((requirement) =>
    suggestion.shifts.some(
      (shift) =>
        shift.siteId === requirement.siteId &&
        shift.shiftDate === requirement.shiftDate &&
        shift.startTime === requirement.startTime &&
        shift.endTime === requirement.endTime,
    ),
  ).length

  const coverageRatio =
    input.requirements.length === 0 ? 1 : coveredRequirements / input.requirements.length

  const assignedMinutesByEmployee = new Map<string, number>()
  for (const shift of [...input.existingShifts, ...suggestion.shifts]) {
    assignedMinutesByEmployee.set(
      shift.employeeId,
      (assignedMinutesByEmployee.get(shift.employeeId) ?? 0) + getShiftMinutes(shift.startTime, shift.endTime),
    )
  }

  const fairnessSignals = input.employees
    .filter((employee) => employee.targetWeeklyMinutes != null)
    .map((employee) => {
      const target = Math.max(1, employee.targetWeeklyMinutes ?? 1)
      const assigned = assignedMinutesByEmployee.get(employee.id) ?? 0
      return Math.max(0, 1 - Math.abs(assigned - target) / target)
    })
  const fairness =
    fairnessSignals.length === 0
      ? 60
      : Math.round((fairnessSignals.reduce((sum, value) => sum + value, 0) / fairnessSignals.length) * 100)

  const preferenceSignals: number[] = suggestion.shifts.map((shift) => {
    const employee = input.employees.find((item) => item.id === shift.employeeId)
    if (!employee) return 0.5
    const [hours] = shift.startTime.slice(0, 5).split(":").map(Number)
    if (hours < 12 && employee.prefersMorning) return 1
    if (hours >= 12 && hours < 18 && employee.prefersAfternoon) return 1
    if (hours >= 18 && employee.prefersEvening) return 1
    if (hours < 12 && employee.avoidOpening) return 0
    if (hours >= 18 && employee.avoidClosing) return 0
    return 0.5
  })
  const preference =
    preferenceSignals.length === 0
      ? 50
      : Math.round((preferenceSignals.reduce((sum, value) => sum + value, 0) / preferenceSignals.length) * 100)

  const breakdown: PlanningScoreBreakdown = {
    coverage: Math.round(coverageRatio * 100),
    fairness,
    continuity: 60,
    preference,
  }

  const score = Math.round(
    breakdown.coverage * 0.55 +
      breakdown.fairness * 0.2 +
      breakdown.continuity * 0.15 +
      breakdown.preference * 0.1,
  )

  return { score, breakdown }
}
