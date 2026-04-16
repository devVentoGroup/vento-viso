# VISO Scheduling AI Foundation

Fecha: 2026-04-13

## Objetivo

Ubicar en `VISO` toda la capacidad futura de generacion inteligente de horarios para que el planner web siga siendo la fuente principal de planificacion y `ANIMA` quede como consumo movil.

## Decision de producto

- `VISO`:
  - crear borradores de semana
  - optimizar cobertura
  - sugerir reemplazos
  - revisar conflictos
  - publicar
- `ANIMA`:
  - consumir turnos publicados
  - mostrar semana personal
  - mostrar semana de sede en lectura
  - permitir ajustes puntuales si el rol lo permite

## Decision tecnica

No empezar con un modelo entrenado desde cero.

Primero construir una base hibrida:

1. reglas duras
2. scoring operativo
3. generacion heuristica
4. aprendizaje/prediccion despues

## Capas recomendadas

### 1. Datos

Inputs minimos:

- `employees`
- `employee_sites`
- `employee_shifts`
- `attendance_logs`
- `sites`

Inputs nuevos recomendados:

- `employee_availability`
- `staffing_requirements`
- `employee_shift_preferences`
- `shift_generation_runs`
- `shift_generation_candidates`

### 2. Reglas duras

El motor debe validar al menos:

- disponibilidad por empleado
- no solapar turnos
- sede valida
- rol/capacidad requerida
- maximos por dia y semana
- descansos minimos entre turnos
- estado activo del empleado

### 3. Scoring

Cada propuesta debe poder explicarse con puntaje por:

- cobertura del requerimiento
- equilibrio de carga
- continuidad operativa
- respeto de preferencias
- riesgo de fatiga o exceso

### 4. Generacion

Primer nivel recomendado:

- sugerir borrador semanal para una sede
- completar huecos
- duplicar patron anterior ajustado
- sugerir reemplazo para turno puntual

## Ubicacion en el repo

Base tecnica inicial:

- `src/lib/planning-ai/types.ts`
- `src/lib/planning-ai/rules.ts`
- `src/lib/planning-ai/scoring.ts`
- `src/lib/planning-ai/generate.ts`
- `supabase/migrations/20260413120000_viso_planning_ai_foundation.sql`

Integracion posterior:

- `src/app/staff/schedule/page.tsx`
- `src/components/viso/weekly-schedule-planner.tsx`

## Integracion UX recomendada

Agregar en el planner acciones como:

- `Sugerir borrador`
- `Completar huecos`
- `Sugerir reemplazo`
- `Explicar propuesta`

Pero no publicar automatico.

Siempre debe quedar:

- preview
- conflictos detectados
- explicacion resumida
- confirmacion humana

## Regla importante

La IA no publica sola.

Siempre propone un borrador revisable dentro del planner.

## Fase 1 recomendada

1. definir contratos y scoring base
2. generar borrador heuristico simple por sede/semana
3. mostrar propuesta en `VISO`
4. permitir aceptar o descartar

## Fase 2 recomendada

- usar historico de asistencia y turnos para sugerencias mejores
- sugerir cobertura por franja
- detectar combinaciones que suelen fallar

## Fase 3 recomendada

- prediccion de demanda
- asignacion mas fina por rol y sitio
- priorizacion multi-sede

## Caso complejo: persona con varios roles

No se debe resolver solo con `employees.role`.

El motor debe tomar el rol efectivo por sede y capacidad puntual.

Ejemplo:

- gerente en `Vento Cafe`
- chef en `Saudo`
- permiso de planificar en ambas

Entonces la generacion debe usar:

- contexto de sede actual
- rol efectivo por sede
- capacidades por sede

No un rol global unico.
