# Estado actual VISO

Fecha: 2026-05-28
Rol: backoffice gerencial, administracion de personal, menu comercial, Pass y contenido web.

## Implementado

- Auth con Vento Shell, health endpoint y pantallas de error para diagnostico de produccion.
- Negocios/sedes con branding y media.
- Staff: listado, detalle, alta, permisos, documentos y fotos.
- Attendance report y calendario de staff.
- Schedule planner semanal y base de reglas/AI heuristica en `src/lib/planning-ai`.
- Menu comercial: listado, alta y edicion de items.
- Categorias comerciales y colecciones comerciales.
- Productos, usuarios Pass, tarifas de delivery y contenido CMS web.
- Uploads para logos, imagenes de productos y media web.
- Auditoria operativa en `/ops/audit`.

## Estado real de integracion

- VISO administra datos que consumen Pass, Anima y sitios web, pero no debe crear migraciones propias para contratos compartidos; eso vive en Shell.
- Menu comercial no debe mezclarse con categorias operativas de Nexo.
- Planner de horarios vive en VISO; Anima consume turnos publicados y notificaciones.

## Pendiente para sinergia

1. Convertir el planner AI de foundation a flujo visible con preview, conflictos y explicacion.
2. Cerrar notificacion confiable al publicar turnos hacia Anima.
3. Dashboards ejecutivos cross-app: inventario, compras, produccion, ventas, personal y servicio.
4. Auditoria gerencial con trazabilidad por app y por usuario.
5. Revisar que menu, categorias comerciales y colecciones usen solo contratos comerciales, no `products.category_id` operativo.

## Documentos anteriores

`VISO-SCHEDULING-AI-FOUNDATION.md` sigue vigente como diseno tecnico de base, pero no representa una funcionalidad completa de IA publicada. Los documentos historicos VISO/ANIMA de marzo fueron eliminados.

