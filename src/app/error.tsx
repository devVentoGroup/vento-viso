"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("VISO render error:", error.message, error.digest);
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      <div className="max-w-md space-y-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-8 shadow-[var(--ui-shadow-soft)]">
        <h1 className="text-xl font-semibold text-[var(--ui-text)]">
          Algo salió mal
        </h1>
        <p className="text-[var(--ui-muted)]">
          No se pudo cargar el panel. Revisa los logs del servidor en Vercel para
          ver el error exacto.
        </p>
        {error.digest && (
          <p className="rounded-lg bg-[var(--ui-neutral-soft)] px-3 py-2 font-mono text-sm text-[var(--ui-muted)]">
            Digest: <span className="text-[var(--ui-text)]">{error.digest}</span>
          </p>
        )}
        {isDev && error.message && (
          <pre className="max-h-40 overflow-auto rounded-lg bg-[var(--ui-danger-soft)] p-3 text-sm text-[var(--ui-danger)]">
            {error.message}
          </pre>
        )}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-[var(--ui-primary)] px-4 py-2 text-sm font-medium text-[var(--ui-on-primary)] hover:bg-[var(--ui-primary-hover)]"
          >
            Reintentar
          </button>
          <a
            href="/"
            className="rounded-xl border border-[var(--ui-border)] px-4 py-2 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-neutral-soft)]"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
