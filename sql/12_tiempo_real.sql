-- IT Mexico - Cambios en tiempo real
-- Ejecuta este archivo completo en Supabase > SQL Editor > New query (solo una vez)
--
-- Activa Realtime en las tablas que se ven en la app: cuando alguien guarda algo,
-- las pantallas de los demás se actualizan solas. Los permisos (RLS) se siguen respetando:
-- cada quien solo recibe los cambios que tiene permiso de ver.

do $$
declare
  t text;
begin
  foreach t in array array[
    'articulos', 'movimientos', 'recepciones', 'recepcion_articulos',
    'proveedores', 'articulo_proveedor', 'sucursales',
    'tareas', 'tarea_comentarios', 'eventos'
  ] loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t)
       and not exists (select 1 from pg_publication_tables
                       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Para ver qué tablas quedaron activas:
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
