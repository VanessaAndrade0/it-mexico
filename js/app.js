import { supabase } from "./supabase.js";
import { estado } from "./estado.js";
import { $, esc, formatoFecha } from "./util.js";
import { iniciarAuth } from "./auth.js";
import { iniciarInventario, renderInventario } from "./inventario.js";
import { iniciarMovimientos, renderMovimientos } from "./movimientos.js";
import { iniciarProveedores, renderProveedores } from "./proveedores.js";
import { iniciarTrucks, renderTrucks } from "./truck.js";
import { iniciarExcel } from "./excel.js";
import { iniciarSucursales, renderSucursales } from "./sucursales.js";
import { iniciarAgenda, renderAgenda } from "./agenda.js";
import { iniciarPendientes, renderPendientes } from "./pendientes.js";

const ROLES = { admin: "Admin", editor: "Editor", lectura: "Solo lectura", pendiente: "Pendiente" };

// Trae todo de Supabase y vuelve a dibujar las pantallas
async function recargar() {
  await cargarRol();
  if (estado.rol === "pendiente") return; // sin permiso no se pide nada

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
  seguro("Pendientes", renderPendientes);
}

// Rol de quien entró: decide qué botones se ven (la base de datos también lo revisa)
async function cargarRol() {
  const { data: sesion } = await supabase.auth.getUser();
  const email = (sesion?.user?.email || "").toLowerCase();
  const { data, error } = await supabase.from("perfiles").select("rol").eq("email", email).maybeSingle();
  // Si todavía no se ejecuta sql/10_seguridad.sql, la app sigue funcionando como antes
  estado.rol = error ? "admin" : (data?.rol || "pendiente");
  document.body.dataset.rol = estado.rol;
  $("#rolTag").textContent = ROLES[estado.rol] || "";
  $("#avisoPendiente").hidden = estado.rol !== "pendiente";
  if (estado.rol === "admin" && !error) contarPendientes();
}

async function contarPendientes() {
  const { count } = await supabase.from("perfiles").select("email", { count: "exact", head: true }).eq("rol", "pendiente");
  $("#usuariosBadge").hidden = !count;
  $("#usuariosBadge").textContent = count || "";
}

// ---------- Usuarios y bitácora (solo admin) ----------
async function abrirUsuarios() {
  const modal = $("#modal");
  const { data, error } = await supabase.from("perfiles").select("*").order("email");
  modal.classList.add("ancho");
  modal.innerHTML = `<form method="dialog" id="formUsuarios">
    <h2>Usuarios</h2>
    ${error ? `<p class="error">No se pudo cargar: ${esc(error.message)}</p>` : `
    <div class="table-wrap"><table>
      <thead><tr><th>Correo</th><th>Rol</th><th>Desde</th></tr></thead>
      <tbody>${data.map(p => `<tr>
        <td>${esc(p.email)}</td>
        <td><select data-email="${esc(p.email)}">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === p.rol ? "selected" : ""}>${v}</option>`).join("")}</select></td>
        <td class="muted">${formatoFecha(p.creado_en)}</td>
      </tr>`).join("")}</tbody>
    </table></div>`}
    <p class="error" id="errUsuarios"></p>
    <div class="row"><button class="btn" type="button" id="btnBitacora">Ver bitácora de cambios</button><button class="btn primary empuja" value="cerrar">Listo</button></div>
  </form>`;
  modal.addEventListener("close", () => modal.classList.remove("ancho"), { once: true });
  modal.showModal();

  modal.querySelector("tbody")?.addEventListener("change", async e => {
    const sel = e.target.closest("select[data-email]");
    if (!sel) return;
    const { data: hecho, error } = await supabase.from("perfiles").update({ rol: sel.value }).eq("email", sel.dataset.email).select();
    if (error || !hecho?.length) {
      $("#errUsuarios").textContent = "No se pudo cambiar: " + (error?.message || "sin permiso");
      return abrirUsuarios();
    }
    $("#errUsuarios").textContent = "";
    contarPendientes();
  });
  $("#btnBitacora").addEventListener("click", abrirBitacora);
}

async function abrirBitacora() {
  const modal = $("#modal");
  const { data, error } = await supabase.from("bitacora").select("*").order("fecha", { ascending: false }).limit(200);
  const resumen = b => {
    const d = b.antes || {};
    return esc(d.nombre || d.titulo || d.orden_compra || d.codigo || d.archivo || d.email ||
      [d.tipo, d.cantidad && `${d.cantidad} pzs`, d.sucursal, d.ticket].filter(Boolean).join(" · ") || b.registro_id || "");
  };
  const cambios = b => b.despues
    ? Object.keys(b.despues).filter(k => JSON.stringify(b.despues[k]) !== JSON.stringify(b.antes?.[k]) && !/_en$|_por$/.test(k))
        .map(k => `<div class="nota">${esc(k)}: <s>${esc(b.antes?.[k] ?? "—")}</s> → <b>${esc(b.despues[k] ?? "—")}</b></div>`).join("")
    : "";
  modal.classList.add("ancho");
  modal.innerHTML = `<form method="dialog">
    <h2>Bitácora de cambios</h2>
    <p class="ayuda">Los últimos 200 cambios y eliminaciones. Lo eliminado se guarda completo aquí, así que se puede recuperar.</p>
    ${error ? `<p class="error">No se pudo cargar: ${esc(error.message)}</p>` : `
    <div class="table-wrap"><table>
      <thead><tr><th>Fecha</th><th>Quién</th><th>Qué</th><th>Registro</th></tr></thead>
      <tbody>${data.length ? data.map(b => `<tr>
        <td>${formatoFecha(b.fecha)}</td>
        <td>${esc(b.usuario || "—")}</td>
        <td><span class="pill ${b.accion === "eliminar" ? "atrasado" : "gris"}">${b.accion === "eliminar" ? "Eliminó" : "Editó"}</span> ${esc(b.tabla)}</td>
        <td>${resumen(b)}${cambios(b)}</td>
      </tr>`).join("") : `<tr><td colspan="4" class="empty">Todavía no hay cambios registrados.</td></tr>`}</tbody>
    </table></div>`}
    <div class="row"><button class="btn" type="button" id="btnVolverUsuarios">‹ Usuarios</button><button class="btn primary empuja" value="cerrar">Listo</button></div>
  </form>`;
  if (!modal.open) modal.showModal();
  $("#btnVolverUsuarios").addEventListener("click", abrirUsuarios);
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
  boton.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  window.scrollTo({ top: 0 });
});

$("#btnUsuarios").addEventListener("click", abrirUsuarios);

seguro("Inventario", () => iniciarInventario(recargar));
seguro("Movimientos", () => iniciarMovimientos(recargar));
seguro("Proveedores", () => iniciarProveedores(recargar));
seguro("Trucks", () => iniciarTrucks(recargar));
seguro("Excel", () => iniciarExcel(recargar));
seguro("Sucursales", () => iniciarSucursales(recargar));
seguro("Agenda", () => iniciarAgenda(recargar));
seguro("Pendientes", iniciarPendientes);
iniciarAuth(recargar);