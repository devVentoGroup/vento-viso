"use client";

import { useState } from "react";
import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";

type MenuItemRow = {
  id: string;
  code: string;
  name: string;
  price_amount: number;
  is_active: boolean;
  is_featured: boolean;
  metadata?: Record<string, unknown> | null;
};

type MenuCategoryGroup = {
  categoryId: string;
  label: string;
  sortOrder: number;
  rows: MenuItemRow[];
};

type MenuCollectionGroup = {
  collectionId: string;
  label: string;
  subtitle: string;
  sortOrder: number;
  categories: MenuCategoryGroup[];
};

type MenuSiteGroup = {
  siteId: string;
  siteLabel: string;
  collections: MenuCollectionGroup[];
};

type CommercialMenuOrganizerProps = {
  initialMenu: MenuSiteGroup[];
};

function formatCop(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function readNumericMeta(metadata: Record<string, unknown> | null | undefined, key: string) {
  const raw = metadata?.[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function swapRows(rows: MenuItemRow[], itemId: string, direction: "up" | "down") {
  const currentIndex = rows.findIndex((row) => row.id === itemId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= rows.length) {
    return rows;
  }

  const nextRows = [...rows];
  const moving = nextRows[currentIndex];
  nextRows[currentIndex] = nextRows[targetIndex];
  nextRows[targetIndex] = moving;
  return nextRows;
}

export function CommercialMenuOrganizer({ initialMenu }: CommercialMenuOrganizerProps) {
  const [menu, setMenu] = useState(initialMenu);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function moveItem(itemId: string, direction: "up" | "down") {
    if (pendingItemId) return;

    const previousMenu = menu;
    setError("");
    setPendingItemId(itemId);
    setMenu((current) =>
      current.map((site) => ({
        ...site,
        collections: site.collections.map((collection) => ({
          ...collection,
          categories: collection.categories.map((category) => ({
            ...category,
            rows: category.rows.some((row) => row.id === itemId)
              ? swapRows(category.rows, itemId, direction)
              : category.rows,
          })),
        })),
      })),
    );

    try {
      const response = await fetch("/api/viso/menu/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, direction }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || "No se pudo guardar el orden.");
      }
    } catch (err) {
      setMenu(previousMenu);
      setError(err instanceof Error ? err.message : "No se pudo guardar el orden.");
    } finally {
      setPendingItemId(null);
    }
  }

  if (menu.length === 0) {
    return <div className="ui-empty">No hay items comerciales configurados.</div>;
  }

  return (
    <div className="space-y-6">
      {error ? <div className="ui-alert ui-alert--error">{error}</div> : null}

      {menu.map((siteGroup) => (
        <section key={siteGroup.siteId} className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ui-text)]">
              {siteGroup.siteLabel}
            </h2>
            <p className="ui-caption">
              Organización comercial por colección, categoría y producto.
            </p>
          </div>

          {siteGroup.collections.map((collectionGroup) => (
            <div
              key={collectionGroup.collectionId}
              className="rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4"
            >
              <div className="mb-4">
                <h3 className="text-base font-semibold text-[var(--ui-text)]">
                  {collectionGroup.label}
                </h3>
                {collectionGroup.subtitle ? (
                  <p className="ui-caption">{collectionGroup.subtitle}</p>
                ) : null}
              </div>

              <div className="space-y-6">
                {collectionGroup.categories.map((categoryGroup) => (
                  <div
                    key={categoryGroup.categoryId}
                    className="rounded-2xl border border-[var(--ui-border)] bg-white p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ui-muted)]">
                          {categoryGroup.label}
                        </h4>
                        <p className="ui-caption">
                          {categoryGroup.rows.length} {categoryGroup.rows.length === 1 ? "producto" : "productos"}
                        </p>
                      </div>
                    </div>

                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>Orden</TableHeaderCell>
                          <TableHeaderCell>Item</TableHeaderCell>
                          <TableHeaderCell>Precio</TableHeaderCell>
                          <TableHeaderCell>Costo receta</TableHeaderCell>
                          <TableHeaderCell>Margen</TableHeaderCell>
                          <TableHeaderCell>Estado</TableHeaderCell>
                          <TableHeaderCell></TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {categoryGroup.rows.map((row, index) => {
                          const recipeCost = readNumericMeta(row.metadata, "recipe_cost_amount");
                          const marginAmount = readNumericMeta(row.metadata, "margin_amount");
                          const marginPct = readNumericMeta(row.metadata, "margin_pct");
                          const isPending = pendingItemId === row.id;

                          return (
                            <TableRow key={row.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-[var(--ui-text)]">
                                    {index + 1}
                                  </span>

                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      className="ui-btn ui-btn--ghost ui-btn--sm"
                                      disabled={index === 0 || Boolean(pendingItemId)}
                                      onClick={() => void moveItem(row.id, "up")}
                                    >
                                      {isPending ? "Guardando..." : "Subir"}
                                    </button>

                                    <button
                                      type="button"
                                      className="ui-btn ui-btn--ghost ui-btn--sm"
                                      disabled={index === categoryGroup.rows.length - 1 || Boolean(pendingItemId)}
                                      onClick={() => void moveItem(row.id, "down")}
                                    >
                                      {isPending ? "Guardando..." : "Bajar"}
                                    </button>
                                  </div>
                                </div>
                              </TableCell>

                              <TableCell>
                                <div className="font-semibold">{row.name}</div>
                                <div className="ui-caption">{row.code}</div>
                                {row.is_featured ? <div className="ui-caption">Destacado</div> : null}
                              </TableCell>

                              <TableCell>{formatCop(row.price_amount)}</TableCell>
                              <TableCell>{recipeCost == null ? "-" : formatCop(recipeCost)}</TableCell>

                              <TableCell>
                                {marginAmount == null ? "-" : (
                                  <div>
                                    <div>{formatCop(marginAmount)}</div>
                                    {marginPct == null ? null : (
                                      <div className="ui-caption">{marginPct.toFixed(2)}%</div>
                                    )}
                                  </div>
                                )}
                              </TableCell>

                              <TableCell>
                                <span className={`ui-chip ${row.is_active ? "ui-chip--success" : ""}`}>
                                  {row.is_active ? "Activo" : "Inactivo"}
                                </span>
                              </TableCell>

                              <TableCell className="text-right">
                                <Link href={`/menu/${row.id}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                                  Editar
                                </Link>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
