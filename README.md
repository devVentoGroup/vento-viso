# Vento VISO

App de gerencia para administrar trabajadores, usuarios de Vento Pass y negocios.

## Setup rapido

1. Copia `.env.example` a `.env.local` y completa las variables.
2. Aplica migraciones de `supabase/migrations` en tu BD.
3. Instala dependencias: `npm install`.
4. Levanta el proyecto: `npm run dev`.

## Flujo de alta de negocio

1. Entra a `Negocios` -> `Crear negocio`.
2. Completa datos de sede (code, nombre, tipo, direccion, coords).
3. Completa el branding de Vento Pass (logo, colores, tags).
4. Revisa la vista previa y guarda.

## Notas

- El bucket `pass-satellite-logos` debe existir y estar en modo publico.
- Las politicas de RLS del migration `20260309000000_viso_pass_admin_policies.sql` habilitan escritura para propietario y gerente_general.