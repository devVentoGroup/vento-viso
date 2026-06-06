# Validacion del flujo comercial VENTO

## Alcance

Este documento valida el flujo actual:

Viso configura producto -> Pass vende -> Wompi confirma pago cuando aplica -> Pulso opera la orden.

La validacion debe hacerse cuando el flujo este visualmente aprobado y antes de activar ventas reales.

## Prerrequisitos

- La sede/satelite existe y esta activo.
- El producto core asociado existe.
- El producto del menu esta activo en Viso.
- El producto tiene precio correcto.
- El producto tiene al menos un modo de cumplimiento activo: domicilio, recoger o en sitio.
- La app Pass carga el satelite correcto.
- Pulso puede ver ordenes de la misma sede.
- Para Wompi: `EXPO_PUBLIC_PASS_PAYMENTS_ENABLED=true` esta configurado en el ambiente de Pass.
- Las funciones y secretos de pago estan desplegados/configurados.

## Validacion en Viso

### Producto base

- Abrir el producto en `Menu`.
- Confirmar nombre, descripcion, precio e imagen.
- Confirmar que el producto core esta asociado.
- Confirmar que no hay IDs internos visibles para usuarios operativos.
- Confirmar categoria y coleccion.
- Confirmar que el producto esta activo.
- Confirmar modos de cumplimiento.

Resultado esperado:

- El producto queda claro para una persona no tecnica.
- La pantalla se entiende por secciones: venta, personalizacion y operacion.

### Personalizacion en Pass

- Crear grupo obligatorio.
- Crear grupo de extras.
- Crear grupo de preferencias.
- Crear opcion con precio adicional.
- Crear opcion sin precio.
- Crear opcion por defecto.
- Si aplica, crear opcion de remover ingrediente.
- Guardar y recargar la pagina.

Resultado esperado:

- Los grupos persisten.
- Las opciones aparecen en el orden correcto.
- El indicador muestra que el producto abre modal en Pass cuando tiene opciones.

## Validacion en Pass

### Catalogo

- Abrir el satelite en Pass.
- Confirmar que el producto aparece en la categoria correcta.
- Confirmar imagen, nombre, descripcion y precio.
- Confirmar que productos con opciones abren modal.
- Confirmar que productos sin opciones se agregan directo.

Resultado esperado:

- El menu se siente fluido y claro.
- El producto con personalizacion no se agrega sin pasar por el modal.

### Modal de producto

- Abrir producto con opciones.
- Intentar agregar sin seleccionar requeridos.
- Seleccionar opcion obligatoria.
- Seleccionar extra con precio.
- Seleccionar preferencia sin precio.
- Cambiar cantidad.
- Agregar al carrito.
- Agregar el mismo producto con una configuracion distinta.

Resultado esperado:

- El modal bloquea requeridos faltantes.
- El total cambia con extras.
- El carrito conserva variantes distintas como lineas separadas.
- La barra del carrito muestra pista de personalizacion cuando hay opciones.

### Checkout

- Ir a checkout.
- Confirmar datos de contacto.
- Para domicilio, seleccionar direccion y cotizar domicilio.
- Confirmar resumen:
  - item;
  - cantidad;
  - opciones;
  - precio base;
  - precio de opciones;
  - domicilio;
  - total.
- Revisar texto de pago.

Resultado esperado:

- Si es domicilio con pago activo, el boton dice `Pagar`.
- Si es recoger o en sitio, el flujo indica pago en sede/recoger.
- No se puede continuar sin contacto.
- No se puede continuar con domicilio sin direccion valida.

### Pago Wompi

- Crear pedido de domicilio con pago online activo.
- Confirmar que se abre checkout de Wompi.
- Completar pago aprobado en ambiente de prueba.
- Volver a la app.

Resultado esperado:

- Se crea la orden.
- Se crea transaccion.
- Wompi recibe el monto correcto.
- La orden queda pagada cuando llega confirmacion.

## Validacion en Pulso

### Entrada de orden

- Abrir Pulso en la sede correspondiente.
- Ver orden nueva.
- Confirmar:
  - cliente;
  - telefono;
  - direccion si es domicilio;
  - total;
  - estado de pago;
  - origen Vento Pass.

Resultado esperado:

- La orden entra sin refrescos manuales innecesarios o aparece al refrescar.
- El operador ve informacion suficiente para operar.

### Detalle de items

- Abrir/revisar la tarjeta de orden.
- Confirmar productos y cantidades.
- Confirmar que las opciones se muestran debajo del item.
- Confirmar extras con precio.
- Confirmar preferencias/removidos.
- Confirmar notas.

Resultado esperado:

- Pulso muestra exactamente lo que el cliente configuro.
- No depende solo de texto libre en notas.

### Bloqueo por pago

- Crear domicilio con pago pendiente.
- Ver orden en Pulso.
- Intentar avanzar la orden.

Resultado esperado:

- La tarjeta queda resaltada por pago pendiente.
- Pulso muestra alerta de Wompi pendiente.
- No permite preparar/despachar domicilio online sin pago aprobado.

### Operacion

- Con pago aprobado o pedido sin pago online, avanzar estados:
  - preparando;
  - listo;
  - entregado.
- Para domicilio, asignar aliado y referencia.

Resultado esperado:

- Los estados cambian correctamente.
- No se pierden opciones ni notas.
- El historial queda consistente.

## Validacion de backend

- Confirmar que el RPC recalcula precios del lado servidor.
- Confirmar que no acepta precios manipulados desde cliente.
- Confirmar que guarda `order_items`.
- Confirmar que guarda `order_item_options`.
- Confirmar que transacciones de pago se asocian a la orden.
- Confirmar que cancelaciones o fallos de pago no dejan la orden operable como pagada.

## Validacion visual

### Viso

- La pantalla no se siente tecnica.
- Los bloques tienen jerarquia clara.
- Los formularios no se ven apretados.
- Los textos explican operacion real.

### Pass

- El menu se ve premium y rapido.
- El modal no corta textos.
- Los botones son claros.
- La barra del carrito no tapa contenido importante.
- Checkout muestra total y pago sin ambiguedad.

### Pulso

- La orden se escanea rapido.
- Pago pendiente es imposible de ignorar.
- Las opciones son visibles sin abrir otra pantalla.
- Los botones de accion son claros.

## Casos de prueba minimos

1. Producto simple para recoger.
2. Producto simple para domicilio con pago online.
3. Producto con opcion obligatoria.
4. Producto con extras pagos.
5. Producto con preferencia sin precio.
6. Producto con ingrediente removible.
7. Dos variantes del mismo producto en el mismo carrito.
8. Domicilio con pago pendiente.
9. Domicilio con pago aprobado.
10. Producto sin producto core asociado, debe bloquear checkout.

## Criterio de aprobacion

El flujo queda aprobado cuando:

- Viso configura sin pasos tecnicos innecesarios.
- Pass vende productos simples y configurados.
- Wompi se abre solo cuando corresponde.
- Pulso muestra opciones estructuradas.
- Pulso bloquea pagos pendientes.
- TypeScript pasa en Viso, Pass y Pulso.
- El equipo valida visualmente en movil y escritorio.
