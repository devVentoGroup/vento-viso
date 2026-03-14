"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";

export type DocumentTypeRow = {
  id: string;
  name: string | null;
  system_key: string | null;
  scope?: string | null;
};

export type RequiredRuleRow = {
  id: string;
  site_id: string | null;
  role: string | null;
  document_type_id: string;
  is_required: boolean;
  active: boolean;
  display_order: number;
  document_type?: { id: string; name: string | null } | null;
};

type RequiredDocumentRulesPanelProps = {
  businessId: string;
  siteId: string | null;
  siteName: string | null;
  documentTypes: DocumentTypeRow[];
  rules: RequiredRuleRow[];
  addAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

export function RequiredDocumentRulesPanel({
  businessId,
  siteId,
  siteName,
  documentTypes,
  rules,
  addAction,
  deleteAction,
}: RequiredDocumentRulesPanelProps) {
  const router = useRouter();
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const contractType = documentTypes.find((t) => t.system_key === "employment_contract");
  const rulesForThisSite = rules.filter((r) => r.site_id === siteId || (siteId && r.site_id === null));
  const employeeScopedTypes = documentTypes.filter((t) => t.scope === "employee");
  const typesForSelect = employeeScopedTypes.length > 0 ? employeeScopedTypes : documentTypes;

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!siteId || !selectedTypeId) return;
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    formData.set("business_id", businessId);
    formData.set("site_id", siteId);
    formData.set("document_type_id", selectedTypeId);
    if (roleFilter.trim()) formData.set("role", roleFilter.trim());
    await addAction(formData);
    setIsSubmitting(false);
    router.refresh();
  }

  async function handleDelete(ruleId: string) {
    setIsSubmitting(true);
    const formData = new FormData();
    formData.set("business_id", businessId);
    if (!businessId && siteId) formData.set("site_id", siteId);
    formData.set("id", ruleId);
    await deleteAction(formData);
    setIsSubmitting(false);
    router.refresh();
  }

  if (!siteId) {
    return (
      <div className="ui-panel ui-panel--accent-brand">
        <h3 className="ui-h3">Documentos requeridos y carnet laboral</h3>
        <p className="ui-caption mt-1">Asocia una sede al negocio para configurar documentos requeridos para el carnet.</p>
      </div>
    );
  }

  return (
    <div className="ui-panel ui-panel--accent-brand space-y-4">
      <h3 className="ui-h3">Documentos requeridos y carnet laboral</h3>
      <p className="ui-caption">
        Para que un trabajador sea elegible para el carnet en Wallet debe tener contrato activo y todos los documentos marcados como requeridos para su sede/rol.
      </p>

      {contractType && (
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
          <span className="ui-label">Tipo de documento que cuenta como contrato</span>
          <p className="font-medium">{contractType.name}</p>
          <p className="ui-caption">El contrato debe tener vigencia activa (fecha actual entre inicio y fin) para que el trabajador sea elegible.</p>
        </div>
      )}

      <div>
        <h4 className="ui-label mb-2">Reglas para esta sede: {siteName ?? siteId}</h4>
        {rulesForThisSite.length === 0 ? (
          <p className="ui-caption">Sin reglas específicas. Añade documentos requeridos para esta sede (o deja rol vacío para aplicar a todos los roles).</p>
        ) : (
          <Table className="ui-table--accent">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Tipo documento</TableHeaderCell>
                <TableHeaderCell>Rol</TableHeaderCell>
                <TableHeaderCell>Requerido</TableHeaderCell>
                <TableHeaderCell>Activo</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rulesForThisSite.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.document_type?.name ?? r.document_type_id}</TableCell>
                  <TableCell>{r.role ?? "Todos"}</TableCell>
                  <TableCell>{r.is_required ? "Sí" : "No"}</TableCell>
                  <TableCell>{r.active ? "Sí" : "No"}</TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                      onClick={() => handleDelete(r.id)}
                      disabled={isSubmitting}
                    >
                      Quitar
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="ui-caption block">Tipo de documento</span>
            <select
              className="ui-input min-w-[200px]"
              value={selectedTypeId}
              onChange={(e) => setSelectedTypeId(e.target.value)}
              required
            >
              <option value="">Seleccionar</option>
              {typesForSelect.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ?? t.id}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="ui-caption block">Rol (opcional)</span>
            <input
              type="text"
              className="ui-input min-w-[120px]"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              placeholder="ej. gerente"
              name="role"
            />
          </label>
          <button type="submit" className="ui-btn ui-btn--brand" disabled={isSubmitting || !selectedTypeId}>
            {isSubmitting ? "Guardando…" : "Añadir requerido"}
          </button>
        </form>
      </div>
    </div>
  );
}
