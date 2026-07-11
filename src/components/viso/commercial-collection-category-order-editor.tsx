"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";

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
  const [isMainMenu, setIsMainMenu] = useState(false);
  const [siteId, setSiteId] = useState("");
  const [isResolved, setIsResolved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalItems(items);
    setStatus("");
  }, [items]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const formId = `collection-${collectionId}`;
    const collectionForm = document.getElementById(formId);
    const kindSelect = Array.from(
      document.querySelectorAll<HTMLSelectElement>('select[name="kind"][form]'),
    ).find((select) => select.getAttribute("form") === formId);
    const siteInput = collectionForm?.querySelector<HTMLInputElement>('input[name="site_id"]');
    const manualSections = root.previousElementSibling;

    const syncView = () => {
      const nextIsMainMenu = kindSelect?.value === "main";
      setIsMainMenu(nextIsMainMenu);
      setSiteId(siteInput?.value ?? "");
      setIsResolved(true);

      if (manualSections instanceof HTMLElement) {
        manualSections.hidden = nextIsMainMenu;
      }
    };

    syncView();
    kindSelect?.addEventListener("change", syncView);

    return () => {
      kindSelect?.removeEventListener("change", syncView);
      if (manualSections instanceof HTMLElement) {
        manualSections.hidden = false;
      }
    };
  }, [collectionId]);

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

  if (isMainMenu) {
    const categoriesPath = siteId
      ? `/commercial-categories?site=${encodeURIComponent(siteId)}`
      : "/commercial-categories";

    return (
      <div
        ref={rootRef}
        className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-black text-[var(--ui-text)]">
              Secciones automáticas
            </div>
            <p className="ui-caption mt-1">
              El menú principal incluye automáticamente todas las secciones activas de esta sede.
            </p>
          </div>

          <span className="ui-chip ui-chip--success">
            {localItems.length} activas
          </span>
        </div>

        <div className="mt-3 text-xs text-[var(--ui-muted)]">
          {localItems.length > 0
            ? localItems.map((item) => item.name).join(" · ")
            : "No hay secciones comerciales activas en esta sede."}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="ui-caption">
            Para agregar, quitar o reordenar secciones, administra las categorías comerciales de la sede.
          </p>
          <Link href={categoriesPath} className="ui-btn ui-btn--ghost ui-btn--sm">
            Administrar categorías
          </Link>
        </div>
      </div>
    );
  }

  if (!isResolved || localItems.length === 0) {
    return <div ref={rootRef} className="hidden" aria-hidden="true" />;
  }

  return (
    <div
      ref={rootRef}
      className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
            Orden en el menú comercial
          </div>
          <div className="text-xs text-[var(--ui-muted)]">
            Este orden controla cómo se organizan las secciones en Pass.
          </div>
        </div>

        {status ? (
          <div className="rounded-full border border-[var(--ui-border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
            {isPending ? "Guardando..." : status}
          </div>
        ) : null}
      </div>

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
                {item.description || "Sección comercial"}
              </div>
            </div>

            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--sm"
                disabled={index === 0}
                onClick={() => handleMove(index, "up")}
              >
                ↑
              </button>

              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--sm"
                disabled={index === localItems.length - 1}
                onClick={() => handleMove(index, "down")}
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
