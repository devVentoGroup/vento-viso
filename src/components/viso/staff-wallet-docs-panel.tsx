"use client";

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
  wallet_eligible: boolean;
  wallet_status: string;
};

export type WalletCardRow = {
  id: string;
  status: string;
  serial_number: string | null;
  last_issued_at: string | null;
  last_revoked_at: string | null;
  revocation_reason: string | null;
} | null;

type StaffWalletDocsPanelProps = {
  employeeId: string;
  employeeName: string | null;
  documents: DocRow[];
  eligibility: EligibilityRow | null;
  walletCard: WalletCardRow;
  documentTypeNamesById: Record<string, string>;
};

function formatDate(s: string | null) {
  if (!s) return "-";
  try {
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "short" }).format(new Date(s));
  } catch {
    return s;
  }
}

export function StaffWalletDocsPanel({
  employeeId,
  employeeName,
  documents,
  eligibility,
  walletCard,
  documentTypeNamesById,
}: StaffWalletDocsPanelProps) {
  const missingNames = (eligibility?.missing_required_document_type_ids ?? []).map((id) => documentTypeNamesById[id] ?? id);

  return (
    <div className="ui-panel ui-panel--accent-brand space-y-6">
      <h3 className="ui-h3">Documentos y carnet laboral</h3>

      <div>
        <h4 className="ui-label mb-2">Documentos del trabajador</h4>
        {documents.length === 0 ? (
          <p className="ui-caption">Sin documentos cargados. Los documentos se pueden subir desde ANIMA o desde esta ficha (próximamente).</p>
        ) : (
          <Table className="ui-table--accent">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Tipo / Título</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Expedición</TableHeaderCell>
                <TableHeaderCell>Vencimiento</TableHeaderCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
          </div>
        )}
      </div>

      <div>
        <h4 className="ui-label mb-2">Elegibilidad para carnet en Wallet</h4>
        {eligibility?.wallet_eligible ? (
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
            <span className="ui-chip ui-chip--success">Elegible</span>
            <p className="ui-caption mt-1">Cumple contrato activo y documentos requeridos. Puede agregar el carnet desde ANIMA.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
            <span className="ui-chip">No elegible</span>
            <ul className="mt-2 list-inside list-disc text-sm text-[var(--ui-muted)]">
              {!eligibility?.contract_active && <li>Sin contrato vigente</li>}
              {!eligibility?.documents_complete && missingNames.length > 0 && (
                <li>Faltan documentos requeridos: {missingNames.join(", ")}</li>
              )}
              {eligibility?.contract_active && eligibility?.documents_complete && !eligibility?.wallet_eligible && (
                <li>Empleado inactivo</li>
              )}
            </ul>
          </div>
        )}
      </div>

      <div>
        <h4 className="ui-label mb-2">Carnet laboral</h4>
        {walletCard ? (
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 space-y-2">
            <p>
              Estado: <span className={`ui-chip ${walletCard.status === "issued" ? "ui-chip--success" : walletCard.status === "revoked" ? "ui-chip--danger" : ""}`}>{walletCard.status}</span>
            </p>
            {walletCard.last_issued_at && <p className="ui-caption">Última emisión: {formatDate(walletCard.last_issued_at)}</p>}
            {walletCard.last_revoked_at && <p className="ui-caption">Revocado: {formatDate(walletCard.last_revoked_at)}</p>}
            {walletCard.revocation_reason && <p className="ui-caption">Motivo: {walletCard.revocation_reason}</p>}
            <p className="ui-caption">Emitir y revocar el carnet desde aquí (acciones en desarrollo).</p>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
            <p className="ui-caption">Aún no hay registro de carnet. Cuando el trabajador sea elegible y agregue el carnet desde ANIMA, aquí se mostrará el estado.</p>
          </div>
        )}
      </div>
    </div>
  );
}
