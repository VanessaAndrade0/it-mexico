-- IT Mexico - Agenda: tablero de tareas, recados y calendario
-- Ejecuta este archivo completo en Supabase > SQL Editor > New query (solo una vez)

-- Tareas del tablero
create table if not exists tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'hecho')),
  prioridad text not null default 'normal' check (prioridad in ('normal', 'alta')),
  asignado_a text,                 -- correo de la persona (vacío = para todos)
  fecha_limite date,
  orden double precision not null default extract(epoch from now()),
  creado_por text default (auth.jwt() ->> 'email'),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  completada_en timestamptz
);

-- Recados (comentarios) de cada tarea
create table if not exists tarea_comentarios (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references tareas(id) on delete cascade,
  texto text not null,
  autor text default (auth.jwt() ->> 'email'),
  creado_en timestamptz not null default now()
);

-- Eventos del calendario (pueden durar varios días, como un viaje)
create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  tipo text not null default 'evento' check (tipo in ('evento', 'reunion', 'viaje', 'vacaciones', 'recordatorio')),
  fecha_inicio date not null,
  fecha_fin date not null,
  hora text,
  persona text,
  notas text,
  creado_por text default (auth.jwt() ->> 'email'),
  creado_en timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

-- Guarda cuándo se cambió y cuándo se terminó cada tarea
create or replace function marcar_tarea() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  if new.estado = 'hecho' and (tg_op = 'INSERT' or old.estado <> 'hecho') then
    new.completada_en := now();
  elsif new.estado <> 'hecho' then
    new.completada_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_marcar_tarea on tareas;
create trigger trg_marcar_tarea
before insert or update on tareas
for each row execute function marcar_tarea();

-- Seguridad: solo usuarios con sesión iniciada
alter table tareas enable row level security;
alter table tarea_comentarios enable row level security;
alter table eventos enable row level security;

drop policy if exists "usuarios usan tareas" on tareas;
create policy "usuarios usan tareas" on tareas for all to authenticated using (true) with check (true);

drop policy if exists "usuarios usan comentarios" on tarea_comentarios;
create policy "usuarios usan comentarios" on tarea_comentarios for all to authenticated using (true) with check (true);

drop policy if exists "usuarios usan eventos" on eventos;
create policy "usuarios usan eventos" on eventos for all to authenticated using (true) with check (true);

-- Para que Supabase vea las tablas nuevas de inmediato
notify pgrst, 'reload schema';
