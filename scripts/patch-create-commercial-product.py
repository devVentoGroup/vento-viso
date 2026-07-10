from pathlib import Path

p = Path('src/app/menu/new/page.tsx')
s = p.read_text(encoding='utf-8-sig')

def once(old, new):
    global s
    if old not in s:
        raise SystemExit('missing block: ' + old[:100])
    s = s.replace(old, new, 1)

once('''  const commercialCollectionId = asText(formData.get("commercial_collection_id"));\n  const commercialCategoryId = asText(formData.get("commercial_category_id"));\n\n  if (!name || !siteId || !productId || !commercialCollectionId || !commercialCategoryId) {''', '''  const requestedCollectionIds = Array.from(new Set(\n    formData.getAll("commercial_collection_ids").map((value) => asText(value)).filter(Boolean),\n  ));\n  const fallbackCollectionId = asText(formData.get("commercial_collection_id"));\n  const collectionIds = requestedCollectionIds.length > 0\n    ? requestedCollectionIds\n    : fallbackCollectionId\n      ? [fallbackCollectionId]\n      : [];\n  const commercialCollectionId = collectionIds[0] ?? "";\n  const commercialCategoryId = asText(formData.get("commercial_category_id"));\n\n  if (!name || !siteId || !productId || collectionIds.length === 0 || !commercialCategoryId) {''')

needle = '''  if (!createdItem?.id) {\n    redirect("/menu/new?error=" + encodeURIComponent("Item creado sin identificador."));\n  }\n\n  const { error: presentationError } = await supabase'''
replacement = '''  if (!createdItem?.id) {\n    redirect("/menu/new?error=" + encodeURIComponent("Item creado sin identificador."));\n  }\n\n  const collectionRows = collectionIds.map((collectionId, index) => ({\n    catalog_item_id: createdItem.id,\n    commercial_collection_id: collectionId,\n    sort_order: sortOrder,\n    is_active: true,\n    is_primary: index === 0,\n    metadata: { configured_from: "viso_product_form" },\n  }));\n\n  const { error: collectionsError } = await supabase\n    .schema("pass")\n    .from("catalog_item_collections")\n    .upsert(collectionRows, { onConflict: "catalog_item_id,commercial_collection_id" });\n\n  if (collectionsError) {\n    redirect("/menu/new?error=" + encodeURIComponent(collectionsError.message));\n  }\n\n  const { error: presentationError } = await supabase'''
once(needle, replacement)
once('''  redirect(`/menu/${createdItem.id}?ok=${encodeURIComponent("Producto creado. Ahora configura sus personalizaciones.")}`);''', '''  redirect(`/menu/${createdItem.id}?ok=${encodeURIComponent("Producto creado. Ahora puedes configurar sus opciones.")}`);''')

p.write_text(s, encoding='utf-8')
