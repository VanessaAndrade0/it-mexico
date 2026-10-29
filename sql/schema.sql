-- IT Mexico - Inventario
-- Ejecuta este archivo completo en Supabase > SQL Editor > New query

-- Proveedores
create table if not exists proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  contacto text,
  correo text,
  telefono text,
  notas text,
  creado_en timestamptz not null default now()
);

-- Artículos del inventario
create table if not exists articulos (
  id uuid primary key default gen_random_uuid(),
  sku text,
  nombre text not null unique,
  categoria text,
  ubicacion text,
  unidad text not null default 'pzas',
  minimo integer not null default 0 check (minimo >= 0),
  stock integer not null default 0,
  creado_en timestamptz not null default now()
);

-- Un artículo puede tener varios proveedores y un proveedor varios artículos
create table if not exists articulo_proveedor (
  articulo_id uuid not null references articulos(id) on delete cascade,
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  primary key (articulo_id, proveedor_id)
);

-- Entradas, salidas y ajustes
create table if not exists movimientos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  articulo_id uuid not null references articulos(id) on delete restrict,
  cantidad integer not null check (cantidad <> 0),
  fecha timestamptz not null default now(),
  ticket text,
  sucursal text,
  solicitante text,
  lpn text,
  proveedor_id uuid references proveedores(id) on delete set null,
  nota text,
  registrado_por text default (auth.jwt() ->> 'email'),
  registrado_en timestamptz not null default now(),
  constraint cantidad_positiva check (tipo = 'ajuste' or cantidad > 0)
);

-- El stock se actualiza solo cada vez que se registra un movimiento
create or replace function actualizar_stock() returns trigger
language plpgsql as $$
begin
  update articulos
     set stock = stock + case new.tipo when 'salida' then -new.cantidad else new.cantidad end
   where id = new.articulo_id;
  return new;
end;
$$;

drop trigger if exists trg_actualizar_stock on movimientos;
create trigger trg_actualizar_stock
after insert on movimientos
for each row execute function actualizar_stock();

-- Seguridad: solo usuarios con sesión iniciada pueden ver y registrar
alter table proveedores enable row level security;
alter table articulos enable row level security;
alter table articulo_proveedor enable row level security;
alter table movimientos enable row level security;

create policy "usuarios leen proveedores" on proveedores for select to authenticated using (true);
create policy "usuarios editan proveedores" on proveedores for all to authenticated using (true) with check (true);

create policy "usuarios leen articulos" on articulos for select to authenticated using (true);
create policy "usuarios editan articulos" on articulos for all to authenticated using (true) with check (true);

create policy "usuarios leen relacion" on articulo_proveedor for select to authenticated using (true);
create policy "usuarios editan relacion" on articulo_proveedor for all to authenticated using (true) with check (true);

-- Los movimientos no se editan ni se borran, para conservar el historial
create policy "usuarios leen movimientos" on movimientos for select to authenticated using (true);
create policy "usuarios registran movimientos" on movimientos for insert to authenticated with check (true);
