export type PlanningRoleCode = string

export type PlanningEmployee = {
  id: string
  fullName: string | null
  roleCode: PlanningRoleCode | null
  siteIds: string[]
  isActive: boolean
  targetWeeklyMinutes?: number | null
  maxWeeklyMinutes?: number | null
  prefersMorning?: boolean
  prefersAfternoon?: boolean
  prefersEvening?: boolean
  avoidOpening?: boolean
  avoidClosing?: boolean
}

export type PlanningShiftDraft = {
  employeeId: string
  siteId: string
  shiftDate: string
  startTime: string
  endTime: string
  shiftKind: "laboral" | "descanso"
  requiredRoleCode?: PlanningRoleCode | null
  notes?: string | null
}

export type PlanningRequirement = {
  siteId: string
  shiftDate: string
  startTime: string
  endTime: string
  requiredHeadcount: number
  roleCode?: PlanningRoleCode | null
}

export type PlanningAvailability = {
  employeeId: string
  siteId?: string | null
  shiftDate: string
  availableFrom: string
  availableTo: string
  isAvailable?: boolean
  availabilityKind?: "preferred" | "allowed" | "blocked"
}

export type PlanningRuleViolation = {
  code:
    | "employee_inactive"
    | "site_mismatch"
    | "role_mismatch"
    | "outside_availability"
    | "blocked_window"
    | "shift_overlap"
  message: string
}

export type PlanningScoreBreakdown = {
  coverage: number
  fairness: number
  continuity: number
  preference: number
}

export type PlanningSuggestion = {
  shifts: PlanningShiftDraft[]
  score: number
  breakdown: PlanningScoreBreakdown
  warnings: string[]
}

export type PlanningGenerationInput = {
  siteId: string
  weekStartIso: string
  employees: PlanningEmployee[]
  requirements: PlanningRequirement[]
  availability: PlanningAvailability[]
  existingShifts: PlanningShiftDraft[]
}
