import { supabase } from "./supabase.js";
import { estado } from "./estado.js";
import { $ } from "./util.js";
import { iniciarAuth } from "./auth.js";
import { iniciarInventario, renderInventario } from "./inventario.js";
import { iniciarMovimientos, renderMovimientos } from "./movimientos.js";
import { iniciarProveedores, renderProveedores } from "./proveedores.js";
import { iniciarTrucks, renderTrucks } from "./truck.js";
import { iniciarExcel } from "./excel.js";
import { iniciarSucursales, renderSucursales } from "./sucursales.js";
import { iniciarAgenda, renderAgenda } from "./agenda.js";

// Trae todo de Supabase y vuelve a dibujar las pantallas
async function recargar() {
  const [art, prov, rel, mov, trk, suc] = await Promise.all([
    supabase.from("articulos").select("*").order("nombre"),
    supabase.from("proveedores").select("*").order("nombre"),
    supabase.from("articulo_proveedor").select("*"),
    supabase.from("movimientos").select("*, articulos(nombre)").order("fecha", { ascending: false }).limit(100),
    supabase.from("recepciones").select("*, proveedores(nombre), recepcion_articulos(id, articulo_id, cantidad, articulos(nombre))").order("fecha", { ascending: false }).limit(200),
    supabase.from("sucursales").select("*").order("codigo"),
  ]);
  estado.articulos = art.data || [];
  estado.proveedores = prov.data || [];
  estado.relaciones = rel.data || [];
  estado.movimientos = mov.data || [];
  estado.trucks = trk.data || [];
  estado.sucursales = suc.data || [];

  seguro("Inventario", renderInventario);
  seguro("Movimientos", renderMovimientos);
  seguro("Proveedores", renderProveedores);
  seguro("Trucks", renderTrucks);
  seguro("Sucursales", renderSucursales);
  seguro("Agenda", renderAgenda);
}

// Si una pantalla falla, las demás siguen funcionando y se avisa cuál fue
function seguro(nombre, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`Error en ${nombre}:`, error);
    let aviso = document.querySelector("#avisoError");
    if (!aviso) {
      aviso = document.createElement("div");
      aviso.id = "avisoError";
      aviso.className = "alert critico wrap";
      document.body.prepend(aviso);
    }
    aviso.innerHTML += `<div><b>No cargó ${nombre}:</b> ${error.message}. Revisa que index.html y los archivos de js sean los últimos.</div>`;
  }
}

// Cambiar de pestaña
$("#tabs").addEventListener("click", e => {
  const boton = e.target.closest("button[data-tab]");
  if (!boton) return;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b === boton));
  document.querySelectorAll("main section").forEach(s => s.hidden = s.dataset.view !== boton.dataset.tab);
});

seguro("Inventario", () => iniciarInventario(recargar));
seguro("Movimientos", () => iniciarMovimientos(recargar));
seguro("Proveedores", () => iniciarProveedores(recargar));
seguro("Trucks", () => iniciarTrucks(recargar));
seguro("Excel", () => iniciarExcel(recargar));
seguro("Sucursales", () => iniciarSucursales(recargar));
seguro("Agenda", () => iniciarAgenda(recargar));
iniciarAuth(recargar);