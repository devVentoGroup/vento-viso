import type {
  PlanningAvailability,
  PlanningEmployee,
  PlanningRoleConcurrencyLimit,
  PlanningRuleViolation,
  PlanningShiftDraft,
} from "./types";

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd;
}

function normalizeRole(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function roleMatches(
  employeeRole: string | null | undefined,
  requiredRole: string | null | undefined,
) {
  const employee = normalizeRole(employeeRole);
  const required = normalizeRole(requiredRole);
  if (!required) return true;
  if (!employee) return false;
  return (
    employee === required ||
    employee.includes(required) ||
    required.includes(employee)
  );
}

function employeeCanCoverRole(
  employee: PlanningEmployee,
  requiredRole: string | null | undefined,
) {
  if (!requiredRole) return true;
  if (roleMatches(employee.roleCode, requiredRole)) return true;
  return (employee.operationalRoleCodes ?? []).some((roleCode) =>
    roleMatches(roleCode, requiredRole),
  );
}

function getDayOfWeek(iso: string) {
  const parsed = new Date(`${iso}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? -1 : parsed.getDay();
}

function limitAppliesToShift(
  limit: PlanningRoleConcurrencyLimit,
  shift: PlanningShiftDraft,
) {
  if (!roleMatches(shift.requiredRoleCode, limit.roleCode)) return false;

  const dayOfWeek = getDayOfWeek(shift.shiftDate);
  if (limit.dayOfWeek != null && limit.dayOfWeek !== dayOfWeek) return false;

  if (
    !limit.appliesAcrossSites &&
    limit.siteId &&
    shift.siteId !== limit.siteId
  )
    return false;

  if (
    limit.siteId &&
    !limit.appliesAcrossSites &&
    shift.siteId !== limit.siteId
  )
    return false;

  if (limit.startTime && limit.endTime) {
    return overlaps(
      limit.startTime,
      limit.endTime,
      shift.startTime,
      shift.endTime,
    );
  }

  return true;
}

function countConcurrentRoleShifts(
  limit: PlanningRoleConcurrencyLimit,
  shift: PlanningShiftDraft,
  shifts: PlanningShiftDraft[],
) {
  return shifts.filter((item) => {
    if (item.shiftKind === "descanso") return false;
    if (item.shiftDate !== shift.shiftDate) return false;
    if (!limitAppliesToShift(limit, item)) return false;
    if (!overlaps(item.startTime, item.endTime, shift.startTime, shift.endTime))
      return false;
    if (!limit.appliesAcrossSites) {
      const scopedSiteId = limit.siteId ?? shift.siteId;
      return item.siteId === scopedSiteId;
    }
    return true;
  }).length;
}

export function validateDraftShift(args: {
  shift: PlanningShiftDraft;
  employee: PlanningEmployee | undefined;
  availability: PlanningAvailability[];
  existingShifts: PlanningShiftDraft[];
  roleConcurrencyLimits?: PlanningRoleConcurrencyLimit[];
}) {
  const violations: PlanningRuleViolation[] = [];
  const {
    shift,
    employee,
    availability,
    existingShifts,
    roleConcurrencyLimits = [],
  } = args;

  if (!employee || !employee.isActive) {
    violations.push({
      code: "employee_inactive",
      message: "El trabajador no está activo.",
    });
    return violations;
  }

  if (!employee.siteIds.includes(shift.siteId)) {
    violations.push({
      code: "site_mismatch",
      message: "El trabajador no está asignado a esta sede.",
    });
  }

  if (!employeeCanCoverRole(employee, shift.requiredRoleCode)) {
    violations.push({
      code: "role_mismatch",
      message: "El trabajador no cumple el rol requerido para este bloque.",
    });
  }

  const dayAvailability = availability.filter(
    (item) =>
      item.employeeId === shift.employeeId &&
      item.shiftDate === shift.shiftDate &&
      (!item.siteId || item.siteId === shift.siteId),
  );

  const blockedAvailability = dayAvailability.filter(
    (item) => item.availabilityKind === "blocked" || item.isAvailable === false,
  );
  const positiveAvailability = dayAvailability.filter(
    (item) =>
      item.availabilityKind === "preferred" ||
      item.availabilityKind === "allowed" ||
      (item.availabilityKind == null && item.isAvailable !== false),
  );

  if (
    blockedAvailability.some((item) =>
      overlaps(
        item.availableFrom,
        item.availableTo,
        shift.startTime,
        shift.endTime,
      ),
    )
  ) {
    violations.push({
      code: "blocked_window",
      message: "El turno propuesto cae dentro de un bloqueo declarado.",
    });
  }

  if (
    positiveAvailability.length > 0 &&
    !positiveAvailability.some(
      (item) =>
        item.availableFrom <= shift.startTime &&
        item.availableTo >= shift.endTime,
    )
  ) {
    violations.push({
      code: "outside_availability",
      message: "El turno propuesto queda fuera de la disponibilidad declarada.",
    });
  }

  const overlappingShift = existingShifts.find(
    (item) =>
      item.employeeId === shift.employeeId &&
      item.shiftDate === shift.shiftDate &&
      overlaps(item.startTime, item.endTime, shift.startTime, shift.endTime),
  );

  if (overlappingShift) {
    violations.push({
      code: "shift_overlap",
      message: "El turno propuesto se cruza con otro turno del trabajador.",
    });
  }

  const exceededRoleLimit = roleConcurrencyLimits.find((limit) => {
    if (!limitAppliesToShift(limit, shift)) return false;
    const currentCount = countConcurrentRoleShifts(
      limit,
      shift,
      existingShifts,
    );
    return currentCount + 1 > limit.maxConcurrent;
  });

  if (exceededRoleLimit) {
    violations.push({
      code: "role_concurrency_limit",
      message: `Ya se alcanzo el maximo simultaneo para ${exceededRoleLimit.roleCode}.`,
    });
  }

  return violations;
}
