import type {
  PlanningAvailability,
  PlanningEmployee,
  PlanningRuleViolation,
  PlanningShiftDraft,
} from "./types"

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd
}

function normalizeRole(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

function roleMatches(employeeRole: string | null | undefined, requiredRole: string | null | undefined) {
  const employee = normalizeRole(employeeRole)
  const required = normalizeRole(requiredRole)
  if (!required) return true
  if (!employee) return false
  return employee === required || employee.includes(required) || required.includes(employee)
}

export function validateDraftShift(args: {
  shift: PlanningShiftDraft
  employee: PlanningEmployee | undefined
  availability: PlanningAvailability[]
  existingShifts: PlanningShiftDraft[]
}) {
  const violations: PlanningRuleViolation[] = []
  const { shift, employee, availability, existingShifts } = args

  if (!employee || !employee.isActive) {
    violations.push({
      code: "employee_inactive",
      message: "El trabajador no está activo.",
    })
    return violations
  }

  if (!employee.siteIds.includes(shift.siteId)) {
    violations.push({
      code: "site_mismatch",
      message: "El trabajador no está asignado a esta sede.",
    })
  }

  if (!roleMatches(employee.roleCode, shift.requiredRoleCode)) {
    violations.push({
      code: "role_mismatch",
      message: "El trabajador no cumple el rol requerido para este bloque.",
    })
  }

  const dayAvailability = availability.filter(
    (item) =>
      item.employeeId === shift.employeeId &&
      item.shiftDate === shift.shiftDate &&
      (!item.siteId || item.siteId === shift.siteId),
  )

  const blockedAvailability = dayAvailability.filter(
    (item) => item.availabilityKind === "blocked" || item.isAvailable === false,
  )
  const positiveAvailability = dayAvailability.filter(
    (item) =>
      item.availabilityKind === "preferred" ||
      item.availabilityKind === "allowed" ||
      (item.availabilityKind == null && item.isAvailable !== false),
  )

  if (
    blockedAvailability.some((item) =>
      overlaps(item.availableFrom, item.availableTo, shift.startTime, shift.endTime),
    )
  ) {
    violations.push({
      code: "blocked_window",
      message: "El turno propuesto cae dentro de un bloqueo declarado.",
    })
  }

  if (
    positiveAvailability.length > 0 &&
    !positiveAvailability.some(
      (item) => item.availableFrom <= shift.startTime && item.availableTo >= shift.endTime,
    )
  ) {
    violations.push({
      code: "outside_availability",
      message: "El turno propuesto queda fuera de la disponibilidad declarada.",
    })
  }

  const overlappingShift = existingShifts.find(
    (item) =>
      item.employeeId === shift.employeeId &&
      item.shiftDate === shift.shiftDate &&
      overlaps(item.startTime, item.endTime, shift.startTime, shift.endTime),
  )

  if (overlappingShift) {
    violations.push({
      code: "shift_overlap",
      message: "El turno propuesto se cruza con otro turno del trabajador.",
    })
  }

  return violations
}
