-- IT Mexico - Seguridad: roles, permisos por rol y bitácora de cambios
-- Ejecuta este archivo completo en Supabase > SQL Editor > New query (solo una vez)
--
-- Roles:
--   admin      ve, registra, edita y elimina; administra usuarios
--   editor     ve, registra y edita; no elimina movimientos, artículos, trucks, proveedores ni sucursales
--   lectura    solo ve
--   pendiente  cuenta nueva sin autorizar: no ve nada hasta que un admin le asigne rol

-- 1. Perfiles de usuario
create table if not exists perfiles (
  email text primary key check (email = lower(email)),
  nombre text,
  rol text not null default 'pendiente' check (rol in ('admin', 'editor', 'lectura', 'pendiente')),
  creado_en timestamptz not null default now()
);

-- Las cuentas que ya existen quedan como admin (Vanessa, Jesús e Yssel)
insert into perfiles (email, rol)
select lower(email), 'admin' from auth.users where email is not null
on conflict (email) do nothing;

-- Cada cuenta nueva entra como pendiente
create or replace function crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null then
    insert into public.perfiles (email) values (lower(new.email)) on conflict (email) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crear_perfil on auth.users;
create trigger trg_crear_perfil
after insert on auth.users
for each row execute function crear_perfil();

-- Nunca se puede quedar la app sin administradores
create or replace function cuidar_admins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from perfiles where rol = 'admin') then
    raise exception 'Debe quedar al menos un administrador.';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_cuidar_admins on perfiles;
create trigger trg_cuidar_admins
after update or delete on perfiles
for each statement execute function cuidar_admins();

-- 2. Funciones para saber el rol de quien está usando la app
create or replace function mi_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from perfiles where email = lower(auth.jwt() ->> 'email');
$$;

create or replace function puede_ver() returns boolean
language sql stable as $$ select coalesce(mi_rol() in ('admin', 'editor', 'lectura'), false) $$;

create or replace function puede_editar() returns boolean
language sql stable as $$ select coalesce(mi_rol() in ('admin', 'editor'), false) $$;

create or replace function es_admin() returns boolean
language sql stable as $$ select coalesce(mi_rol() = 'admin', false) $$;

-- 3. Permisos de cada tabla (se borran las reglas viejas que dejaban todo abierto)
do $$
declare
  t text;
  p record;
  -- en estas tablas solo un admin puede eliminar
  solo_admin_borra text[] := array['articulos', 'movimientos', 'recepciones', 'proveedores', 'sucursales'];
begin
  foreach t in array array['articulos', 'proveedores', 'articulo_proveedor', 'movimientos', 'recepciones',
                           'recepcion_articulos', 'sucursales', 'importaciones', 'tareas', 'tarea_comentarios', 'eventos']
  loop
    continue when to_regclass('public.' || t) is null;

    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on %I', p.policyname, t);
    end loop;

    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('create policy "ver" on %I for select to authenticated using (puede_ver())', t);
    execute format('create policy "agregar" on %I for insert to authenticated with check (puede_editar())', t);
    execute format('create policy "editar" on %I for update to authenticated using (puede_editar()) with check (puede_editar())', t);

    if t = 'importaciones' then
      -- un editor solo puede quitar el registro vacío que deja su propia importación sin envíos nuevos
      execute format($p$create policy "eliminar" on %I for delete to authenticated
        using (es_admin() or (puede_editar() and envios = 0 and importado_por = lower(auth.jwt() ->> 'email')))$p$, t);
    elsif t = any (solo_admin_borra) then
      execute format('create policy "eliminar" on %I for delete to authenticated using (es_admin())', t);
    else
      execute format('create policy "eliminar" on %I for delete to authenticated using (puede_editar())', t);
    end if;
  end loop;
end;
$$;

-- Perfiles: cada quien ve el suyo; el admin ve y cambia todos
alter table perfiles enable row level security;
revoke all on perfiles from anon;
grant select, insert, update, delete on perfiles to authenticated;
drop policy if exists "ver perfiles" on perfiles;
drop policy if exists "admin cambia perfiles" on perfiles;
create policy "ver perfiles" on perfiles for select to authenticated
  using (email = lower(auth.jwt() ->> 'email') or es_admin());
create policy "admin cambia perfiles" on perfiles for all to authenticated
  using (es_admin()) with check (es_admin());

-- 4. Bitácora: guarda quién cambió o borró qué, con los datos de antes y después
create table if not exists bitacora (
  id bigserial primary key,
  tabla text not null,
  registro_id text,
  accion text not null,
  antes jsonb,
  despues jsonb,
  usuario text default lower(auth.jwt() ->> 'email'),
  fecha timestamptz not null default now()
);
create index if not exists bitacora_fecha_idx on bitacora (fecha desc);
create index if not exists bitacora_registro_idx on bitacora (tabla, registro_id);

alter table bitacora enable row level security;
revoke all on bitacora from anon;
grant select on bitacora to authenticated;
drop policy if exists "admin ve bitacora" on bitacora;
create policy "admin ve bitacora" on bitacora for select to authenticated using (es_admin());
-- nadie la puede editar ni borrar desde la app: solo la llena el trigger

create or replace function registrar_bitacora() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_antes jsonb := to_jsonb(old);
  v_despues jsonb := case when tg_op = 'UPDATE' then to_jsonb(new) end;
begin
  -- los cambios de stock que hacen los movimientos ya quedan en el historial
  if tg_table_name = 'articulos' and tg_op = 'UPDATE' and (v_antes - 'stock') = (v_despues - 'stock') then
    return null;
  end if;
  insert into bitacora (tabla, registro_id, accion, antes, despues)
  values (tg_table_name, v_antes ->> 'id', case tg_op when 'UPDATE' then 'editar' else 'eliminar' end, v_antes, v_despues);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['articulos', 'movimientos', 'recepciones', 'proveedores', 'sucursales', 'importaciones', 'perfiles'] loop
    continue when to_regclass('public.' || t) is null;
    execute format('drop trigger if exists trg_bitacora on %I', t);
    execute format('create trigger trg_bitacora after update or delete on %I for each row execute function registrar_bitacora()', t);
  end loop;
end;
$$;

-- 5. Reglas de datos en la base (no solo en la página)
-- Un movimiento no puede ser de 0 piezas (not valid = no revisa lo que ya existe)
alter table movimientos drop constraint if exists movimientos_cantidad_no_cero;
alter table movimientos add constraint movimientos_cantidad_no_cero check (cantidad <> 0) not valid;

-- La sucursal se guarda en mayúsculas y, si se escribió el código de 4, se cambia al de 5
create or replace function normalizar_sucursal() returns trigger
language plpgsql as $$
declare v_codigo text;
begin
  if new.sucursal is not null then
    new.sucursal := nullif(upper(trim(new.sucursal)), '');
    if length(new.sucursal) = 4 then
      select codigo into v_codigo from sucursales where codigo_corto = new.sucursal;
      if v_codigo is not null then new.sucursal := v_codigo; end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalizar_sucursal on movimientos;
create trigger trg_normalizar_sucursal
before insert or update of sucursal on movimientos
for each row execute function normalizar_sucursal();

-- Para que Supabase vea los cambios de inmediato
notify pgrst, 'reload schema';
