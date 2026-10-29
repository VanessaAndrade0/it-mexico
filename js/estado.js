// Datos cargados de Supabase que comparten todas las pantallas
export const estado = {
  articulos: [],
  proveedores: [],
  relaciones: [], // { articulo_id, proveedor_id }
  movimientos: [],
};

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
