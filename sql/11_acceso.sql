-- IT Mexico - Acceso solo con correo de la empresa
-- Ejecuta este archivo completo en Supabase > SQL Editor > New query (solo una vez)
--
-- A partir de ahora solo se pueden crear cuentas (o cambiar el correo de una cuenta)
-- con correo de la empresa. Las cuentas que ya existen no se tocan.
-- Si el dominio cambia, solo se modifica la línea de v_dominio.

create or replace function public.solo_correo_empresa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_dominio text := '@fastenal.com';
begin
  if new.email is null or lower(new.email) not like '%' || v_dominio then
    raise exception 'Solo se permiten correos de la empresa (%)', v_dominio;
  end if;
  return new;
end $$;

drop trigger if exists solo_correo_empresa on auth.users;
create trigger solo_correo_empresa
  before insert or update of email on auth.users
  for each row execute function public.solo_correo_empresa();
