"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("VISO global error:", error.message, error.digest);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", background: "#f5f5f5" }}>
        <div style={{ maxWidth: "28rem", margin: "0 auto", background: "#fff", padding: "2rem", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Error en VISO</h1>
          <p style={{ color: "#666", marginBottom: "1rem" }}>
            Falló la carga de la aplicación. Suele deberse a variables de entorno faltantes en Vercel (Supabase).
          </p>
          {error.digest && (
            <p style={{ fontSize: "0.875rem", color: "#888", fontFamily: "monospace" }}>
              Digest: {error.digest}
            </p>
          )}
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{ padding: "0.5rem 1rem", background: "#1f2937", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}
            >
              Reintentar
            </button>
            <Link
              href="/"
              style={{ padding: "0.5rem 1rem", border: "1px solid #ddd", borderRadius: "8px", color: "#333", textDecoration: "none" }}
            >
              Ir al inicio
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
