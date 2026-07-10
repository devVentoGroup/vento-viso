from pathlib import Path

p = Path('src/components/viso/menu-item-form.tsx')
s = p.read_text(encoding='utf-8-sig')

replacements = {
    'Primero elige la sede; las categorías y productos se filtran con esa seleccion.': 'Elige dónde se venderá. Solo mostraremos las opciones disponibles para esa sede.',
    'Mapa de creación comercial': 'Productos pendientes por publicar',
    'Cobertura por satélite: productos operativos vendibles contra items comerciales activos.': 'Consulta rápidamente qué productos de cada sede todavía no aparecen en Vento Pass.',
    'Sede completa': 'Todo publicado',
    'Todos los vendibles tienen item comercial.': 'Todos los productos de esta sede ya están publicados.',
    'productos operativos vendibles contra items comerciales activos': 'productos disponibles frente a productos ya publicados',
    'Estos son los productos que aparecen en el buscador de creación.': 'Selecciona uno para completar su publicación.',
    'Datos del item': 'Cómo lo verá el cliente',
    'Estado comercial': 'Publicación',
    'Item activo': 'Visible para los clientes',
    'Controla si el item aparece disponible en el menu de compras.': 'Actívalo cuando el producto esté listo para mostrarse en Vento Pass.',
    'Badges (separados por coma)': 'Etiquetas visibles',
    'Popular, Nuevo, Club': 'Popular, Nuevo, Recomendado',
    'Modalidades habilitadas': 'Dónde puede recibirlo el cliente',
    'Visualización en Pass': 'Diseño en Vento Pass',
    'Requiere detalle antes de agregar': 'Mostrar opciones antes de agregar',
    'Mostrar en destacados': 'Destacar este producto',
    'Crear item': 'Crear producto comercial',
}

for old, new in replacements.items():
    s = s.replace(old, new)

marker = '''  const selectedProduct = useMemo(() => {\n    return eligibleProducts.find((product) => product.id === productId) ?? null;\n  }, [eligibleProducts, productId]);'''
if marker in s and 'Completa automáticamente el nombre' not in s:
    s = s.replace(marker, marker + '''\n\n  useEffect(() => {\n    if (mode !== "create" || !selectedProduct || name.trim()) return;\n    // Completa automáticamente el nombre comercial y permite editarlo después.\n    setName(getProductDisplayName(selectedProduct));\n  }, [mode, name, selectedProduct]);''', 1)

p.write_text(s, encoding='utf-8')
