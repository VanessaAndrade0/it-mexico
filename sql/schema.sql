-- IT Mexico - Historial de envíos (años pasados)
-- Ejecuta este archivo completo en Supabase > SQL Editor > New query (solo una vez)

-- Datos extra en cada movimiento
alter table movimientos
  add column if not exists historico boolean not null default false, -- importado de años pasados: no mueve el stock
  add column if not exists serie text,                               -- número de serie de la pieza
  add column if not exists metodo_envio text,                        -- Blue Global, UPS, Self pick...
  add column if not exists clave_importacion text;                   -- evita duplicados si se importa dos veces

alter table movimientos drop constraint if exists movimientos_clave_importacion_key;
alter table movimientos add constraint movimientos_clave_importacion_key unique (clave_importacion);

create index if not exists movimientos_serie_idx on movimientos (serie);
create index if not exists movimientos_fecha_idx on movimientos (fecha);

-- Los movimientos históricos no cambian el stock al registrarse...
create or replace function actualizar_stock() returns trigger
language plpgsql as $$
begin
  if new.historico then
    return new;
  end if;
  update articulos
     set stock = stock + case new.tipo when 'salida' then -new.cantidad else new.cantidad end
   where id = new.articulo_id;
  return new;
end;
$$;

-- ...ni al anularse...
create or replace function revisar_cambio_movimiento() returns trigger
language plpgsql as $$
begin
  if old.anulado then
    raise exception 'Este movimiento ya está anulado y no se puede cambiar.';
  end if;

  if new.anulado then
    new.anulado_por := auth.jwt() ->> 'email';
    new.anulado_en := now();
    if not old.historico then
      update articulos
         set stock = stock - case old.tipo when 'salida' then -old.cantidad else old.cantidad end
       where id = old.articulo_id;
    end if;
  else
    new.editado_por := auth.jwt() ->> 'email';
    new.editado_en := now();
  end if;

  return new;
end;
$$;

-- ...ni al borrarse
create or replace function revertir_stock_al_borrar() returns trigger
language plpgsql as $$
begin
  if not old.anulado and not old.historico then
    update articulos
       set stock = stock - case old.tipo when 'salida' then -old.cantidad else old.cantidad end
     where id = old.articulo_id;
  end if;
  return old;
end;
$$;