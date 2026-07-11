from pathlib import Path

FORM = Path('src/components/viso/menu-item-form.tsx')
PAGE = Path('src/app/menu/new/page.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing block: {label}')
    return text.replace(old, new, 1)


# Enrich the operational product data used to prefill the commercial form.
p = PAGE.read_text(encoding='utf-8-sig')
if 'description: string | null;' not in p.split('type CommercialCategoryRow')[0]:
    p = replace_once(
        p,
        '  sku: string | null;\n  base_price: number | string | null;',
        '  sku: string | null;\n  description: string | null;\n  base_price: number | string | null;',
        'sell option description type',
    )
p = p.replace(
    '.select("site_id,product_id,name,sku,base_price,recipe_cost_amount")',
    '.select("site_id,product_id,name,sku,description,base_price,recipe_cost_amount")',
)
if 'description: row.description ?? null,' not in p:
    p = replace_once(
        p,
        '        sku: row.sku ?? null,\n        site_ids: new Set<string>(),',
        '        sku: row.sku ?? null,\n        description: row.description ?? null,\n        site_ids: new Set<string>(),',
        'product map description',
    )
    p = replace_once(
        p,
        '      sku: item.sku,\n      site_ids: Array.from(item.site_ids),',
        '      sku: item.sku,\n      description: item.description,\n      site_ids: Array.from(item.site_ids),',
        'product output description',
    )
p = p.replace('title="Crear item comercial"', 'title="Publicar producto en Vento Pass"')
p = p.replace(
    'subtitle="Crea la ficha comercial base por sede y producto operacional. Viso oculta los productos que ya tienen item comercial activo en esa sede."',
    'subtitle="Elige el producto, revisa su información y decide dónde aparecerá. VISO completa el resto automáticamente."',
)
PAGE.write_text(p, encoding='utf-8')


s = FORM.read_text(encoding='utf-8-sig')

# Add operational description to the product type when the exact type is present.
if 'description?: string | null;' not in s:
    s = s.replace(
        '  sku?: string | null;\n  site_ids?: string[];',
        '  sku?: string | null;\n  description?: string | null;\n  site_ids?: string[];',
        1,
    )

# Prefill name, description and price, while leaving every value editable.
old_effect = '''  useEffect(() => {
    if (mode !== "create" || !selectedProduct || name.trim()) return;
    // Completa automáticamente el nombre comercial y permite editarlo después.
    setName(getProductDisplayName(selectedProduct));
  }, [mode, name, selectedProduct]);'''
new_effect = '''  useEffect(() => {
    if (mode !== "create" || !selectedProduct) return;
    if (!name.trim()) setName(getProductDisplayName(selectedProduct));
    if (!description.trim() && selectedProduct.description?.trim()) {
      setDescription(selectedProduct.description.trim());
    }
  }, [description, mode, name, selectedProduct]);'''
if old_effect in s:
    s = s.replace(old_effect, new_effect, 1)

# Make the large pending-products dashboard optional instead of dominating creation.
start = s.find('{mode === "create" && commercialCoverage.length > 0 ? (')
if start >= 0:
    next_panel = s.find('      <div className="ui-panel space-y-6">', start)
    segment = s[start:next_panel]
    if '<details className="ui-panel group">' not in segment:
        segment = segment.replace(
            '<div className="ui-panel space-y-4">',
            '<details className="ui-panel group">\n          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">\n            <span>\n              <span className="block text-sm font-black text-[var(--ui-text)]">Productos pendientes por publicar</span>\n              <span className="ui-caption mt-1 block">Consulta la cobertura solo cuando la necesites.</span>\n            </span>\n            <span className="ui-chip ui-chip--warn">{selectedSiteCoverage?.missing_count ?? 0} pendientes</span>\n          </summary>\n          <div className="mt-5 space-y-4">',
            1,
        )
        closing = segment.rfind('</div>\n      ) : null}')
        if closing >= 0:
            segment = segment[:closing] + '</div>\n        </details>\n' + segment[closing + len('</div>\n'):]
            s = s[:start] + segment + s[next_panel:]

# Replace the misleading manual checkbox with an explicit add-to-cart behavior choice.
old_modal = '''            <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
              <label className="flex items-start gap-3 text-sm text-[var(--ui-text)]">
                <input
                  type="checkbox"
                  checked={opensDetailModal}
                  onChange={(event) => setOpensDetailModal(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-bold">Mostrar opciones antes de agregar</span>
                  <span className="mt-1 block text-xs text-[var(--ui-muted)]">
                    Actívalo para productos que deben abrir modal antes de sumarse al pedido, como combos, productos personalizables o items con extras.
                  </span>
                </span>
              </label>
            </div>'''
new_modal = '''            <div className="space-y-3 rounded-2xl border border-[var(--ui-border)] bg-white p-4">
              <div>
                <div className="text-sm font-black text-[var(--ui-text)]">Forma de agregar al pedido</div>
                <div className="ui-caption mt-1">Si después agregas tamaños, sabores, extras o personalizaciones, VISO abrirá el detalle automáticamente.</div>
              </div>
              <input type="hidden" name="opens_detail_modal" value={opensDetailModal ? "true" : "false"} />
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setOpensDetailModal(false)} className={`rounded-2xl border p-4 text-left transition ${!opensDetailModal ? "border-[var(--ui-brand)] bg-[var(--ui-brand-soft)]" : "border-[var(--ui-border)] bg-white"}`}>
                  <span className="block text-sm font-black text-[var(--ui-text)]">Agregar directamente</span>
                  <span className="ui-caption mt-1 block">Úsalo para productos simples sin decisiones del cliente.</span>
                </button>
                <button type="button" onClick={() => setOpensDetailModal(true)} className={`rounded-2xl border p-4 text-left transition ${opensDetailModal ? "border-[var(--ui-brand)] bg-[var(--ui-brand-soft)]" : "border-[var(--ui-border)] bg-white"}`}>
                  <span className="block text-sm font-black text-[var(--ui-text)]">Mostrar primero el detalle</span>
                  <span className="ui-caption mt-1 block">Úsalo para combos o productos cuya información debe leerse antes de agregar.</span>
                </button>
              </div>
            </div>'''
if old_modal in s:
    s = s.replace(old_modal, new_modal, 1)

# Present merchandising and technical controls as advanced settings.
variant_marker = '<div className="space-y-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 sm:col-span-2">\n            <div>\n              <div className="ui-label">Variantes del producto</div>'
advanced_end = '          </div>\n        </div>\n      </div>\n\n\n      <div className="ui-panel space-y-6">\n        <div>\n          <div className="ui-h3">5. Imagen del producto</div>'
vi = s.find(variant_marker)
ei = s.find(advanced_end, vi)
if vi >= 0 and ei >= 0 and '<summary className="cursor-pointer' not in s[vi:ei]:
    block = s[vi:ei]
    wrapped = '''<details className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 sm:col-span-2">
            <summary className="cursor-pointer list-none text-sm font-black text-[var(--ui-text)]">Opciones avanzadas de presentación</summary>
            <p className="ui-caption mt-1">Variantes, formas de entrega, diseño y destacados. La mayoría de productos puede conservar los valores recomendados.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
''' + block + '''
            </div>
          </details>
'''
    s = s[:vi] + wrapped + s[ei:]

# Reduce the oversized preview canvas and keep actions visible while scrolling.
s = s.replace('className="max-w-md overflow-hidden rounded-[28px]', 'className="max-w-sm overflow-hidden rounded-[28px]', 1)
s = s.replace(
    'className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3"',
    'className="sticky bottom-3 z-40 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-white/95 p-3 shadow-[var(--ui-shadow-2)] backdrop-blur"',
    1,
)

# Clearer creation labels.
s = s.replace('Crear producto comercial', 'Publicar producto', 1)
s = s.replace('Vista en vivo en Pass', 'Vista previa en Vento Pass', 1)
s = s.replace(
    'Esta vista cambia mientras editas. Úsala para validar si cualquier persona entendería qué está comprando el cliente.',
    'Se actualiza mientras completas la ficha. Así verá el cliente la información principal.',
)
FORM.write_text(s, encoding='utf-8')
