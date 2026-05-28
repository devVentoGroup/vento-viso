# VISO

VISO es el backoffice gerencial de Vento OS para personal, negocios, menu comercial, Pass, contenido web y vistas administrativas.

## Estado actual

- Staff, permisos, documentos, fotos, asistencia y calendario.
- Planner semanal y foundation heuristica/AI para horarios.
- Negocios/sedes y branding.
- Menu comercial, categorias comerciales, colecciones y productos.
- Usuarios Pass, delivery rates y CMS web.
- Health endpoint y pantallas de error para diagnostico de produccion.

## Documentacion vigente

- `docs/ESTADO-ACTUAL-VISO-2026-05-28.md`
- `docs/VISO-SCHEDULING-AI-FOUNDATION.md` como diseño tecnico de planner AI.
- Los documentos historicos VISO/ANIMA de marzo fueron eliminados; el estado actual vive en `docs/ESTADO-ACTUAL-VISO-2026-05-28.md`.

## Desarrollo

```bash
npm install
npm run dev
```

## Variables de entorno clave

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Para diagnostico en produccion: `/api/health`.
