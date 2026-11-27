-- IT Mexico - Marca, modelo y costos (datos del archivo maestro)
-- Ejecuta este archivo completo en Supabase > SQL Editor > New query (solo una vez)

alter table articulos
  add column if not exists marca text,
  add column if not exists modelo text;

alter table movimientos
  add column if not exists costo_usd numeric(12, 2),   -- costo de la pieza
  add column if not exists costo_envio numeric(12, 2), -- costo del flete (Freight Cost)
  add column if not exists orden_compra text;          -- PO
