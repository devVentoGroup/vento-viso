from pathlib import Path

p = Path('src/components/viso/menu-item-form.tsx')
s = p.read_text(encoding='utf-8-sig')

old = '''          <div className="grid gap-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 sm:col-span-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="ui-label">Agrupación visual opcional</div>
              <p className="ui-caption">
                Solo cambia cómo se ve la card en Pass. No descuenta inventario. Sabores, toppings, vaso o cono se configuran después desde la edición del producto.
              </p>
            </div>
            <label className="space-y-2">
              <span className="ui-label">Nombre visual del grupo</span>
              <input
                name="display_group"
                className="ui-input"
                value={displayGroup}
                onChange={(event) => setDisplayGroup(event.target.value)}
                placeholder="Soda Hatsu"
              />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Etiqueta visual de variante</span>
              <input
                name="variant_label"
                className="ui-input"
                value={variantLabel}
                onChange={(event) => setVariantLabel(event.target.value)}
                placeholder="Sandía"
              />
            </label>
          </div>'''

new = '''          <div className="space-y-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 sm:col-span-2">
            <div>
              <div className="ui-label">Variantes del producto</div>
              <p className="ui-caption">Úsalo cuando varias referencias deben mostrarse juntas, por ejemplo Soda Hatsu: Sandía, Frutos rojos y Limón.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => { setDisplayGroup(""); setVariantLabel(""); }}
                className={`rounded-2xl border p-4 text-left transition ${!displayGroup ? "border-[var(--ui-brand)] bg-white shadow-sm" : "border-[var(--ui-border)] bg-white/70"}`}
              >
                <div className="text-sm font-black text-[var(--ui-text)]">Producto individual</div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">Se muestra como una tarjeta independiente.</div>
              </button>
              <button
                type="button"
                onClick={() => { if (!displayGroup) setDisplayGroup(name.trim() || "Nueva familia"); }}
                className={`rounded-2xl border p-4 text-left transition ${displayGroup ? "border-[var(--ui-brand)] bg-white shadow-sm" : "border-[var(--ui-border)] bg-white/70"}`}
              >
                <div className="text-sm font-black text-[var(--ui-text)]">Tiene otras versiones</div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">Agrupa sabores, tamaños o presentaciones bajo una sola familia.</div>
              </button>
            </div>

            {displayGroup ? (
              <div className="grid gap-4 rounded-2xl border border-[var(--ui-border)] bg-white p-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="ui-label">Familia del producto</span>
                  <input
                    name="display_group"
                    className="ui-input"
                    value={displayGroup}
                    onChange={(event) => setDisplayGroup(event.target.value)}
                    placeholder="Soda Hatsu"
                  />
                  <span className="ui-caption">Escribe el mismo nombre en todas las versiones de esta familia.</span>
                </label>
                <label className="space-y-2">
                  <span className="ui-label">Nombre de esta versión</span>
                  <input
                    name="variant_label"
                    className="ui-input"
                    value={variantLabel}
                    onChange={(event) => setVariantLabel(event.target.value)}
                    placeholder="Sandía"
                  />
                  <span className="ui-caption">Ejemplo: Sandía, Limón, 6 porciones o Grande.</span>
                </label>
                <div className="rounded-xl bg-[var(--ui-brand-soft)] p-3 sm:col-span-2">
                  <div className="text-xs font-bold uppercase tracking-wide text-[var(--ui-muted)]">Así se verá en Pass</div>
                  <div className="mt-1 text-sm font-black text-[var(--ui-text)]">{displayGroup || "Familia"}</div>
                  <div className="mt-0.5 text-sm text-[var(--ui-muted)]">{variantLabel || "Nombre de esta versión"}</div>
                </div>
              </div>
            ) : null}

            {!displayGroup ? <input type="hidden" name="display_group" value="" /> : null}
            {!displayGroup ? <input type="hidden" name="variant_label" value="" /> : null}
          </div>'''

if old in s:
    s = s.replace(old, new, 1)
elif 'Variantes del producto' not in s:
    raise SystemExit('variant block not found')

p.write_text(s, encoding='utf-8')
