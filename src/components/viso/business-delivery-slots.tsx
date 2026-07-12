import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

type DeliverySlotRow = {
  id: string;
  fulfillment_type: string;
  iso_weekday: number;
  slot_start: string;
  slot_end: string;
  capacity: number | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
};

const FULFILLMENT_OPTIONS = [
  { value: "delivery", label: "Domicilio" },
  { value: "pickup", label: "Recoger en sede" },
  { value: "on_premise", label: "Consumir en sede" },
] as const;

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" },
] as const;

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asBool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function businessPath(businessId: string) {
  return `/businesses/${businessId}`;
}

function redirectWithError(businessId: string, message: string): never {
  redirect(`${businessPath(businessId)}?error=${encodeURIComponent(message)}`);
}

function normalizeTime(value: string | null | undefined) {
  return String(value ?? "").slice(0, 5);
}

async function saveDeliverySlot(formData: FormData) {
  "use server";

  const businessId = asText(formData.get("business_id"));
  const siteId = asText(formData.get("site_id"));
  const slotId = asText(formData.get("slot_id"));
  const fulfillmentType = asText(formData.get("fulfillment_type"));
  const isoWeekday = Number(asText(formData.get("iso_weekday")));
  const slotStart = asText(formData.get("slot_start"));
  const slotEnd = asText(formData.get("slot_end"));
  const capacityRaw = asText(formData.get("capacity"));
  const capacity = capacityRaw ? Number(capacityRaw) : null;
  const validFrom = asText(formData.get("valid_from")) || null;
  const validUntil = asText(formData.get("valid_until")) || null;
  const returnTo = businessPath(businessId);

  await requireAppAccess({ appId: "viso", returnTo });

  if (!businessId || !siteId) {
    redirectWithError(businessId, "No se encontró la sede del negocio.");
  }

  if (!FULFILLMENT_OPTIONS.some((option) => option.value === fulfillmentType)) {
    redirectWithError(businessId, "Selecciona una modalidad válida.");
  }

  if (!Number.isInteger(isoWeekday) || isoWeekday < 1 || isoWeekday > 7) {
    redirectWithError(businessId, "Selecciona un día válido.");
  }

  if (!/^\d{2}:\d{2}$/.test(slotStart) || !/^\d{2}:\d{2}$/.test(slotEnd)) {
    redirectWithError(businessId, "Define una hora inicial y final válidas.");
  }

  if (slotEnd <= slotStart) {
    redirectWithError(businessId, "La hora final debe ser posterior a la hora inicial.");
  }

  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
    redirectWithError(businessId, "La capacidad debe ser un entero mayor que cero o quedar vacía.");
  }

  if (validFrom && validUntil && validUntil < validFrom) {
    redirectWithError(businessId, "La fecha final de vigencia no puede ser anterior a la inicial.");
  }

  const payload = {
    site_id: siteId,
    fulfillment_type: fulfillmentType,
    iso_weekday: isoWeekday,
    slot_start: slotStart,
    slot_end: slotEnd,
    capacity,
    valid_from: validFrom,
    valid_until: validUntil,
    is_active: asBool(formData.get("is_active")),
  };

  const supabase = createAdminClient();
  const query = slotId
    ? supabase.schema("pass").from("site_delivery_slots").update(payload).eq("id", slotId).eq("site_id", siteId)
    : supabase.schema("pass").from("site_delivery_slots").insert(payload);
  const { error } = await query;

  if (error) {
    redirectWithError(businessId, error.message);
  }

  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=${encodeURIComponent(slotId ? "Franja actualizada." : "Franja agregada.")}`);
}

async function deleteDeliverySlot(formData: FormData) {
  "use server";

  const businessId = asText(formData.get("business_id"));
  const siteId = asText(formData.get("site_id"));
  const slotId = asText(formData.get("slot_id"));
  const returnTo = businessPath(businessId);

  await requireAppAccess({ appId: "viso", returnTo });

  if (!businessId || !siteId || !slotId) {
    redirectWithError(businessId, "La franja seleccionada no es válida.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("pass")
    .from("site_delivery_slots")
    .delete()
    .eq("id", slotId)
    .eq("site_id", siteId);

  if (error) {
    redirectWithError(businessId, error.message);
  }

  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=${encodeURIComponent("Franja eliminada.")}`);
}

function SlotFields({ slot, formId }: { slot: DeliverySlotRow; formId: string }) {
  return (
    <>
      <TableCell>
        <select
          form={formId}
          name="fulfillment_type"
          className="ui-input h-10 min-w-36"
          defaultValue={slot.fulfillment_type}
        >
          {FULFILLMENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <select
          form={formId}
          name="iso_weekday"
          className="ui-input h-10 min-w-32"
          defaultValue={slot.iso_weekday}
        >
          {WEEKDAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <input
          form={formId}
          name="slot_start"
          type="time"
          required
          className="ui-input h-10 min-w-28"
          defaultValue={normalizeTime(slot.slot_start)}
        />
      </TableCell>
      <TableCell>
        <input
          form={formId}
          name="slot_end"
          type="time"
          required
          className="ui-input h-10 min-w-28"
          defaultValue={normalizeTime(slot.slot_end)}
        />
      </TableCell>
      <TableCell>
        <input
          form={formId}
          name="capacity"
          type="number"
          min={1}
          step={1}
          placeholder="Sin límite"
          className="ui-input h-10 w-28"
          defaultValue={slot.capacity ?? ""}
        />
      </TableCell>
      <TableCell>
        <div className="flex min-w-64 gap-2">
          <input
            form={formId}
            name="valid_from"
            type="date"
            aria-label="Vigente desde"
            className="ui-input h-10"
            defaultValue={slot.valid_from ?? ""}
          />
          <input
            form={formId}
            name="valid_until"
            type="date"
            aria-label="Vigente hasta"
            className="ui-input h-10"
            defaultValue={slot.valid_until ?? ""}
          />
        </div>
      </TableCell>
      <TableCell>
        <label className="flex items-center gap-2 text-sm">
          <input form={formId} type="checkbox" name="is_active" defaultChecked={slot.is_active !== false} />
          Activa
        </label>
      </TableCell>
    </>
  );
}

export async function BusinessDeliverySlots({
  businessId,
  siteId,
}: {
  businessId: string;
  siteId: string | null;
}) {
  if (!siteId) {
    return (
      <section className="ui-panel space-y-2">
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">Programación de pedidos</h2>
        <div className="ui-empty">Este negocio todavía no tiene una sede vinculada.</div>
      </section>
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("pass")
    .from("site_delivery_slots")
    .select("id,fulfillment_type,iso_weekday,slot_start,slot_end,capacity,valid_from,valid_until,is_active")
    .eq("site_id", siteId)
    .order("fulfillment_type", { ascending: true })
    .order("iso_weekday", { ascending: true })
    .order("slot_start", { ascending: true });

  const slots = (data ?? []) as DeliverySlotRow[];
  const newSlot: DeliverySlotRow = {
    id: "new",
    fulfillment_type: "delivery",
    iso_weekday: 1,
    slot_start: "08:00",
    slot_end: "09:00",
    capacity: null,
    valid_from: null,
    valid_until: null,
    is_active: true,
  };

  return (
    <section className="ui-panel space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">Programación de pedidos</h2>
        <p className="ui-caption">
          Define las franjas que Vento Pass ofrecerá para domicilio, recogida o consumo en esta sede. La capacidad vacía significa sin límite.
        </p>
      </div>

      {error ? <div className="ui-alert ui-alert--error">{error.message}</div> : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Modalidad</TableHeaderCell>
              <TableHeaderCell>Día</TableHeaderCell>
              <TableHeaderCell>Desde</TableHeaderCell>
              <TableHeaderCell>Hasta</TableHeaderCell>
              <TableHeaderCell>Capacidad</TableHeaderCell>
              <TableHeaderCell>Vigencia</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {slots.map((slot) => {
              const formId = `delivery-slot-${slot.id}`;
              return (
                <TableRow key={slot.id}>
                  <TableCell className="hidden">
                    <form id={formId} action={saveDeliverySlot}>
                      <input type="hidden" name="business_id" value={businessId} />
                      <input type="hidden" name="site_id" value={siteId} />
                      <input type="hidden" name="slot_id" value={slot.id} />
                    </form>
                  </TableCell>
                  <SlotFields slot={slot} formId={formId} />
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <button form={formId} type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                        Guardar
                      </button>
                      <form action={deleteDeliverySlot}>
                        <input type="hidden" name="business_id" value={businessId} />
                        <input type="hidden" name="site_id" value={siteId} />
                        <input type="hidden" name="slot_id" value={slot.id} />
                        <button type="submit" className="ui-btn ui-btn--danger ui-btn--sm">
                          Eliminar
                        </button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

            <TableRow>
              <TableCell className="hidden">
                <form id="new-delivery-slot" action={saveDeliverySlot}>
                  <input type="hidden" name="business_id" value={businessId} />
                  <input type="hidden" name="site_id" value={siteId} />
                </form>
              </TableCell>
              <SlotFields slot={newSlot} formId="new-delivery-slot" />
              <TableCell className="text-right">
                <button form="new-delivery-slot" type="submit" className="ui-btn ui-btn--brand ui-btn--sm">
                  Agregar franja
                </button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {slots.length === 0 ? (
        <div className="ui-caption">Todavía no hay franjas guardadas. Configura la primera en la última fila.</div>
      ) : null}
    </section>
  );
}
