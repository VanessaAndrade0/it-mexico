// Datos cargados de Supabase que comparten todas las pantallas
export const estado = {
  articulos: [],
  proveedores: [],
  relaciones: [], // { articulo_id, proveedor_id }
  movimientos: [],
  trucks: [], // recepciones con sus artículos
  sucursales: [], // catálogo: codigo (5) y codigo_corto (4)
  rol: null, // admin, editor, lectura o pendiente (tabla perfiles)
};

// Busca una sucursal por cualquiera de sus dos códigos
export function sucursalPorCodigo(codigo) {
  const c = String(codigo || "").trim().toUpperCase();
  if (!c) return null;
  return estado.sucursales.find(s => s.codigo === c || s.codigo_corto === c) || null;
}

// Código de 5 con el que se identifica la sucursal (si se escribió el de 4, se convierte)
export function codigoSucursal(codigo) {
  const c = String(codigo || "").trim().toUpperCase();
  return sucursalPorCodigo(c)?.codigo || c;
}

export function proveedoresDe(articuloId) {
  const ids = estado.relaciones.filter(r => r.articulo_id === articuloId).map(r => r.proveedor_id);
  return estado.proveedores.filter(p => ids.includes(p.id));
}

export function articulosDe(proveedorId) {
  const ids = estado.relaciones.filter(r => r.proveedor_id === proveedorId).map(r => r.articulo_id);
  return estado.articulos.filter(a => ids.includes(a.id));
}

export function bajoMinimo() {
  return estado.articulos.filter(a => a.minimo > 0 && a.stock <= a.minimo);
}