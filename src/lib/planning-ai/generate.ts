import { validateDraftShift } from "./rules"
import { scoreSuggestion } from "./scoring"
import type {
  PlanningEmployee,
  PlanningGenerationInput,
  PlanningShiftDraft,
  PlanningSuggestion,
} from "./types"

function getShiftMinutes(shift: Pick<PlanningShiftDraft, "startTime" | "endTime" | "shiftKind">) {
  if (shift.shiftKind === "descanso") return 0
  const [startHours, startMinutes] = shift.startTime.slice(0, 5).split(":").map(Number)
  const [endHours, endMinutes] = shift.endTime.slice(0, 5).split(":").map(Number)
  return Math.max(0, endHours * 60 + endMinutes - (startHours * 60 + startMinutes))
}

function getAssignedMinutes(employeeId: string, shifts: PlanningShiftDraft[]) {
  return shifts
    .filter((shift) => shift.employeeId === employeeId)
    .reduce((total, shift) => total + getShiftMinutes(shift), 0)
}

function getShiftStartMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number)
  return hours * 60 + minutes
}

function getPreferenceScore(employee: PlanningEmployee, requirement: PlanningGenerationInput["requirements"][number]) {
  const startMinutes = getShiftStartMinutes(requirement.startTime)
  const isMorning = startMinutes < 12 * 60
  const isAfternoon = startMinutes >= 12 * 60 && startMinutes < 18 * 60
  const isEvening = startMinutes >= 18 * 60

  let score = 0
  if (isMorning && employee.prefersMorning) score += 2
  if (isAfternoon && employee.prefersAfternoon) score += 2
  if (isEvening && employee.prefersEvening) score += 2
  if (isMorning && employee.avoidOpening) score -= 2
  if (isEvening && employee.avoidClosing) score -= 2
  return score
}

function sortCandidates(
  employees: PlanningEmployee[],
  requirement: PlanningGenerationInput["requirements"][number],
  allShifts: PlanningShiftDraft[],
) {
  return [...employees].sort((left, right) => {
    const leftRoleScore =
      requirement.roleCode && left.roleCode
        ? Number(left.roleCode.toLowerCase().includes(requirement.roleCode.toLowerCase()))
        : Number(!requirement.roleCode)
    const rightRoleScore =
      requirement.roleCode && right.roleCode
        ? Number(right.roleCode.toLowerCase().includes(requirement.roleCode.toLowerCase()))
        : Number(!requirement.roleCode)

    if (leftRoleScore !== rightRoleScore) return rightRoleScore - leftRoleScore

    const leftMinutes = getAssignedMinutes(left.id, allShifts)
    const rightMinutes = getAssignedMinutes(right.id, allShifts)
    const shiftMinutes = getShiftMinutes({
      startTime: requirement.startTime,
      endTime: requirement.endTime,
      shiftKind: "laboral",
    })

    const leftWouldExceed = left.maxWeeklyMinutes != null && leftMinutes + shiftMinutes > left.maxWeeklyMinutes
    const rightWouldExceed =
      right.maxWeeklyMinutes != null && rightMinutes + shiftMinutes > right.maxWeeklyMinutes
    if (leftWouldExceed !== rightWouldExceed) return Number(leftWouldExceed) - Number(rightWouldExceed)

    const leftTargetGap =
      left.targetWeeklyMinutes != null ? Math.max(0, left.targetWeeklyMinutes - leftMinutes) : Number.MAX_SAFE_INTEGER
    const rightTargetGap =
      right.targetWeeklyMinutes != null ? Math.max(0, right.targetWeeklyMinutes - rightMinutes) : Number.MAX_SAFE_INTEGER
    if (leftTargetGap !== rightTargetGap) return rightTargetGap - leftTargetGap

    const leftPreferenceScore = getPreferenceScore(left, requirement)
    const rightPreferenceScore = getPreferenceScore(right, requirement)
    if (leftPreferenceScore !== rightPreferenceScore) return rightPreferenceScore - leftPreferenceScore

    if (leftMinutes !== rightMinutes) return leftMinutes - rightMinutes

    return String(left.fullName ?? left.id).localeCompare(String(right.fullName ?? right.id), "es")
  })
}

export function generateWeeklySuggestion(input: PlanningGenerationInput): PlanningSuggestion {
  const proposedShifts: PlanningShiftDraft[] = []
  const warnings: string[] = []

  for (const requirement of input.requirements) {
    const sortedCandidates = sortCandidates(
      input.employees.filter(
        (employee) => employee.isActive && employee.siteIds.includes(requirement.siteId),
      ),
      requirement,
      [...input.existingShifts, ...proposedShifts],
    )

    let assigned = false

    for (const candidate of sortedCandidates) {
      const draft: PlanningShiftDraft = {
        employeeId: candidate.id,
        siteId: requirement.siteId,
        shiftDate: requirement.shiftDate,
        startTime: requirement.startTime,
        endTime: requirement.endTime,
        shiftKind: "laboral",
        requiredRoleCode: requirement.roleCode,
        notes: "Sugerencia inicial del motor de planificación",
      }

      const violations = validateDraftShift({
        shift: draft,
        employee: candidate,
        availability: input.availability,
        existingShifts: [...input.existingShifts, ...proposedShifts],
      })

      if (violations.length > 0) {
        continue
      }

      proposedShifts.push(draft)
      assigned = true
      break
    }

    if (!assigned) {
      warnings.push(
        `Sin candidato valido para ${requirement.shiftDate} ${requirement.startTime}-${requirement.endTime}${
          requirement.roleCode ? ` (${requirement.roleCode})` : ""
        }.`,
      )
    }
  }

  const { score, breakdown } = scoreSuggestion({ shifts: proposedShifts }, input)

  return {
    shifts: proposedShifts,
    score,
    breakdown,
    warnings,
  }
}
