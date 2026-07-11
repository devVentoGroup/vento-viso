import { NextRequest, NextResponse } from "next/server";

import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

type MenuItemMoveRow = {
  catalog_item_id: string;
  relation_sort_order: number | null;
  catalog_item?: { id: string; name: string; site_id: string; commercial_category_id: string | null; product_id: string | null; price_amount: number; is_active: boolean; metadata?: Record<string, unknown> | null } | { id: string; name: string; site_id: string; commercial_category_id: string | null; product_id: string | null; price_amount: number; is_active: boolean; metadata?: Record<string, unknown> | null }[] | null;
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
      collectionId?: unknown;
      categoryId?: unknown;
      direction?: unknown;
    } | null;

    const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
    const collectionId = typeof body?.collectionId === "string" ? body.collectionId.trim() : "";
    const categoryId = typeof body?.categoryId === "string" ? body.categoryId.trim() : "";
    const direction = typeof body?.direction === "string" ? body.direction.trim() : "";

    if (!itemId || !collectionId || !categoryId || (direction !== "up" && direction !== "down")) {
      return jsonError("Movimiento inválido.");
    }

    const supabase = createAdminClient();
    const { data: current, error: currentError } = await supabase
      .schema("pass")
      .from("catalog_items")
      .select("id,site_id,commercial_category_id")
      .eq("id", itemId)
      .eq("commercial_category_id", categoryId)
      .maybeSingle();

    if (currentError || !current) {
      return jsonError(currentError?.message || "No se encontró el item comercial.", 404);
    }

    const { data: currentRelation, error: currentRelationError } = await supabase
      .schema("pass")
      .from("catalog_item_collections")
      .select("catalog_item_id,commercial_collection_id")
      .eq("catalog_item_id", itemId)
      .eq("commercial_collection_id", collectionId)
      .eq("is_active", true)
      .maybeSingle();

    if (currentRelationError || !currentRelation) {
      return jsonError(currentRelationError?.message || "El item no pertenece a esta colección activa.", 404);
    }

    const { data: groupRaw, error: groupError } = await supabase
      .schema("pass")
      .from("catalog_item_collections")
      .select("catalog_item_id,relation_sort_order:sort_order,catalog_item:catalog_items!inner(id,name,site_id,commercial_category_id,product_id,price_amount,is_active,metadata)")
      .eq("commercial_collection_id", collectionId)
      .eq("is_active", true);

    if (groupError) {
      return jsonError(groupError.message, 500);
    }

    const group = ((groupRaw ?? []) as MenuItemMoveRow[]).map((relation) => ({ ...relation, catalog_item: Array.isArray(relation.catalog_item) ? relation.catalog_item[0] ?? null : relation.catalog_item })).filter((relation) => {
      const item = relation.catalog_item;
      return item && item.site_id === current.site_id && item.commercial_category_id === categoryId && item.is_active === true && Boolean(item.product_id) && item.price_amount > 0 && item.metadata?.source_app === "viso" && item.metadata?.source_module === "menu_comercial";
    }).sort((a, b) => {
      const aOrder = sortNumber(a.relation_sort_order);
      const bOrder = sortNumber(b.relation_sort_order);

      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.catalog_item!.name.localeCompare(b.catalog_item!.name, "es-CO");
    });

    const currentIndex = group.findIndex((item) => item.catalog_item_id === itemId);
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
          .from("catalog_item_collections")
          .update({ sort_order: index * 10 })
          .eq("catalog_item_id", item.catalog_item_id)
          .eq("commercial_collection_id", collectionId)
          .eq("is_active", true),
      ),
    );

    const failed = updates.find((result) => result.error);

    if (failed?.error) {
      return jsonError(failed.error.message, 500);
    }

    return NextResponse.json({
      ok: true,
      collectionId,
      categoryId,
      order: reordered.map((item) => item.catalog_item_id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar el orden.";
    return jsonError(message, 500);
  }
}
