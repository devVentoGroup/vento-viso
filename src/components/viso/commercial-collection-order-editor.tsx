"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type CollectionOrderItem = {
  id: string;
  name: string;
  subtitle: string | null;
  kind: string;
  isActive: boolean;
};

type SaveOrderResult = {
  ok: boolean;
  error?: string;
};

type CommercialCollectionOrderEditorProps = {
  siteId: string;
  items: CollectionOrderItem[];
  saveOrderAction: (
    siteId: string,
    orderedCollectionIds: string[],
  ) => Promise<SaveOrderResult>;
};

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return items;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [moving] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moving);
  return next;
}

function kindLabel(kind: string) {
  switch (kind) {
    case "main":
      return "Menú principal";
    case "seasonal":
      return "Temporada";
    case "special":
      return "Menú especial";
    case "campaign":
      return "Campaña";
    case "event":
      return "Evento";
    default:
      return "Colección";
  }
}

export function CommercialCollectionOrderEditor({
  siteId,
  items,
  saveOrderAction,
}: CommercialCollectionOrderEditorProps) {
  const [localItems, setLocalItems] = useState(items);
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLocalItems(items);
      setStatus("");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [items]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  function scheduleSave(nextItems: CollectionOrderItem[]) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    setStatus("Cambios pendientes...");

    saveTimerRef.current = setTimeout(() => {
      setStatus("Guardando...");

      startTransition(() => {
        void saveOrderAction(
          siteId,
          nextItems.map((item) => item.id),
        ).then((result) => {
          if (!result.ok) {
            setStatus(result.error || "No se pudo guardar el orden.");
            return;
          }

          setStatus("Guardado");
        });
      });
    }, 450);
  }

  function handleMove(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const nextItems = moveItem(localItems, index, targetIndex);

    if (nextItems === localItems) return;

    setLocalItems(nextItems);
    scheduleSave(nextItems);
  }

  if (localItems.length === 0) return null;

  return (
    <section className="rounded-3xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-[var(--ui-text)]">
            Orden de las colecciones en Vento Pass
          </h3>
          <p className="ui-caption mt-1">
            La primera colección activa será la seleccionada al abrir el menú.
          </p>
        </div>

        {status ? (
          <div className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
            {isPending ? "Guardando..." : status}
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        {localItems.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black text-[var(--ui-text)]">
                  {index + 1}. {item.name}
                </span>
                <span className={item.isActive ? "ui-chip ui-chip--success" : "ui-chip"}>
                  {item.isActive ? "Activa" : "Inactiva"}
                </span>
              </div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">
                {item.subtitle || kindLabel(item.kind)}
              </div>
            </div>

            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--sm"
                disabled={index === 0 || isPending}
                onClick={() => handleMove(index, "up")}
                aria-label={`Subir ${item.name}`}
              >
                ↑
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--sm"
                disabled={index === localItems.length - 1 || isPending}
                onClick={() => handleMove(index, "down")}
                aria-label={`Bajar ${item.name}`}
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}