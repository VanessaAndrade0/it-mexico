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

let miCorreo = "";
const ROLES = { admin: "Admin", editor: "Editor", lectura: "Solo lectura", pendiente: "Pendiente" };

// Trae todo de Supabase y vuelve a dibujar las pantallas
async function recargar() {
  await cargarRol();
  if (estado.rol === "pendiente") return; // sin permiso no se pide nada
  conectarTiempoReal();

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
  miCorreo = email;
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
  anunciarPresencia();
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

// ---------- Tiempo real: cambios de los demás y quién está conectado ----------
// Supabase avisa cuando alguien guarda algo; la pantalla se vuelve a cargar sola
// y sale un aviso abajo. También se ve quién tiene la app abierta y en qué pestaña.
let canal = null;
let esperaRecarga = null;

const PESTANAS = { inventario: "Inventario", movimientos: "Movimientos", pendientes: "Pendientes", trucks: "Trucks", sucursales: "Sucursales", proveedores: "Proveedores", excel: "Excel", agenda: "Agenda" };
const nombreCorto = correo => {
  const base = String(correo || "").split("@")[0].split(/[._-]/)[0];
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Alguien";
};
const pestanaActual = () => document.querySelector("#tabs button.active")?.dataset.tab || "inventario";

function conectarTiempoReal() {
  if (canal || !miCorreo) return;
  canal = supabase.channel("itmexico", { config: { presence: { key: miCorreo } } });

  canal.on("postgres_changes", { event: "*", schema: "public" }, cambio => {
    if (["bitacora", "perfiles", "importaciones"].includes(cambio.table)) return;
    const r = cambio.new && Object.keys(cambio.new).length ? cambio.new : cambio.old || {};
    const quien = r.registrado_por || r.editado_por || r.recibido_por || r.creado_por || "";
    if (quien.toLowerCase() !== miCorreo) {
      const texto = describirCambio(cambio, r, quien);
      if (texto) avisar(texto);
    }
    // Varios cambios seguidos (por ejemplo un lote de 20 salidas) se juntan en una sola recarga
    clearTimeout(esperaRecarga);
    esperaRecarga = setTimeout(recargarEnSilencio, 1200);
  });

  canal.on("presence", { event: "sync" }, dibujarConectados);

  canal.subscribe(estadoCanal => {
    if (estadoCanal === "SUBSCRIBED") anunciarPresencia();
  });
}

async function recargarEnSilencio() {
  // Si alguien está escribiendo en una ventana, se espera a que la cierre para no moverle la pantalla
  if ($("#modal").open && document.activeElement?.closest("#modal")) {
    esperaRecarga = setTimeout(recargarEnSilencio, 3000);
    return;
  }
  await recargar();
}

function anunciarPresencia() {
  if (!canal) return;
  canal.track({ correo: miCorreo, pestana: pestanaActual(), desde: new Date().toISOString() }).catch(() => {});
}

function dibujarConectados() {
  const estadoPresencia = canal.presenceState();
  const otros = Object.entries(estadoPresencia)
    .filter(([correo]) => correo !== miCorreo)
    .map(([correo, sesiones]) => ({ correo, pestana: sesiones.at(-1)?.pestana }));
  $("#enLinea").innerHTML = otros.map(o => `<span class="en-linea" title="${esc(o.correo)} · en ${esc(PESTANAS[o.pestana] || o.pestana || "la app")}">
      <span class="punto"></span>${esc(nombreCorto(o.correo))}<span class="donde">· ${esc(PESTANAS[o.pestana] || "")}</span></span>`).join("");
}

function describirCambio({ table, eventType }, r, quien) {
  const q = nombreCorto(quien);
  const art = id => estado.articulos.find(a => a.id === id)?.nombre || "un artículo";
  if (table === "movimientos" && eventType === "INSERT") {
    const tipo = { salida: "una salida", entrada: "una entrada", ajuste: "un ajuste" }[r.tipo] || "un movimiento";
    return `<b>${esc(q)}</b> registró ${tipo} de ${Math.abs(r.cantidad || 0)} ${esc(art(r.articulo_id))}${r.sucursal ? ` para ${esc(r.sucursal)}` : ""}`;
  }
  if (table === "movimientos" && eventType === "UPDATE") return r.anulado ? `<b>${esc(q)}</b> anuló un movimiento` : `<b>${esc(q)}</b> editó un movimiento`;
  if (table === "articulos") {
    if (eventType === "INSERT") return `<b>${esc(q)}</b> agregó el artículo ${esc(r.nombre || "")}`;
    if (eventType === "DELETE") return "Se eliminó un artículo";
    return ""; // los cambios de stock ya se avisan con el movimiento
  }
  if (table === "recepciones") {
    if (eventType === "INSERT") return `<b>${esc(q)}</b> registró un truck${r.orden_compra ? ` (PO ${esc(r.orden_compra)})` : ""}`;
    if (eventType === "UPDATE" && r.estado === "recibido") return `<b>${esc(nombreCorto(r.recibido_por || quien))}</b> recibió un truck${r.orden_compra ? ` (PO ${esc(r.orden_compra)})` : ""}`;
    if (eventType === "DELETE") return "Se eliminó un truck";
    return "";
  }
  if (table === "tareas") {
    if (eventType === "INSERT") return `<b>${esc(q)}</b> agregó la tarea “${esc(r.titulo || "")}”`;
    if (eventType === "UPDATE" && r.estado === "hecho") return `Se terminó la tarea “${esc(r.titulo || "")}”`;
    return "";
  }
  if (table === "tarea_comentarios" && eventType === "INSERT") return `<b>${esc(q)}</b> dejó un recado en una tarea`;
  if (table === "eventos" && eventType === "INSERT") return `<b>${esc(q)}</b> agregó “${esc(r.titulo || "")}” al calendario`;
  if (table === "sucursales" && eventType === "INSERT") return `<b>${esc(q)}</b> agregó la sucursal ${esc(r.codigo || "")}`;
  if (table === "proveedores" && eventType === "INSERT") return `<b>${esc(q)}</b> agregó el proveedor ${esc(r.nombre || "")}`;
  return "";
}

function avisar(html) {
  const caja = $("#avisos");
  const aviso = document.createElement("div");
  aviso.className = "aviso";
  aviso.innerHTML = html;
  caja.append(aviso);
  while (caja.children.length > 3) caja.firstElementChild.remove();
  setTimeout(() => { aviso.classList.add("sale"); setTimeout(() => aviso.remove(), 400); }, 6000);
}
