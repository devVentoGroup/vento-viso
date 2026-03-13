# VISO + ANIMA — Estado y continuidad

> Resumen de últimos cambios y dirección para seguir. Fecha: 2026-03-13.

---

## 1. Rol de cada app

| App | Rol | Usuarios |
|-----|-----|----------|
| **VISO** | Panel web de gerencia (Next.js, viso.ventogroup.co) | Propietarios, gerentes, administradores |
| **ANIMA** | App móvil operativa (Expo/React Native) | Empleados y managers en terreno |

**Flujo de datos:** Lo que se configura o planifica en VISO (trabajadores, sedes, horarios, negocios, productos Pass) se consume o ejecuta en ANIMA y en otras apps del ecosistema (Pass, Nexo, etc.).

---

## 2. Últimos cambios en VISO (esta sesión y recientes)

### 2.1 Estabilidad y diagnóstico
- **Error 500 en producción:** Se añadieron `error.tsx` y `global-error.tsx` para capturar errores de Server Components y mostrar digest + mensaje en dev.
- **Ruta `/api/health`:** Comprueba variables de entorno (Supabase) y devuelve `missing` para diagnosticar 503/500.
- **README:** Instrucciones para configurar env en Vercel y ver logs.

### 2.2 Trabajadores
- **Lista de empleados:** La query fallaba por ambigüedad de relaciones `employees` ↔ `sites`. Se desambiguó con hint de FK: `site:sites!employees_site_id_fkey(...)` y `site:sites!employee_sites_site_id_fkey(...)` en `staff/page.tsx`.
- **Manejo de error:** Si la query a `employees` falla, se muestra mensaje claro en lugar de “No hay trabajadores”.
- **Estado vacío:** Texto y CTA “Invitar trabajador” cuando la lista está vacía.

### 2.3 Horario semanal (planner)
- **Flujo único y progresivo:** Sin wizard ni formulario fijo. El panel derecho muestra solo el siguiente paso según la selección:
  - Sin selección: mensaje “Haz clic o arrastra…”
  - Clic en hueco → “¿Quién trabaja este turno?” → lista de personas → confirmar o “Ajustar horario”.
  - Clic en turno existente → resumen → Editar / Eliminar.
- **Selección por arrastre:** En la cuadrícula se puede arrastrar (mousedown → mover → mouseup) en el mismo día para marcar un bloque de horas; al soltar se abre el panel con ese rango y se elige la persona.
- **Resumen en una línea:** “X trabajadores · Y turnos · Z borradores” + botones Copiar semana anterior / Publicar horarios.

### 2.4 Archivos clave tocados
- `src/app/page.tsx` — Home con conteos.
- `src/app/staff/page.tsx` — Lista trabajadores (query + error + empty state).
- `src/app/staff/schedule/page.tsx` — Página de horario semanal (sede, semana, acciones).
- `src/components/viso/weekly-schedule-planner.tsx` — Cuadrícula + flujo progresivo + arrastre.
- `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/api/health/route.ts`, `.env.example`, `README.md`.

---

## 3. Últimos cambios en ANIMA (recientes)

### 3.1 Roadmap operativo
- **`docs/ROADMAP-ANIMA-OPERATIVO.md`:** Define visión, dominios (identidad, asistencia, programación, documentos, comunicación, config) y fases:
  - **Fase 1:** Invitaciones pendientes y reenvío (bandeja operativa).
  - **Fase 2:** Turnos programados (MVP móvil + planner denso en web).
  - **Fase 3:** Parametrización en BD (políticas de asistencia, roles, turnos).
  - **Fase 4:** Migración gradual de `public` a schema `anima`.

### 3.2 Invitaciones — Fase 1 completada (2026-03-13)
- **`docs/ANIMA-INVITACIONES-PENDIENTES-DISENO.md`:** Modelo `staff_invitations`, estados (sent, linked_existing_user, accepted, expired, cancelled), edge functions (create, accept, resend, cancel), y cambios de UI en Equipo. **Estado: implementado.**
- **Funciones:** `staff-invitations-create`, `staff-invitations-accept`, `staff-invitations-resend`, `staff-invitations-cancel` — todas implementadas y conectadas desde Equipo.
- **Migración:** `20260313110000_anima_staff_invitations_foundation.sql` — base de invitaciones.
- **Auditoría:** `vento-anima/docs/AUDITORIA-INVITACIONES-ANIMA-2026-03-13.md` — verificación end-to-end y ajustes (expired_at/expires_at, textos).

### 3.3 Turnos
- **Pantalla `app/(app)/shifts.tsx`:** “Mis turnos” en ANIMA; lista turnos publicados del empleado desde `employee_shifts`.
- **`src/components/shifts/utils.ts`:** Utilidades para fechas, duración, estado, sitio.
- **Regla de producto:** Planner denso (semanal, copiar semana, muchos empleados) en **web (VISO)**; en móvil solo consumo y ajustes puntuales.

### 3.4 Publicación de horarios
- **Migración:** `20260313123000_anima_shift_publication_workflow.sql` — flujo de publicación de turnos.
- **VISO:** Acciones “Publicar semana” / “Publicar horarios” en el planner que marcan turnos como publicados; ANIMA muestra solo turnos con `published_at` no nulo.

### 3.5 Otros
- **Home, team, layout:** Cambios en `app/(app)/home.tsx`, `team.tsx`, `_layout.tsx`.
- **Asistencia:** `use-attendance.ts` y políticas (departure autoclose, etc.).
- **Update policy:** `use-app-update-policy.ts` y política split prod/dev.

---

## 4. Cómo encaja todo

```
VISO (web)                          ANIMA (móvil)
─────────────────────────────────────────────────────────────
· Trabajadores (lista, invitar)  →  · Equipo + invitaciones pendientes
· Horario semanal (planner)      →  · Mis turnos + notificaciones
· Publicar semana                →  · Solo turnos publicados visibles
· Negocios, productos, Pass      →  · (consumo en otras apps)
```

- **Turnos:** Se crean/editan/borran en VISO (planner). Se publican desde VISO. ANIMA lee `employee_shifts` con `published_at` y muestra “Mis turnos” y próximos en Home.
- **Invitaciones:** Se crean desde ANIMA (Equipo) o desde VISO; la bandeja de pendientes y reenvío se implementa en ANIMA según el diseño de invitaciones; la persistencia ya está en `staff_invitations`.

---

## 5. Qué queremos hacer (según roadmap y docs)

### Completado
1. **ANIMA – Invitaciones pendientes** ✅
   - Bandeja en `team.tsx` con estados sent, expired, linked_existing_user.
   - Reenviar y Cancelar conectados a `staff-invitations-resend` y `staff-invitations-cancel`.
   - Create y accept persisten y cierran en `staff_invitations`. Ver auditoría en `vento-anima/docs/AUDITORIA-INVITACIONES-ANIMA-2026-03-13.md`.

### Corto plazo (seguir sin romper)
2. **ANIMA – Turnos MVP**
   - Pantalla “Mis turnos” y tarjeta próximo turno en Home ya filtran por `published_at`; VISO ya tiene “Publicar horarios” y escribe `published_at`/`published_by`. Ver `vento-anima/docs/ANIMA-TURNOS-MVP.md`.
   - Opcional: notificación al asignar/publicar turno.
   - Opcional: manager en móvil crear/editar/cancelar turno puntual.

3. **VISO – Horario**
   - Sin cambios obligatorios; flujo progresivo y arrastre ya están. Opcional: notificar a ANIMA al publicar.

### Medio plazo
4. **Parametrización en BD:** Políticas de asistencia, capacidades por rol, `app_config`, políticas de turnos (ver Fase 3 del roadmap).
5. **Schema `anima`:** Crear schema y hacer que lo nuevo nazca en `anima.*`; migrar por capas desde `public`.

---

## 6. Pendientes técnicos a tener en cuenta

- **VISO:** `weekly-schedule-planner.tsx` tiene cambios sin commitear (arrastre, flujo progresivo). Conviene commit y deploy para que producción use la nueva UX.
- **ANIMA:** Migraciones sin aplicar en todos los entornos (staff_invitations, shift_publication_workflow). Verificar que estén en el mismo Supabase que VISO si comparten BD.
- **Relación employees/sites:** Si en otras partes del monorepo se hace `select` con `site:sites(...)` sobre tablas con varias FKs a `sites`, puede repetirse el error de “more than one relationship”; desambiguar con `!table_column_fkey`.

---

## 7. Próximo entregable sugerido

1. ~~Implementar bandeja de invitaciones pendientes en ANIMA~~ — **Hecho.** Reenviar y Cancelar operativos.
2. **Seguir Fase 2 turnos:** Documento `vento-anima/docs/ANIMA-TURNOS-MVP.md` creado; flujo publicar (VISO) → consumir solo publicados (ANIMA Mis turnos + Home) ya implementado. Próximos opcionales: notificación al publicar, manager móvil turno puntual.
3. **Parametrización y schema anima** cuando corresponda (Fase 3 y 4 del roadmap).

---

## 8. Referencia rápida de archivos

| Qué | Dónde |
|-----|--------|
| Roadmap ANIMA | `vento-anima/docs/ROADMAP-ANIMA-OPERATIVO.md` |
| Diseño invitaciones | `vento-anima/docs/ANIMA-INVITACIONES-PENDIENTES-DISENO.md` |
| **Auditoría invitaciones** | `vento-anima/docs/AUDITORIA-INVITACIONES-ANIMA-2026-03-13.md` |
| Turnos MVP (estado y próximos pasos) | `vento-anima/docs/ANIMA-TURNOS-MVP.md` |
| Planner semanal VISO | `vento-viso/src/app/staff/schedule/page.tsx` + `weekly-schedule-planner.tsx` |
| Lista trabajadores VISO | `vento-viso/src/app/staff/page.tsx` |
| Mis turnos ANIMA | `vento-anima/app/(app)/shifts.tsx` + `src/components/shifts/utils.ts` |
| Edge functions invitaciones | `vento-anima/supabase/functions/staff-invitations-*` |
| Health/diagnóstico VISO | `vento-viso/src/app/api/health/route.ts`, `error.tsx`, `global-error.tsx` |
