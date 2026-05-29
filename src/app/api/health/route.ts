import { NextResponse } from "next/server";

/**
 * GET /api/health — Comprueba que las variables de entorno necesarias existan.
 * No revela valores, solo si faltan. Útil para diagnosticar 500 en producción.
 */
export async function GET() {
  const hasUrl =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL || !!process.env.SUPABASE_URL;
  const hasAnon =
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    !!process.env.SUPABASE_ANON_KEY;
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!hasUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL o SUPABASE_URL");
  if (!hasAnon)
    missing.push(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY o SUPABASE_ANON_KEY o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  if (!hasServiceRole) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  const ok = hasUrl && hasAnon && hasServiceRole;

  return NextResponse.json(
    {
      ok,
      message: ok
        ? "Env vars presentes"
        : "Faltan variables de entorno en Vercel",
      missing,
    },
    { status: ok ? 200 : 503 }
  );
}
