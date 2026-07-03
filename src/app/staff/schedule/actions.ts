"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { notifyShiftChange } from "@/lib/anima/shift-notify";
import { generateWeeklySuggestion } from "@/lib/planning-ai/generate";
import type {
  PlanningAvailability,
  PlanningGenerationInput,
  PlanningRequirement,
  PlanningShiftDraft,
} from "@/lib/planning-ai/types";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  addDays,
  appendReturnParams,
  asNumber,
  asText,
  buildEmployeeHistoricalSignals,
  buildHistoricalRequirements,
  buildReturnTo,
  buildWeekDays,
  cleanOptionalText,
  createEmptyHistoricalSignals,
  formatWeekLabel,
  FULL_DAY_REST_END_TIME,
  FULL_DAY_REST_START_TIME,
  getApplicableOperationalRoleRows,
  getDayOfWeek,
  getEmployeeRef,
  getOperationalRoleCandidateFromBaseRole,
  getShiftMinutes,
  getShiftOperationalContext,
  getVisibleShiftStatus,
  isoDate,
  loadShiftOperationalContextIndex,
  parseWeekStart,
  requireStaffScheduleAccess,
  resolveContextSiteId,
  roleMatches,
  STAFF_SCHEDULE_PERMISSION,
  uniqueTextValues,
  withShiftOperationalContext,
  type AvailabilityRow,
  type EmployeeHistoricalPlanningSignals,
  type EmployeeOperationalProfileRow,
  type EmployeeRow,
  type EmployeeSiteLink,
  type HistoricalShiftPatternRow,
  type OperationalAreaOption,
  type OperationalRoleOption,
  type RoleConcurrencyLimitRow,
  type ShiftOperationalContext,
  type ShiftOperationalContextSeed,
  type ShiftRow,
  type SiteOperationalRoleRow,
  type SiteRow,
  type StaffingRequirementRow,
} from "./helpers";
export async function saveShiftAction(formData: FormData) {
  "use server";
  const shiftId = asText(formData.get("shift_id"));
  const employeeId = asText(formData.get("employee_id"));
  const employeeIds = [
    ...new Set(
      formData
        .getAll("employee_ids")
        .map((value) => asText(value))
        .filter(Boolean),
    ),
  ];
  const siteId = asText(formData.get("site_id"));
  const areaId = asText(formData.get("area_id")) || null;
  let resolvedAreaId = areaId;
  const explicitCheckinSiteId = asText(formData.get("checkin_site_id")) || null;
  const explicitCheckoutSiteId =
    asText(formData.get("checkout_site_id")) || null;
  const explicitOperationalContext: ShiftOperationalContext = {
    checkinSiteId: explicitCheckinSiteId,
    checkoutSiteId: explicitCheckoutSiteId,
  };
  const shiftDate = asText(formData.get("shift_date"));
  const blockShiftDates = formData
    .getAll("block_shift_date")
    .map((value) => asText(value));
  const startTime = asText(formData.get("start_time"));
  const endTime = asText(formData.get("end_time"));
  const blockStartTimes = formData
    .getAll("block_start_time")
    .map((value) => asText(value));
  const blockEndTimes = formData
    .getAll("block_end_time")
    .map((value) => asText(value));
  const blockNotes = formData
    .getAll("block_notes")
    .map((value) => asText(value));
  const blockSiteIds = formData
    .getAll("block_site_id")
    .map((value) => asText(value));
  const shiftNotes = asText(formData.get("notes"));
  const explicitShiftKind = asText(formData.get("shift_kind"));
  const operationalRole = asText(formData.get("operational_role")) || null;
  const isRestShift = asText(formData.get("rest_shift")) === "1";
  const isFullDayRest = asText(formData.get("full_day_rest")) === "1";
  const globalShiftKind =
    explicitShiftKind === "descanso" || isRestShift || isFullDayRest
      ? "descanso"
      : "laboral";
  const blockRestIndexes = new Set(
    formData
      .getAll("block_rest_day")
      .map((value) => Number(asText(value)))
      .filter((value) => Number.isInteger(value) && value >= 0),
  );
  const blockCount = Math.max(
    blockShiftDates.length,
    blockStartTimes.length,
    blockEndTimes.length,
    blockNotes.length,
  );
  const rawShiftBlocks: Array<{
    shiftDate: string;
    startTime: string;
    endTime: string;
    notes: string;
    siteId: string;
    shiftKind: "laboral" | "descanso";
  }> =
    blockCount > 0
      ? Array.from({ length: blockCount })
          .map((_, index) => {
            const isRestBlock = blockRestIndexes.has(index);
            return {
              shiftDate: blockShiftDates[index] || shiftDate,
              startTime: isRestBlock
                ? FULL_DAY_REST_START_TIME
                : (blockStartTimes[index] ?? ""),
              endTime: isRestBlock
                ? FULL_DAY_REST_END_TIME
                : (blockEndTimes[index] ?? ""),
              notes: blockNotes[index] ?? "",
              siteId: blockSiteIds[index] || siteId,
              shiftKind: isRestBlock
                ? ("descanso" as const)
                : ("laboral" as const),
            };
          })
          .filter(
            (block) =>
              block.shiftDate ||
              block.startTime ||
              block.endTime ||
              block.notes,
          )
      : [];
  const resolvedShiftBlocks: Array<{
    shiftDate: string;
    startTime: string;
    endTime: string;
    notes: string;
    siteId: string;
    shiftKind: "laboral" | "descanso";
  }> =
    globalShiftKind === "descanso" && rawShiftBlocks.length === 0
      ? [
          {
            shiftDate,
            startTime: FULL_DAY_REST_START_TIME,
            endTime: FULL_DAY_REST_END_TIME,
            notes: shiftNotes,
            siteId: blockSiteIds[0] || siteId,
            shiftKind: "descanso",
          },
        ]
      : rawShiftBlocks.length > 0
        ? rawShiftBlocks
        : [
            {
              shiftDate,
              startTime,
              endTime,
              notes: shiftNotes,
              siteId: blockSiteIds[0] || siteId,
              shiftKind: "laboral",
            },
          ];
  const orderedShiftBlocks = [...resolvedShiftBlocks].sort((first, second) => {
    const dateCompare = first.shiftDate.localeCompare(second.shiftDate, "es");
    if (dateCompare !== 0) return dateCompare;
    const startCompare = first.startTime.localeCompare(second.startTime, "es");
    return startCompare !== 0
      ? startCompare
      : first.endTime.localeCompare(second.endTime, "es");
  });
  const firstShiftBlock = orderedShiftBlocks[0] ?? {
    shiftDate: "",
    startTime: "",
    endTime: "",
    notes: "",
    siteId,
    shiftKind: "laboral" as const,
  };
  const laboralShiftBlocks = orderedShiftBlocks.filter(
    (block) => block.shiftKind !== "descanso",
  );
  const restShiftBlocks = orderedShiftBlocks.filter(
    (block) => block.shiftKind === "descanso",
  );
  const hasLaboralBlocks = laboralShiftBlocks.length > 0;
  const requestedShiftDates = [
    ...new Set(
      orderedShiftBlocks.map((block) => block.shiftDate).filter(Boolean),
    ),
  ];
  const requestedLaboralShiftDates = [
    ...new Set(
      laboralShiftBlocks.map((block) => block.shiftDate).filter(Boolean),
    ),
  ];
  const requestedRestShiftDates = [
    ...new Set(restShiftBlocks.map((block) => block.shiftDate).filter(Boolean)),
  ];
  const requestedSiteIds = [
    ...new Set(orderedShiftBlocks.map((block) => block.siteId).filter(Boolean)),
  ];
  const resolvedStartTime = firstShiftBlock.startTime;
  const resolvedEndTime = firstShiftBlock.endTime;
  const showEndAsClose = asText(formData.get("show_end_as_close")) === "1";
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";
  const keepQuick = asText(formData.get("keep_quick")) === "1";
  const primaryShiftDate = firstShiftBlock.shiftDate || shiftDate;
  const requestedEmployeeIds =
    employeeIds.length > 0 ? employeeIds : employeeId ? [employeeId] : [];

  await Promise.all(
    requestedSiteIds.length > 0
      ? requestedSiteIds.map((id) => requireStaffScheduleAccess(returnTo, id))
      : [requireStaffScheduleAccess(returnTo, siteId)],
  );
  const supabase = createAdminClient();

  if (
    requestedEmployeeIds.length === 0 ||
    !siteId ||
    requestedSiteIds.length === 0 ||
    requestedShiftDates.length === 0 ||
    orderedShiftBlocks.length === 0
  ) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Completa trabajador, fecha y horario.")}`,
    );
  }

  const { data: employeeSiteRows, error: employeeSiteError } = await supabase
    .from("employees")
    .select("id,site_id,is_active")
    .in("id", requestedEmployeeIds)
    .eq("is_active", true);

  if (employeeSiteError) {
    redirect(`${returnTo}&error=${encodeURIComponent(employeeSiteError.message)}`);
  }

  const primarySiteByEmployeeId = new Map(
    (employeeSiteRows ?? []).map((row) => [row.id, row.site_id]),
  );
  const sitesToValidateByEmployeeId = new Map<string, Set<string>>();
  for (const employee of requestedEmployeeIds) {
    const set = new Set(
      requestedSiteIds.filter((id) => primarySiteByEmployeeId.get(employee) !== id),
    );
    if (set.size > 0) sitesToValidateByEmployeeId.set(employee, set);
  }

  const unresolvedEmployeeIds = [...sitesToValidateByEmployeeId.keys()];
  if (unresolvedEmployeeIds.length > 0 && requestedSiteIds.length > 0) {
    const { data: linkedSiteRows, error: linkedSiteError } = await supabase
      .from("employee_sites")
      .select("employee_id,site_id")
      .in("employee_id", unresolvedEmployeeIds)
      .in("site_id", requestedSiteIds)
      .eq("is_active", true);

    if (linkedSiteError) {
      redirect(`${returnTo}&error=${encodeURIComponent(linkedSiteError.message)}`);
    }

    for (const row of linkedSiteRows ?? []) {
      sitesToValidateByEmployeeId.get(row.employee_id)?.delete(row.site_id);
    }
    const invalidEmployeeIds = [...sitesToValidateByEmployeeId.entries()]
      .filter(([, sites]) => sites.size > 0)
      .map(([id]) => id);

    if (invalidEmployeeIds.length > 0) {
      redirect(
        `${returnTo}&error=${encodeURIComponent("Ese trabajador no está vinculado a la sede elegida para el turno.")}`,
      );
    }
  }

  if (shiftId && requestedEmployeeIds.length !== 1) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("La edición solo admite un trabajador por turno.")}`,
    );
  }

  if (shiftId && requestedShiftDates.length !== 1) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("La edición solo admite un día por turno.")}`,
    );
  }

  if (shiftId && orderedShiftBlocks.length !== 1) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("La edición solo admite un bloque horario por turno.")}`,
    );
  }

  let selectedRoleRequirements: Pick<
    SiteOperationalRoleRow,
    "requires_external_checkin" | "requires_external_checkout"
  > | null = null;
  const selectedRoleRequirementsBySiteId = new Map<
    string,
    Pick<
      SiteOperationalRoleRow,
      "requires_external_checkin" | "requires_external_checkout"
    >
  >();

  if (hasLaboralBlocks) {
    if (!operationalRole) {
      redirect(
        `${returnTo}&error=${encodeURIComponent("Selecciona un rol operativo de la matriz para este turno.")}`,
      );
    }

    const { data: matrixRowsData, error: matrixError } = await supabase
      .from("vento_site_operational_role_matrix_v1")
      .select(
        "site_id,area_id,area_name,area_kind,role_code,role_label,role_family,is_default,requires_external_checkin,requires_external_checkout,is_active",
      )
      .in("site_id", requestedSiteIds)
      .eq("is_active", true);

    if (matrixError) {
      redirect(`${returnTo}&error=${encodeURIComponent(matrixError.message)}`);
    }

    const matrixRows = (matrixRowsData ?? []) as SiteOperationalRoleRow[];
    if (
      areaId &&
      laboralShiftBlocks.some(
        (block) =>
          !matrixRows.some(
            (row) => row.site_id === block.siteId && row.area_id === areaId,
          ),
      )
    ) {
      redirect(
        `${returnTo}&error=${encodeURIComponent("El área seleccionada no pertenece a la matriz activa de esta sede.")}`,
      );
    }

    for (const blockSiteId of [
      ...new Set(laboralShiftBlocks.map((block) => block.siteId)),
    ]) {
      const siteMatrixRows = matrixRows.filter((row) => row.site_id === blockSiteId);
      const applicableRows = getApplicableOperationalRoleRows(
        siteMatrixRows,
        areaId,
      );
      let selectedRoleRow =
        applicableRows.find((row) => row.role_code === operationalRole) ?? null;

      if (!selectedRoleRow && !areaId) {
        const uniqueRoleAreaRows = siteMatrixRows.filter(
          (row) => row.role_code === operationalRole,
        );
        if (uniqueRoleAreaRows.length === 1) {
          selectedRoleRow = uniqueRoleAreaRows[0] ?? null;
          if (requestedSiteIds.length === 1) {
            resolvedAreaId = selectedRoleRow?.area_id ?? null;
          }
        }
      }

      if (!selectedRoleRow) {
        redirect(
          `${returnTo}&error=${encodeURIComponent("El rol operativo seleccionado no está permitido para la sede y área del turno.")}`,
        );
      }

      selectedRoleRequirementsBySiteId.set(blockSiteId, selectedRoleRow);
    }

    selectedRoleRequirements =
      selectedRoleRequirementsBySiteId.values().next().value ?? null;
  }

  const incompleteBlocks = orderedShiftBlocks.some(
    (block) => !block.shiftDate || !block.startTime || !block.endTime,
  );
  if (incompleteBlocks) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Completa día, inicio y fin de cada bloque horario.")}`,
    );
  }

  if (hasLaboralBlocks) {
    const invalidBlocks = laboralShiftBlocks.filter(
      (block) => block.endTime <= block.startTime,
    );
    if (invalidBlocks.length > 0) {
      redirect(
        `${returnTo}&error=${encodeURIComponent("La hora de fin debe ser posterior a la hora de inicio en todos los bloques.")}`,
      );
    }

    for (let i = 0; i < laboralShiftBlocks.length; i += 1) {
      for (let j = i + 1; j < laboralShiftBlocks.length; j += 1) {
        const first = laboralShiftBlocks[i];
        const second = laboralShiftBlocks[j];
        if (!first || !second) continue;
        if (
          first.shiftDate === second.shiftDate &&
          first.startTime < second.endTime &&
          second.startTime < first.endTime
        ) {
          redirect(
            `${returnTo}&error=${encodeURIComponent(
              `Los bloques del turno partido se solapan (${first.startTime.slice(0, 5)} - ${first.endTime.slice(0, 5)} y ${second.startTime.slice(0, 5)} - ${second.endTime.slice(0, 5)}).`,
            )}`,
          );
        }
      }
    }
  }

  const restShiftDateSet = new Set(requestedRestShiftDates);
  if (
    hasLaboralBlocks &&
    laboralShiftBlocks.some((block) => restShiftDateSet.has(block.shiftDate))
  ) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("No mezcles descanso de día completo con bloques laborales del mismo día para el mismo trabajador.")}`,
    );
  }

  if (requestedRestShiftDates.length > 0) {
    let restConflictQuery = supabase
      .from("employee_shifts")
      .select("id,employee_id,shift_date,start_time,end_time,shift_kind,status")
      .in("employee_id", requestedEmployeeIds)
      .in("shift_date", requestedRestShiftDates)
      .neq("status", "cancelled");
    if (shiftId) {
      restConflictQuery = restConflictQuery.neq("id", shiftId);
    }
    const { data: restConflicts, error: restConflictError } =
      await restConflictQuery;
    if (restConflictError) {
      redirect(
        `${returnTo}&error=${encodeURIComponent(restConflictError.message)}`,
      );
    }
    if ((restConflicts ?? []).length > 0) {
      redirect(
        `${returnTo}&error=${encodeURIComponent("Ese trabajador ya tiene turnos en uno de los días que estás marcando como descanso. Elimina o ajusta esos turnos primero.")}`,
      );
    }
  }

  // Validar solapamiento: mismo empleado, misma fecha, rangos que se cruzan
  if (hasLaboralBlocks) {
    let overlapQuery = supabase
      .from("employee_shifts")
      .select("id, employee_id, shift_date, start_time, end_time")
      .in("employee_id", requestedEmployeeIds)
      .in("shift_date", requestedLaboralShiftDates)
      .neq("shift_kind", "descanso");
    if (shiftId) {
      overlapQuery = overlapQuery.neq("id", shiftId);
    }
    const { data: sameDayShifts, error: overlapErr } = await overlapQuery;
    if (overlapErr) {
      redirect(`${returnTo}&error=${encodeURIComponent(overlapErr.message)}`);
    }
    const overlaps = (sameDayShifts ?? []).filter(
      (s: {
        employee_id: string;
        shift_date: string;
        start_time: string;
        end_time: string;
      }) =>
        laboralShiftBlocks.some(
          (block) =>
            block.shiftDate === s.shift_date &&
            block.startTime < s.end_time &&
            s.start_time < block.endTime,
        ),
    );
    if (overlaps.length > 0) {
      const conflictingIds = [
        ...new Set(overlaps.map((shift) => shift.employee_id)),
      ];
      const { data: conflictEmployees } = await supabase
        .from("employees")
        .select("id,full_name,alias")
        .in("id", conflictingIds);
      const conflictNames = new Map(
        (conflictEmployees ?? []).map((employee) => [
          employee.id,
          employee.full_name ?? employee.alias ?? employee.id,
        ]),
      );
      const summary = conflictingIds
        .map((id) => {
          const conflict = overlaps.find((shift) => shift.employee_id === id);
          if (!conflict) return conflictNames.get(id) ?? id;
          return `${conflictNames.get(id) ?? id} ${conflict.shift_date} (${conflict.start_time.slice(0, 5)} - ${conflict.end_time.slice(0, 5)})`;
        })
        .join(", ");
      redirect(
        `${returnTo}&error=${encodeURIComponent(
          `Algunos trabajadores ya tienen un turno que se solapa: ${summary}. Ajusta el horario o quítalos de la selección.`,
        )}`,
      );
    }
  }

  const closeBlockIndex =
    !hasLaboralBlocks || !showEndAsClose
      ? -1
      : orderedShiftBlocks.reduce(
          (lastIndex, block, index) =>
            block.shiftKind === "descanso" ? lastIndex : index,
          -1,
        );
  const operationalContextIndex = await loadShiftOperationalContextIndex(
    supabase,
    hasLaboralBlocks
      ? requestedEmployeeIds.flatMap((id) =>
          requestedSiteIds.map((blockSiteId) => ({
            employeeId: id,
            siteId: blockSiteId,
            operationalRole,
          })),
        )
      : [],
  );

  if (hasLaboralBlocks && selectedRoleRequirements) {
    const missingExternalContext = requestedEmployeeIds.filter((id) =>
      laboralShiftBlocks.some((block) => {
        const requirements = selectedRoleRequirementsBySiteId.get(block.siteId);
        if (!requirements) return false;

        const profileContext = getShiftOperationalContext(
          operationalContextIndex,
          id,
          block.siteId,
          operationalRole,
        );
        const checkinSiteId = resolveContextSiteId(
          explicitOperationalContext.checkinSiteId,
          profileContext?.checkinSiteId,
        );
        const checkoutSiteId = resolveContextSiteId(
          explicitOperationalContext.checkoutSiteId,
          profileContext?.checkoutSiteId,
        );

        return (
          (Boolean(requirements.requires_external_checkin) && !checkinSiteId) ||
          (Boolean(requirements.requires_external_checkout) && !checkoutSiteId)
        );
      }),
    );

    if (missingExternalContext.length > 0) {
      redirect(
        `${returnTo}&error=${encodeURIComponent("Este rol operativo exige punto físico de entrada y salida. Selecciona puntos de marcación o configura el perfil operativo del trabajador.")}`,
      );
    }
  }

  const buildShiftPayload = (
    id: string,
    block: (typeof orderedShiftBlocks)[number],
    index: number,
  ) => {
    const blockShiftKind = block.shiftKind;
    const isRestBlock = blockShiftKind === "descanso";
    return withShiftOperationalContext(
      {
        site_id: block.siteId,
        area_id: isRestBlock ? null : resolvedAreaId,
        shift_kind: blockShiftKind,
        operational_role: isRestBlock ? null : operationalRole,
        break_minutes: isRestBlock
          ? 0
          : Math.max(0, asNumber(formData.get("break_minutes"), 0)),
        status: asText(formData.get("status")) || "scheduled",
        notes: block.notes || shiftNotes || null,
        published_at: null,
        published_by: null,
        employee_id: id,
        shift_date: block.shiftDate,
        start_time: isRestBlock ? FULL_DAY_REST_START_TIME : block.startTime,
        end_time: isRestBlock ? FULL_DAY_REST_END_TIME : block.endTime,
        show_end_as_close: !isRestBlock && index === closeBlockIndex,
      },
      isRestBlock
        ? null
        : getShiftOperationalContext(
            operationalContextIndex,
            id,
            block.siteId,
            operationalRole,
          ),
      blockShiftKind,
      isRestBlock ? null : explicitOperationalContext,
    );
  };

  const insertPayload = requestedEmployeeIds.flatMap((id) =>
    orderedShiftBlocks.map((block, index) =>
      buildShiftPayload(id, block, index),
    ),
  );

  const updateBlock = firstShiftBlock;
  const query = shiftId
    ? supabase
        .from("employee_shifts")
        .update(buildShiftPayload(requestedEmployeeIds[0], updateBlock, 0))
        .eq("id", shiftId)
    : supabase.from("employee_shifts").insert(insertPayload);

  const { error } = await query;
  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  const successCode = shiftId
    ? "turno_actualizado_borrador"
    : insertPayload.length > 1
      ? "turnos_creados_borrador"
      : "turno_creado_borrador";
  const nextReturnTo =
    !shiftId && keepQuick
      ? appendReturnParams(returnTo, {
          quick_keep: "1",
          quick_employee_id: requestedEmployeeIds[0] ?? null,
          quick_shift_date: primaryShiftDate,
          edit_shift: null,
        })
      : appendReturnParams(returnTo, {
          quick_keep: null,
          quick_employee_id: null,
          quick_shift_date: null,
          edit_shift: null,
        });
  redirect(`${nextReturnTo}&ok=${encodeURIComponent(successCode)}`);
}

export async function deleteShiftAction(formData: FormData) {
  "use server";
  const shiftId = asText(formData.get("shift_id"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo);
  const supabase = createAdminClient();

  if (!shiftId) {
    redirect(`${returnTo}&error=${encodeURIComponent("Turno inválido.")}`);
  }

  const { error } = await supabase
    .from("employee_shifts")
    .delete()
    .eq("id", shiftId)
    .is("published_at", null);
  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("turno_eliminado")}`);
}

export async function deleteManyShiftAction(formData: FormData) {
  "use server";
  const shiftIds = formData
    .getAll("shift_ids")
    .map((value) => asText(value))
    .filter(Boolean);
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo);
  const supabase = createAdminClient();

  if (shiftIds.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Selecciona al menos un turno para eliminar.")}`,
    );
  }

  const { error } = await supabase
    .from("employee_shifts")
    .delete()
    .in("id", shiftIds);
  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("turnos_eliminados")}`);
}

export async function deleteDraftWeekAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (!siteId || !weekStartIso) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Faltan datos para descartar los borradores.")}`,
    );
  }

  const weekStart = parseWeekStart(weekStartIso);
  const weekEndIso = isoDate(addDays(weekStart, 6));

  const { error } = await supabase
    .from("employee_shifts")
    .delete()
    .eq("site_id", siteId)
    .gte("shift_date", weekStartIso)
    .lte("shift_date", weekEndIso)
    .is("published_at", null);

  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("borradores_descartados")}`);
}

export async function assignManyShiftAction(formData: FormData) {
  "use server";
  const sourceShiftIds = formData
    .getAll("shift_ids")
    .map((value) => asText(value))
    .filter(Boolean);
  const targetEmployeeIds = [
    ...new Set(
      formData
        .getAll("employee_ids")
        .map((value) => asText(value))
        .filter(Boolean),
    ),
  ];
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo);
  const supabase = createAdminClient();

  if (sourceShiftIds.length === 0 || targetEmployeeIds.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Selecciona bloques y trabajadores para aplicar la edición masiva.")}`,
    );
  }

  const { data: sourceShifts, error: sourceError } = await supabase
    .from("employee_shifts")
    .select(
      "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
    )
    .in("id", sourceShiftIds);

  if (sourceError) {
    redirect(`${returnTo}&error=${encodeURIComponent(sourceError.message)}`);
  }

  const shiftRows = (sourceShifts ?? []) as ShiftRow[];
  if (shiftRows.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("No se encontraron los bloques seleccionados.")}`,
    );
  }

  const requestedRanges = shiftRows
    .filter((shift) => shift.shift_kind !== "descanso")
    .map((shift) => ({
      shift_date: shift.shift_date,
      start_time: shift.start_time,
      end_time: shift.end_time,
    }));
  const requestedDates = [
    ...new Set(requestedRanges.map((item) => item.shift_date)),
  ];

  const { data: existingShifts, error: existingError } =
    requestedRanges.length > 0
      ? await supabase
          .from("employee_shifts")
          .select("employee_id,shift_date,start_time,end_time")
          .neq("shift_kind", "descanso")
          .in("employee_id", targetEmployeeIds)
          .in("shift_date", requestedDates)
      : { data: [], error: null };

  if (existingError) {
    redirect(`${returnTo}&error=${encodeURIComponent(existingError.message)}`);
  }

  const overlaps = (existingShifts ?? []).filter((existing) =>
    requestedRanges.some(
      (range) =>
        range.shift_date === existing.shift_date &&
        range.start_time < existing.end_time &&
        existing.start_time < range.end_time,
    ),
  );

  if (overlaps.length > 0) {
    const conflictingIds = [
      ...new Set(overlaps.map((shift) => shift.employee_id)),
    ];
    const { data: conflictEmployees } = await supabase
      .from("employees")
      .select("id,full_name,alias")
      .in("id", conflictingIds);
    const conflictNames = new Map(
      (conflictEmployees ?? []).map((employee) => [
        employee.id,
        employee.full_name ?? employee.alias ?? employee.id,
      ]),
    );
    const summary = conflictingIds
      .map((id) => {
        const conflict = overlaps.find((shift) => shift.employee_id === id);
        if (!conflict) return conflictNames.get(id) ?? id;
        return `${conflictNames.get(id) ?? id} (${conflict.shift_date} ${conflict.start_time.slice(0, 5)} - ${conflict.end_time.slice(0, 5)})`;
      })
      .join(", ");
    redirect(
      `${returnTo}&error=${encodeURIComponent(
        `Algunos trabajadores destino ya tienen un turno que se solapa: ${summary}.`,
      )}`,
    );
  }

  const existingExact = new Set(
    (existingShifts ?? []).map(
      (shift) =>
        `${shift.employee_id}|${shift.shift_date}|${shift.start_time}|${shift.end_time}`,
    ),
  );

  const operationalContextIndex = await loadShiftOperationalContextIndex(
    supabase,
    targetEmployeeIds.flatMap((employeeId) =>
      shiftRows.map((shift) => ({
        employeeId,
        siteId: shift.site_id,
        operationalRole: shift.operational_role,
      })),
    ),
  );

  const payload = targetEmployeeIds.flatMap((employeeId) =>
    shiftRows
      .filter((shift) => shift.employee_id !== employeeId)
      .filter(
        (shift) =>
          !existingExact.has(
            `${employeeId}|${shift.shift_date}|${shift.start_time}|${shift.end_time}`,
          ),
      )
      .map((shift) => {
        const shiftKind = shift.shift_kind ?? "laboral";
        return withShiftOperationalContext(
          {
            employee_id: employeeId,
            site_id: shift.site_id,
            area_id: shift.area_id ?? null,
            shift_date: shift.shift_date,
            start_time: shift.start_time,
            end_time: shift.end_time,
            shift_kind: shiftKind,
            operational_role: shift.operational_role ?? null,
            show_end_as_close: shift.show_end_as_close ?? false,
            break_minutes: shift.break_minutes ?? 0,
            status: shift.status || "scheduled",
            notes: shift.notes ?? null,
            published_at: null,
            published_by: null,
          },
          getShiftOperationalContext(
            operationalContextIndex,
            employeeId,
            shift.site_id,
            shift.operational_role,
          ),
          shiftKind,
          {
            checkinSiteId: shift.checkin_site_id ?? null,
            checkoutSiteId: shift.checkout_site_id ?? null,
          },
        );
      }),
  );

  if (payload.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("No hubo nuevos turnos por crear para los trabajadores seleccionados.")}`,
    );
  }

  const { error } = await supabase.from("employee_shifts").insert(payload);
  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("turnos_asignados_masivo")}`);
}

export async function copyPreviousWeekAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (!siteId || !weekStartIso) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Faltan datos para copiar la semana.")}`,
    );
  }

  const weekStart = parseWeekStart(weekStartIso);
  const prevStart = addDays(weekStart, -7);
  const prevEnd = addDays(prevStart, 6);

  const { data: previousRows, error: previousError } = await supabase
    .from("employee_shifts")
    .select(
      "employee_id,site_id,area_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,checkin_site_id,checkout_site_id",
    )
    .eq("site_id", siteId)
    .gte("shift_date", isoDate(prevStart))
    .lte("shift_date", isoDate(prevEnd));

  if (previousError) {
    redirect(`${returnTo}&error=${encodeURIComponent(previousError.message)}`);
  }

  const rows = (previousRows ?? []) as Array<{
    employee_id: string;
    site_id: string;
    area_id?: string | null;
    shift_date: string;
    start_time: string;
    end_time: string;
    shift_kind?: string | null;
    operational_role?: string | null;
    show_end_as_close?: boolean | null;
    break_minutes: number | null;
    status: string;
    notes: string | null;
    checkin_site_id?: string | null;
    checkout_site_id?: string | null;
  }>;

  if (rows.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("No hay turnos en la semana anterior para copiar.")}`,
    );
  }

  const operationalContextIndex = await loadShiftOperationalContextIndex(
    supabase,
    rows.map((row) => ({
      employeeId: row.employee_id,
      siteId: row.site_id,
      operationalRole: row.operational_role,
    })),
  );

  const nextRows = rows.map((row) => {
    const baseDate = new Date(`${row.shift_date}T12:00:00`);
    baseDate.setDate(baseDate.getDate() + 7);
    const shiftKind = row.shift_kind ?? "laboral";
    const profileContext = getShiftOperationalContext(
      operationalContextIndex,
      row.employee_id,
      row.site_id,
      row.operational_role,
    );

    return {
      ...row,
      shift_date: isoDate(baseDate),
      checkin_site_id:
        shiftKind === "descanso"
          ? null
          : (profileContext?.checkinSiteId ?? row.checkin_site_id ?? null),
      checkout_site_id:
        shiftKind === "descanso"
          ? null
          : (profileContext?.checkoutSiteId ?? row.checkout_site_id ?? null),
      published_at: null,
      published_by: null,
    };
  });

  const { error } = await supabase.from("employee_shifts").upsert(nextRows, {
    onConflict: "employee_id,site_id,shift_date,start_time",
  });

  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("semana_copiada_borrador")}`);
}

export async function copyDayToOtherDaysAction(formData: FormData) {
  "use server";
  const sourceDayIso = asText(formData.get("source_day"));
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";
  const targetDaysRaw = formData.getAll("target_days");
  const targetDays = Array.from(targetDaysRaw)
    .filter(
      (v): v is string =>
        typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()),
    )
    .filter((iso) => iso !== sourceDayIso);

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (!siteId || !sourceDayIso || !employeeId || targetDays.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Elige el día, la persona y al menos un día destino.")}`,
    );
  }

  const query = supabase
    .from("employee_shifts")
    .select(
      "employee_id,site_id,area_id,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,checkin_site_id,checkout_site_id",
    )
    .eq("site_id", siteId)
    .eq("shift_date", sourceDayIso)
    .eq("employee_id", employeeId);

  const { data: sourceShifts, error: fetchError } = await query;

  if (fetchError) {
    redirect(`${returnTo}&error=${encodeURIComponent(fetchError.message)}`);
  }

  const rows = (sourceShifts ?? []) as Array<{
    employee_id: string;
    site_id: string;
    area_id?: string | null;
    start_time: string;
    end_time: string;
    shift_kind?: string | null;
    operational_role?: string | null;
    show_end_as_close?: boolean | null;
    break_minutes: number | null;
    status: string;
    notes: string | null;
    checkin_site_id?: string | null;
    checkout_site_id?: string | null;
  }>;

  if (rows.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Ese día no tiene turnos de esa persona para copiar.")}`,
    );
  }

  const operationalContextIndex = await loadShiftOperationalContextIndex(
    supabase,
    rows.map((row) => ({
      employeeId: row.employee_id,
      siteId: row.site_id,
      operationalRole: row.operational_role,
    })),
  );

  const toInsert = targetDays.flatMap((shiftDate) =>
    rows.map((row) => {
      const shiftKind = row.shift_kind ?? "laboral";
      const profileContext = getShiftOperationalContext(
        operationalContextIndex,
        row.employee_id,
        row.site_id,
        row.operational_role,
      );

      return {
        employee_id: row.employee_id,
        site_id: row.site_id,
        area_id: row.area_id ?? null,
        shift_date: shiftDate,
        start_time: row.start_time,
        end_time: row.end_time,
        shift_kind: shiftKind,
        operational_role: row.operational_role ?? null,
        show_end_as_close: row.show_end_as_close ?? false,
        break_minutes: row.break_minutes,
        status: row.status,
        notes: row.notes,
        checkin_site_id:
          shiftKind === "descanso"
            ? null
            : (profileContext?.checkinSiteId ?? row.checkin_site_id ?? null),
        checkout_site_id:
          shiftKind === "descanso"
            ? null
            : (profileContext?.checkoutSiteId ?? row.checkout_site_id ?? null),
        published_at: null,
        published_by: null,
      };
    }),
  );

  // Evitar solapamientos: por cada día destino, comprobar que ni los existentes ni los nuevos se crucen
  for (const shiftDate of targetDays) {
    const { data: existingRows } = await supabase
      .from("employee_shifts")
      .select("start_time, end_time")
      .eq("employee_id", employeeId)
      .eq("shift_date", shiftDate);
    const ranges = [
      ...((existingRows ?? []) as Array<{
        start_time: string;
        end_time: string;
      }>),
      ...rows.map((r) => ({ start_time: r.start_time, end_time: r.end_time })),
    ];
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const a = ranges[i];
        const b = ranges[j];
        if (a.start_time < b.end_time && b.start_time < a.end_time) {
          redirect(
            `${returnTo}&error=${encodeURIComponent(
              `El día ${shiftDate} quedaría con turnos solapados para esa persona (${a.start_time.slice(0, 5)}-${a.end_time.slice(0, 5)} y ${b.start_time.slice(0, 5)}-${b.end_time.slice(0, 5)}). Ajusta o elige otros días.`,
            )}`,
          );
        }
      }
    }
  }

  const { error } = await supabase.from("employee_shifts").insert(toInsert);
  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(
    `${returnTo}&ok=${encodeURIComponent("Día aplicado a los días seleccionados.")}`,
  );
}

export async function publishWeekAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  const { user } = await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (!siteId || !weekStartIso) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Faltan datos para publicar la semana.")}`,
    );
  }

  const weekStart = parseWeekStart(weekStartIso);
  const weekEndIso = isoDate(addDays(weekStart, 6));

  const { data: shifts, error: shiftsError } = await supabase
    .from("employee_shifts")
    .select("id, employee_id, shift_date, start_time, end_time, published_at")
    .eq("site_id", siteId)
    .gte("shift_date", weekStartIso)
    .lte("shift_date", weekEndIso);

  if (shiftsError) {
    redirect(`${returnTo}&error=${encodeURIComponent(shiftsError.message)}`);
  }

  const shiftRows = (shifts ?? []) as Array<{
    id: string;
    employee_id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    published_at: string | null;
  }>;
  const draftRows = shiftRows.filter((row) => !row.published_at);

  if (shiftRows.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("No hay turnos en esta semana para publicar.")}`,
    );
  }
  if (draftRows.length === 0) {
    redirect(
      `${returnTo}&ok=${encodeURIComponent("sin_borradores_por_publicar")}`,
    );
  }

  const publishedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("employee_shifts")
    .update({
      published_at: publishedAt,
      published_by: user.id,
    })
    .eq("site_id", siteId)
    .gte("shift_date", weekStartIso)
    .lte("shift_date", weekEndIso)
    .is("published_at", null);

  if (updateError) {
    redirect(`${returnTo}&error=${encodeURIComponent(updateError.message)}`);
  }

  await notifyShiftChange({
    employeeIds: draftRows.map((row) => row.employee_id),
    title: "Tu horario semanal fue publicado",
    body: `Revisa tus turnos de la semana ${formatWeekLabel(weekStart)} en ANIMA.`,
    data: {
      siteId,
      weekStart: weekStartIso,
      action: "published_week",
      source: "viso_schedule_planner",
    },
  });

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("semana_publicada")}`);
}

export async function suggestDraftWeekAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (!siteId || !weekStartIso) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Faltan datos para generar el borrador sugerido.")}`,
    );
  }

  const weekStart = parseWeekStart(weekStartIso);
  const weekEndIso = isoDate(addDays(weekStart, 6));
  const weekDays = buildWeekDays(weekStart);

  const [
    directEmployeesRes,
    linkedEmployeesRes,
    existingShiftsRes,
    staffingRequirementsRes,
    historicalShiftsRes,
    availabilityRes,
    planningLimitsRes,
    shiftPreferencesRes,
    siteOperationalRolesRes,
    employeeOperationalProfilesRes,
    roleConcurrencyLimitsRes,
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id,full_name,alias,role,is_active,site_id")
      .eq("site_id", siteId)
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    supabase
      .from("employee_sites")
      .select(
        "employee_id,is_active,employee:employees(id,full_name,alias,role,is_active,site_id)",
      )
      .eq("site_id", siteId)
      .eq("is_active", true),
    supabase
      .from("employee_shifts")
      .select(
        "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
      )
      .eq("site_id", siteId)
      .gte("shift_date", weekStartIso)
      .lte("shift_date", weekEndIso),
    supabase
      .schema("viso")
      .from("site_staffing_requirements")
      .select(
        "site_id,day_of_week,start_time,end_time,min_headcount,required_role_code",
      )
      .eq("site_id", siteId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true }),
    supabase
      .from("employee_shifts")
      .select(
        "employee_id,shift_date,start_time,end_time,operational_role,status,shift_kind,employees!employee_shifts_employee_id_fkey(role)",
      )
      .eq("site_id", siteId)
      .gte("shift_date", isoDate(addDays(weekStart, -180)))
      .lt("shift_date", weekStartIso)
      .neq("status", "cancelled")
      .order("shift_date", { ascending: false }),
    supabase
      .schema("viso")
      .from("employee_availability")
      .select(
        "employee_id,site_id,day_of_week,available_from,available_to,is_available,availability_kind",
      )
      .or(`site_id.is.null,site_id.eq.${siteId}`),
    supabase
      .schema("viso")
      .from("employee_planning_limits")
      .select("employee_id,target_weekly_minutes,max_weekly_minutes")
      .or(`site_id.is.null,site_id.eq.${siteId}`),
    supabase
      .schema("viso")
      .from("employee_shift_preferences")
      .select(
        "employee_id,prefers_morning,prefers_afternoon,prefers_evening,avoid_opening,avoid_closing",
      )
      .or(`site_id.is.null,site_id.eq.${siteId}`),
    supabase
      .from("vento_site_operational_role_matrix_v1")
      .select(
        "site_id,area_id,area_name,area_kind,role_code,role_label,role_family,is_default,requires_external_checkin,requires_external_checkout,is_active",
      )
      .eq("site_id", siteId)
      .eq("is_active", true),
    supabase
      .from("employee_site_operational_profiles")
      .select(
        "employee_id,site_id,default_operational_role,default_checkin_site_id,default_checkout_site_id,is_active",
      )
      .eq("site_id", siteId)
      .neq("is_active", false),
    supabase
      .schema("viso")
      .from("role_concurrency_limits")
      .select(
        "id,site_id,role_code,day_of_week,start_time,end_time,max_concurrent,applies_across_sites,is_active",
      )
      .eq("is_active", true)
      .or(`site_id.is.null,site_id.eq.${siteId}`),
  ]);

  if (staffingRequirementsRes.error) {
    redirect(
      `${returnTo}&error=${encodeURIComponent(staffingRequirementsRes.error.message)}`,
    );
  }
  if (siteOperationalRolesRes.error) {
    redirect(
      `${returnTo}&error=${encodeURIComponent(siteOperationalRolesRes.error.message)}`,
    );
  }
  if (employeeOperationalProfilesRes.error) {
    redirect(
      `${returnTo}&error=${encodeURIComponent(employeeOperationalProfilesRes.error.message)}`,
    );
  }
  if (roleConcurrencyLimitsRes.error) {
    redirect(
      `${returnTo}&error=${encodeURIComponent(roleConcurrencyLimitsRes.error.message)}`,
    );
  }

  const staffingRequirements = (staffingRequirementsRes.data ??
    []) as StaffingRequirementRow[];
  const historicalShiftRows = (historicalShiftsRes.data ?? []) as Array<{
    employee_id: string | null;
    shift_date: string;
    start_time: string;
    end_time: string;
    operational_role: string | null;
    shift_kind: string | null;
    employees?: { role: string | null } | { role: string | null }[] | null;
  }>;

  const employeeMap = new Map<string, EmployeeRow>();
  for (const row of (directEmployeesRes.data ?? []) as EmployeeRow[]) {
    employeeMap.set(row.id, row);
  }
  for (const link of (linkedEmployeesRes.data ?? []) as EmployeeSiteLink[]) {
    const employee = getEmployeeRef(link.employee);
    if (employee?.id && employee.is_active) {
      employeeMap.set(employee.id, employee);
    }
  }
  const employees = [...employeeMap.values()];

  if (employees.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("No hay trabajadores activos en esta sede para sugerir horarios.")}`,
    );
  }

  const existingShifts = ((existingShiftsRes.data ?? []) as ShiftRow[])
    .filter((shift) => shift.status !== "cancelled")
    .map<PlanningShiftDraft>((shift) => ({
      employeeId: shift.employee_id,
      siteId: shift.site_id,
      areaId: shift.area_id ?? null,
      shiftDate: shift.shift_date,
      startTime: shift.start_time,
      endTime: shift.end_time,
      shiftKind: (shift.shift_kind ?? "laboral") as "laboral" | "descanso",
      requiredRoleCode: shift.operational_role ?? null,
      notes: shift.notes,
    }));

  let requirements: PlanningRequirement[] = [];
  if (staffingRequirements.length > 0) {
    for (const day of weekDays) {
      const dayOfWeek = getDayOfWeek(day.iso);
      const dayRequirements = staffingRequirements.filter(
        (row) => row.day_of_week === dayOfWeek,
      );

      for (const row of dayRequirements) {
        const coveredCount = existingShifts.filter(
          (shift) =>
            shift.shiftDate === day.iso &&
            shift.startTime === row.start_time &&
            shift.endTime === row.end_time &&
            roleMatches(
              employeeMap.get(shift.employeeId)?.role ?? null,
              row.required_role_code,
            ),
        ).length;
        const missingHeadcount = Math.max(0, row.min_headcount - coveredCount);

        for (let index = 0; index < missingHeadcount; index += 1) {
          requirements.push({
            siteId,
            shiftDate: day.iso,
            startTime: row.start_time,
            endTime: row.end_time,
            requiredHeadcount: 1,
            roleCode: row.required_role_code,
          });
        }
      }
    }
  } else {
    const patternCounts = new Map<string, HistoricalShiftPatternRow>();
    for (const row of historicalShiftRows) {
      if (row.shift_kind === "descanso") continue;
      const employeeRef = Array.isArray(row.employees)
        ? row.employees[0]
        : row.employees;
      const role = row.operational_role ?? employeeRef?.role ?? null;
      const key = [
        getDayOfWeek(row.shift_date),
        row.start_time,
        row.end_time,
        role ?? "",
      ].join("|");
      const current = patternCounts.get(key) ?? {
        shift_date: row.shift_date,
        start_time: row.start_time,
        end_time: row.end_time,
        operational_role: row.operational_role,
        employee_role: employeeRef?.role ?? null,
        count: 0,
      };
      current.count += 1;
      patternCounts.set(key, current);
    }

    requirements = buildHistoricalRequirements(
      weekDays,
      [...patternCounts.values()].filter((row) => row.count >= 2),
      siteId,
    );
  }

  if (requirements.length === 0 && staffingRequirements.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent(
        "No hay reglas ni suficiente historico repetido para sugerir un borrador en esta sede.",
      )}`,
    );
  }

  if (requirements.length === 0) {
    redirect(`${returnTo}&ok=${encodeURIComponent("sugerencia_no_necesaria")}`);
  }

  const availabilityRows = (availabilityRes.data ?? []) as AvailabilityRow[];
  const planningLimitsRows = (planningLimitsRes.data ?? []) as Array<{
    employee_id: string;
    target_weekly_minutes: number;
    max_weekly_minutes: number;
  }>;
  const shiftPreferenceRows = (shiftPreferencesRes.data ?? []) as Array<{
    employee_id: string;
    prefers_morning: boolean;
    prefers_afternoon: boolean;
    prefers_evening: boolean;
    avoid_opening: boolean;
    avoid_closing: boolean;
  }>;
  const roleConcurrencyLimitRows = (roleConcurrencyLimitsRes.data ??
    []) as RoleConcurrencyLimitRow[];
  const planningLimitsByEmployee = new Map(
    planningLimitsRows.map((row) => [row.employee_id, row] as const),
  );
  const shiftPreferencesByEmployee = new Map(
    shiftPreferenceRows.map((row) => [row.employee_id, row] as const),
  );
  const activeSiteOperationalRoleRows = (siteOperationalRolesRes.data ??
    []) as SiteOperationalRoleRow[];
  const employeeOperationalProfileRows = (employeeOperationalProfilesRes.data ??
    []) as EmployeeOperationalProfileRow[];
  const profileByEmployee = new Map(
    employeeOperationalProfileRows
      .filter((profile) => profile.site_id === siteId)
      .map((profile) => [profile.employee_id, profile] as const),
  );
  const operationalRoleCodesByEmployee = new Map<string, Set<string>>();
  const areaIdByOperationalRole = new Map<string, string | null>();

  for (const roleRow of activeSiteOperationalRoleRows) {
    const roleCode = cleanOptionalText(roleRow.role_code);
    if (!roleCode) continue;
    if (!areaIdByOperationalRole.has(roleCode) || roleRow.is_default) {
      areaIdByOperationalRole.set(roleCode, cleanOptionalText(roleRow.area_id));
    }
  }

  for (const employee of employees) {
    const profile = profileByEmployee.get(employee.id);
    const roleCodes = new Set<string>();
    const profileRole = cleanOptionalText(profile?.default_operational_role);
    const baseCandidateRole = getOperationalRoleCandidateFromBaseRole(
      employee.role,
    );

    if (profileRole) roleCodes.add(profileRole);
    if (baseCandidateRole) roleCodes.add(baseCandidateRole);

    operationalRoleCodesByEmployee.set(employee.id, roleCodes);
  }
  const historicalSignalsByEmployee = buildEmployeeHistoricalSignals(
    historicalShiftRows,
    weekStart,
  );
  const availability: PlanningAvailability[] = availabilityRows.flatMap((row) =>
    weekDays
      .filter((day) => row.day_of_week === getDayOfWeek(day.iso))
      .map((day) => ({
        employeeId: row.employee_id,
        siteId: row.site_id,
        shiftDate: day.iso,
        availableFrom: row.available_from,
        availableTo: row.available_to,
        isAvailable: row.is_available,
        availabilityKind: row.availability_kind,
      })),
  );

  const generationInput: PlanningGenerationInput = {
    siteId,
    weekStartIso,
    employees: employees.map((employee) => {
      const limits = planningLimitsByEmployee.get(employee.id);
      const preferences = shiftPreferencesByEmployee.get(employee.id);
      const profile = profileByEmployee.get(employee.id);
      const profileRole = cleanOptionalText(profile?.default_operational_role);
      const fallbackRole = getOperationalRoleCandidateFromBaseRole(
        employee.role,
      );
      const defaultOperationalRoleCode = profileRole ?? fallbackRole;
      const operationalRoleCodes = [
        ...(operationalRoleCodesByEmployee.get(employee.id) ?? new Set()),
      ];
      const historicalSignals =
        historicalSignalsByEmployee.get(employee.id) ??
        createEmptyHistoricalSignals();
      return {
        id: employee.id,
        fullName: employee.full_name ?? employee.alias ?? null,
        roleCode: defaultOperationalRoleCode ?? employee.role ?? null,
        operationalRoleCodes,
        defaultOperationalRoleCode,
        defaultAreaId: defaultOperationalRoleCode
          ? (areaIdByOperationalRole.get(defaultOperationalRoleCode) ?? null)
          : null,
        siteIds: [siteId],
        isActive: Boolean(employee.is_active ?? true),
        targetWeeklyMinutes: limits?.target_weekly_minutes ?? null,
        maxWeeklyMinutes: limits?.max_weekly_minutes ?? null,
        prefersMorning: preferences?.prefers_morning ?? false,
        prefersAfternoon: preferences?.prefers_afternoon ?? false,
        prefersEvening: preferences?.prefers_evening ?? false,
        avoidOpening: preferences?.avoid_opening ?? false,
        avoidClosing: preferences?.avoid_closing ?? false,
        recentMorningShifts: historicalSignals.recentMorningShifts,
        recentAfternoonShifts: historicalSignals.recentAfternoonShifts,
        recentEveningShifts: historicalSignals.recentEveningShifts,
        lastWeekMorningShifts: historicalSignals.lastWeekMorningShifts,
        lastWeekAfternoonShifts: historicalSignals.lastWeekAfternoonShifts,
        lastWeekEveningShifts: historicalSignals.lastWeekEveningShifts,
        recentOpeningShifts: historicalSignals.recentOpeningShifts,
        recentClosingShifts: historicalSignals.recentClosingShifts,
        recentWeekendShifts: historicalSignals.recentWeekendShifts,
      };
    }),
    requirements,
    availability,
    existingShifts,
    roleConcurrencyLimits: roleConcurrencyLimitRows.map((row) => ({
      id: row.id,
      siteId: row.site_id,
      roleCode: row.role_code,
      dayOfWeek: row.day_of_week,
      startTime: row.start_time,
      endTime: row.end_time,
      maxConcurrent: row.max_concurrent,
      appliesAcrossSites: row.applies_across_sites,
    })),
  };

  const suggestion = generateWeeklySuggestion(generationInput);

  const { data: runRow, error: runError } = await supabase
    .schema("viso")
    .from("shift_generation_runs")
    .insert({
      site_id: siteId,
      week_start: weekStartIso,
      status: suggestion.shifts.length > 0 ? "completed" : "failed",
      strategy:
        staffingRequirements.length > 0 ? "heuristic_v1" : "historical_v1",
      input_snapshot: {
        requirementsCount: requirements.length,
        employeeCount: employees.length,
        existingShiftCount: existingShifts.length,
        source:
          staffingRequirements.length > 0
            ? "configured_requirements"
            : "historical_shift_patterns",
      },
      warnings: suggestion.warnings,
    })
    .select("id")
    .single();

  if (runError || !runRow) {
    redirect(
      `${returnTo}&error=${encodeURIComponent(runError?.message ?? "No se pudo registrar la corrida de sugerencia.")}`,
    );
  }

  const explanation = {
    score: suggestion.score,
    breakdown: suggestion.breakdown,
    historicalRotationWindowDays: 180,
    historicalSignalsByEmployee: Object.fromEntries(
      [...historicalSignalsByEmployee.entries()].map(
        ([employeeId, signals]) => [employeeId, signals],
      ),
    ),
  };

  const { data: candidateRow, error: candidateError } = await supabase
    .schema("viso")
    .from("shift_generation_candidates")
    .insert({
      run_id: runRow.id,
      rank_order: 1,
      score: suggestion.score,
      coverage_score: suggestion.breakdown.coverage,
      fairness_score: suggestion.breakdown.fairness,
      continuity_score: suggestion.breakdown.continuity,
      preference_score: suggestion.breakdown.preference,
      warnings: suggestion.warnings,
      explanation,
    })
    .select("id")
    .single();

  if (candidateError || !candidateRow) {
    redirect(
      `${returnTo}&error=${encodeURIComponent(candidateError?.message ?? "No se pudo registrar el candidato sugerido.")}`,
    );
  }

  if (suggestion.shifts.length > 0) {
    const candidateItems = suggestion.shifts.map((shift) => ({
      candidate_id: candidateRow.id,
      employee_id: shift.employeeId,
      site_id: shift.siteId,
      shift_date: shift.shiftDate,
      start_time: shift.startTime,
      end_time: shift.endTime,
      shift_kind: shift.shiftKind,
      notes: shift.notes ?? null,
      explanation: {
        requiredRoleCode: shift.requiredRoleCode ?? null,
        ...(shift.explanation ?? {}),
      },
    }));

    const { error: itemsError } = await supabase
      .schema("viso")
      .from("shift_generation_candidate_items")
      .insert(candidateItems);

    if (itemsError) {
      redirect(`${returnTo}&error=${encodeURIComponent(itemsError.message)}`);
    }

    const operationalContextIndex = await loadShiftOperationalContextIndex(
      supabase,
      suggestion.shifts.map((shift) => ({
        employeeId: shift.employeeId,
        siteId: shift.siteId,
        operationalRole: shift.requiredRoleCode,
      })),
    );

    const draftRows = suggestion.shifts.map((shift) => {
      const shiftKind = shift.shiftKind;
      const operationalRole =
        shiftKind === "descanso" ? null : (shift.requiredRoleCode ?? null);
      return withShiftOperationalContext(
        {
          employee_id: shift.employeeId,
          site_id: shift.siteId,
          area_id: shift.areaId ?? null,
          shift_date: shift.shiftDate,
          start_time: shift.startTime,
          end_time: shift.endTime,
          shift_kind: shiftKind,
          operational_role: operationalRole,
          show_end_as_close: false,
          break_minutes: 0,
          status: "scheduled",
          notes: shift.notes ?? "Sugerido por VISO",
          published_at: null,
          published_by: null,
        },
        getShiftOperationalContext(
          operationalContextIndex,
          shift.employeeId,
          shift.siteId,
          operationalRole,
        ),
        shiftKind,
      );
    });

    const { error: insertDraftError } = await supabase
      .from("employee_shifts")
      .insert(draftRows);
    if (insertDraftError) {
      redirect(
        `${returnTo}&error=${encodeURIComponent(insertDraftError.message)}`,
      );
    }
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(
    `${returnTo}&ok=${encodeURIComponent(
      suggestion.shifts.length > 0
        ? "sugerencia_generada_borrador"
        : "sugerencia_sin_resultado",
    )}`,
  );
}

export async function saveCoverageRequirementAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";
  const dayOfWeek = asNumber(formData.get("day_of_week"), -1);
  const startTime = asText(formData.get("start_time"));
  const endTime = asText(formData.get("end_time"));
  const minHeadcount = asNumber(formData.get("min_headcount"), 0);
  const idealHeadcount = asNumber(
    formData.get("ideal_headcount"),
    minHeadcount,
  );
  const requiredRoleCode = asText(formData.get("required_role_code")) || null;

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (
    !siteId ||
    !weekStartIso ||
    dayOfWeek < 0 ||
    dayOfWeek > 6 ||
    !startTime ||
    !endTime
  ) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Completa día, franja y sede para guardar la cobertura.")}`,
    );
  }

  if (endTime <= startTime) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("La hora de fin debe ser posterior a la hora de inicio.")}`,
    );
  }

  if (minHeadcount < 1 || idealHeadcount < minHeadcount) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Define un mínimo válido y un ideal mayor o igual al mínimo.")}`,
    );
  }

  const { error } = await supabase
    .schema("viso")
    .from("site_staffing_requirements")
    .upsert({
      site_id: siteId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      min_headcount: minHeadcount,
      ideal_headcount: idealHeadcount,
      required_role_code: requiredRoleCode,
    });

  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("cobertura_guardada")}`);
}

export async function deleteCoverageRequirementAction(formData: FormData) {
  "use server";
  const id = asText(formData.get("id"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo);
  const supabase = createAdminClient();

  if (!id) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Regla de cobertura inválida.")}`,
    );
  }

  const { error } = await supabase
    .schema("viso")
    .from("site_staffing_requirements")
    .delete()
    .eq("id", id);

  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("cobertura_eliminada")}`);
}

export async function saveAvailabilityAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";
  const employeeId = asText(formData.get("employee_id"));
  const dayOfWeek = asNumber(formData.get("day_of_week"), -1);
  const availableFrom = asText(formData.get("available_from"));
  const availableTo = asText(formData.get("available_to"));
  const availabilityKind = asText(formData.get("availability_kind")) as
    "preferred" | "allowed" | "blocked";

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (
    !siteId ||
    !weekStartIso ||
    !employeeId ||
    dayOfWeek < 0 ||
    dayOfWeek > 6 ||
    !availableFrom ||
    !availableTo
  ) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Completa trabajador, día y horario para guardar la disponibilidad.")}`,
    );
  }

  if (availableTo <= availableFrom) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("La hora final debe ser posterior a la inicial.")}`,
    );
  }

  if (!["preferred", "allowed", "blocked"].includes(availabilityKind)) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Tipo de disponibilidad inválido.")}`,
    );
  }

  const { error } = await supabase
    .schema("viso")
    .from("employee_availability")
    .insert({
      employee_id: employeeId,
      site_id: siteId,
      day_of_week: dayOfWeek,
      available_from: availableFrom,
      available_to: availableTo,
      is_available: availabilityKind !== "blocked",
      availability_kind: availabilityKind,
    });

  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("disponibilidad_guardada")}`);
}

export async function deleteAvailabilityAction(formData: FormData) {
  "use server";
  const id = asText(formData.get("id"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo);
  const supabase = createAdminClient();

  if (!id) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Disponibilidad inválida.")}`,
    );
  }

  const { error } = await supabase
    .schema("viso")
    .from("employee_availability")
    .delete()
    .eq("id", id);

  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("disponibilidad_eliminada")}`);
}

export async function saveWorkerRulesAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";
  const employeeId = asText(formData.get("employee_id"));
  const targetWeeklyMinutes = asNumber(
    formData.get("target_weekly_minutes"),
    2400,
  );
  const maxWeeklyMinutes = asNumber(formData.get("max_weekly_minutes"), 2880);
  const prefersMorning = asText(formData.get("prefers_morning")) === "1";
  const prefersAfternoon = asText(formData.get("prefers_afternoon")) === "1";
  const prefersEvening = asText(formData.get("prefers_evening")) === "1";
  const avoidOpening = asText(formData.get("avoid_opening")) === "1";
  const avoidClosing = asText(formData.get("avoid_closing")) === "1";

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (!siteId || !employeeId) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Selecciona un trabajador para guardar sus reglas.")}`,
    );
  }

  if (targetWeeklyMinutes < 0 || maxWeeklyMinutes < targetWeeklyMinutes) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("El máximo semanal debe ser mayor o igual al objetivo semanal.")}`,
    );
  }

  const { error: limitsError } = await supabase
    .schema("viso")
    .from("employee_planning_limits")
    .upsert({
      employee_id: employeeId,
      site_id: siteId,
      target_weekly_minutes: targetWeeklyMinutes,
      max_weekly_minutes: maxWeeklyMinutes,
    });

  if (limitsError) {
    redirect(`${returnTo}&error=${encodeURIComponent(limitsError.message)}`);
  }

  const { error: preferencesError } = await supabase
    .schema("viso")
    .from("employee_shift_preferences")
    .upsert({
      employee_id: employeeId,
      site_id: siteId,
      prefers_morning: prefersMorning,
      prefers_afternoon: prefersAfternoon,
      prefers_evening: prefersEvening,
      avoid_opening: avoidOpening,
      avoid_closing: avoidClosing,
    });

  if (preferencesError) {
    redirect(
      `${returnTo}&error=${encodeURIComponent(preferencesError.message)}`,
    );
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(
    `${returnTo}&ok=${encodeURIComponent("reglas_trabajador_guardadas")}`,
  );
}


