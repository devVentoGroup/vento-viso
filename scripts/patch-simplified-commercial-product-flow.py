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