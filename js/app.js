import { supabase } from "./supabase.js";
import { estado } from "./estado.js";
import { $ } from "./util.js";
import { iniciarAuth } from "./auth.js";
import { iniciarInventario, renderInventario } from "./inventario.js";
import { iniciarMovimientos, renderMovimientos } from "./movimientos.js";
import { iniciarProveedores, renderProveedores } from "./proveedores.js";

// Trae todo de Supabase y vuelve a dibujar las pantallas
async function recargar() {
  const [art, prov, rel, mov] = await Promise.all([
    supabase.from("articulos").select("*").order("nombre"),
    supabase.from("proveedores").select("*").order("nombre"),
    supabase.from("articulo_proveedor").select("*"),
    supabase.from("movimientos").select("*, articulos(nombre)").order("fecha", { ascending: false }).limit(100),
  ]);
  estado.articulos = art.data || [];
  estado.proveedores = prov.data || [];
  estado.relaciones = rel.data || [];
  estado.movimientos = mov.data || [];

  renderInventario();
  renderMovimientos();
  renderProveedores();
}

// Cambiar de pestaña
$("#tabs").addEventListener("click", e => {
  const boton = e.target.closest("button[data-tab]");
  if (!boton) return;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b === boton));
  document.querySelectorAll("main section").forEach(s => s.hidden = s.dataset.view !== boton.dataset.tab);
});

iniciarInventario(recargar);
iniciarMovimientos(recargar);
iniciarProveedores(recargar);
iniciarAuth(recargar);
