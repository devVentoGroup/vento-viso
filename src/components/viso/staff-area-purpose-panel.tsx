"use client";

import { type FormEvent, useState } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";

type StaffAreaPurpose = "operational" | "remission";

type StaffAreaPurposeSite = {
  siteId: string;
  siteName: string;
};

type StaffAreaPurposeArea = {
  id: string;
  label: string;
};

type StaffAreaPurposeAssignment = {
  operationalAreaId: string;
  remissionAreaId: string;
};

type StaffAreaPurposeActionResult =
  | {
      ok: true;
      siteId: string;
      purpose: StaffAreaPurpose;
      areaId: string | null;
    }
  | {
      ok: false;
      error: string;
    };

type StaffAreaPurposePanelProps = {
  employeeId: string;
  sites: StaffAreaPurposeSite[];
  areasBySite: Record<string, StaffAreaPurposeArea[]>;
  remissionOptionsBySite: Record<string, StaffAreaPurposeArea[]>;
  initialAssignments: Record<string, StaffAreaPurposeAssignment>;
  saveAssignmentAction: (formData: FormData) => Promise<StaffAreaPurposeActionResult>;
};

type PanelMessage = {
  type: "success" | "error";
  text: string;
};

function assignmentValue(
  assignments: Record<string, StaffAreaPurposeAssignment>,
  siteId: string,
  purpose: StaffAreaPurpose,
) {
  const assignment = assignments[siteId];

  if (!assignment) return "";

  return purpose === "operational" ? assignment.operationalAreaId : assignment.remissionAreaId;
}

export function StaffAreaPurposePanel({
  employeeId,
  sites,
  areasBySite,
  remissionOptionsBySite,
  initialAssignments,
  saveAssignmentAction,
}: StaffAreaPurposePanelProps) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState<PanelMessage | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>, siteId: string, purpose: StaffAreaPurpose) {
    event.preventDefault();

    const key = `${siteId}::${purpose}`;
    const formData = new FormData(event.currentTarget);

    setSavingKey(key);
    setMessage(null);

    try {
      const result = await saveAssignmentAction(formData);

      if (result.ok === false) {
        setMessage({ type: "error", text: result.error });
        return;
      }

      const nextAreaId = result.areaId ?? "";

      setAssignments((current) => {
        const currentAssignment = current[siteId] ?? {
          operationalAreaId: "",
          remissionAreaId: "",
        };

        return {
          ...current,
          [siteId]: {
            ...currentAssignment,
            [purpose === "operational" ? "operationalAreaId" : "remissionAreaId"]: nextAreaId,
          },
        };
      });

      setMessage({ type: "success", text: "Asignación guardada." });
    } catch (error) {
      const text = error instanceof Error ? error.message : "No se pudo guardar la asignación.";
      setMessage({ type: "error", text });
    } finally {
      setSavingKey("");
    }
  }

  function setAreaValue(siteId: string, purpose: StaffAreaPurpose, areaId: string) {
    setAssignments((current) => {
      const currentAssignment = current[siteId] ?? {
        operationalAreaId: "",
        remissionAreaId: "",
      };

      return {
        ...current,
        [siteId]: {
          ...currentAssignment,
          [purpose === "operational" ? "operationalAreaId" : "remissionAreaId"]: areaId,
        },
      };
    });
  }

  return (
    <div className="ui-panel space-y-4">
      <div className="ui-h3">Áreas por propósito</div>
      <p className="ui-body-muted">
        Asigna por sede un área operativa y un área para remisiones. Ejemplo: cajera con rol Caja y remisión por Mostrador.
      </p>

      {message ? (
        <div className={`ui-alert ${message.type === "error" ? "ui-alert--error" : "ui-alert--success"}`}>
          {message.type === "success" ? "Listo: " : ""}
          {message.text}
        </div>
      ) : null}

      {sites.length === 0 ? (
        <div className="ui-empty">Primero asigna al menos una sede al trabajador.</div>
      ) : (
        <div className="max-h-[520px] overflow-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Área operativa</TableHeaderCell>
                <TableHeaderCell>Área remisión</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sites.map((site) => {
                const siteAreas = areasBySite[site.siteId] ?? [];
                const remissionOptions = remissionOptionsBySite[site.siteId] ?? siteAreas;
                const operationalKey = `${site.siteId}::operational`;
                const remissionKey = `${site.siteId}::remission`;
                const operationalValue = assignmentValue(assignments, site.siteId, "operational");
                const remissionValue = assignmentValue(assignments, site.siteId, "remission");

                return (
                  <TableRow key={`area-purpose-${site.siteId}`}>
                    <TableCell>{site.siteName}</TableCell>
                    <TableCell>
                      <form
                        onSubmit={(event) => handleSubmit(event, site.siteId, "operational")}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="employee_id" value={employeeId} />
                        <input type="hidden" name="site_id" value={site.siteId} />
                        <input type="hidden" name="purpose" value="operational" />
                        <select
                          name="area_id"
                          className="ui-input min-w-[220px]"
                          value={operationalValue}
                          onChange={(event) => setAreaValue(site.siteId, "operational", event.target.value)}
                          disabled={savingKey === operationalKey}
                        >
                          <option value="">Sin definir</option>
                          {siteAreas.map((area) => (
                            <option key={area.id} value={area.id}>
                              {area.label}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm" disabled={savingKey === operationalKey}>
                          {savingKey === operationalKey ? "Guardando" : "Guardar"}
                        </button>
                      </form>
                    </TableCell>
                    <TableCell>
                      <form
                        onSubmit={(event) => handleSubmit(event, site.siteId, "remission")}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="employee_id" value={employeeId} />
                        <input type="hidden" name="site_id" value={site.siteId} />
                        <input type="hidden" name="purpose" value="remission" />
                        <select
                          name="area_id"
                          className="ui-input min-w-[220px]"
                          value={remissionValue}
                          onChange={(event) => setAreaValue(site.siteId, "remission", event.target.value)}
                          disabled={savingKey === remissionKey}
                        >
                          <option value="">Sin definir</option>
                          {remissionOptions.map((area) => (
                            <option key={area.id} value={area.id}>
                              {area.label}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm" disabled={savingKey === remissionKey}>
                          {savingKey === remissionKey ? "Guardando" : "Guardar"}
                        </button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
