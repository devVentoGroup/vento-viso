import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

function getSupabaseFunctionsBaseUrl() {
  const baseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  if (!baseUrl) {
    throw new Error("Missing Supabase URL");
  }

  return new URL("/functions/v1/attendance-report", baseUrl);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const [{ data: userData }, { data: sessionData }, accessCheck] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
      supabase.rpc("has_permission", { p_permission_code: "viso.access" }),
    ]);

    const user = userData.user ?? null;
    const accessToken = sessionData.session?.access_token ?? null;

    if (!user || !accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (accessCheck.error || !accessCheck.data) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const upstreamUrl = getSupabaseFunctionsBaseUrl();
    for (const [key, value] of request.nextUrl.searchParams.entries()) {
      upstreamUrl.searchParams.set(key, value);
    }

    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const format = (request.nextUrl.searchParams.get("format") ?? "json").trim().toLowerCase();

    if (!upstreamResponse.ok) {
      const payload = await upstreamResponse.text();
      return new NextResponse(payload, {
        status: upstreamResponse.status,
        headers: {
          "content-type": upstreamResponse.headers.get("content-type") ?? "application/json",
        },
      });
    }

    if (format !== "xlsx") {
      const payload = await upstreamResponse.json();
      return NextResponse.json(payload);
    }

    const payload = (await upstreamResponse.json()) as {
      filename?: string;
      mimeType?: string;
      base64?: string;
    };

    const fileBuffer = Buffer.from(payload.base64 ?? "", "base64");
    const filename = payload.filename ?? "reporte_asistencia.xlsx";
    const mimeType =
      payload.mimeType ??
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "content-type": mimeType,
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[viso attendance-report route]", error);
    return NextResponse.json(
      { error: "No se pudo procesar el reporte de asistencia." },
      { status: 500 },
    );
  }
}
