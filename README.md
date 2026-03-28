# Vento VISO

App de gerencia para administrar trabajadores, usuarios de Vento Pass y negocios.

## Setup rapido

1. Copia `.env.example` a `.env.local` y completa las variables.
2. Aplica migraciones de `supabase/migrations` en tu BD.
3. Instala dependencias: `npm install`.
4. Levanta el proyecto: `npm run dev`.

### Variables de entorno en Vercel

Si en producción ves **500 Internal Server Error** y en el navegador solo aparece un mensaje genérico de Server Components:

1. **Comprueba env en el deploy**: Abre `https://viso.ventogroup.co/api/health`. Si devuelve `503` y un array `missing`, faltan variables en Vercel (Settings → Environment Variables). Añade al menos:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **Ver el error real**: En el dashboard de Vercel → tu proyecto → **Logs** (o **Deployments** → último deploy → **Functions**). Ahí aparece el mensaje y stack del error del servidor (p. ej. "SUPABASE_SERVICE_ROLE_KEY is required").

## Flujo de alta de negocio

1. Entra a `Negocios` -> `Crear negocio`.
2. Completa datos de sede (code, nombre, tipo, direccion, coords).
3. Completa el branding de Vento Pass (logo, colores, tags).
4. Revisa la vista previa y guarda.

## Notas

- El bucket `pass-satellite-logos` debe existir y estar en modo publico.
- El bucket `website-media` se usa para imagenes/videos del sitio `ventogroup.co`.
- Las politicas de RLS del migration `20260309000000_viso_pass_admin_policies.sql` habilitan escritura para propietario y gerente_general.
