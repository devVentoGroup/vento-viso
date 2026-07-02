import { validateDraftShift } from "./rules";
import { scoreSuggestion } from "./scoring";
import type {
  PlanningEmployee,
  PlanningGenerationInput,
  PlanningShiftDraft,
  PlanningSuggestion,
} from "./types";

function getShiftMinutes(
  shift: Pick<PlanningShiftDraft, "startTime" | "endTime" | "shiftKind">,
) {
  if (shift.shiftKind === "descanso") return 0;
  const [startHours, startMinutes] = shift.startTime
    .slice(0, 5)
    .split(":")
    .map(Number);
  const [endHours, endMinutes] = shift.endTime
    .slice(0, 5)
    .split(":")
    .map(Number);
  return Math.max(
    0,
    endHours * 60 + endMinutes - (startHours * 60 + startMinutes),
  );
}

function getAssignedMinutes(employeeId: string, shifts: PlanningShiftDraft[]) {
  return shifts
    .filter((shift) => shift.employeeId === employeeId)
    .reduce((total, shift) => total + getShiftMinutes(shift), 0);
}

function getShiftStartMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function getShiftDayPart(startTime: string) {
  const startMinutes = getShiftStartMinutes(startTime);
  if (startMinutes < 12 * 60) return "morning";
  if (startMinutes < 18 * 60) return "afternoon";
  return "evening";
}

function getRotationScore(
  employee: PlanningEmployee,
  requirement: PlanningGenerationInput["requirements"][number],
) {
  const dayPart = getShiftDayPart(requirement.startTime);
  const recentSamePart =
    dayPart === "morning"
      ? (employee.recentMorningShifts ?? 0)
      : dayPart === "afternoon"
        ? (employee.recentAfternoonShifts ?? 0)
        : (employee.recentEveningShifts ?? 0);
  const lastWeekSamePart =
    dayPart === "morning"
      ? (employee.lastWeekMorningShifts ?? 0)
      : dayPart === "afternoon"
        ? (employee.lastWeekAfternoonShifts ?? 0)
        : (employee.lastWeekEveningShifts ?? 0);
  const openingPenalty =
    dayPart === "morning" ? (employee.recentOpeningShifts ?? 0) : 0;
  const closingPenalty =
    dayPart === "evening" ? (employee.recentClosingShifts ?? 0) : 0;

  return -(
    lastWeekSamePart * 4 +
    recentSamePart * 1.5 +
    openingPenalty * 1.5 +
    closingPenalty * 1.5
  );
}

function getPreferenceScore(
  employee: PlanningEmployee,
  requirement: PlanningGenerationInput["requirements"][number],
) {
  const startMinutes = getShiftStartMinutes(requirement.startTime);
  const isMorning = startMinutes < 12 * 60;
  const isAfternoon = startMinutes >= 12 * 60 && startMinutes < 18 * 60;
  const isEvening = startMinutes >= 18 * 60;

  let score = 0;
  if (isMorning && employee.prefersMorning) score += 2;
  if (isAfternoon && employee.prefersAfternoon) score += 2;
  if (isEvening && employee.prefersEvening) score += 2;
  if (isMorning && employee.avoidOpening) score -= 2;
  if (isEvening && employee.avoidClosing) score -= 2;
  return score;
}

function normalizeRole(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function roleMatches(
  role: string | null | undefined,
  requiredRole: string | null | undefined,
) {
  const normalizedRole = normalizeRole(role);
  const normalizedRequired = normalizeRole(requiredRole);
  if (!normalizedRequired) return true;
  if (!normalizedRole) return false;
  return (
    normalizedRole === normalizedRequired ||
    normalizedRole.includes(normalizedRequired) ||
    normalizedRequired.includes(normalizedRole)
  );
}

function employeeRoleScore(
  employee: PlanningEmployee,
  requiredRole: string | null | undefined,
) {
  if (!requiredRole) return employee.defaultOperationalRoleCode ? 1 : 0;

  const operationalRoles = employee.operationalRoleCodes ?? [];
  if (
    employee.defaultOperationalRoleCode &&
    normalizeRole(employee.defaultOperationalRoleCode) ===
      normalizeRole(requiredRole)
  ) {
    return 5;
  }
  if (
    operationalRoles.some(
      (roleCode) => normalizeRole(roleCode) === normalizeRole(requiredRole),
    )
  ) {
    return 4;
  }
  if (
    operationalRoles.some((roleCode) => roleMatches(roleCode, requiredRole))
  ) {
    return 3;
  }
  if (roleMatches(employee.roleCode, requiredRole)) return 2;
  return 0;
}

function sortCandidates(
  employees: PlanningEmployee[],
  requirement: PlanningGenerationInput["requirements"][number],
  allShifts: PlanningShiftDraft[],
) {
  return [...employees].sort((left, right) => {
    const leftRoleScore = employeeRoleScore(left, requirement.roleCode);
    const rightRoleScore = employeeRoleScore(right, requirement.roleCode);

    if (leftRoleScore !== rightRoleScore) return rightRoleScore - leftRoleScore;

    const leftMinutes = getAssignedMinutes(left.id, allShifts);
    const rightMinutes = getAssignedMinutes(right.id, allShifts);
    const shiftMinutes = getShiftMinutes({
      startTime: requirement.startTime,
      endTime: requirement.endTime,
      shiftKind: "laboral",
    });

    const leftWouldExceed =
      left.maxWeeklyMinutes != null &&
      leftMinutes + shiftMinutes > left.maxWeeklyMinutes;
    const rightWouldExceed =
      right.maxWeeklyMinutes != null &&
      rightMinutes + shiftMinutes > right.maxWeeklyMinutes;
    if (leftWouldExceed !== rightWouldExceed)
      return Number(leftWouldExceed) - Number(rightWouldExceed);

    const leftTargetGap =
      left.targetWeeklyMinutes != null
        ? Math.max(0, left.targetWeeklyMinutes - leftMinutes)
        : Number.MAX_SAFE_INTEGER;
    const rightTargetGap =
      right.targetWeeklyMinutes != null
        ? Math.max(0, right.targetWeeklyMinutes - rightMinutes)
        : Number.MAX_SAFE_INTEGER;
    if (leftTargetGap !== rightTargetGap) return rightTargetGap - leftTargetGap;

    const leftPreferenceScore = getPreferenceScore(left, requirement);
    const rightPreferenceScore = getPreferenceScore(right, requirement);
    if (leftPreferenceScore !== rightPreferenceScore)
      return rightPreferenceScore - leftPreferenceScore;

    const leftRotationScore = getRotationScore(left, requirement);
    const rightRotationScore = getRotationScore(right, requirement);
    if (leftRotationScore !== rightRotationScore)
      return rightRotationScore - leftRotationScore;

    if (leftMinutes !== rightMinutes) return leftMinutes - rightMinutes;

    return String(left.fullName ?? left.id).localeCompare(
      String(right.fullName ?? right.id),
      "es",
    );
  });
}

export function generateWeeklySuggestion(
  input: PlanningGenerationInput,
): PlanningSuggestion {
  const proposedShifts: PlanningShiftDraft[] = [];
  const warnings: string[] = [];

  for (const requirement of input.requirements) {
    const sortedCandidates = sortCandidates(
      input.employees.filter(
        (employee) =>
          employee.isActive && employee.siteIds.includes(requirement.siteId),
      ),
      requirement,
      [...input.existingShifts, ...proposedShifts],
    );

    let assigned = false;

    for (const candidate of sortedCandidates) {
      const operationalRole =
        requirement.roleCode ??
        candidate.defaultOperationalRoleCode ??
        candidate.roleCode ??
        null;
      const draft: PlanningShiftDraft = {
        employeeId: candidate.id,
        siteId: requirement.siteId,
        areaId: candidate.defaultAreaId ?? null,
        shiftDate: requirement.shiftDate,
        startTime: requirement.startTime,
        endTime: requirement.endTime,
        shiftKind: "laboral",
        requiredRoleCode: operationalRole,
        notes: "Sugerencia inicial del motor de planificación",
        explanation: {
          operationalRole,
          defaultAreaId: candidate.defaultAreaId ?? null,
          rotation: {
            dayPart: getShiftDayPart(requirement.startTime),
            recentMorningShifts: candidate.recentMorningShifts ?? 0,
            recentAfternoonShifts: candidate.recentAfternoonShifts ?? 0,
            recentEveningShifts: candidate.recentEveningShifts ?? 0,
            lastWeekMorningShifts: candidate.lastWeekMorningShifts ?? 0,
            lastWeekAfternoonShifts: candidate.lastWeekAfternoonShifts ?? 0,
            lastWeekEveningShifts: candidate.lastWeekEveningShifts ?? 0,
            recentOpeningShifts: candidate.recentOpeningShifts ?? 0,
            recentClosingShifts: candidate.recentClosingShifts ?? 0,
          },
        },
      };

      const violations = validateDraftShift({
        shift: draft,
        employee: candidate,
        availability: input.availability,
        existingShifts: [...input.existingShifts, ...proposedShifts],
        roleConcurrencyLimits: input.roleConcurrencyLimits,
      });

      if (violations.length > 0) {
        continue;
      }

      proposedShifts.push(draft);
      assigned = true;
      break;
    }

    if (!assigned) {
      warnings.push(
        `Sin candidato valido para ${requirement.shiftDate} ${requirement.startTime}-${requirement.endTime}${
          requirement.roleCode ? ` (${requirement.roleCode})` : ""
        }.`,
      );
    }
  }

  const { score, breakdown } = scoreSuggestion(
    { shifts: proposedShifts },
    input,
  );

  return {
    shifts: proposedShifts,
    score,
    breakdown,
    warnings,
  };
}
