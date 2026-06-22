"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";

export type DocRow = {
  id: string;
  title: string | null;
  status: string;
  issue_date: string | null;
  expiry_date: string | null;
  document_type: { id: string; name: string | null } | null;
};

export type EligibilityRow = {
  employee_id: string;
  contract_active: boolean;
  contract_document_id: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  documents_complete: boolean;
  missing_required_document_type_ids: string[] | null;
};

export type DocumentTypeOption = {
  id: string;
  name: string | null;
  requires_expiry: boolean | null;
  validity_months: number | null;
};

type StaffDocumentsPanelProps = {
  employeeId: string;
  employeeName: string | null;
  documents: DocRow[];
  eligibility: EligibilityRow | null;
  documentTypeNamesById: Record<string, string>;
  documentTypes: DocumentTypeOption[];
  uploadDocumentAction: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
  canUploadDocuments?: boolean;
  canEditDocuments?: boolean;
  updateDocumentAction?: (formData: FormData) => Promise<void>;
};

function formatDate(s: string | null) {
  if (!s) return "-";

  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return `${Number(day)}/${month}/${year.slice(2)}`;
  }

  try {
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "short" }).format(new Date(s));
  } catch {
    return s;
  }
}

const STAFF_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

function sanitizeDocumentFileName(value: string) {
  const raw = value.trim() || "documento.pdf";
  const cleaned = raw
    .replace(/[\/\\]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-()]/g, "_");

  if (!cleaned) return "documento.pdf";
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

function getPdfMime(file: File) {
  const mime = file.type.trim().toLowerCase();
  if (!mime) return "application/pdf";
  if (mime === "application/pdf" || mime === "application/x-pdf") return mime;
  return "";
}

function UploadDocumentForm({
  employeeId,
  documentTypes,
  uploadDocumentAction,
  fileInputRef,
  onCancel,
}: {
  employeeId: string;
  documentTypes: DocumentTypeOption[];
  uploadDocumentAction: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const selectedType = documentTypes.find((dt) => dt.id === selectedTypeId);
  const needsExpiry = selectedType?.requires_expiry === true;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    setUploadError("");

    if (!form.reportValidity()) return;

    const file = fileInputRef.current?.files?.[0] ?? null;

    if (!file) {
      setUploadError("Selecciona un archivo PDF.");
      return;
    }

    const mime = getPdfMime(file);

    if (!mime || !file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Solo se permiten archivos PDF.");
      return;
    }

    if (file.size <= 0) {
      setUploadError("El archivo está vacío.");
      return;
    }

    if (file.size > STAFF_DOCUMENT_MAX_BYTES) {
      setUploadError("El PDF supera el límite permitido de 20 MB.");
      return;
    }

    const formData = new FormData(form);
    formData.set("employee_id", employeeId);
    formData.set("file_name", sanitizeDocumentFileName(file.name));
    formData.set("file_size_bytes", String(file.size));
    formData.set("file_mime", mime);

    setIsUploading(true);

    try {
      const result = await uploadDocumentAction(formData);

      if (!result.ok) {
        setUploadError(result.error || "No se pudo subir el documento.");
        return;
      }

      form.reset();
      router.refresh();
      onCancel();
    } catch (error) {
      console.error("[VISO] error al subir documento de trabajador:", error);
      setUploadError("No se pudo subir el documento. Revisa la conexión e intenta de nuevo.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="employee_id" value={employeeId} />

      {uploadError ? <div className="ui-alert ui-alert--error">{uploadError}</div> : null}

      <div>
        <label htmlFor="doc-type" className="ui-label block mb-1">
          Tipo de documento
        </label>
        <select
          id="doc-type"
          name="document_type_id"
          className="ui-input w-full"
          value={selectedTypeId}
          onChange={(e) => setSelectedTypeId(e.target.value)}
          disabled={isUploading}
          required
        >
          <option value="">Selecciona un tipo</option>
          {documentTypes.map((dt) => (
            <option key={dt.id} value={dt.id}>
              {dt.name ?? dt.id}
            </option>
          ))}
        </select>
      </div>

      {needsExpiry && (
        <>
          <div>
            <label htmlFor="issue_date" className="ui-label block mb-1">
              Fecha de expedición
            </label>
            <input
              id="issue_date"
              type="date"
              name="issue_date"
              className="ui-input w-full"
              disabled={isUploading}
              required={needsExpiry}
            />
          </div>
          <div>
            <label htmlFor="expiry_date" className="ui-label block mb-1">
              Fecha de vencimiento
            </label>
            <input
              id="expiry_date"
              type="date"
              name="expiry_date"
              className="ui-input w-full"
              disabled={isUploading}
              required={needsExpiry}
            />
          </div>
        </>
      )}

      <div>
        <label htmlFor="file" className="ui-label block mb-1">
          Archivo PDF
        </label>
        <input
          ref={fileInputRef}
          id="file"
          type="file"
          name="file"
          accept=".pdf,application/pdf"
          className="ui-input w-full"
          disabled={isUploading}
          required
        />
        <p className="ui-caption mt-1">Máximo 20 MB.</p>
      </div>

      <div className="flex gap-2">
        <button type="submit" className="ui-btn ui-btn--brand" disabled={isUploading}>
          {isUploading ? "Subiendo..." : "Subir"}
        </button>
        <button type="button" onClick={onCancel} className="ui-btn ui-btn--ghost" disabled={isUploading}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function toDateInputValue(s: string | null) {
  if (!s) return "";

  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  }

  try {
    const d = new Date(s);
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export function StaffDocumentsPanel({
  employeeId,
  documents,
  eligibility,
  documentTypeNamesById,
  documentTypes,
  uploadDocumentAction,
  canUploadDocuments = false,
  canEditDocuments = false,
  updateDocumentAction,
}: StaffDocumentsPanelProps) {
  const missingNames = (eligibility?.missing_required_document_type_ids ?? []).map(
    (id) => documentTypeNamesById[id] ?? "Documento requerido sin nombre",
  );
  const [showUpload, setShowUpload] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentsResetKey = documents
    .map((doc) => `${doc.id}:${doc.status}:${doc.issue_date ?? ""}:${doc.expiry_date ?? ""}`)
    .join("|");
  const editingDoc = editingDocId ? documents.find((d) => d.id === editingDocId) : null;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShowUpload(false);
      setEditingDocId(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [documentsResetKey]);

  return (
    <div className="ui-panel ui-panel--accent-brand space-y-6">
      <h3 className="ui-h3">Documentos y carnet laboral</h3>

      <div>
        <h4 className="ui-label mb-2">Documentos del trabajador</h4>
        <div className="mb-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
          <p className="ui-caption mb-3">Sube documentos desde aquí o desde ANIMA. Para contrato laboral elige tipo &quot;Contrato laboral&quot; e indica fechas de vigencia.</p>
          {!canUploadDocuments ? (
            <p className="ui-caption">No tienes permiso para subir documentos de trabajadores.</p>
          ) : !showUpload ? (
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="ui-btn ui-btn--brand inline-flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Subir documento
            </button>
          ) : (
            <UploadDocumentForm
              employeeId={employeeId}
              documentTypes={documentTypes}
              uploadDocumentAction={uploadDocumentAction}
              fileInputRef={fileInputRef}
              onCancel={() => setShowUpload(false)}
            />
          )}
        </div>
        {documents.length === 0 ? (
          <p className="ui-caption">Sin documentos cargados.</p>
        ) : (
          <>
            <Table className="ui-table--accent">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Tipo / Título</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>Expedición</TableHeaderCell>
                  <TableHeaderCell>Vencimiento</TableHeaderCell>
                  {canEditDocuments && updateDocumentAction && <TableHeaderCell>Acciones</TableHeaderCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {documents.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.document_type?.name ?? d.title ?? d.id}</TableCell>
                    <TableCell>
                      <span className={`ui-chip ${d.status === "approved" ? "ui-chip--success" : d.status === "rejected" ? "ui-chip--danger" : ""}`}>
                        {d.status === "approved" ? "Aprobado" : d.status === "rejected" ? "Rechazado" : "Pendiente"}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(d.issue_date)}</TableCell>
                    <TableCell>{formatDate(d.expiry_date)}</TableCell>
                    {canEditDocuments && updateDocumentAction && (
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingDocId(d.id)}
                            className="ui-btn ui-btn--ghost text-sm"
                          >
                            Editar fechas
                          </button>

                          <form
                            action={updateDocumentAction}
                            method="post"
                            onSubmit={(event) => {
                              const confirmed = window.confirm(
                                "¿Eliminar este documento? Esta acción borrará el registro y el archivo PDF."
                              );

                              if (!confirmed) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="document_action" value="delete" />
                            <input type="hidden" name="document_id" value={d.id} />
                            <input type="hidden" name="employee_id" value={employeeId} />

                            <button type="submit" className="ui-btn ui-btn--danger text-sm">
                              Eliminar
                            </button>
                          </form>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {canEditDocuments && updateDocumentAction && editingDoc && (
              <div className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                <h4 className="ui-label mb-3">Editar documento: {editingDoc.document_type?.name ?? editingDoc.title ?? editingDoc.id}</h4>
                <form action={updateDocumentAction} method="post" className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="document_id" value={editingDoc.id} />
                  <input type="hidden" name="employee_id" value={employeeId} />
                  <div>
                    <label htmlFor="edit-issue_date" className="ui-label block mb-1">
                      Fecha de expedición
                    </label>
                    <input
                      id="edit-issue_date"
                      type="date"
                      name="issue_date"
                      className="ui-input w-full"
                      defaultValue={toDateInputValue(editingDoc.issue_date)}
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-expiry_date" className="ui-label block mb-1">
                      Fecha de vencimiento
                    </label>
                    <input
                      id="edit-expiry_date"
                      type="date"
                      name="expiry_date"
                      className="ui-input w-full"
                      defaultValue={toDateInputValue(editingDoc.expiry_date)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="edit-title" className="ui-label block mb-1">
                      Título (opcional)
                    </label>
                    <input
                      id="edit-title"
                      type="text"
                      name="title"
                      className="ui-input w-full"
                      defaultValue={editingDoc.title ?? ""}
                      placeholder="Ej. Contrato laboral"
                    />
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <button type="submit" className="ui-btn ui-btn--brand">
                      Guardar cambios
                    </button>
                    <button type="button" onClick={() => setEditingDocId(null)} className="ui-btn ui-btn--ghost">
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <h4 className="ui-label mb-2">Contrato activo</h4>
        {eligibility?.contract_active ? (
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
            <span className="ui-chip ui-chip--success">Vigente</span>
            <p className="mt-2 text-sm">
              Desde {formatDate(eligibility.contract_start_date)} hasta {formatDate(eligibility.contract_end_date)}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
            <span className="ui-chip">Sin contrato vigente</span>
            <p className="ui-caption mt-1">Se requiere un documento de tipo Contrato laboral con vigencia que incluya la fecha actual.</p>
            {documents.some(
              (d) =>
                d.status === "approved" &&
                d.document_type?.name?.toLowerCase().includes("contrato laboral")
            ) && (
                <p className="mt-2 text-sm text-[var(--ui-muted)]">
                  Tienes un contrato aprobado: para que figure como vigente, la <strong>fecha de expedición</strong> debe ser hoy o una fecha pasada, y la de vencimiento hoy o futura. Revisa las fechas del documento en la lista de arriba.
                </p>
              )}
          </div>
        )}
      </div>

      <div>
        <h4 className="ui-label mb-2">Estado para carnet laboral</h4>
        {eligibility?.contract_active && eligibility?.documents_complete ? (
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
            <span className="ui-chip ui-chip--success">Listo</span>
            <p className="ui-caption mt-1">Cumple contrato activo y documentos requeridos. El trabajador puede ver su carnet dentro de ANIMA.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
            <span className="ui-chip">Pendiente</span>
            <ul className="mt-2 list-inside list-disc text-sm text-[var(--ui-muted)] space-y-1">
              {!eligibility?.contract_active && <li>Sin contrato vigente</li>}
              {!eligibility?.documents_complete && missingNames.length > 0 && (
                <li>Faltan documentos requeridos: {missingNames.join(", ")}</li>
              )}
              {!eligibility?.documents_complete && missingNames.length === 0 && <li>Faltan documentos requeridos por configurar o cargar.</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
