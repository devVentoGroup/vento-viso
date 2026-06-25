import { NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js"
import ExcelJS from "exceljs"

import { createClient as createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type EmployeeRow = {
  id: string
  role: string
  site_id: string | null
}

type ShiftPolicyRow = {
  late_grace_minutes: number | null
  auto_checkout_grace_minutes_after_end: number | null
}

type EmployeeRelation = {
  full_name: string | null
  alias: string | null
  role: string | null
}

type SiteRelation = {
  name: string | null
}

type AttendanceRow = {
  employee_id: string
  site_id: string
  action: "check_in" | "check_out"
  source: string | null
  notes: string | null
  occurred_at: string
  shift_id: string | null
  employees: EmployeeRelation | EmployeeRelation[] | null
  sites: SiteRelation | SiteRelation[] | null
}

type BreakRow = {
  employee_id: string
  site_id: string
  started_at: string
  ended_at: string | null
}

type ShiftEventRow = {
  employee_id: string
  site_id: string
  shift_start_at: string
  event_type: string
  occurred_at: string
  distance_meters: number | null
  notes: string | null
}

type ScheduledShiftRow = {
  id: string
  employee_id: string
  site_id: string
  shift_date: string
  start_time: string
  end_time: string
  break_minutes: number | null
  notes: string | null
  status: string
  published_at: string | null
  employees: EmployeeRelation | EmployeeRelation[] | null
  sites: SiteRelation | SiteRelation[] | null
}

type AttendanceSession = {
  key: string
  employeeId: string
  employeeName: string
  alias: string
  role: string
  siteId: string
  siteName: string
  shiftId: string | null
  checkInAt: string
  checkInSource: string | null
  checkOutAt: string | null
  checkOutSource: string | null
  checkOutNotes: string | null
  effectiveEndAt: string
  status: "Cerrado" | "Abierto"
  grossMinutes: number
  breakMinutes: number
  netMinutes: number
  breakRangesLabel: string
  departureAt: string | null
  departureDistanceMeters: number | null
  isAutoClose: boolean
  observations: string[]
}

type ConsolidatedShiftRecord = {
  shiftId: string
  employeeId: string
  employeeName: string
  alias: string
  role: string
  siteId: string
  siteName: string
  shiftDate: string
  scheduledStartAt: string
  scheduledEndAt: string
  scheduledBreakMinutes: number
  scheduledNetMinutes: number
  shiftStatus: string
  publishedAt: string | null
  checkInAt: string | null
  checkInSource: string | null
  checkOutAt: string | null
  checkOutSource: string | null
  checkOutNotes: string | null
  actualGrossMinutes: number
  actualBreakMinutes: number
  actualNetMinutes: number
  breakRangesLabel: string
  attendanceStatus: string
  closureStatus: string
  lateMinutes: number
  leftEarlyMinutes: number
  overtimeMinutes: number
  isLate: boolean
  isNoShow: boolean
  isOpen: boolean
  isAutoClose: boolean
  isRestDay: boolean
  hasDepartureEvent: boolean
  departureAt: string | null
  departureDistanceMeters: number | null
  matchedBy: "shift_id" | "window" | "none"
  observations: string[]
}

type EmployeeSummary = {
  employeeId: string
  employeeName: string
  alias: string
  role: string
  sites: string[]
  scheduledShifts: number
  attendedShifts: number
  restDayCount: number
  lateCount: number
  noShowCount: number
  openCount: number
  missingCloseCount: number
  autoCloseCount: number
  departureCount: number
  scheduledMinutes: number
  netMinutes: number
  incidentCount: number
}

type SiteSummary = {
  siteId: string
  siteName: string
  scheduledShifts: number
  attendedShifts: number
  restDayCount: number
  lateCount: number
  noShowCount: number
  openCount: number
  missingCloseCount: number
  autoCloseCount: number
  departureCount: number
  scheduledMinutes: number
  netMinutes: number
  incidentCount: number
}

type IncidentRow = {
  category: string
  shiftDate: string
  siteName: string
  employeeName: string
  scheduledRange: string
  actualRange: string
  status: string
  detail: string
}

type ReportSummary = {
  scheduledShifts: number
  attendedShifts: number
  restDayCount: number
  lateCount: number
  noShowCount: number
  openCount: number
  missingCloseCount: number
  autoCloseCount: number
  departureCount: number
  scheduledMinutes: number
  netMinutes: number
  attendanceRate: number
  punctualityRate: number
}

type IncidentBuildOptions = {
  unlinkedAttendanceIncidentCutoffMs: number | null
}

const ALLOWED_GLOBAL_ROLES = new Set(["propietario", "gerente_general"])
const MANAGER_ROLE = "gerente"
const MANAGER_ALLOWED_SITE_TYPES = new Set(["satellite", "production_center"])
const SHIFT_LEAVE_EVENT_TYPE = "left_site_open_shift"
const REST_SHIFT_STATUSES = new Set([
  "descanso",
  "dia_descanso",
  "rest",
  "rest_day",
  "day_off",
  "off",
  "off_day",
  "libre",
])
const DEFAULT_REPORT_TIME_ZONE = "America/Bogota"
const DEFAULT_LATE_GRACE_MINUTES = 5
const DEFAULT_AUTO_CLOSE_GRACE_MINUTES = 30
const MATCH_WINDOW_BEFORE_MINUTES = 360
const MATCH_WINDOW_AFTER_MINUTES = 720
const QUERY_BUFFER_HOURS = 36
const DEFAULT_UNLINKED_ATTENDANCE_INCIDENT_LOOKBACK_DAYS = 14
const UNLINKED_ATTENDANCE_INCIDENT_START_DATE_ENV = "VISO_ATTENDANCE_UNLINKED_INCIDENT_START_DATE"
const UNLINKED_ATTENDANCE_INCIDENT_LOOKBACK_DAYS_ENV = "VISO_ATTENDANCE_UNLINKED_INCIDENT_LOOKBACK_DAYS"

const jsonHeaders = {
  "Content-Type": "application/json",
  "cache-control": "no-store",
}

function getSupabaseServerConfig() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase server config")
  }

  return { supabaseUrl, serviceKey }
}

function buildExcelHeaders(filename: string) {
  return {
    "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "content-disposition": `attachment; filename="${filename}"`,
    "cache-control": "no-store",
  }
}

function normalizeTimeZone(rawValue: string | null): string {
  const candidate = String(rawValue ?? "").trim()
  if (!candidate) return DEFAULT_REPORT_TIME_ZONE
  try {
    new Intl.DateTimeFormat("es-CO", { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    return DEFAULT_REPORT_TIME_ZONE
  }
}

function formatDateForFilename(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function formatDate(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone,
  }).format(value)
}

function formatDateTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value))
}

function formatTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(value))
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function safeMinutes(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value))
}

function getOptionalEnvDateMs(value: string | undefined): number | null {
  const candidate = String(value ?? "").trim()
  if (!candidate) return null
  const parsed = new Date(candidate.includes("T") ? candidate : `${candidate}T00:00:00-05:00`)
  const parsedMs = parsed.getTime()
  return Number.isFinite(parsedMs) ? parsedMs : null
}

function getPositiveIntegerEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

function getUnlinkedAttendanceIncidentCutoffMs(reportEnd: Date): number | null {
  const configuredStartMs = getOptionalEnvDateMs(process.env[UNLINKED_ATTENDANCE_INCIDENT_START_DATE_ENV])
  if (configuredStartMs != null) return configuredStartMs

  const lookbackDays = getPositiveIntegerEnv(
    process.env[UNLINKED_ATTENDANCE_INCIDENT_LOOKBACK_DAYS_ENV],
    DEFAULT_UNLINKED_ATTENDANCE_INCIDENT_LOOKBACK_DAYS,
  )

  if (lookbackDays <= 0) return null
  return reportEnd.getTime() - lookbackDays * 86400000
}

function normalizeShiftStatus(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function isRestShiftStatus(status: string | null | undefined): boolean {
  return REST_SHIFT_STATUSES.has(normalizeShiftStatus(status))
}

function isRestShiftLike(shift: Pick<ScheduledShiftRow, "status" | "notes">): boolean {
  if (isRestShiftStatus(shift.status)) return true

  const notes = normalizeShiftStatus(shift.notes)
  if (!notes) return false

  return (
    notes.includes("descanso") ||
    notes.includes("dia_descanso") ||
    notes.includes("libre") ||
    notes.includes("rest_day") ||
    notes.includes("day_off")
  )
}

function isAttendanceIncident(row: ConsolidatedShiftRecord): boolean {
  if (row.isRestDay) return false
  return row.isLate || row.isNoShow || row.isOpen || row.isAutoClose || row.hasDepartureEvent
}

function minutesToClock(value: number): string {
  const total = safeMinutes(value)
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${hours}:${minutes.toString().padStart(2, "0")}`
}

function minutesToLabel(value: number): string {
  const total = safeMinutes(value)
  if (total === 0) return "0 min"
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`
  }
  return `${minutes} min`
}

function minutesToHoursLabel(value: number): string {
  const total = safeMinutes(value)
  const hours = total / 60
  if (Number.isInteger(hours)) return `${hours} h`
  return `${hours.toFixed(1).replace(".", ",")} h`
}

function formatSignedMinutes(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0 min"
  const sign = value > 0 ? "+" : "-"
  return `${sign}${minutesToLabel(Math.abs(value))}`
}

function sanitizeSheetName(base: string, used: Set<string>): string {
  const clean = base.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim() || "Empleado"
  let candidate = clean.slice(0, 31)
  let index = 2
  while (used.has(candidate)) {
    const suffix = ` (${index})`
    candidate = `${clean.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`
    index += 1
  }
  used.add(candidate)
  return candidate
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return { year, month, day }
}

function parseTimeOnly(value: string) {
  const [hour, minute, second] = value.split(":").map((part) => Number(part))
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
    second: Number.isFinite(second) ? second : 0,
  }
}

function getZonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(value)

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  }
}

function zonedLocalToUtc(dateValue: string, timeValue: string, timeZone: string): string {
  const { year, month, day } = parseDateOnly(dateValue)
  const desiredTime = parseTimeOnly(timeValue)

  let guessMs = Date.UTC(
    year,
    Math.max(0, month - 1),
    day,
    desiredTime.hour,
    desiredTime.minute,
    desiredTime.second,
  )

  for (let i = 0; i < 2; i += 1) {
    const zoned = getZonedParts(new Date(guessMs), timeZone)
    const desiredMs = Date.UTC(
      year,
      Math.max(0, month - 1),
      day,
      desiredTime.hour,
      desiredTime.minute,
      desiredTime.second,
    )
    const zonedMs = Date.UTC(
      zoned.year,
      Math.max(0, zoned.month - 1),
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
    )
    guessMs += desiredMs - zonedMs
  }

  return new Date(guessMs).toISOString()
}

function formatDateKeyInTimeZone(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value)
}

function addDaysToDateKey(dateKey: string, delta: number): string {
  const base = new Date(`${dateKey}T12:00:00.000Z`)
  base.setUTCDate(base.getUTCDate() + delta)
  return base.toISOString().slice(0, 10)
}

function buildSessionKey(employeeId: string, checkInAtIso: string, siteId: string) {
  return `${employeeId}|${siteId}|${checkInAtIso}`
}

function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  return startA < endB && startB < endA
}

function applyHeaderStyle(row: ExcelJS.Row) {
  row.height = 20
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 9 }
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "D9E8F6" } }
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    }
  })
}

function applyDataStyle(row: ExcelJS.Row, zebra: boolean) {
  row.eachCell((cell) => {
    cell.font = { size: 9 }
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true }
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    }
    if (zebra) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F7F5F8" } }
    }
  })
}

function applyTotalsStyle(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { size: 9, bold: true }
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "E6E1EA" } }
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    }
  })
}

function buildAttendanceSessions(
  attendanceRows: AttendanceRow[],
  breakRows: BreakRow[],
  eventRows: ShiftEventRow[],
  rangeEndIso: string,
  timeZone: string,
): AttendanceSession[] {
  const nowMs = Date.now()
  const rangeEndMs = Math.min(new Date(rangeEndIso).getTime(), nowMs)
  const breaksByEmployeeSite = new Map<string, Array<{ startMs: number; endMs: number }>>()

  for (const row of breakRows) {
    const startMs = new Date(row.started_at).getTime()
    const endMsRaw = row.ended_at ? new Date(row.ended_at).getTime() : rangeEndMs
    const endMs = Math.min(endMsRaw, rangeEndMs)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue
    const key = `${row.employee_id}|${row.site_id}`
    const list = breaksByEmployeeSite.get(key) ?? []
    list.push({ startMs, endMs })
    breaksByEmployeeSite.set(key, list)
  }

  const departureEvents = eventRows
    .filter((row) => row.event_type === SHIFT_LEAVE_EVENT_TYPE)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))

  const logsByEmployee = new Map<string, AttendanceRow[]>()
  for (const row of attendanceRows) {
    const list = logsByEmployee.get(row.employee_id) ?? []
    list.push(row)
    logsByEmployee.set(row.employee_id, list)
  }

  const sessions: AttendanceSession[] = []

  for (const [employeeId, rows] of logsByEmployee.entries()) {
    const ordered = [...rows].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    let pendingCheckIn: AttendanceRow | null = null

    const closeSession = (
      checkInRow: AttendanceRow,
      checkOutRow: AttendanceRow | null,
      extraObservation: string | null,
      effectiveEndAtIso: string,
      status: "Cerrado" | "Abierto",
    ) => {
      const startMs = new Date(checkInRow.occurred_at).getTime()
      const endMs = new Date(effectiveEndAtIso).getTime()
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return

      const siteKey = `${employeeId}|${checkInRow.site_id}`
      const employeeBreaks = breaksByEmployeeSite.get(siteKey) ?? []
      const overlapRanges: Array<{ startMs: number; endMs: number }> = []
      let breakMinutesRaw = 0

      for (const item of employeeBreaks) {
        const overlapStart = Math.max(startMs, item.startMs)
        const overlapEnd = Math.min(endMs, item.endMs)
        if (overlapEnd > overlapStart) {
          overlapRanges.push({ startMs: overlapStart, endMs: overlapEnd })
          breakMinutesRaw += (overlapEnd - overlapStart) / 60000
        }
      }

      const employeeInfo = unwrapRelation(checkInRow.employees)
      const siteInfo = unwrapRelation(checkInRow.sites)
      const shiftId = checkOutRow?.shift_id ?? checkInRow.shift_id ?? null
      const grossMinutesRaw = (endMs - startMs) / 60000
      const grossMinutes = safeMinutes(grossMinutesRaw)
      const breakMinutes = safeMinutes(breakMinutesRaw)
      const netMinutes = safeMinutes(grossMinutesRaw - breakMinutesRaw)
      const breakRangesLabel =
        overlapRanges.length === 0
          ? "-"
          : overlapRanges
            .map(
              (item) =>
                `${formatTime(new Date(item.startMs).toISOString(), timeZone)}-${formatTime(new Date(item.endMs).toISOString(), timeZone)}`,
            )
            .join(" | ")

      const departure =
        departureEvents.find((row) => {
          const eventMs = new Date(row.occurred_at).getTime()
          return (
            row.employee_id === employeeId &&
            row.site_id === checkInRow.site_id &&
            eventMs >= startMs &&
            eventMs <= endMs
          )
        }) ?? null

      const notes = (checkOutRow?.notes ?? "").toLowerCase()
      const source = (checkOutRow?.source ?? "").toLowerCase()
      const isAutoClose =
        status === "Cerrado" &&
        (
          source === "system" ||
          notes.includes("cierre automatic") ||
          notes.includes("cierre automático") ||
          notes.includes("auto check-out") ||
          notes.includes("auto check-out") ||
          notes.includes("auto_close")
        )

      const observations: string[] = []
      if (departure?.occurred_at) {
        const distanceLabel =
          departure.distance_meters != null ? ` (${Math.round(departure.distance_meters)}m)` : ""
        observations.push(
          `Salida de sede detectada ${formatDateTime(departure.occurred_at, timeZone)}${distanceLabel}`,
        )
      }
      if (isAutoClose && checkOutRow?.occurred_at) {
        observations.push(`Cierre automático ${formatTime(checkOutRow.occurred_at, timeZone)}`)
      }
      if (status === "Abierto") {
        observations.push("Turno abierto")
      }
      if (extraObservation) {
        observations.push(extraObservation)
      }

      sessions.push({
        key: buildSessionKey(employeeId, checkInRow.occurred_at, checkInRow.site_id),
        employeeId,
        employeeName: employeeInfo?.full_name ?? employeeId,
        alias: employeeInfo?.alias ?? "",
        role: employeeInfo?.role ?? "",
        siteId: checkInRow.site_id,
        siteName: siteInfo?.name ?? "",
        shiftId,
        checkInAt: checkInRow.occurred_at,
        checkInSource: checkInRow.source ?? null,
        checkOutAt: checkOutRow?.occurred_at ?? null,
        checkOutSource: checkOutRow?.source ?? null,
        checkOutNotes: checkOutRow?.notes ?? null,
        effectiveEndAt: effectiveEndAtIso,
        status,
        grossMinutes,
        breakMinutes,
        netMinutes,
        breakRangesLabel,
        departureAt: departure?.occurred_at ?? null,
        departureDistanceMeters: departure?.distance_meters ?? null,
        isAutoClose,
        observations,
      })
    }

    for (const row of ordered) {
      if (row.action === "check_in") {
        if (pendingCheckIn) {
          closeSession(pendingCheckIn, null, "Nueva entrada sin salida previa", row.occurred_at, "Cerrado")
        }
        pendingCheckIn = row
        continue
      }

      if (row.action === "check_out" && pendingCheckIn) {
        closeSession(pendingCheckIn, row, null, row.occurred_at, "Cerrado")
        pendingCheckIn = null
      }
    }

    if (pendingCheckIn) {
      closeSession(
        pendingCheckIn,
        null,
        null,
        new Date(rangeEndMs).toISOString(),
        "Abierto",
      )
    }
  }

  return sessions.sort((a, b) => {
    if (a.employeeName !== b.employeeName) return a.employeeName.localeCompare(b.employeeName, "es")
    return a.checkInAt.localeCompare(b.checkInAt)
  })
}

function buildConsolidatedShiftRecords(
  scheduledShifts: ScheduledShiftRow[],
  sessions: AttendanceSession[],
  lateGraceMinutes: number,
  autoCloseGraceMinutes: number,
  reportEndIso: string,
  timeZone: string,
) {
  const sessionsByEmployee = new Map<string, AttendanceSession[]>()
  for (const session of sessions) {
    const list = sessionsByEmployee.get(session.employeeId) ?? []
    list.push(session)
    sessionsByEmployee.set(session.employeeId, list)
  }

  const usedSessionKeys = new Set<string>()
  const reportCutoffMs = Math.min(Date.now(), new Date(reportEndIso).getTime())

  const rows = [...scheduledShifts]
    .sort((a, b) => {
      const employeeA = unwrapRelation(a.employees)?.full_name ?? a.employee_id
      const employeeB = unwrapRelation(b.employees)?.full_name ?? b.employee_id
      if (employeeA !== employeeB) return employeeA.localeCompare(employeeB, "es")
      if (a.shift_date !== b.shift_date) return a.shift_date.localeCompare(b.shift_date)
      return a.start_time.localeCompare(b.start_time)
    })
    .map((shift) => {
      const employeeInfo = unwrapRelation(shift.employees)
      const siteInfo = unwrapRelation(shift.sites)
      const isRestDay = isRestShiftLike(shift)
      const scheduledStartAt = zonedLocalToUtc(shift.shift_date, shift.start_time, timeZone)
      const scheduledEndAt = zonedLocalToUtc(shift.shift_date, shift.end_time, timeZone)
      const scheduledStartMs = new Date(scheduledStartAt).getTime()
      const scheduledEndMs = new Date(scheduledEndAt).getTime()
      const scheduledGrossMinutes = safeMinutes((scheduledEndMs - scheduledStartMs) / 60000)
      const scheduledBreakMinutes = isRestDay ? 0 : safeMinutes(shift.break_minutes ?? 0)
      const scheduledNetMinutes = isRestDay ? 0 : safeMinutes(scheduledGrossMinutes - scheduledBreakMinutes)
      const employeeSessions = sessionsByEmployee.get(shift.employee_id) ?? []

      let matched: AttendanceSession | null =
        employeeSessions.find((session) => !usedSessionKeys.has(session.key) && session.shiftId === shift.id) ??
        null
      let matchedBy: "shift_id" | "window" | "none" = matched ? "shift_id" : "none"

      if (!matched) {
        const candidates = employeeSessions
          .filter((session) => {
            if (usedSessionKeys.has(session.key)) return false
            if (session.siteId !== shift.site_id) return false
            const sessionStartMs = new Date(session.checkInAt).getTime()
            const sessionEndMs = new Date(session.effectiveEndAt).getTime()
            return rangesOverlap(
              sessionStartMs,
              sessionEndMs,
              scheduledStartMs - MATCH_WINDOW_BEFORE_MINUTES * 60000,
              scheduledEndMs + MATCH_WINDOW_AFTER_MINUTES * 60000,
            )
          })
          .sort((left, right) => {
            const leftDiff = Math.abs(new Date(left.checkInAt).getTime() - scheduledStartMs)
            const rightDiff = Math.abs(new Date(right.checkInAt).getTime() - scheduledStartMs)
            if (leftDiff !== rightDiff) return leftDiff - rightDiff
            return left.checkInAt.localeCompare(right.checkInAt)
          })

        matched = candidates[0] ?? null
        matchedBy = matched ? "window" : "none"
      }

      if (matched) {
        usedSessionKeys.add(matched.key)
      }

      const shiftEnded = scheduledEndMs <= reportCutoffMs
      const checkInMs = matched ? new Date(matched.checkInAt).getTime() : null
      const effectiveEndMs = matched ? new Date(matched.effectiveEndAt).getTime() : null
      const lateMinutes = !isRestDay && checkInMs != null ? safeMinutes((checkInMs - scheduledStartMs) / 60000) : 0
      const isLate = !isRestDay && checkInMs != null && checkInMs > scheduledStartMs + lateGraceMinutes * 60000
      const overtimeMinutes =
        !isRestDay && effectiveEndMs != null ? safeMinutes((effectiveEndMs - scheduledEndMs) / 60000) : 0
      const leftEarlyMinutes =
        !isRestDay && matched?.checkOutAt != null ? safeMinutes((scheduledEndMs - new Date(matched.checkOutAt).getTime()) / 60000) : 0
      const isNoShow = !isRestDay && !matched && shiftEnded
      const isOpen = !isRestDay && matched?.status === "Abierto"
      const missingCloseCountable = !isRestDay && !!matched && isOpen && shiftEnded
      const attendanceStatus = isRestDay
        ? "Descanso"
        : isNoShow
          ? "No asistió"
          : !matched
            ? "Pendiente"
            : isOpen
              ? "Abierto"
              : "Asistió"
      const closureStatus = isRestDay
        ? "No aplica"
        : !matched
          ? "Sin registro"
          : isOpen
            ? "Pendiente"
            : matched.isAutoClose
              ? "Automático"
              : "Manual"

      const observations = [...(matched?.observations ?? [])]
      if (isRestDay) {
        observations.push("Turno marcado como descanso")
      }
      if (isLate) {
        observations.push(`Llegó tarde (${minutesToLabel(lateMinutes)})`)
      }
      if (isNoShow) {
        observations.push("No se presentó al turno programado")
      }
      if (missingCloseCountable) {
        observations.push("No cerró el turno")
      }
      if (matchedBy === "window") {
        observations.push("Asistencia vinculada por ventana horaria")
      }
      if (shift.notes?.trim()) {
        observations.push(`Nota del turno: ${shift.notes.trim()}`)
      }

      return {
        shiftId: shift.id,
        employeeId: shift.employee_id,
        employeeName: employeeInfo?.full_name ?? shift.employee_id,
        alias: employeeInfo?.alias ?? "",
        role: employeeInfo?.role ?? "",
        siteId: shift.site_id,
        siteName: siteInfo?.name ?? "",
        shiftDate: shift.shift_date,
        scheduledStartAt,
        scheduledEndAt,
        scheduledBreakMinutes,
        scheduledNetMinutes,
        shiftStatus: shift.status,
        publishedAt: shift.published_at,
        checkInAt: matched?.checkInAt ?? null,
        checkInSource: matched?.checkInSource ?? null,
        checkOutAt: matched?.checkOutAt ?? null,
        checkOutSource: matched?.checkOutSource ?? null,
        checkOutNotes: matched?.checkOutNotes ?? null,
        actualGrossMinutes: matched?.grossMinutes ?? 0,
        actualBreakMinutes: matched?.breakMinutes ?? 0,
        actualNetMinutes: matched?.netMinutes ?? 0,
        breakRangesLabel: matched?.breakRangesLabel ?? "-",
        attendanceStatus,
        closureStatus,
        lateMinutes,
        leftEarlyMinutes,
        overtimeMinutes,
        isLate,
        isNoShow,
        isOpen: !!isOpen,
        isAutoClose: !isRestDay && (matched?.isAutoClose ?? false),
        isRestDay,
        hasDepartureEvent: !!matched?.departureAt,
        departureAt: matched?.departureAt ?? null,
        departureDistanceMeters: matched?.departureDistanceMeters ?? null,
        matchedBy,
        observations,
      } satisfies ConsolidatedShiftRecord
    })

  return { rows, usedSessionKeys }
}

function buildEmployeeSummary(rows: ConsolidatedShiftRecord[]): EmployeeSummary[] {
  const byEmployee = new Map<string, EmployeeSummary & { _siteSet: Set<string> }>()

  for (const row of rows) {
    const current =
      byEmployee.get(row.employeeId) ??
      {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        alias: row.alias,
        role: row.role,
        sites: [],
        scheduledShifts: 0,
        attendedShifts: 0,
        restDayCount: 0,
        lateCount: 0,
        noShowCount: 0,
        openCount: 0,
        missingCloseCount: 0,
        autoCloseCount: 0,
        departureCount: 0,
        scheduledMinutes: 0,
        netMinutes: 0,
        incidentCount: 0,
        _siteSet: new Set<string>(),
      }

    if (row.siteName) current._siteSet.add(row.siteName)

    if (row.isRestDay) {
      current.restDayCount += 1
      byEmployee.set(row.employeeId, current)
      continue
    }
    current.scheduledShifts += 1
    current.scheduledMinutes += row.scheduledNetMinutes
    current.netMinutes += row.actualNetMinutes
    if (row.checkInAt) current.attendedShifts += 1
    if (row.isLate) current.lateCount += 1
    if (row.isNoShow) current.noShowCount += 1
    if (row.isOpen) current.openCount += 1
    if (row.isOpen && row.attendanceStatus === "Abierto") current.missingCloseCount += 1
    if (row.isAutoClose) current.autoCloseCount += 1
    if (row.hasDepartureEvent) current.departureCount += 1
    if (isAttendanceIncident(row)) {
      current.incidentCount += 1
    }

    byEmployee.set(row.employeeId, current)
  }

  return [...byEmployee.values()]
    .map((item) => ({
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      alias: item.alias,
      role: item.role,
      sites: [...item._siteSet.values()],
      scheduledShifts: item.scheduledShifts,
      attendedShifts: item.attendedShifts,
      restDayCount: item.restDayCount,
      lateCount: item.lateCount,
      noShowCount: item.noShowCount,
      openCount: item.openCount,
      missingCloseCount: item.missingCloseCount,
      autoCloseCount: item.autoCloseCount,
      departureCount: item.departureCount,
      scheduledMinutes: safeMinutes(item.scheduledMinutes),
      netMinutes: safeMinutes(item.netMinutes),
      incidentCount: item.incidentCount,
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "es"))
}

function buildSiteSummary(rows: ConsolidatedShiftRecord[]): SiteSummary[] {
  const bySite = new Map<string, SiteSummary>()
  for (const row of rows) {
    const current =
      bySite.get(row.siteId) ??
      {
        siteId: row.siteId,
        siteName: row.siteName || row.siteId,
        scheduledShifts: 0,
        attendedShifts: 0,
        restDayCount: 0,
        lateCount: 0,
        noShowCount: 0,
        openCount: 0,
        missingCloseCount: 0,
        autoCloseCount: 0,
        departureCount: 0,
        scheduledMinutes: 0,
        netMinutes: 0,
        incidentCount: 0,
      }

    if (row.isRestDay) {
      current.restDayCount += 1
      bySite.set(row.siteId, current)
      continue
    }

    current.scheduledShifts += 1
    current.scheduledMinutes += row.scheduledNetMinutes
    current.netMinutes += row.actualNetMinutes
    if (row.checkInAt) current.attendedShifts += 1
    if (row.isLate) current.lateCount += 1
    if (row.isNoShow) current.noShowCount += 1
    if (row.isOpen) current.openCount += 1
    if (row.isOpen && row.attendanceStatus === "Abierto") current.missingCloseCount += 1
    if (row.isAutoClose) current.autoCloseCount += 1
    if (row.hasDepartureEvent) current.departureCount += 1
    if (isAttendanceIncident(row)) {
      current.incidentCount += 1
    }

    bySite.set(row.siteId, current)
  }

  return [...bySite.values()].sort((a, b) => a.siteName.localeCompare(b.siteName, "es"))
}

function buildReportSummary(rows: ConsolidatedShiftRecord[]): ReportSummary {
  const countableRows = rows.filter((row) => !row.isRestDay)
  const restDayCount = rows.length - countableRows.length
  const scheduledShifts = countableRows.length
  const attendedShifts = countableRows.filter((row) => !!row.checkInAt).length
  const lateCount = countableRows.filter((row) => row.isLate).length
  const noShowCount = countableRows.filter((row) => row.isNoShow).length
  const openCount = countableRows.filter((row) => row.isOpen).length
  const missingCloseCount = countableRows.filter((row) => row.isOpen && row.attendanceStatus === "Abierto").length
  const autoCloseCount = countableRows.filter((row) => row.isAutoClose).length
  const departureCount = countableRows.filter((row) => row.hasDepartureEvent).length
  const scheduledMinutes = countableRows.reduce((sum, row) => sum + row.scheduledNetMinutes, 0)
  const netMinutes = countableRows.reduce((sum, row) => sum + row.actualNetMinutes, 0)
  const attendanceRate = scheduledShifts > 0 ? attendedShifts / scheduledShifts : 0
  const punctualityRate = attendedShifts > 0 ? (attendedShifts - lateCount) / attendedShifts : 0

  return {
    scheduledShifts,
    attendedShifts,
    restDayCount,
    lateCount,
    noShowCount,
    openCount,
    missingCloseCount,
    autoCloseCount,
    departureCount,
    scheduledMinutes: safeMinutes(scheduledMinutes),
    netMinutes: safeMinutes(netMinutes),
    attendanceRate,
    punctualityRate,
  }
}

function buildIncidentRows(
  rows: ConsolidatedShiftRecord[],
  sessions: AttendanceSession[],
  usedSessionKeys: Set<string>,
  timeZone: string,
  options: IncidentBuildOptions,
): IncidentRow[] {
  const incidents: IncidentRow[] = []

  for (const row of rows) {
    if (row.isRestDay) continue

    const scheduledRange = `${formatTime(row.scheduledStartAt, timeZone)}-${formatTime(row.scheduledEndAt, timeZone)}`
    const actualRange = row.checkInAt
      ? `${formatTime(row.checkInAt, timeZone)}-${row.checkOutAt ? formatTime(row.checkOutAt, timeZone) : "Abierto"}`
      : "-"

    if (row.isLate) {
      incidents.push({
        category: "Tardanza",
        shiftDate: row.shiftDate,
        siteName: row.siteName,
        employeeName: row.employeeName,
        scheduledRange,
        actualRange,
        status: row.attendanceStatus,
        detail: `Ingreso tardío por ${minutesToLabel(row.lateMinutes)}.`,
      })
    }
    if (row.isNoShow) {
      incidents.push({
        category: "Inasistencia",
        shiftDate: row.shiftDate,
        siteName: row.siteName,
        employeeName: row.employeeName,
        scheduledRange,
        actualRange,
        status: row.attendanceStatus,
        detail: "No se registró entrada para el turno programado.",
      })
    }
    if (row.isOpen) {
      incidents.push({
        category: "Sin cierre",
        shiftDate: row.shiftDate,
        siteName: row.siteName,
        employeeName: row.employeeName,
        scheduledRange,
        actualRange,
        status: row.closureStatus,
        detail: "El turno sigue abierto y no tiene check-out registrado.",
      })
    }
    if (row.isAutoClose) {
      incidents.push({
        category: "Autocierre",
        shiftDate: row.shiftDate,
        siteName: row.siteName,
        employeeName: row.employeeName,
        scheduledRange,
        actualRange,
        status: row.closureStatus,
        detail: "La salida fue registrada automáticamente por el sistema.",
      })
    }
    if (row.hasDepartureEvent) {
      const distanceLabel =
        row.departureDistanceMeters != null ? ` Distancia: ${Math.round(row.departureDistanceMeters)}m.` : ""
      incidents.push({
        category: "Salida de sede",
        shiftDate: row.shiftDate,
        siteName: row.siteName,
        employeeName: row.employeeName,
        scheduledRange,
        actualRange,
        status: row.closureStatus,
        detail: `Se detectó salida de sede durante el turno.${distanceLabel}`,
      })
    }
    if (row.matchedBy === "window") {
      incidents.push({
        category: "Vinculación manual",
        shiftDate: row.shiftDate,
        siteName: row.siteName,
        employeeName: row.employeeName,
        scheduledRange,
        actualRange,
        status: row.attendanceStatus,
        detail: "La asistencia se vinculó por ventana horaria y no por shift_id.",
      })
    }
  }

  for (const session of sessions) {
    if (usedSessionKeys.has(session.key)) continue

    // Si el log ya tiene shift_id pero la sesión no se consolidó en este rango,
    // no debe reportarse como "sin turno"; normalmente es un efecto del buffer
    // de consulta o de un turno fuera del rango visual.
    if (session.shiftId) continue

    const sessionStartMs = new Date(session.checkInAt).getTime()
    if (
      options.unlinkedAttendanceIncidentCutoffMs != null &&
      Number.isFinite(sessionStartMs) &&
      sessionStartMs < options.unlinkedAttendanceIncidentCutoffMs
    ) {
      continue
    }

    incidents.push({
      category: "Asistencia sin turno",
      shiftDate: session.checkInAt.slice(0, 10),
      siteName: session.siteName,
      employeeName: session.employeeName,
      scheduledRange: "-",
      actualRange: `${formatTime(session.checkInAt, timeZone)}-${session.checkOutAt ? formatTime(session.checkOutAt, timeZone) : "Abierto"}`,
      status: session.status,
      detail: "Existe asistencia reciente registrada que no pudo vincularse a un turno publicado del rango.",
    })
  }

  return incidents.sort((a, b) => {
    if (a.shiftDate !== b.shiftDate) return a.shiftDate.localeCompare(b.shiftDate)
    if (a.siteName !== b.siteName) return a.siteName.localeCompare(b.siteName, "es")
    return a.employeeName.localeCompare(b.employeeName, "es")
  })
}

function buildWorkbook(
  rows: ConsolidatedShiftRecord[],
  employeeSummaryRows: EmployeeSummary[],
  siteSummaryRows: SiteSummary[],
  incidentRows: IncidentRow[],
  summary: ReportSummary,
  start: Date,
  end: Date,
  timeZone: string,
  scopeLabel: string,
) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "VISO"
  workbook.lastModifiedBy = "VISO"
  workbook.created = new Date()
  workbook.modified = new Date()

  const summarySheet = workbook.addWorksheet("Resumen ejecutivo")
  summarySheet.properties.defaultRowHeight = 18
  summarySheet.columns = [
    { width: 24 },
    { width: 16 },
    { width: 6 },
    { width: 28 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
  ]

  summarySheet.mergeCells("A1:O1")
  summarySheet.getCell("A1").value = "REPORTE OPERATIVO DE TURNOS Y ASISTENCIA"
  summarySheet.getCell("A1").font = { size: 12, bold: true }
  summarySheet.getCell("A1").alignment = { vertical: "middle", horizontal: "center" }
  summarySheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "D9E8F6" } }

  summarySheet.mergeCells("A2:O2")
  summarySheet.getCell("A2").value = `Periodo: ${formatDate(start, timeZone)} a ${formatDate(end, timeZone)} | Alcance: ${scopeLabel} | Generado: ${formatDate(new Date(), timeZone)}`
  summarySheet.getCell("A2").font = { size: 9, italic: true }
  summarySheet.getCell("A2").alignment = { vertical: "middle", horizontal: "left" }

  const metricHeaderRow = 4
  summarySheet.getRow(metricHeaderRow).values = ["Métrica", "Valor"]
  applyHeaderStyle(summarySheet.getRow(metricHeaderRow))

  const metrics: Array<[string, string | number]> = [
    ["Turnos programados", summary.scheduledShifts],
    ["Turnos asistidos", summary.attendedShifts],
    ["Descansos", summary.restDayCount],
    ["Tardanzas", summary.lateCount],
    ["Inasistencias", summary.noShowCount],
    ["Turnos abiertos", summary.openCount],
    ["Cierres faltantes", summary.missingCloseCount],
    ["Cierres automáticos", summary.autoCloseCount],
    ["Salidas de sede", summary.departureCount],
    ["Horas programadas", minutesToClock(summary.scheduledMinutes)],
    ["Horas netas reales", minutesToClock(summary.netMinutes)],
    ["Asistencia", `${Math.round(summary.attendanceRate * 100)}%`],
    ["Puntualidad", `${Math.round(summary.punctualityRate * 100)}%`],
  ]

  let metricRow = metricHeaderRow + 1
  for (const [index, metric] of metrics.entries()) {
    summarySheet.getRow(metricRow).values = [metric[0], metric[1]]
    applyDataStyle(summarySheet.getRow(metricRow), index % 2 === 1)
    metricRow += 1
  }

  metricRow += 2
  summarySheet.mergeCells(`A${metricRow}:O${metricRow}`)
  summarySheet.getCell(`A${metricRow}`).value = "RESUMEN POR TRABAJADOR"
  summarySheet.getCell(`A${metricRow}`).font = { size: 10, bold: true }
  summarySheet.getCell(`A${metricRow}`).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "F1ECF5" },
  }
  metricRow += 1

  summarySheet.getRow(metricRow).values = [
    "No.",
    "Empleado",
    "Alias",
    "Rol",
    "Sede(s)",
    "Programados",
    "Asistidos",
    "Descansos",
    "Tardanzas",
    "Inasistencias",
    "Abiertos",
    "Autocierres",
    "Salidas sede",
    "Horas prog.",
    "Horas netas",
  ]
  applyHeaderStyle(summarySheet.getRow(metricRow))

  let employeeRow = metricRow + 1
  for (const [index, row] of employeeSummaryRows.entries()) {
    summarySheet.getRow(employeeRow).values = [
      index + 1,
      row.employeeName,
      row.alias,
      row.role,
      row.sites.join(" | "),
      row.scheduledShifts,
      row.attendedShifts,
      row.restDayCount,
      row.lateCount,
      row.noShowCount,
      row.openCount,
      row.autoCloseCount,
      row.departureCount,
      minutesToClock(row.scheduledMinutes),
      minutesToClock(row.netMinutes),
    ]
    applyDataStyle(summarySheet.getRow(employeeRow), index % 2 === 1)
    employeeRow += 1
  }

  if (employeeSummaryRows.length === 0) {
    summarySheet.mergeCells(`A${employeeRow}:O${employeeRow}`)
    summarySheet.getCell(`A${employeeRow}`).value = "Sin turnos programados para el rango seleccionado."
    summarySheet.getCell(`A${employeeRow}`).font = { size: 9, italic: true }
    summarySheet.getCell(`A${employeeRow}`).alignment = { vertical: "middle", horizontal: "center" }
    employeeRow += 1
  }

  employeeRow += 2
  summarySheet.mergeCells(`A${employeeRow}:K${employeeRow}`)
  summarySheet.getCell(`A${employeeRow}`).value = "RESUMEN POR SEDE"
  summarySheet.getCell(`A${employeeRow}`).font = { size: 10, bold: true }
  summarySheet.getCell(`A${employeeRow}`).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "F1ECF5" },
  }
  employeeRow += 1

  summarySheet.getRow(employeeRow).values = [
    "No.",
    "Sede",
    "Programados",
    "Asistidos",
    "Descansos",
    "Tardanzas",
    "Inasistencias",
    "Abiertos",
    "Autocierres",
    "Horas prog.",
    "Horas netas",
  ]
  applyHeaderStyle(summarySheet.getRow(employeeRow))

  let siteRow = employeeRow + 1
  for (const [index, row] of siteSummaryRows.entries()) {
    summarySheet.getRow(siteRow).values = [
      index + 1,
      row.siteName,
      row.scheduledShifts,
      row.attendedShifts,
      row.restDayCount,
      row.lateCount,
      row.noShowCount,
      row.openCount,
      row.autoCloseCount,
      minutesToClock(row.scheduledMinutes),
      minutesToClock(row.netMinutes),
    ]
    applyDataStyle(summarySheet.getRow(siteRow), index % 2 === 1)
    siteRow += 1
  }

  const detailSheet = workbook.addWorksheet("Detalle por turno")
  detailSheet.properties.defaultRowHeight = 18
  detailSheet.columns = [
    { width: 6 },
    { width: 14 },
    { width: 22 },
    { width: 28 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 40 },
  ]

  detailSheet.mergeCells("A1:W1")
  detailSheet.getCell("A1").value = "DETALLE OPERATIVO POR TURNO"
  detailSheet.getCell("A1").font = { size: 11, bold: true }
  detailSheet.getCell("A1").alignment = { vertical: "middle", horizontal: "center" }
  detailSheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "D9E8F6" } }

  detailSheet.mergeCells("A2:W2")
  detailSheet.getCell("A2").value = `Periodo: ${formatDate(start, timeZone)} a ${formatDate(end, timeZone)} | Alcance: ${scopeLabel}`
  detailSheet.getCell("A2").font = { size: 9, italic: true }
  detailSheet.getCell("A2").alignment = { vertical: "middle", horizontal: "left" }

  const detailHeaderRow = 4
  detailSheet.getRow(detailHeaderRow).values = [
    "No.",
    "Fecha",
    "Sede",
    "Trabajador",
    "Programado",
    "Entrada real",
    "Salida real",
    "Estado asistencia",
    "Estado cierre",
    "Descansos",
    "Min prog.",
    "Min netos",
    "Horas netas",
    "Tardanza",
    "Salida anticipada",
    "Tiempo extra",
    "Autocierre",
    "Salida sede",
    "Vinculación",
    "Fuente check-in",
    "Fuente cierre",
    "Estado turno",
    "Observaciones",
  ]
  applyHeaderStyle(detailSheet.getRow(detailHeaderRow))
  detailSheet.views = [{ state: "frozen", ySplit: detailHeaderRow }]

  let detailRow = detailHeaderRow + 1
  for (const [index, row] of rows.entries()) {
    detailSheet.getRow(detailRow).values = [
      index + 1,
      row.shiftDate,
      row.siteName,
      row.employeeName,
      `${formatTime(row.scheduledStartAt, timeZone)}-${formatTime(row.scheduledEndAt, timeZone)}`,
      row.checkInAt ? formatDateTime(row.checkInAt, timeZone) : "-",
      row.checkOutAt ? formatDateTime(row.checkOutAt, timeZone) : row.isOpen ? "Abierto" : "-",
      row.attendanceStatus,
      row.closureStatus,
      row.breakRangesLabel,
      row.scheduledNetMinutes,
      row.actualNetMinutes,
      minutesToHoursLabel(row.actualNetMinutes),
      row.isLate ? minutesToLabel(row.lateMinutes) : "-",
      row.leftEarlyMinutes > 0 ? minutesToLabel(row.leftEarlyMinutes) : "-",
      row.overtimeMinutes > 0 ? minutesToLabel(row.overtimeMinutes) : "-",
      row.isAutoClose ? "Sí" : "No",
      row.hasDepartureEvent ? "Sí" : "No",
      row.matchedBy,
      row.checkInSource ?? "-",
      row.checkOutSource ?? "-",
      row.shiftStatus,
      row.observations.join(" | ") || "Sin novedades",
    ]
    applyDataStyle(detailSheet.getRow(detailRow), index % 2 === 1)
    detailRow += 1
  }

  if (rows.length === 0) {
    detailSheet.mergeCells(`A${detailRow}:W${detailRow}`)
    detailSheet.getCell(`A${detailRow}`).value = "Sin turnos para el rango seleccionado."
    detailSheet.getCell(`A${detailRow}`).font = { size: 9, italic: true }
    detailSheet.getCell(`A${detailRow}`).alignment = { vertical: "middle", horizontal: "center" }
  }

  const incidentsSheet = workbook.addWorksheet("Incidencias")
  incidentsSheet.properties.defaultRowHeight = 18
  incidentsSheet.columns = [
    { width: 18 },
    { width: 14 },
    { width: 22 },
    { width: 28 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
    { width: 42 },
  ]
  incidentsSheet.mergeCells("A1:H1")
  incidentsSheet.getCell("A1").value = "INCIDENCIAS OPERATIVAS"
  incidentsSheet.getCell("A1").font = { size: 11, bold: true }
  incidentsSheet.getCell("A1").alignment = { vertical: "middle", horizontal: "center" }
  incidentsSheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "D9E8F6" },
  }
  incidentsSheet.getRow(4).values = [
    "Categoría",
    "Fecha",
    "Sede",
    "Trabajador",
    "Horario",
    "Registro",
    "Estado",
    "Detalle",
  ]
  applyHeaderStyle(incidentsSheet.getRow(4))

  let incidentsDataRow = 5
  for (const [index, row] of incidentRows.entries()) {
    incidentsSheet.getRow(incidentsDataRow).values = [
      row.category,
      row.shiftDate,
      row.siteName,
      row.employeeName,
      row.scheduledRange,
      row.actualRange,
      row.status,
      row.detail,
    ]
    applyDataStyle(incidentsSheet.getRow(incidentsDataRow), index % 2 === 1)
    incidentsDataRow += 1
  }

  if (incidentRows.length === 0) {
    incidentsSheet.mergeCells("A5:H5")
    incidentsSheet.getCell("A5").value = "Sin incidencias operativas en el rango seleccionado."
    incidentsSheet.getCell("A5").font = { size: 9, italic: true }
    incidentsSheet.getCell("A5").alignment = { vertical: "middle", horizontal: "center" }
  }

  const usedNames = new Set<string>(["Resumen ejecutivo", "Detalle por turno", "Incidencias"])
  const rowsByEmployee = new Map<string, ConsolidatedShiftRecord[]>()
  for (const row of rows) {
    const list = rowsByEmployee.get(row.employeeId) ?? []
    list.push(row)
    rowsByEmployee.set(row.employeeId, list)
  }

  for (const person of employeeSummaryRows) {
    const personRows = rowsByEmployee.get(person.employeeId) ?? []
    const sheetName = sanitizeSheetName(person.employeeName || person.employeeId, usedNames)
    const sheet = workbook.addWorksheet(sheetName)
    sheet.properties.defaultRowHeight = 18
    sheet.columns = [
      { width: 12 },
      { width: 22 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 36 },
    ]

    sheet.mergeCells("A1:K1")
    sheet.getCell("A1").value = `DETALLE INDIVIDUAL | ${person.employeeName}`
    sheet.getCell("A1").font = { size: 11, bold: true }
    sheet.getCell("A1").alignment = { vertical: "middle", horizontal: "center" }
    sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "D9E8F6" } }

    sheet.getRow(4).values = [
      "Fecha",
      "Sede",
      "Programado",
      "Entrada",
      "Salida",
      "Asistencia",
      "Cierre",
      "Tardanza",
      "Min netos",
      "Horas netas",
      "Observaciones",
    ]
    applyHeaderStyle(sheet.getRow(4))

    let rowNumber = 5
    for (const [index, row] of personRows.entries()) {
      sheet.getRow(rowNumber).values = [
        row.shiftDate,
        row.siteName,
        `${formatTime(row.scheduledStartAt, timeZone)}-${formatTime(row.scheduledEndAt, timeZone)}`,
        row.checkInAt ? formatDateTime(row.checkInAt, timeZone) : "-",
        row.checkOutAt ? formatDateTime(row.checkOutAt, timeZone) : row.isOpen ? "Abierto" : "-",
        row.attendanceStatus,
        row.closureStatus,
        row.isLate ? minutesToLabel(row.lateMinutes) : "-",
        row.actualNetMinutes,
        minutesToHoursLabel(row.actualNetMinutes),
        row.observations.join(" | ") || "Sin novedades",
      ]
      applyDataStyle(sheet.getRow(rowNumber), index % 2 === 1)
      rowNumber += 1
    }

    if (personRows.length === 0) {
      sheet.mergeCells("A5:K5")
      sheet.getCell("A5").value = "Sin registros para este trabajador."
      sheet.getCell("A5").font = { size: 9, italic: true }
      sheet.getCell("A5").alignment = { vertical: "middle", horizontal: "center" }
    }
  }

  return workbook
}

export async function GET(request: NextRequest) {
  try {
    const authSupabase = await createServerSupabaseClient()
    const [{ data: userData }, accessCheck] = await Promise.all([
      authSupabase.auth.getUser(),
      authSupabase.rpc("has_permission", { p_permission_code: "viso.access" }),
    ])

    const user = userData.user ?? null

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (accessCheck.error || !accessCheck.data) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { supabaseUrl, serviceKey } = getSupabaseServerConfig()
    const supabase = createSupabaseServiceClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const userId = user.id
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id, role, site_id")
      .eq("id", userId)
      .single<EmployeeRow>()

    if (employeeError || !employee) {
      return new Response(JSON.stringify({ error: "Employee not found" }), {
        status: 404,
        headers: jsonHeaders,
      })
    }

    const url = new URL(request.url)
    const startParam = url.searchParams.get("start")
    const endParam = url.searchParams.get("end")
    const requestedEmployeeId = url.searchParams.get("employee_id")?.trim() || null
    const requestedSiteId = url.searchParams.get("site_id")?.trim() || null
    const responseFormat = (url.searchParams.get("format") ?? "xlsx").trim().toLowerCase()
    const reportTimeZone = normalizeTimeZone(url.searchParams.get("tz"))

    const end = endParam ? new Date(endParam) : new Date()
    const start = startParam ? new Date(startParam) : new Date(end.getTime() - 30 * 86400000)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return new Response(JSON.stringify({ error: "Invalid date range" }), {
        status: 400,
        headers: jsonHeaders,
      })
    }

    const startIso = start.toISOString()
    const endIso = end.toISOString()

    const role = employee.role
    const isGlobalRole = ALLOWED_GLOBAL_ROLES.has(role)
    const isManager = role === MANAGER_ROLE

    let scopeSiteId: string | null = null
    let scopeEmployeeId: string | null = null
    let scopeLabel = "Todas las sedes"

    if (isGlobalRole) {
      scopeSiteId = requestedSiteId
      scopeEmployeeId = requestedEmployeeId
      if (scopeSiteId) {
        const { data: scopedSite, error: scopedSiteError } = await supabase
          .from("sites")
          .select("id, name")
          .eq("id", scopeSiteId)
          .maybeSingle()

        if (scopedSiteError || !scopedSite) {
          return new Response(JSON.stringify({ error: "Site scope not found" }), {
            status: 404,
            headers: jsonHeaders,
          })
        }
        scopeLabel = `Sede: ${scopedSite.name ?? scopedSite.id}`
      }
    } else if (isManager) {
      const { data: settings } = await supabase
        .from("employee_settings")
        .select("selected_site_id")
        .eq("employee_id", userId)
        .maybeSingle()

      scopeSiteId = settings?.selected_site_id ?? employee.site_id
      if (!scopeSiteId) {
        return new Response(JSON.stringify({ error: "No site assigned" }), {
          status: 400,
          headers: jsonHeaders,
        })
      }

      const { data: site, error: siteError } = await supabase
        .from("sites")
        .select("name, site_type")
        .eq("id", scopeSiteId)
        .single()

      if (siteError || !site) {
        return new Response(JSON.stringify({ error: "Site not found" }), {
          status: 404,
          headers: jsonHeaders,
        })
      }

      if (!MANAGER_ALLOWED_SITE_TYPES.has(site.site_type ?? "")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: jsonHeaders,
        })
      }

      scopeLabel = site.name ?? "Tu sede"
    } else {
      scopeEmployeeId = userId
      scopeLabel = "Registro personal"
    }

    if (scopeEmployeeId) {
      const { data: scopedEmployee, error: scopedEmployeeError } = await supabase
        .from("employees")
        .select("id, full_name, alias, site_id")
        .eq("id", scopeEmployeeId)
        .maybeSingle()

      if (scopedEmployeeError || !scopedEmployee) {
        return new Response(JSON.stringify({ error: "Employee scope not found" }), {
          status: 404,
          headers: jsonHeaders,
        })
      }

      if (isGlobalRole && scopeSiteId) {
        const primaryMatchesSite = scopedEmployee.site_id === scopeSiteId
        let assignmentMatchesSite = false

        if (!primaryMatchesSite) {
          const { data: employeeSiteMatch, error: employeeSiteMatchError } = await supabase
            .from("employee_sites")
            .select("employee_id")
            .eq("employee_id", scopeEmployeeId)
            .eq("site_id", scopeSiteId)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle()

          if (employeeSiteMatchError) {
            return new Response(JSON.stringify({ error: "Employee site validation failed" }), {
              status: 500,
              headers: jsonHeaders,
            })
          }
          assignmentMatchesSite = !!employeeSiteMatch
        }

        if (!primaryMatchesSite && !assignmentMatchesSite) {
          return new Response(
            JSON.stringify({ error: "Employee does not belong to selected site" }),
            {
              status: 400,
              headers: jsonHeaders,
            },
          )
        }
      }

      if (isGlobalRole && scopeEmployeeId !== userId) {
        const employeeLabel = scopedEmployee.alias ?? scopedEmployee.full_name ?? scopedEmployee.id
        scopeLabel = scopeSiteId
          ? `${scopeLabel} | Trabajador: ${employeeLabel}`
          : `Trabajador: ${employeeLabel}`
      }
    }

    const queryStart = new Date(start.getTime() - QUERY_BUFFER_HOURS * 3600000)
    const queryEnd = new Date(end.getTime() + QUERY_BUFFER_HOURS * 3600000)
    const shiftStartDate = formatDateKeyInTimeZone(start, reportTimeZone)
    const shiftEndDate = formatDateKeyInTimeZone(end, reportTimeZone)

    const [
      { data: policyData, error: policyError },
      { data: attendanceData, error: attendanceError },
      { data: breakData, error: breakError },
      { data: eventData, error: eventError },
      { data: shiftData, error: shiftError },
    ] = await Promise.all([
      supabase
        .from("shift_policy")
        .select("late_grace_minutes, auto_checkout_grace_minutes_after_end")
        .limit(1)
        .maybeSingle<ShiftPolicyRow>(),
      (() => {
        let query = supabase
          .from("attendance_logs")
          .select(
            "employee_id, site_id, action, source, notes, occurred_at, shift_id, employees(full_name, alias, role), sites(name)",
          )
          .gte("occurred_at", queryStart.toISOString())
          .lte("occurred_at", queryEnd.toISOString())
          .order("occurred_at", { ascending: true })

        if (scopeSiteId) query = query.eq("site_id", scopeSiteId)
        if (scopeEmployeeId) query = query.eq("employee_id", scopeEmployeeId)
        return query
      })(),
      (() => {
        let query = supabase
          .from("attendance_breaks")
          .select("employee_id, site_id, started_at, ended_at")
          .lte("started_at", queryEnd.toISOString())
          .or(`ended_at.is.null,ended_at.gte.${queryStart.toISOString()}`)
          .order("started_at", { ascending: true })

        if (scopeSiteId) query = query.eq("site_id", scopeSiteId)
        if (scopeEmployeeId) query = query.eq("employee_id", scopeEmployeeId)
        return query
      })(),
      (() => {
        let query = supabase
          .from("attendance_shift_events")
          .select("employee_id, site_id, shift_start_at, event_type, occurred_at, distance_meters, notes")
          .gte("occurred_at", queryStart.toISOString())
          .lte("occurred_at", queryEnd.toISOString())
          .order("occurred_at", { ascending: true })

        if (scopeSiteId) query = query.eq("site_id", scopeSiteId)
        if (scopeEmployeeId) query = query.eq("employee_id", scopeEmployeeId)
        return query
      })(),
      (() => {
        let query = supabase
          .from("employee_shifts")
          .select(
            "id, employee_id, site_id, shift_date, start_time, end_time, break_minutes, notes, status, published_at, employees!employee_shifts_employee_id_fkey(full_name, alias, role), sites!employee_shifts_site_id_fkey(name)",
          )
          .not("published_at", "is", null)
          .neq("status", "cancelled")
          .gte("shift_date", shiftStartDate)
          .lte("shift_date", shiftEndDate)
          .order("shift_date", { ascending: true })
          .order("start_time", { ascending: true })

        if (scopeSiteId) query = query.eq("site_id", scopeSiteId)
        if (scopeEmployeeId) query = query.eq("employee_id", scopeEmployeeId)
        return query
      })(),
    ])

    if (policyError) {
      return new Response(JSON.stringify({ error: "Shift policy query failed" }), {
        status: 500,
        headers: jsonHeaders,
      })
    }
    if (attendanceError) {
      return new Response(JSON.stringify({ error: "Attendance query failed" }), {
        status: 500,
        headers: jsonHeaders,
      })
    }
    if (breakError) {
      return new Response(JSON.stringify({ error: "Break query failed" }), {
        status: 500,
        headers: jsonHeaders,
      })
    }
    if (eventError) {
      return new Response(JSON.stringify({ error: "Shift events query failed" }), {
        status: 500,
        headers: jsonHeaders,
      })
    }
    if (shiftError) {
      return new Response(JSON.stringify({ error: "Shift schedule query failed" }), {
        status: 500,
        headers: jsonHeaders,
      })
    }

    const policy = policyData ?? null
    const lateGraceMinutes = safeMinutes(policy?.late_grace_minutes ?? DEFAULT_LATE_GRACE_MINUTES)
    const autoCloseGraceMinutes = safeMinutes(
      policy?.auto_checkout_grace_minutes_after_end ?? DEFAULT_AUTO_CLOSE_GRACE_MINUTES,
    )

    const attendanceRows = (attendanceData ?? []) as AttendanceRow[]
    const breakRows = (breakData ?? []) as BreakRow[]
    const eventRows = (eventData ?? []) as ShiftEventRow[]
    const scheduledShifts = (shiftData ?? []) as ScheduledShiftRow[]

    const sessions = buildAttendanceSessions(attendanceRows, breakRows, eventRows, endIso, reportTimeZone)
    const unlinkedAttendanceIncidentCutoffMs = getUnlinkedAttendanceIncidentCutoffMs(end)
    const consolidated = buildConsolidatedShiftRecords(
      scheduledShifts,
      sessions,
      lateGraceMinutes,
      autoCloseGraceMinutes,
      endIso,
      reportTimeZone,
    )
    const rows = consolidated.rows
    const employeeSummaryRows = buildEmployeeSummary(rows)
    const siteSummaryRows = buildSiteSummary(rows)
    const incidentRows = buildIncidentRows(rows, sessions, consolidated.usedSessionKeys, reportTimeZone, {
      unlinkedAttendanceIncidentCutoffMs,
    })
    const summary = buildReportSummary(rows)

    if (responseFormat === "json") {
      const topEmployees = [...employeeSummaryRows]
        .sort((a, b) => {
          if (b.incidentCount !== a.incidentCount) return b.incidentCount - a.incidentCount
          return a.employeeName.localeCompare(b.employeeName, "es")
        })
        .slice(0, 6)
      const topSites = [...siteSummaryRows]
        .sort((a, b) => {
          if (b.incidentCount !== a.incidentCount) return b.incidentCount - a.incidentCount
          return a.siteName.localeCompare(b.siteName, "es")
        })
        .slice(0, 6)

      return new Response(
        JSON.stringify({
          format: "json",
          scopeLabel,
          timeZone: reportTimeZone,
          lateGraceMinutes,
          autoCloseGraceMinutes,
          generatedAt: new Date().toISOString(),
          period: {
            start: startIso,
            end: endIso,
          },
          summary,
          topEmployees,
          topSites,
          incidents: incidentRows.slice(0, 12),
          incidentCountTotal: incidentRows.length,
          incidentPolicy: {
            unlinkedAttendanceIncidentStartAt: unlinkedAttendanceIncidentCutoffMs != null
              ? new Date(unlinkedAttendanceIncidentCutoffMs).toISOString()
              : null,
            unlinkedAttendanceIncidentLookbackDays: process.env[UNLINKED_ATTENDANCE_INCIDENT_START_DATE_ENV]
              ? null
              : getPositiveIntegerEnv(
                  process.env[UNLINKED_ATTENDANCE_INCIDENT_LOOKBACK_DAYS_ENV],
                  DEFAULT_UNLINKED_ATTENDANCE_INCIDENT_LOOKBACK_DAYS,
                ),
          },
        }),
        {
          status: 200,
          headers: jsonHeaders,
        },
      )
    }

    const workbook = buildWorkbook(
      rows,
      employeeSummaryRows,
      siteSummaryRows,
      incidentRows,
      summary,
      start,
      end,
      reportTimeZone,
      scopeLabel,
    )

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = `reporte_turnos_asistencia_${formatDateForFilename(start)}_${formatDateForFilename(end)}.xlsx`

    return new NextResponse(buffer as BodyInit, {
      status: 200,
      headers: buildExcelHeaders(filename),
    })
  } catch (error) {
    console.error("[viso attendance-report route]", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo procesar el reporte de asistencia.",
      },
      { status: 500 },
    )
  }
}
