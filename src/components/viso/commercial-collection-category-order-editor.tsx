"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type CategoryOrderItem = {
  linkId: string;
  categoryId: string;
  name: string;
  description: string | null;
};

type SaveOrderResult = {
  ok: boolean;
  error?: string;
};

type CommercialCollectionCategoryOrderEditorProps = {
  collectionId: string;
  items: CategoryOrderItem[];
  saveOrderAction: (
    collectionId: string,
    orderedLinkIds: string[],
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

export function CommercialCollectionCategoryOrderEditor({
  collectionId,
  items,
  saveOrderAction,
}: CommercialCollectionCategoryOrderEditorProps) {
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
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  function scheduleSave(nextItems: CategoryOrderItem[]) {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    setStatus("Cambios pendientes...");

    saveTimerRef.current = setTimeout(() => {
      setStatus("Guardando...");

      startTransition(() => {
        void saveOrderAction(
          collectionId,
          nextItems.map((item) => item.linkId),
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

  return (
    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
            Orden dentro de esta colección
          </div>
          <div className="text-xs text-[var(--ui-muted)]">
            Solo controla el orden de las categorías en esta colección dentro de Vento Pass.
          </div>
        </div>

        {status ? (
          <div className="rounded-full border border-[var(--ui-border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
            {isPending ? "Guardando..." : status}
          </div>
        ) : null}
      </div>

      {localItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--ui-border)] bg-white px-4 py-5 text-sm text-[var(--ui-muted)]">
          No hay categorías asignadas. Agrégalas en “Secciones asignadas” y luego podrás ordenarlas aquí.
        </div>
      ) : (
        <div className="space-y-2">
          {localItems.map((item, index) => (
            <div
              key={item.linkId}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--ui-text)]">
                  {index + 1}. {item.name}
                </div>
                <div className="text-xs text-[var(--ui-muted)]">
                  {item.description || "Categoría comercial"}
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
      )}
    </div>
  );
}