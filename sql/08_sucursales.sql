-- IT Mexico - Catálogo de sucursales
-- Cada sucursal tiene dos códigos:
--   codigo       (5 caracteres) con el que se identifica, por ejemplo NL023
--   codigo_corto (4 caracteres) el que se usa al hacer la etiqueta LPN del envío
-- Ejecuta este archivo completo en Supabase > SQL Editor > New query (solo una vez)

create table if not exists sucursales (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[A-Z0-9]{5}$'),
  codigo_corto text unique check (codigo_corto is null or codigo_corto ~ '^[A-Z0-9]{4}$'),
  nombre text,
  ciudad text,
  notas text,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table sucursales enable row level security;

drop policy if exists "usuarios usan sucursales" on sucursales;
create policy "usuarios usan sucursales" on sucursales
  for all to authenticated using (true) with check (true);

-- Para que Supabase vea la tabla nueva de inmediato
notify pgrst, 'reload schema';
