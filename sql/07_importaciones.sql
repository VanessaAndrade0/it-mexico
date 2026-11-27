-- IT Mexico - Registro de archivos importados (un archivo maestro por año)
-- Ejecuta este archivo completo en Supabase > SQL Editor > New query (solo una vez)

create table if not exists importaciones (
  id uuid primary key default gen_random_uuid(),
  archivo text not null,
  fecha_inicio date,          -- primer envío del archivo
  fecha_fin date,             -- último envío del archivo
  envios integer not null default 0,
  importado_por text default (auth.jwt() ->> 'email'),
  importado_en timestamptz not null default now()
);

-- Cada envío del historial sabe de qué archivo vino.
-- Si se elimina una importación, se borran sus envíos (no mueven el stock).
alter table movimientos
  add column if not exists importacion_id uuid references importaciones(id) on delete cascade;

create index if not exists movimientos_importacion_idx on movimientos (importacion_id);

-- Los envíos que ya se importaron antes de este cambio quedan en un registro propio
do $$
declare
  v_id uuid;
begin
  if exists (select 1 from movimientos where historico and importacion_id is null) then
    insert into importaciones (archivo, fecha_inicio, fecha_fin, envios, importado_por)
    select 'IT Mexico Inventory Master File 2024.xlsx',
           min((fecha at time zone 'America/Mexico_City')::date),
           max((fecha at time zone 'America/Mexico_City')::date),
           count(*), 'importado antes del registro'
      from movimientos
     where historico and importacion_id is null
    returning id into v_id;

    update movimientos set importacion_id = v_id where historico and importacion_id is null;
  end if;
end;
$$;

alter table importaciones enable row level security;

drop policy if exists "usuarios usan importaciones" on importaciones;
create policy "usuarios usan importaciones" on importaciones
  for all to authenticated using (true) with check (true);
