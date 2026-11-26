import { estado, sucursalPorCodigo } from "./estado.js";
import { esc, $, descargarExcel } from "./util.js";
import { agregarAlCarrito, tareasEnCarrito, abrirCarrito } from "./movimientos.js";

// ---------- Pendientes de ServiceNow ----------
// La lista de "My Groups Task" se copia de ServiceNow y se pega aquí.
// Se acomoda sola en columnas y se puede filtrar por todo a la vez.
// Se guarda en este navegador; no se guardan los nombres de las personas.
const CLAVE = "itmexico-pendientes";
let datos = { filas: [], vinculos: {}, actualizado: null };
let ultimoPegado = [];
let seleccion = new Set();

function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* sigue en memoria */ }
}
function leer() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || "null");
    if (g?.filas) datos = { filas: g.filas, vinculos: g.vinculos || {}, actualizado: g.actualizado || null };
  } catch { /* se empieza vacío */ }
}

// ---------- Leer lo que se pegó ----------
const RE_FECHA = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?/i;
const RE_ESTADO = /^(open|work in progress|pending|on hold|assigned|abierto|en curso|pendiente)$/i;

function leerFecha(texto) {
  const m = RE_FECHA.exec(texto);
  if (!m) return null;
  let h = Number(m[4]);
  if (m[7]) { const pm = m[7].toUpperCase() === "PM"; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  // ServiceNow la muestra como mes-día-año
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), h, Number(m[5]), Number(m[6] || 0)).toISOString();
}

// Convierte lo pegado en una lista de celdas, renglón por renglón
function celdasDe(texto, html) {
  if (html && /<t[dh][\s>]/i.test(html)) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return [...doc.querySelectorAll("tr")].flatMap(tr => [...tr.querySelectorAll("td,th")].map(td => td.textContent.replace(/\s+/g, " ").trim()));
  }
  return texto.split(/\t|\r?\n/).map(c => c.replace(/\s+/g, " ").trim());
}

function armar(cs) {
  const r = { req: cs[0].toUpperCase(), ritm: "", sctask: "", sucursal: "", item: "", cantidad: 1, estado: "", fecha: null };
  const resto = [];
  for (const c of cs.slice(1)) {
    if (!c) continue;
    if (!r.ritm && /^RITM\d+$/i.test(c)) r.ritm = c.toUpperCase();
    else if (!r.sctask && /^SCTASK\d+$/i.test(c)) r.sctask = c.toUpperCase();
    else if (!r.fecha && RE_FECHA.test(c)) r.fecha = leerFecha(c);
    else if (!r.estado && RE_ESTADO.test(c)) r.estado = c;
    else resto.push(c);
  }
  // Sucursal: el primer código de 4 o 5 letras/números en mayúsculas (el nombre de la persona va antes y se descarta)
  const iSuc = resto.findIndex(c => /^[A-Z0-9]{4,5}$/.test(c) && !/^\d+$/.test(c));
  if (iSuc >= 0) r.sucursal = resto[iSuc];
  const despues = (iSuc >= 0 ? resto.slice(iSuc + 1) : resto).filter(c => c !== r.sucursal);
  const iCant = despues.findIndex(c => /^\d{1,4}$/.test(c));
  r.cantidad = iCant >= 0 ? Math.max(1, Number(despues[iCant])) : 1;
  r.item = (iCant > 0 ? despues.slice(0, iCant) : despues.filter(c => !c.startsWith("_")).slice(0, 1)).join(" ").trim();
  return r.sctask || r.ritm ? r : null;
}

// Por si se pegó como texto con espacios (todo un renglón en una sola celda)
const RE_RENGLON = /(REQ\d+)\s+(RITM\d+)\s+(SCTASK\d+)\s+(.+?)\s+([A-Z0-9]{4,5})\s+(?:\5\s+)?(.+?)\s+(\d{1,4})\s+(\S+)\s+(Open|Work in Progress|Pending|On Hold|Assigned)\s+(\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)/g;

export function interpretar(texto, html = "") {
  const celdas = celdasDe(texto, html).filter(Boolean);
  if (celdas.some(c => /REQ\d+.*SCTASK\d+/i.test(c))) {
    return [...texto.matchAll(RE_RENGLON)].map(m => ({
      req: m[1], ritm: m[2], sctask: m[3], sucursal: m[5], item: m[6].trim(), cantidad: Number(m[7]) || 1, estado: m[9], fecha: leerFecha(m[10]),
    }));
  }
  const grupos = [];
  for (const c of celdas) {
    if (/^REQ\d+$/i.test(c)) grupos.push([c]);
    else if (grupos.length) grupos.at(-1).push(c);
  }
  return grupos.map(armar).filter(Boolean);
}

// ---------- Ligar el artículo de ServiceNow con el de IT Mexico ----------
const normal = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/^\d+\s*-\s*/, "").replace(/\bmex\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function articuloDe(item) {
  const clave = normal(item);
  if (clave in datos.vinculos) return estado.articulos.find(a => a.id === datos.vinculos[clave]) || null;
  const exacto = estado.articulos.find(a => normal(a.nombre) === clave);
  if (exacto) return exacto;
  const porSku = estado.articulos.find(a => a.sku && normal(item).split(" ").includes(normal(a.sku)));
  if (porSku) return porSku;
  const candidatos = estado.articulos.filter(a => { const n = normal(a.nombre); return n && (clave.includes(n) || n.includes(clave)); });
  return candidatos.length === 1 ? candidatos[0] : null;
}

// ¿Alcanza el stock? Se reparte del ticket más antiguo al más nuevo; lo que ya está en el carrito va primero.
function calcularAlcance(filas) {
  const enCarrito = tareasEnCarrito();
  const porArticulo = {};
  for (const f of filas) {
    f.art = articuloDe(f.item);
    f.enCarrito = enCarrito.has(f.sctask);
    if (f.art) (porArticulo[f.art.id] ||= []).push(f);
  }
  for (const lista of Object.values(porArticulo)) {
    let quedan = lista[0].art.stock;
    lista.sort((a, b) => (b.enCarrito - a.enCarrito) || String(a.fecha).localeCompare(String(b.fecha)));
    for (const f of lista) {
      f.alcanza = f.cantidad <= quedan;
      if (f.alcanza) quedan -= f.cantidad;
    }
  }
}

const dias = fecha => fecha ? Math.floor((Date.now() - new Date(fecha)) / 864e5) : null;
const fechaCorta = fecha => fecha ? new Date(fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// ---------- Pantalla ----------
function filtradas() {
  const q = $("#pnBuscar").value.trim().toUpperCase();
  const item = $("#pnArticulo").value, suc = $("#pnSucursal").value;
  const desde = $("#pnDesde").value, hasta = $("#pnHasta").value;
  const solo = $("#pnMostrar").value;
  const lista = datos.filas.filter(f =>
    (!q || [f.req, f.ritm, f.sctask].join(" ").includes(q)) &&
    (!item || f.item === item) &&
    (!suc || f.sucursal === suc) &&
    (!desde || (f.fecha && f.fecha.slice(0, 10) >= desde)) &&
    (!hasta || (f.fecha && f.fecha.slice(0, 10) <= hasta)) &&
    (!solo || (solo === "alcanza" && f.alcanza && !f.enCarrito) || (solo === "no" && f.art && !f.alcanza) ||
      (solo === "carrito" && f.enCarrito) || (solo === "sin" && !f.art)));
  const dir = $("#pnOrden").value === "nuevo" ? -1 : 1;
  return lista.sort((a, b) => dir * String(a.fecha).localeCompare(String(b.fecha)));
}

function opciones(sel, valores, todos) {
  const actual = sel.value;
  sel.innerHTML = `<option value="">${todos}</option>` + valores.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  sel.value = valores.includes(actual) ? actual : "";
}

export function renderPendientes() {
  const seccion = $("#pnTabla");
  if (!seccion) return;
  calcularAlcance(datos.filas);

  const items = [...new Set(datos.filas.map(f => f.item))].sort();
  const sucursales = [...new Set(datos.filas.map(f => f.sucursal).filter(Boolean))].sort();
  opciones($("#pnArticulo"), items, "Todos los artículos");
  opciones($("#pnSucursal"), sucursales, "Todas las sucursales");

  const filas = filtradas();
  const piezas = filas.reduce((s, f) => s + f.cantidad, 0);
  $("#pnActualizado").textContent = datos.actualizado
    ? `Lista pegada el ${new Date(datos.actualizado).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })} · ${datos.filas.length} tickets en total`
    : "Todavía no se ha pegado ninguna lista.";
  $("#pnContador").innerHTML = `<b>${filas.length}</b> tickets · <b>${piezas}</b> piezas${seleccion.size ? ` · <b>${seleccion.size}</b> seleccionados` : ""}`;

  // Resumen por artículo de lo que se ve
  const grupos = {};
  for (const f of filas) (grupos[f.item] ||= []).push(f);
  $("#pnResumen").innerHTML = Object.entries(grupos)
    .sort((a, b) => b[1].reduce((s, f) => s + f.cantidad, 0) - a[1].reduce((s, f) => s + f.cantidad, 0))
    .map(([item, lista]) => {
      const art = lista[0].art;
      const pedidas = lista.reduce((s, f) => s + f.cantidad, 0);
      const alcanzan = lista.filter(f => f.alcanza).length;
      const enCarrito = lista.filter(f => f.enCarrito).length;
      return `<div class="pn-tarjeta ${!art ? "sin" : alcanzan === lista.length ? "ok" : alcanzan ? "medio" : "nada"}">
        <b>${esc(item)}</b>
        <div><b>${pedidas}</b> pedidas en ${lista.length} ticket(s)${art ? ` · stock <b>${art.stock}</b>` : ""}</div>
        ${art ? `<div>${alcanzan === lista.length ? "Alcanza para todos" : alcanzan ? `Alcanza para <b>${alcanzan}</b> de ${lista.length}, empezando por los más antiguos` : "No alcanza para ninguno"}${enCarrito ? ` · ${enCarrito} en el carrito` : ""}</div>` : ""}
        <label class="nota">En IT Mexico es:
          <select data-vincular="${esc(normal(item))}"><option value="">— Elige el artículo —</option>${[...estado.articulos].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(a =>
            `<option value="${a.id}" ${art?.id === a.id ? "selected" : ""}>${esc(a.nombre)}</option>`).join("")}</select>
        </label>
        ${art ? `<button class="btn small solo-editor" type="button" data-elegir-alcanzan="${esc(item)}">Seleccionar los que alcanzan</button>` : ""}
      </div>`;
    }).join("");

  seccion.innerHTML = `<table>
    <thead><tr><th><input type="checkbox" id="pnTodos" title="Seleccionar todos los que se ven"></th><th>Abierto</th><th>REQ / RITM</th><th>Tarea</th><th>Sucursal</th><th>Artículo</th><th class="num">Cant.</th><th>Stock</th></tr></thead>
    <tbody>${filas.length ? filas.map(f => {
      const s = sucursalPorCodigo(f.sucursal);
      const d = dias(f.fecha);
      return `<tr class="${seleccion.has(f.sctask) ? "elegido" : ""}">
        <td><input type="checkbox" data-sel="${esc(f.sctask)}" ${seleccion.has(f.sctask) ? "checked" : ""} ${f.enCarrito ? "disabled" : ""}></td>
        <td>${fechaCorta(f.fecha)}${d !== null ? `<div class="nota ${d > 30 ? "tarde" : ""}">hace ${d} día${d === 1 ? "" : "s"}</div>` : ""}</td>
        <td><b>${esc(f.req)}</b><div class="nota">${esc(f.ritm)}</div></td>
        <td>${esc(f.sctask)}</td>
        <td><b>${esc(f.sucursal || "—")}</b>${s?.nombre ? `<div class="nota">${esc(s.nombre)}</div>` : ""}</td>
        <td>${esc(f.item)}</td>
        <td class="num">${f.cantidad}</td>
        <td>${f.enCarrito ? '<span class="pill gris">En carrito</span>'
          : !f.art ? '<span class="pill gris">Sin ligar</span>'
          : f.alcanza ? '<span class="pill recibido">Alcanza</span>' : '<span class="pill atrasado">No alcanza</span>'}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="8" class="empty">${datos.filas.length ? "Ningún ticket con esos filtros." : "Pega la lista de ServiceNow para empezar."}</td></tr>`}</tbody>
  </table>`;

  $("#pnMandar").disabled = !seleccion.size;
  $("#pnMandar").textContent = seleccion.size ? `Mandar ${seleccion.size} al carrito` : "Mandar al carrito";
}

// Vista previa tipo hoja de cálculo de lo que se pegó
function dibujarHoja() {
  const cols = ["REQ", "RITM", "Tarea", "Sucursal", "Artículo", "Cant.", "Estado", "Abierto"];
  const filas = ultimoPegado.length ? ultimoPegado : Array.from({ length: 4 }, () => null);
  $("#pnPegar").placeholder = ultimoPegado.length ? "" : "Haz clic aquí y pega con Ctrl + V";
  $("#pnHojaTabla").innerHTML = `<table class="hoja-tabla">
    <thead><tr><th></th>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>${filas.map((f, i) => `<tr><th>${i + 1}</th>${f
      ? [f.req, f.ritm, f.sctask, f.sucursal, f.item, f.cantidad, f.estado, fechaCorta(f.fecha)].map(v => `<td>${esc(v ?? "")}</td>`).join("")
      : cols.map(() => "<td></td>").join("")}</tr>`).join("")}</tbody>
  </table>`;
}

function pegar(texto, html) {
  const nuevos = interpretar(texto, html);
  if (!nuevos.length) {
    $("#pnMensaje").className = "lectura mal";
    $("#pnMensaje").innerHTML = "No se reconoció ningún ticket. Copia los renglones completos de la lista (que incluyan REQ, RITM y SCTASK).";
    $("#pnMensaje").hidden = false;
    return;
  }
  const clave = f => f.sctask || f.ritm;
  const antes = new Map(datos.filas.map(f => [clave(f), f]));
  const llegaron = new Set(nuevos.map(clave));
  const nuevosN = nuevos.filter(f => !antes.has(clave(f))).length;
  const completa = $("#pnCompleta").checked;
  const quitados = completa ? datos.filas.filter(f => !llegaron.has(clave(f))).length : 0;
  const unidos = new Map(completa ? [] : datos.filas.map(f => [clave(f), f]));
  for (const f of nuevos) unidos.set(clave(f), { req: f.req, ritm: f.ritm, sctask: f.sctask, sucursal: f.sucursal, item: f.item, cantidad: f.cantidad, estado: f.estado, fecha: f.fecha });
  datos.filas = [...unidos.values()];
  datos.actualizado = new Date().toISOString();
  for (const s of [...seleccion]) if (!unidos.has(s)) seleccion.delete(s);
  guardar();
  ultimoPegado = nuevos.slice(0, 200);
  dibujarHoja();
  $("#pnMensaje").className = "lectura ok";
  $("#pnMensaje").innerHTML = `Se reconocieron <b>${nuevos.length}</b> tickets: ${nuevosN} nuevos, ${nuevos.length - nuevosN} ya estaban${completa ? `, ${quitados} ya no aparecen y se quitaron` : ""}.`;
  $("#pnMensaje").hidden = false;
  renderPendientes();
}

export function iniciarPendientes() {
  leer();
  dibujarHoja();

  // La hoja: un cuadro de texto encima de la tabla que recibe el Ctrl + V
  $("#pnPegar").addEventListener("paste", e => {
    e.preventDefault();
    pegar(e.clipboardData.getData("text/plain"), e.clipboardData.getData("text/html"));
    e.target.value = "";
  });
  $("#pnPegar").addEventListener("input", e => { if (e.target.value.trim()) { pegar(e.target.value, ""); e.target.value = ""; } });

  for (const id of ["#pnBuscar", "#pnArticulo", "#pnSucursal", "#pnDesde", "#pnHasta", "#pnOrden", "#pnMostrar"]) {
    $(id).addEventListener(id === "#pnBuscar" ? "input" : "change", renderPendientes);
  }
  $("#pnLimpiar").addEventListener("click", () => {
    for (const id of ["#pnBuscar", "#pnArticulo", "#pnSucursal", "#pnDesde", "#pnHasta", "#pnMostrar"]) $(id).value = "";
    $("#pnOrden").value = "viejo";
    renderPendientes();
  });

  $("#pnResumen").addEventListener("change", e => {
    const sel = e.target.closest("[data-vincular]");
    if (!sel) return;
    if (sel.value) datos.vinculos[sel.dataset.vincular] = sel.value;
    else delete datos.vinculos[sel.dataset.vincular];
    guardar();
    renderPendientes();
  });
  $("#pnResumen").addEventListener("click", e => {
    const b = e.target.closest("[data-elegir-alcanzan]");
    if (!b) return;
    seleccion = new Set(filtradas().filter(f => f.item === b.dataset.elegirAlcanzan && f.alcanza && !f.enCarrito).map(f => f.sctask));
    renderPendientes();
  });

  $("#pnTabla").addEventListener("change", e => {
    if (e.target.id === "pnTodos") {
      for (const f of filtradas()) if (!f.enCarrito) e.target.checked ? seleccion.add(f.sctask) : seleccion.delete(f.sctask);
    } else {
      const c = e.target.closest("[data-sel]");
      if (!c) return;
      c.checked ? seleccion.add(c.dataset.sel) : seleccion.delete(c.dataset.sel);
    }
    renderPendientes();
  });

  $("#pnMandar").addEventListener("click", () => {
    const elegidos = datos.filas.filter(f => seleccion.has(f.sctask));
    const arts = new Set(elegidos.map(f => f.art?.id));
    const aviso = (texto, bien) => {
      $("#pnMensaje").className = `lectura ${bien ? "ok" : "mal"}`;
      $("#pnMensaje").innerHTML = texto;
      $("#pnMensaje").hidden = false;
      $("#pnMensaje").scrollIntoView({ block: "nearest" });
    };
    if (arts.has(undefined)) return aviso("Hay tickets sin ligar a un artículo de IT Mexico. Elige el artículo en el resumen de arriba.", false);
    if (arts.size > 1) return aviso("El carrito es de un solo artículo a la vez. Selecciona tickets del mismo artículo (usa el filtro de artículo).", false);
    const r = agregarAlCarrito([...arts][0], elegidos);
    if (r.error) return aviso(r.error, false);
    seleccion.clear();
    renderPendientes();
    aviso(`Se agregaron <b>${r.agregados}</b> ticket(s) al carrito${r.repetidos ? ` (${r.repetidos} ya estaban)` : ""}. <button class="btn small" type="button" id="pnIrCarrito">Abrir carrito</button>`, true);
    $("#pnIrCarrito").addEventListener("click", abrirCarrito);
  });
  $("#btnVerCarrito").addEventListener("click", abrirCarrito);
  $("#modal").addEventListener("close", renderPendientes); // al cerrar el carrito se actualiza "En carrito"

  $("#pnDescargar").addEventListener("click", () => {
    descargarExcel(`IT Mexico - Pendientes ${new Date().toLocaleDateString("es-MX").replaceAll("/", "-")}.xlsx`, {
      Pendientes: filtradas().map(f => ({
        Abierto: f.fecha ? new Date(f.fecha).toLocaleString("es-MX") : "", "Días": dias(f.fecha) ?? "", REQ: f.req, RITM: f.ritm, Tarea: f.sctask,
        Sucursal: f.sucursal, "Código de 4": sucursalPorCodigo(f.sucursal)?.codigo_corto || "", Artículo: f.item, Cantidad: f.cantidad,
        Stock: f.enCarrito ? "En carrito" : !f.art ? "Sin ligar" : f.alcanza ? "Alcanza" : "No alcanza",
      })),
    });
  });

  $("#pnVaciar").addEventListener("click", e => {
    const b = e.currentTarget;
    if (!b.dataset.confirmar) { b.dataset.confirmar = "1"; b.textContent = "¿Seguro? Se borra la lista"; return; }
    delete b.dataset.confirmar;
    b.textContent = "Vaciar lista";
    datos.filas = [];
    datos.actualizado = null;
    seleccion.clear();
    ultimoPegado = [];
    guardar();
    dibujarHoja();
    $("#pnMensaje").hidden = true;
    renderPendientes();
  });

  renderPendientes();
}