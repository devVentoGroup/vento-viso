import { NextRequest, NextResponse } from "next/server";

import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

type MenuItemMoveRow = {
  id: string;
  name: string;
  sort_order: number | null;
};

function sortNumber(value: number | string | null | undefined, fallback = Number.MAX_SAFE_INTEGER) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    await requireAppAccess({ appId: "viso", returnTo: "/menu" });

    const body = await request.json().catch(() => null) as {
      itemId?: unknown;
      direction?: unknown;
    } | null;

    const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
    const direction = typeof body?.direction === "string" ? body.direction.trim() : "";

    if (!itemId || (direction !== "up" && direction !== "down")) {
      return jsonError("Movimiento inválido.");
    }

    const supabase = createAdminClient();
    const { data: current, error: currentError } = await supabase
      .schema("pass")
      .from("catalog_items")
      .select("id,site_id,commercial_collection_id,commercial_category_id")
      .eq("id", itemId)
      .maybeSingle();

    if (currentError || !current) {
      return jsonError(currentError?.message || "No se encontró el item comercial.", 404);
    }

    if (!current.commercial_category_id) {
      return jsonError("El item no tiene categoría comercial.");
    }

    let groupQuery = supabase
      .schema("pass")
      .from("catalog_items")
      .select("id,name,sort_order")
      .eq("site_id", current.site_id)
      .eq("commercial_category_id", current.commercial_category_id)
      .not("product_id", "is", null)
      .gt("price_amount", 0)
      .eq("metadata->>source_app", "viso")
      .eq("metadata->>source_module", "menu_comercial")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    groupQuery = current.commercial_collection_id
      ? groupQuery.eq("commercial_collection_id", current.commercial_collection_id)
      : groupQuery.is("commercial_collection_id", null);

    const { data: groupRaw, error: groupError } = await groupQuery;

    if (groupError) {
      return jsonError(groupError.message, 500);
    }

    const group = ((groupRaw ?? []) as MenuItemMoveRow[]).sort((a, b) => {
      const aOrder = sortNumber(a.sort_order);
      const bOrder = sortNumber(b.sort_order);

      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name, "es-CO");
    });

    const currentIndex = group.findIndex((item) => item.id === itemId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= group.length) {
      return NextResponse.json({ ok: true, message: "Orden sin cambios." });
    }

    const reordered = [...group];
    const moving = reordered[currentIndex];
    reordered[currentIndex] = reordered[targetIndex];
    reordered[targetIndex] = moving;

    const updates = await Promise.all(
      reordered.map((item, index) =>
        supabase
          .schema("pass")
          .from("catalog_items")
          .update({ sort_order: index * 10 })
          .eq("id", item.id),
      ),
    );

    const failed = updates.find((result) => result.error);

    if (failed?.error) {
      return jsonError(failed.error.message, 500);
    }

    return NextResponse.json({
      ok: true,
      order: reordered.map((item) => item.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar el orden.";
    return jsonError(message, 500);
  }
}
