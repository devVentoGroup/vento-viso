# VENTO comercio, operacion e inventario

## Objetivo

Conectar Viso, Pass y Pulso para vender desde la aplicacion sin volver pesada la operacion de satelites. El sistema debe permitir configurar el producto una vez, venderlo en Pass, operarlo en Pulso y preparar una base futura para inventario automatico y KDS en Fogo.

## Aplicaciones

### Vento Viso

Viso es el lugar donde se configura todo:

- Producto vendible del menu.
- Imagen, precio, categoria, coleccion y modos de cumplimiento.
- Personalizacion visible en Pass: obligatorios, extras, preferencias, acompanamientos e ingredientes removibles.
- Producto core asociado para trazabilidad.
- Futuro: receta operativa, area de preparacion, LOC principal, LOC alternos y modo de descuento.

La pantalla de producto debe quedar organizada en bloques:

- Venta: datos comerciales, precio, publicacion y visibilidad.
- Personalizacion en Pass: opciones que vera el cliente.
- Operacion: lo que Pulso/KDS necesita para preparar.
- Inventario: receta, consumo y ubicaciones.

### Vento Pass

Pass es la superficie de compra del cliente:

- Muestra el menu por sede/satelite.
- Abre modal de producto cuando hay opciones o cuando Viso lo configura.
- Valida opciones obligatorias antes de agregar al carrito.
- Guarda cada linea configurada con snapshots de opciones.
- Lleva el carrito al checkout.
- Crea el borrador de orden.
- Si el pago online esta activo y el pedido es domicilio, abre Wompi.

El carrito debe preservar variantes. Dos productos iguales con opciones distintas son lineas distintas.

### Vento Pulso

Pulso gestiona la operacion:

- Lista ordenes por sede y estado.
- Muestra pago pendiente/pagado.
- Bloquea domicilios online hasta confirmacion de Wompi.
- Muestra items, cantidades, notas y opciones configuradas.
- Permite avanzar estados operativos.
- Futuro: vista KDS por area, con preparacion por item.

## Flujo actual recomendado

1. Viso configura producto, precio, publicacion y opciones.
2. Pass carga catalogo publicado.
3. Cliente abre producto con opciones.
4. Pass valida requeridos y agrega linea configurada al carrito.
5. Checkout crea orden por RPC.
6. Backend recalcula precios y guarda snapshots.
7. Si aplica, Wompi confirma pago.
8. Pulso muestra la orden y permite operarla cuando el pago lo permite.

## Produccion e inventario

### Centro de produccion

En centro de produccion si es viable registrar produccion real:

- Consumo de insumos.
- Produccion de semi terminados o terminados.
- Ajuste por lote o al cierre del dia.
- Remision a satelites.

### Satelites

En satelites no conviene exigir produccion manual durante operacion. El descuento debe resolverse por receta operativa o por consumo automatico.

El satelite debe recibir stock por:

- Remisiones desde centro de produccion.
- Recepciones de remisiones.
- Traslados rapidos entre areas.
- Ajustes controlados.

La venta debe poder generar consumo automatico o consumo pendiente de confirmar.

## Producto vendible vs receta operativa

Producto vendible:

- Lo que compra el cliente.
- Tiene precio, imagen, nombre, descripcion y opciones comerciales.

Receta operativa:

- Lo que se consume para preparar el producto.
- Puede depender del area, sede o LOC.
- Puede incluir insumos, semi terminados y productos de otra area.

Ejemplo: Especial Vento.

- Producto vendible: Especial Vento.
- Area de preparacion: barra.
- Componentes:
  - 0.5 galleta.
  - 1 porcion de helado.
  - topping.
- LOC principal: barra.
- LOC alterno permitido para galleta: mostrador.

## LOC principal y LOC alternos

La receta no debe estar amarrada rigidamente a un solo LOC. Para que operacion sea viable:

- Cada componente puede tener LOC principal.
- Cada componente puede tener LOC alternos.
- La estrategia puede ser:
  - consumir siempre del LOC principal;
  - consumir primero del principal y luego alternos;
  - consumir siempre de un LOC especifico;
  - reservar en venta y consumir en preparacion.

Esto evita que una persona tenga que registrar un traslado cada vez que usa media galleta desde mostrador para preparar un producto de barra.

## Traslados rapidos

Los traslados rapidos deben existir, pero para movimientos fisicos reales:

- Reposicion de barra desde mostrador.
- Movimiento de paquetes, cajas o unidades completas.
- Correccion de ubicacion de stock.

No deben ser requisito para cada microconsumo de receta durante operacion.

## KDS futuro en Fogo

Fogo puede convertirse en la vista KDS:

- Ordenes por area: barra, cocina, mostrador.
- Items por preparar.
- Opciones visibles.
- Estado por item: nuevo, preparando, listo.
- Bloqueo por pago pendiente.
- Consumo de inventario al preparar, si se decide mover el descuento desde venta a KDS.

## Fases de implementacion

### Fase 1: flujo comercial

- Viso configura producto y personalizacion.
- Pass vende con modal, carrito, checkout y pago.
- Pulso opera ordenes con opciones visibles.

### Fase 2: receta operativa en Viso

- Definir producto vendible vs receta operativa.
- Configurar area de preparacion.
- Configurar LOC principal y alternos.
- Definir momento de consumo: venta, preparacion o cierre.

### Fase 3: simulacion de consumo

- Calcular consumo esperado por ventas.
- No tocar stock real todavia.
- Mostrar diferencias contra inventario fisico.

### Fase 4: descuento real

- Descontar al vender o al preparar.
- Revertir al cancelar.
- Manejar reservas.
- Auditar movimientos por orden.

### Fase 5: KDS e inventario avanzado

- KDS por area en Fogo.
- Consumo por item preparado.
- Produccion por lote.
- Remisiones, recepciones, traslados y ajustes conectados con ventas.

## Decisiones pendientes

- Si el descuento inicial se hara al vender o al marcar preparado.
- Si Pass debe reservar stock antes de pago o solo despues de pago aprobado.
- Como manejar cancelaciones despues de preparacion.
- Como tratar productos sin producto core asociado.
- Como configurar LOC alternos sin hacer pesada la pantalla de Viso.
