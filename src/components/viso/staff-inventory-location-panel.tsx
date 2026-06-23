"use client";

import { FormEvent, useState, useTransition } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";

type StaffInventoryLocationAssignmentResult =
  | {
      ok: true;
      siteId: string;
      locationId: string | null;
    }
  | {
      ok: false;
      error: string;
    };

type StaffInventoryLocationPanelProps = {
  employeeId: string;
  sites: { siteId: string; siteName: string }[];
  locationsBySite: Record<string, { id: string; label: string }[]>;
  initialAssignments: Record<string, string>;
  saveAssignmentAction: (formData: FormData) => Promise<StaffInventoryLocationAssignmentResult>;
};

export function StaffInventoryLocationPanel({
  employeeId,
  sites,
  locationsBySite,
  initialAssignments,
  saveAssignmentAction,
}: StaffInventoryLocationPanelProps) {
  const [draftAssignments, setDraftAssignments] = useState<Record<string, string>>(initialAssignments);
  const [savedAssignments, setSavedAssignments] = useState<Record<string, string>>(initialAssignments);
  const [pendingSiteId, setPendingSiteId] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const saveLocation = (siteId: string) => {
    if (pendingSiteId) return;

    setPendingSiteId(siteId);
    setMessage(null);

    const formData = new FormData();
    formData.set("employee_id", employeeId);
    formData.set("site_id", siteId);
    formData.set("location_id", draftAssignments[siteId] ?? "");

    startTransition(() => {
      void saveAssignmentAction(formData)
        .then((result) => {
          if (!result.ok) {
            setMessage({ kind: "error", text: result.error });
            return;
          }

          const nextLocationId = result.locationId ?? "";

          setDraftAssignments((current) => ({
            ...current,
            [result.siteId]: nextLocationId,
          }));
          setSavedAssignments((current) => ({
            ...current,
            [result.siteId]: nextLocationId,
          }));
          setMessage({ kind: "success", text: "LOC guardado." });
        })
        .catch(() => {
          setMessage({ kind: "error", text: "No se pudo guardar el LOC." });
        })
        .finally(() => {
          setPendingSiteId("");
        });
    });
  };

  const submitLocation = (event: FormEvent<HTMLFormElement>, siteId: string) => {
    event.preventDefault();
    saveLocation(siteId);
  };

  if (sites.length === 0) {
    return <div className="ui-empty">Primero asigna al menos una sede al trabajador.</div>;
  }

  return (
    <div className="space-y-3">
      {message ? (
        <div className={message.kind === "error" ? "ui-alert ui-alert--error" : "ui-alert ui-alert--success"}>
          {message.kind === "success" ? "Listo: " : ""}
          {message.text}
        </div>
      ) : null}

      <div className="max-h-[520px] overflow-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Sede</TableHeaderCell>
              <TableHeaderCell>LOC destino para retiro</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sites.map((site) => {
              const locations = locationsBySite[site.siteId] ?? [];
              const draftLocationId = draftAssignments[site.siteId] ?? "";
              const savedLocationId = savedAssignments[site.siteId] ?? "";
              const isSaving = pendingSiteId === site.siteId;
              const hasUnsavedChanges = draftLocationId !== savedLocationId;

              return (
                <TableRow key={`inventory-location-${site.siteId}`}>
                  <TableCell>{site.siteName}</TableCell>
                  <TableCell>
                    <form onSubmit={(event) => submitLocation(event, site.siteId)} className="flex flex-wrap items-center gap-2">
                      <select
                        name="location_id"
                        className="ui-input min-w-[260px]"
                        value={draftLocationId}
                        disabled={Boolean(pendingSiteId)}
                        onChange={(event) => {
                          const nextLocationId = event.target.value;
                          setDraftAssignments((current) => ({
                            ...current,
                            [site.siteId]: nextLocationId,
                          }));
                        }}
                      >
                        <option value="">Sin LOC asignado</option>
                        {locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.label}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm" disabled={Boolean(pendingSiteId)}>
                        {isSaving ? "Guardando..." : "Guardar"}
                      </button>
                    </form>
                  </TableCell>
                  <TableCell>
                    {hasUnsavedChanges ? (
                      <span className="ui-chip">Sin guardar</span>
                    ) : savedLocationId ? (
                      <span className="ui-chip ui-chip--success">Configurado</span>
                    ) : (
                      <span className="ui-chip">Pendiente</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
