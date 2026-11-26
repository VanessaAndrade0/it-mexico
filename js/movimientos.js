import { supabase } from "./supabase.js";
import { estado, sucursalPorCodigo, codigoSucursal } from "./estado.js";
import { esc, formatoFecha, $, traerTodo, descargarExcel, pitido, copiar } from "./util.js";
import { MESES, numero, opciones, agrupar, tablaGrupos } from "./filtros.js";

// Convierte una fecha de Supabase al formato que usa <input type="datetime-local">
function aFechaLocal(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- Historial: todos los movimientos, con filtros y agrupación ----------

let todos = [];          // todos los movimientos de la base
let pendiente = true;    // hay que volver a cargar cuando se abra la pestaña
let pagina = 0;
const POR_PAGINA = 100;

const visible = () => !document.querySelector('section[data-view="movimientos"]').hidden;
const fechaLocal = iso => new Date(iso);
const anioDe = m => String(fechaLocal(m.fecha).getFullYear());
const mesDe = m => fechaLocal(m.fecha).getMonth() + 1;
// "Self pick", "Self-pick" y "Self Pick" son lo mismo
const metodoDe = m => m.metodo_envio ? m.metodo_envio.toLowerCase().replace(/[-\s]+/g, " ").replace(/\b\w/g, l => l.toUpperCase()) : "";
const piezasDe = m => Math.abs(m.cantidad);
const diaDe = m => { const d = fechaLocal(m.fecha); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
// El historial importado solo trae el día, no la hora
const fechaMov = m => m.historico
  ? fechaLocal(m.fecha).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
  : formatoFecha(m.fecha);

let porId = new Map(); // renglones que se ven, para Editar y Eliminar

// Junta en un renglón las piezas iguales: mismo día, artículo, ticket, sucursal y LPN, sin número de serie
function juntar(lista) {
  const grupos = new Map();
  for (const m of lista) {
    const k = m.serie ? m.id : [diaDe(m), m.tipo, m.articulo_id, m.ticket, m.sucursal, m.lpn, m.metodo_envio, m.solicitante, m.nota, m.historico, m.anulado].join("|");
    const g = grupos.get(k);
    if (g) { g.cantidad += m.cantidad; g.ids.push(m.id); }
    else grupos.set(k, { ...m, ids: [m.id] });
  }
  return [...grupos.values()];
}

export function renderMovimientos() {
  // Llenar selects del formulario con los datos actuales
  const actual = $("#movArticulo").value;
  $("#movArticulo").innerHTML = `<option value="">— Elige artículo —</option>` +
    estado.articulos.map(a => `<option value="${a.id}">${esc(a.nombre)} (stock ${a.stock})</option>`).join("");
  $("#movArticulo").value = actual;

  $("#movProveedor").innerHTML = `<option value="">— Sin proveedor —</option>` +
    estado.proveedores.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");

  // El historial completo solo se carga cuando la pestaña está abierta
  pendiente = true;
  if (visible()) cargarHistorial();
}

async function cargarHistorial() {
  pendiente = false;
  $("#contadorHistorial").textContent = "Cargando historial…";
  try {
    todos = await traerTodo(() => supabase.from("movimientos")
      .select("*, articulos(nombre, categoria, marca)")
      .order("fecha", { ascending: false }).order("id"));
    llenarFiltros();
    pintarHistorial();
  } catch (error) {
    console.error(error);
    $("#contadorHistorial").textContent = "No se pudo cargar el historial: " + error.message;
  }
}

function llenarFiltros() {
  const unicos = f => [...new Set(todos.map(f).filter(Boolean))];
  opciones($("#fAnio"), unicos(anioDe).sort().reverse());
  opciones($("#fMes"), MESES.map((m, i) => ({ valor: i + 1, texto: m })));
  opciones($("#fCategoria"), unicos(m => m.articulos?.categoria).sort());
  opciones($("#fArticulo"), unicos(m => m.articulos?.nombre).sort((a, b) => a.localeCompare(b)));
  opciones($("#fSucursal"), unicos(m => codigoSucursal(m.sucursal)).sort());
  opciones($("#fMetodo"), unicos(metodoDe).sort());
}

function filtrados() {
  const v = id => $(id).value;
  const texto = v("#fBuscar").trim().toLowerCase();
  return todos.filter(m =>
    (!v("#fAnio") || anioDe(m) === v("#fAnio")) &&
    (!v("#fMes") || mesDe(m) === Number(v("#fMes"))) &&
    (!v("#fTipo") || m.tipo === v("#fTipo")) &&
    (!v("#fCategoria") || m.articulos?.categoria === v("#fCategoria")) &&
    (!v("#fArticulo") || m.articulos?.nombre === v("#fArticulo")) &&
    (!v("#fSucursal") || codigoSucursal(m.sucursal) === v("#fSucursal")) &&
    (!v("#fMetodo") || metodoDe(m) === v("#fMetodo")) &&
    (!v("#fOrigen") || (v("#fOrigen") === "historial") === !!m.historico) &&
    (!texto || [m.ticket, m.lpn, m.serie, m.solicitante, m.nota, m.orden_compra].join(" ").toLowerCase().includes(texto)));
}

// Cómo se agrupa y qué filtro se aplica al tocar un grupo
const AGRUPAR = {
  articulo: { titulo: "Artículo", clave: m => m.articulos?.nombre, filtro: "#fArticulo" },
  categoria: { titulo: "Categoría", clave: m => m.articulos?.categoria, filtro: "#fCategoria" },
  sucursal: { titulo: "Sucursal", clave: m => codigoSucursal(m.sucursal), filtro: "#fSucursal" },
  anio: { titulo: "Año", clave: anioDe, filtro: "#fAnio", porNombre: true },
  mes: { titulo: "Mes", clave: m => `${anioDe(m)}-${String(mesDe(m)).padStart(2, "0")} ${MESES[mesDe(m) - 1]}`, porNombre: true },
  metodo: { titulo: "Método de envío", clave: metodoDe, filtro: "#fMetodo" },
  tipo: { titulo: "Tipo", clave: m => m.tipo, filtro: "#fTipo" },
  ticket: { titulo: "Ticket", clave: m => m.ticket, filtro: "#fBuscar" },
};

function pintarHistorial() {
  const lista = filtrados();
  const piezas = lista.reduce((s, m) => s + piezasDe(m), 0);
  const filas = $("#fJuntar").checked ? juntar(lista) : lista.map(m => ({ ...m, ids: [m.id] }));
  porId = new Map(filas.map(f => [f.id, f]));
  $("#contadorHistorial").innerHTML = `<b>${numero(piezas)}</b> piezas en <b>${numero(filas.length)}</b> renglones${lista.length !== todos.length ? ` <span class="muted">(filtrado de ${numero(todos.length)} movimientos)</span>` : ""}`;

  const modo = $("#gAgrupar").value;
  if (modo) {
    const g = AGRUPAR[modo];
    $("#tablaMovimientos").innerHTML = tablaGrupos(agrupar(lista, g.clave, piezasDe, g.porNombre), { titulo: g.titulo, registros: "Movimientos", cantidad: "Piezas" });
    $("#paginacion").hidden = true;
    return;
  }

  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  pagina = Math.min(pagina, paginas - 1);
  const desde = pagina * POR_PAGINA;
  const parte = filas.slice(desde, desde + POR_PAGINA);

  $("#tablaMovimientos").innerHTML = `<table>
    <thead><tr><th class="num">#</th><th>Fecha</th><th>Tipo</th><th>Artículo</th><th class="num">Cant.</th><th>Ticket</th><th>Sucursal</th><th>Pidió</th><th>LPN</th><th>Registró</th><th></th></tr></thead>
    <tbody>${parte.length ? parte.map((m, i) => `<tr class="${m.anulado ? "anulado" : ""}">
        <td class="num muted">${numero(desde + i + 1)}</td>
        <td>${fechaMov(m)}</td>
        <td>${m.tipo}</td>
        <td>${esc(m.articulos?.nombre || "")}${m.serie ? `<div class="nota">S/N ${esc(m.serie)}</div>` : ""}${m.nota ? `<div class="nota">${esc(m.nota)}</div>` : ""}</td>
        <td class="num">${m.tipo === "salida" ? "−" : ""}${m.cantidad}${m.ids.length > 1 ? `<div class="nota">${m.ids.length} piezas</div>` : ""}</td>
        <td>${esc(m.ticket || "")}</td>
        <td>${esc(m.sucursal || "")}</td>
        <td>${esc(m.solicitante || "")}</td>
        <td>${esc(m.lpn || "")}</td>
        <td>${m.historico ? `<span class="pill gris">Historial</span>` : esc(m.registrado_por || "")}${m.editado_por ? `<div class="nota">Editado por ${esc(m.editado_por)}</div>` : ""}</td>
        <td class="acciones">${m.anulado ? `<span class="etiqueta">Anulado</span>` : `<button class="btn small" data-editar="${m.id}">Editar</button>`}<button class="btn small danger" data-eliminar="${m.id}">Eliminar</button></td>
      </tr>`).join("") : `<tr><td colspan="11" class="empty">${todos.length ? "Nada coincide con los filtros." : "Sin movimientos todavía."}</td></tr>`}</tbody>
  </table>`;

  $("#paginacion").hidden = paginas <= 1;
  $("#paginaTexto").textContent = `${numero(desde + 1)}–${numero(Math.min(desde + POR_PAGINA, filas.length))} de ${numero(filas.length)} · página ${pagina + 1} de ${paginas}`;
  $("#btnAnterior").disabled = pagina === 0;
  $("#btnSiguiente").disabled = pagina >= paginas - 1;
}

function descargarFiltrado() {
  const lista = filtrados();
  const modo = $("#gAgrupar").value;
  try {
    if (modo) {
      const g = AGRUPAR[modo];
      descargarExcel(`IT Mexico - Historial por ${g.titulo.toLowerCase()}.xlsx`, {
        [g.titulo]: agrupar(lista, g.clave, piezasDe, g.porNombre).map((f, i) => ({ "#": i + 1, [g.titulo]: f.grupo, Movimientos: f.registros, Piezas: f.cantidad })),
      });
    } else {
      descargarExcel("IT Mexico - Historial filtrado.xlsx", {
        Movimientos: [...porId.values()].map((m, i) => ({
          "#": i + 1, Fecha: fechaMov(m), Tipo: m.tipo, Artículo: m.articulos?.nombre || "", Categoría: m.articulos?.categoria || "",
          Cantidad: m.cantidad, Ticket: m.ticket || "", Sucursal: m.sucursal || "", "Quién pidió": m.solicitante || "", LPN: m.lpn || "",
          "Número de serie": m.serie || "", "Método de envío": m.metodo_envio || "", "Costo de envío (USD)": m.costo_envio ?? "",
          Registró: m.historico ? "Historial importado" : m.registrado_por || "", Nota: m.nota || "",
        })),
      });
    }
  } catch (error) {
    alert(error.message);
  }
}

// Al tocar un grupo se filtra por él y se regresa a la lista
function verGrupo(valor) {
  const modo = $("#gAgrupar").value;
  const g = AGRUPAR[modo];
  if (modo === "mes") {
    const [anio, mes] = valor.split(" ")[0].split("-");
    $("#fAnio").value = anio;
    $("#fMes").value = String(Number(mes));
  } else if (g?.filtro && valor !== "(vacío)") {
    $(g.filtro).value = valor;
  }
  $("#gAgrupar").value = "";
  pagina = 0;
  pintarHistorial();
}

// Muestra el código de 4 y el nombre de la sucursal mientras se escribe
function infoSucursal() {
  const valor = $("#movSucursal").value.trim();
  const s = sucursalPorCodigo(valor);
  $("#movSucursalInfo").className = "nota" + (valor && !s ? " tarde" : "");
  $("#movSucursalInfo").textContent = !valor ? ""
    : s ? [s.codigo !== valor.toUpperCase() && `Se guarda como ${s.codigo}`, s.codigo_corto ? `Código de 4: ${s.codigo_corto}` : "Sin código de 4", s.nombre].filter(Boolean).join(" · ")
    : "No está en el catálogo de sucursales";
}

let recargarApp = () => {};

export function iniciarMovimientos(recargar) {
  recargarApp = recargar;
  $("#movSucursal").addEventListener("input", infoSucursal);
  $("#btnLote").addEventListener("click", () => abrirLote(recargar));
  // Filtros del historial
  const filtros = ["#fAnio", "#fMes", "#fTipo", "#fCategoria", "#fArticulo", "#fSucursal", "#fMetodo", "#fOrigen", "#gAgrupar"];
  $("#fJuntar").addEventListener("change", () => { pagina = 0; pintarHistorial(); });
  filtros.forEach(id => $(id).addEventListener("change", () => { pagina = 0; pintarHistorial(); }));
  $("#fBuscar").addEventListener("input", () => { pagina = 0; pintarHistorial(); });
  $("#btnLimpiarFiltros").addEventListener("click", () => {
    [...filtros, "#fBuscar"].forEach(id => { $(id).value = ""; });
    pagina = 0;
    pintarHistorial();
  });
  $("#btnAnterior").addEventListener("click", () => { pagina--; pintarHistorial(); $("#contadorHistorial").scrollIntoView({ block: "start" }); });
  $("#btnSiguiente").addEventListener("click", () => { pagina++; pintarHistorial(); $("#contadorHistorial").scrollIntoView({ block: "start" }); });
  $("#btnDescargarHistorial").addEventListener("click", descargarFiltrado);
  document.querySelector('#tabs [data-tab="movimientos"]').addEventListener("click", () => { if (pendiente) cargarHistorial(); });

  // El proveedor solo aplica en entradas
  $("#movTipo").addEventListener("change", () => {
    $("#movProveedorWrap").hidden = $("#movTipo").value !== "entrada";
  });

  $("#formMovimiento").addEventListener("submit", async e => {
    e.preventDefault();
    const tipo = $("#movTipo").value;
    const cantidad = Math.round(Number($("#movCantidad").value));
    if (!cantidad || (tipo !== "ajuste" && cantidad < 0)) {
      $("#movMensaje").textContent = "La cantidad no es válida.";
      return;
    }
    const ticket = $("#movTicket").value.trim().toUpperCase();
    if (tipo === "salida" && !ticket) {
      $("#movMensaje").textContent = "Escribe el número de ticket: toda salida necesita ticket.";
      $("#movTicket").focus();
      return;
    }
    const movimiento = {
      tipo,
      articulo_id: $("#movArticulo").value,
      cantidad,
      ticket: ticket || null,
      sucursal: codigoSucursal($("#movSucursal").value) || null,
      solicitante: $("#movSolicitante").value.trim() || null,
      lpn: $("#movLpn").value.trim() || null,
      proveedor_id: tipo === "entrada" ? $("#movProveedor").value || null : null,
      nota: $("#movNota").value.trim() || null,
    };
    const { error } = await supabase.from("movimientos").insert(movimiento);
    if (error) { $("#movMensaje").textContent = "No se pudo registrar."; return; }

    e.target.reset();
    $("#movSucursalInfo").textContent = "";
    $("#movProveedorWrap").hidden = true;
    $("#movMensaje").textContent = "Movimiento registrado.";
    recargar();
  });

  // Botones Editar y Eliminar del historial
  $("#tablaMovimientos").addEventListener("click", e => {
    const editar = e.target.closest("[data-editar]");
    const eliminar = e.target.closest("[data-eliminar]");
    const grupo = e.target.closest("tr[data-grupo]");
    if (editar) abrirEditar(porId.get(editar.dataset.editar), recargar);
    if (eliminar) abrirEliminar(porId.get(eliminar.dataset.eliminar), recargar);
    if (grupo) verGrupo(grupo.dataset.grupo);
  });
}

function abrirEditar(m, recargar) {
  if (!m) return;
  const modal = $("#modal");
  modal.innerHTML = `<form method="dialog" id="formEditarMov">
    <h2>Editar movimiento</h2>
    <p class="muted">${m.tipo} de ${m.cantidad} · ${esc(m.articulos?.nombre || "")}.${m.ids?.length > 1 ? ` <b>Los cambios se aplican a las ${m.ids.length} piezas de este renglón.</b>` : ""} El artículo y la cantidad no se editan: si están mal, elimina este movimiento y registra uno nuevo.</p>
    <label>Fecha <input name="fecha" type="datetime-local" required value="${aFechaLocal(m.fecha)}"></label>
    <label>Ticket (REQ) <input name="ticket" value="${esc(m.ticket || "")}"></label>
    <label>Sucursal <input name="sucursal" maxlength="6" value="${esc(m.sucursal || "")}"></label>
    <label>Quién lo pidió <input name="solicitante" value="${esc(m.solicitante || "")}"></label>
    <label>LPN <input name="lpn" value="${esc(m.lpn || "")}"></label>
    <label>Nota <input name="nota" value="${esc(m.nota || "")}"></label>
    <p class="error" id="errEditarMov"></p>
    <div class="row"><button class="btn primary" value="guardar">Guardar</button><button class="btn" value="cancelar" formnovalidate>Cancelar</button></div>
  </form>`;
  modal.showModal();

  $("#formEditarMov").addEventListener("submit", async e => {
    if (e.submitter?.value !== "guardar") return;
    e.preventDefault();
    const f = new FormData(e.target);
    const cambios = {
      fecha: new Date(f.get("fecha")).toISOString(),
      ticket: f.get("ticket").trim().toUpperCase() || null,
      sucursal: f.get("sucursal").trim().toUpperCase() || null,
      solicitante: f.get("solicitante").trim() || null,
      lpn: f.get("lpn").trim() || null,
      nota: f.get("nota").trim() || null,
    };
    const { error } = await supabase.from("movimientos").update(cambios).in("id", m.ids || [m.id]);
    if (error) { $("#errEditarMov").textContent = "No se pudo guardar: " + error.message; return; }
    modal.close();
    recargar();
  });
}

function abrirEliminar(m, recargar) {
  if (!m) return;
  const modal = $("#modal");
  const cambio = m.tipo === "salida" ? m.cantidad : -m.cantidad;
  const signo = cambio > 0 ? "+" : "−";
  modal.innerHTML = `<form method="dialog" id="formEliminarMov">
    <h2>Eliminar movimiento</h2>
    <p><b>${m.tipo} de ${m.cantidad}</b> · ${esc(m.articulos?.nombre || "")} · ${fechaMov(m)}${m.ids?.length > 1 ? ` · <b>se eliminan las ${m.ids.length} piezas de este renglón</b>` : ""}</p>
    <p class="muted">${m.historico
      ? "Es un registro del historial importado, así que el stock no cambia."
      : m.anulado
      ? "Este movimiento ya estaba anulado, así que el stock no cambia."
      : `El stock se corrige solo (${signo}${Math.abs(cambio)}).`} Se borra del historial y no se puede recuperar.</p>
    <p class="error" id="errEliminarMov"></p>
    <div class="row"><button class="btn danger" value="eliminar">Eliminar</button><button class="btn" value="cancelar" formnovalidate>Cancelar</button></div>
  </form>`;
  modal.showModal();

  $("#formEliminarMov").addEventListener("submit", async e => {
    if (e.submitter?.value !== "eliminar") return;
    e.preventDefault();
    const { error } = await supabase.from("movimientos").delete().in("id", m.ids || [m.id]);
    if (error) { $("#errEliminarMov").textContent = "No se pudo eliminar: " + error.message; return; }
    modal.close();
    recargar();
  });
}

// ---------- Salida por lote: el carrito del día ----------
// 1) Se capturan los tickets del carrito con sus piezas, sucursal y LPN.
// 2) Se escanean las series con el Zebra y cada una cae en el siguiente lugar libre.
// 3) Queda una hoja por ticket con botones de copiar para pasarlo a ServiceNow.
// 4) Se registran todas las salidas de una vez, una por serie.
const CLAVE_LOTE = "itmexico-lote";
let lote = null;

const loteNuevo = () => ({ articulo_id: "", tickets: [], registrado: false });
const totalPiezas = () => lote.tickets.reduce((s, t) => s + t.piezas, 0);
const totalSeries = () => lote.tickets.reduce((s, t) => s + t.series.length, 0);
const siguienteLugar = () => lote.tickets.find(t => t.series.length < t.piezas) || null;

function guardarLote() {
  try { localStorage.setItem(CLAVE_LOTE, JSON.stringify(lote)); } catch { /* sigue en memoria */ }
}

function leerLote() {
  try { lote = JSON.parse(localStorage.getItem(CLAVE_LOTE) || "null"); } catch { lote = null; }
  if (!lote?.tickets) lote = loteNuevo();
}

// Una línea pegada de Excel: TICKET, PIEZAS, SUCURSAL, LPN (separados por tabulador, coma o punto y coma)
function ticketDeLinea(linea) {
  const c = linea.split(/\t|;|,/).map(x => x.trim());
  if (!c[0] || /^ticket|^req$/i.test(c[0])) return null;
  return {
    ticket: c[0].toUpperCase(),
    piezas: Math.max(1, Math.round(Number(c[1])) || 1),
    sucursal: codigoSucursal(c[2] || ""),
    lpn: (c[3] || "").trim(),
    series: [],
    listo: false,
  };
}

function abrirLote(recargar) {
  leerLote();
  const modal = $("#modal");
  modal.classList.add("ancho");
  const articulos = [...estado.articulos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  modal.innerHTML = `<form method="dialog" id="formLote" class="lote">
    <h2>Salida por lote (carrito)</h2>
    <p class="ayuda">Lo que captures aquí se guarda en este navegador hasta que termines el lote, aunque cierres la ventana.</p>

    <h3>1. Artículo y tickets del carrito</h3>
    <label>Artículo
      <select id="ltArticulo"><option value="">Elige el artículo…</option>${articulos.map(a =>
        `<option value="${a.id}">${esc(a.nombre)}${a.sku ? ` · ${esc(a.sku)}` : ""} (stock ${a.stock})</option>`).join("")}</select>
    </label>
    <div class="lote-ticket">
      <label>Ticket <input id="ltTicket" class="mayus" autocomplete="off"></label>
      <label>Piezas <input id="ltPiezas" type="number" min="1" value="1"></label>
      <label>Sucursal <input id="ltSucursal" class="mayus" maxlength="5" list="listaSucursales" placeholder="5 o 4"></label>
      <label>LPN <input id="ltLpn" autocomplete="off"></label>
      <button class="btn" type="button" id="ltAgregar">Agregar</button>
    </div>
    <details class="lote-pegar">
      <summary>Pegar varios tickets desde Excel</summary>
      <p class="ayuda">Copia en Excel las columnas <b>Ticket, Piezas, Sucursal, LPN</b> (en ese orden) y pégalas aquí. Piezas, sucursal y LPN pueden ir vacíos.</p>
      <textarea id="ltPegado" rows="4"></textarea>
      <button class="btn small" type="button" id="ltPegar">Agregar estos tickets</button>
    </details>

    <h3>2. Escanear series</h3>
    <div id="ltSiguiente" class="lectura"></div>
    <label>Número de serie <input id="ltSerie" autocomplete="off" placeholder="Escanea aquí"></label>
    <div id="ltAviso" class="lectura" hidden></div>

    <h3>3. Tickets <span id="ltConteo" class="muted"></span></h3>
    <div id="ltTickets" class="lote-lista"></div>

    <details class="lote-oper" id="ltOper">
      <summary>Lista para hacer los LPN en OPER1</summary>
      <p class="ayuda">Una caja por sucursal para este material. En OPER1: nombre ↵ código de 4 ↵ etiquetas ↵ <b>B</b> ↵ <b>Y</b> ↵ <b>N</b>.
        Al escanear el LPN en un ticket, los demás tickets de esa sucursal toman el mismo.</p>
      <label>Nombre en OPER1 (máx. 8) <input id="ltOperNombre" maxlength="8" class="mayus"></label>
      <div class="table-wrap" id="ltOperLista"></div>
    </details>

    <p class="error" id="errLote"></p>
    <div class="row">
      <button class="btn" type="button" id="ltDescargar">Descargar Excel</button>
      <button class="btn" type="button" id="ltNuevo">Terminar / empezar otro lote</button>
      <button class="btn primary empuja" type="button" id="ltRegistrar"></button>
      <button class="btn" value="cerrar">Cerrar</button>
    </div>
  </form>`;
  modal.addEventListener("close", () => modal.classList.remove("ancho"), { once: true });
  modal.showModal();

  const serie = $("#ltSerie");
  const aviso = (texto, bien) => {
    $("#ltAviso").hidden = false;
    $("#ltAviso").className = `lectura ${bien ? "ok" : "mal"}`;
    $("#ltAviso").innerHTML = texto;
  };
  $("#ltArticulo").value = lote.articulo_id;

  const dibujar = () => {
    const bloqueado = lote.registrado;
    const sig = siguienteLugar();
    const total = totalPiezas(), hechas = totalSeries();
    $("#ltSiguiente").className = `lectura ${sig ? "siguiente" : hechas ? "ok" : ""}`;
    $("#ltSiguiente").innerHTML = bloqueado ? "Este lote ya se registró. Termina de pasarlo a ServiceNow y luego empieza otro."
      : sig ? `Siguiente pieza para <b>${esc(sig.ticket)}</b> (${sig.series.length + 1} de ${sig.piezas})${sig.sucursal ? ` · ${esc(sig.sucursal)}` : ""}${sig.lpn ? ` · LPN ${esc(sig.lpn)}` : ""}`
      : total ? "Todas las piezas tienen serie." : "Agrega los tickets del carrito para empezar.";
    serie.disabled = bloqueado || !sig;
    $("#ltConteo").textContent = total ? `· ${lote.tickets.length} tickets · ${hechas} de ${total} series · ${lote.tickets.filter(t => t.listo).length} listos en ServiceNow` : "";

    $("#ltTickets").innerHTML = lote.tickets.map((t, i) => {
      const s = sucursalPorCodigo(t.sucursal);
      const completo = t.series.length === t.piezas;
      return `<div class="lote-hoja ${t.listo ? "listo" : completo ? "completo" : ""}">
        <div class="row">
          <b class="lote-req">${esc(t.ticket)}</b> <button class="btn small" type="button" data-copiar="${esc(t.ticket)}">Copiar</button>
          <span class="pill ${completo ? "recibido" : "camino"}">${t.series.length} de ${t.piezas}</span>
          ${bloqueado ? "" : `<button class="btn small quitar empuja" type="button" data-quitar-ticket="${i}" title="Quitar ticket">Quitar</button>`}
        </div>
        <div class="nota">Sucursal <b>${esc(t.sucursal || "—")}</b>${s?.nombre ? ` · ${esc(s.nombre)}` : t.sucursal ? ' <span class="tarde">no está en el catálogo</span>' : ""}</div>
        ${t.ritm ? `<div class="row">RITM <b>${esc(t.ritm)}</b> <button class="btn small" type="button" data-copiar="${esc(t.ritm)}">Copiar</button></div>` : ""}
        ${t.sctask ? `<div class="row">Tarea <b>${esc(t.sctask)}</b> <button class="btn small" type="button" data-copiar="${esc(t.sctask)}">Copiar</button></div>` : ""}
        <div class="row">LPN ${bloqueado ? `<b>${esc(t.lpn || "—")}</b>` : `<input class="lpn-input" data-lpn="${i}" value="${esc(t.lpn || "")}" placeholder="Escanea el LPN" autocomplete="off">`}
          ${t.lpn ? `<button class="btn small" type="button" data-copiar="${esc(t.lpn)}">Copiar LPN</button>` : ""}</div>
        <ol class="lote-series">${t.series.map((x, j) => `<li><code>${esc(x)}</code>
          <button class="btn small" type="button" data-copiar="${esc(x)}">Copiar</button>
          ${bloqueado ? "" : `<button class="btn small quitar" type="button" data-quitar-serie="${i}:${j}" title="Quitar para volver a escanear">×</button>`}</li>`).join("")}</ol>
        <label class="check"><input type="checkbox" data-listo="${i}" ${t.listo ? "checked" : ""}> Ya lo capturé en ServiceNow (LPN en comentarios y series en las tareas)</label>
      </div>`;
    }).join("") || '<p class="empty">Sin tickets todavía.</p>';
    dibujarOper();

    const listos = lote.tickets.length && !siguienteLugar();
    $("#ltRegistrar").disabled = bloqueado || !listos;
    $("#ltRegistrar").textContent = bloqueado ? "Registrado ✓" : listos ? `Registrar ${hechas} salida(s)` : `Faltan ${total - hechas} serie(s)`;
    delete $("#ltRegistrar").dataset.confirmar;
    for (const el of modal.querySelectorAll(".lote-ticket input, .lote-ticket button, #ltArticulo, .lote-pegar textarea, .lote-pegar button")) el.disabled = bloqueado;
  };

  // Lista para hacer las etiquetas en OPER1: una caja por sucursal para este material
  const dibujarOper = () => {
    const art = estado.articulos.find(a => a.id === lote.articulo_id);
    const porSucursal = {};
    for (const t of lote.tickets) (porSucursal[t.sucursal || "—"] ||= []).push(t);
    const grupos = Object.entries(porSucursal);
    $("#ltOperNombre").value = nombreOper(art);
    $("#ltOperLista").innerHTML = grupos.length ? `<table>
      <thead><tr><th>Nombre</th><th>Código de 4</th><th class="num">Etiquetas</th><th>Sucursal</th><th>Tickets</th><th>LPN</th></tr></thead>
      <tbody>${grupos.map(([suc, lista]) => {
        const s = sucursalPorCodigo(suc);
        const lpns = [...new Set(lista.map(t => t.lpn).filter(Boolean))];
        return `<tr class="${lpns.length ? "hecho" : ""}">
          <td><code>${esc(nombreOper(art))}</code></td>
          <td><b>${esc(s?.codigo_corto || "Falta")}</b></td>
          <td class="num">1</td>
          <td>${esc(suc)}${s?.nombre ? `<div class="nota">${esc(s.nombre)}</div>` : ""}</td>
          <td>${lista.map(t => esc(t.ticket)).join("<br>")}</td>
          <td>${lpns.length ? lpns.map(esc).join("<br>") : '<span class="muted">pendiente</span>'}</td>
        </tr>`;
      }).join("")}</tbody></table>` : '<p class="empty">Agrega tickets para ver la lista.</p>';
  };

  const agregarTicket = t => {
    if (!t) return false;
    if (lote.tickets.some(x => (t.sctask && x.sctask === t.sctask) || (!t.sctask && !x.sctask && x.ticket === t.ticket))) { aviso(`El ticket <b>${esc(t.ticket)}</b> ya está en el lote.`, false); return false; }
    lote.tickets.push(t);
    return true;
  };

  $("#ltArticulo").addEventListener("change", e => { lote.articulo_id = e.target.value; guardarLote(); });

  const agregarDelFormulario = () => {
    const ticket = $("#ltTicket").value.trim().toUpperCase();
    if (!ticket) { $("#ltTicket").focus(); return; }
    if (agregarTicket({
      ticket, piezas: Math.max(1, Math.round(Number($("#ltPiezas").value)) || 1),
      sucursal: codigoSucursal($("#ltSucursal").value), lpn: $("#ltLpn").value.trim(), series: [], listo: false,
    })) {
      ["#ltTicket", "#ltSucursal", "#ltLpn"].forEach(id => { $(id).value = ""; });
      $("#ltPiezas").value = 1;
      $("#ltAviso").hidden = true;
      guardarLote();
      dibujar();
    }
    $("#ltTicket").focus();
  };
  $("#ltAgregar").addEventListener("click", agregarDelFormulario);
  // Enter en cualquier campo del ticket lo agrega (el Zebra también da Enter al escanear el LPN)
  modal.querySelector(".lote-ticket").addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const orden = ["ltTicket", "ltPiezas", "ltSucursal", "ltLpn"];
    const i = orden.indexOf(e.target.id);
    if (i >= 0 && i < orden.length - 1 && !e.target.value.trim()) return;
    if (e.target.id === "ltLpn" || !$("#ltTicket").value.trim()) agregarDelFormulario();
    else $("#" + orden[i + 1]).focus();
  });

  $("#ltPegar").addEventListener("click", () => {
    const lineas = $("#ltPegado").value.split(/\r?\n/);
    let n = 0;
    for (const l of lineas) if (agregarTicket(ticketDeLinea(l))) n++;
    $("#ltPegado").value = "";
    guardarLote();
    dibujar();
    if (n) aviso(`Se agregaron ${n} ticket(s).`, true);
    serie.focus();
  });

  // Lectura de una serie
  serie.addEventListener("keydown", async e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const valor = serie.value.trim().toUpperCase();
    serie.value = "";
    if (!valor) return;
    if (!lote.articulo_id) { pitido(false); aviso("Primero elige el artículo.", false); return $("#ltArticulo").focus(); }
    const sig = siguienteLugar();
    if (!sig) return;
    const repetida = lote.tickets.find(t => t.series.includes(valor));
    if (repetida) { pitido(false); return aviso(`La serie <b>${esc(valor)}</b> ya está en el ticket ${esc(repetida.ticket)}.`, false); }
    // ¿Ya salió antes?
    serie.disabled = true;
    const { data: previas } = await supabase.from("movimientos").select("ticket, fecha, anulado").eq("serie", valor).eq("tipo", "salida");
    serie.disabled = false;
    const salida = (previas || []).find(p => !p.anulado);
    if (salida) {
      pitido(false);
      serie.focus();
      return aviso(`La serie <b>${esc(valor)}</b> ya salió en el ticket ${esc(salida.ticket || "sin ticket")} (${formatoFecha(salida.fecha)}). Revisa la pieza.`, false);
    }
    sig.series.push(valor);
    guardarLote();
    pitido(true);
    aviso(`<b>${esc(valor)}</b> → ticket <b>${esc(sig.ticket)}</b> (${sig.series.length} de ${sig.piezas})`, true);
    dibujar();
    serie.focus();
  });

  // Botones dentro de la lista de tickets
  $("#ltTickets").addEventListener("click", async e => {
    const c = e.target.closest("[data-copiar]");
    if (c) {
      const ok = await copiar(c.dataset.copiar);
      const antes = c.textContent;
      c.textContent = ok ? "Copiado ✓" : "No se pudo";
      setTimeout(() => { c.textContent = antes; }, 1200);
      return;
    }
    const qs = e.target.closest("[data-quitar-serie]");
    if (qs) {
      const [i, j] = qs.dataset.quitarSerie.split(":").map(Number);
      lote.tickets[i].series.splice(j, 1);
      guardarLote(); dibujar(); serie.focus();
      return;
    }
    const qt = e.target.closest("[data-quitar-ticket]");
    if (qt) {
      if (!qt.dataset.confirmar) { qt.dataset.confirmar = "1"; qt.textContent = "¿Quitar?"; return; }
      lote.tickets.splice(Number(qt.dataset.quitarTicket), 1);
      guardarLote(); dibujar();
    }
  });
  // LPN escrito o escaneado en la tarjeta. Si otros tickets de la misma sucursal no tienen LPN, van en la misma caja.
  const guardarLpn = input => {
    const i = Number(input.dataset.lpn);
    const valor = input.value.trim();
    const t = lote.tickets[i];
    if (t.lpn === valor) return false;
    t.lpn = valor;
    if (valor) for (const x of lote.tickets) if (x !== t && !x.lpn && x.sucursal && x.sucursal === t.sucursal) x.lpn = valor;
    guardarLote();
    return true;
  };
  $("#ltTickets").addEventListener("keydown", e => {
    const input = e.target.closest("[data-lpn]");
    if (!input || e.key !== "Enter") return;
    e.preventDefault();
    guardarLpn(input);
    dibujar();
    const sig = modal.querySelector(".lpn-input:placeholder-shown");
    (sig || serie).focus();
  });
  $("#ltTickets").addEventListener("focusout", e => {
    const input = e.target.closest("[data-lpn]");
    if (input && guardarLpn(input)) dibujar();
  });
  $("#ltOperNombre").addEventListener("change", e => {
    const art = estado.articulos.find(a => a.id === lote.articulo_id);
    if (art) guardarNombreOper(art, e.target.value);
    dibujar();
  });

  $("#ltTickets").addEventListener("change", e => {
    const l = e.target.closest("[data-listo]");
    if (!l) return;
    lote.tickets[Number(l.dataset.listo)].listo = l.checked;
    guardarLote(); dibujar();
  });

  $("#ltDescargar").addEventListener("click", () => {
    try {
      const art = estado.articulos.find(a => a.id === lote.articulo_id);
      descargarExcel(`IT Mexico - Lote ${new Date().toLocaleDateString("es-MX").replaceAll("/", "-")}.xlsx`, {
        Lote: lote.tickets.flatMap(t => Array.from({ length: t.piezas }, (_, j) => ({
          Ticket: t.ticket, Pieza: `${j + 1} de ${t.piezas}`, Sucursal: t.sucursal || "", LPN: t.lpn || "",
          Artículo: art?.nombre || "", "Número de serie": t.series[j] || "", "En ServiceNow": t.listo ? "Sí" : "No",
        }))),
      });
    } catch (error) { $("#errLote").textContent = error.message; }
  });

  $("#ltNuevo").addEventListener("click", e => {
    const b = e.currentTarget;
    const pendientes = lote.tickets.length && (!lote.registrado || lote.tickets.some(t => !t.listo));
    if (pendientes && !b.dataset.confirmar) {
      b.dataset.confirmar = "1";
      b.textContent = lote.registrado ? "Hay tickets sin marcar en ServiceNow, ¿borrar?" : "El lote no se ha registrado, ¿borrar?";
      return;
    }
    const articulo = lote.articulo_id;
    lote = loteNuevo();
    lote.articulo_id = articulo;
    guardarLote();
    delete b.dataset.confirmar;
    b.textContent = "Terminar / empezar otro lote";
    $("#ltAviso").hidden = true;
    dibujar();
    $("#ltTicket").focus();
  });

  $("#ltRegistrar").addEventListener("click", async e => {
    const b = e.currentTarget;
    $("#errLote").textContent = "";
    const art = estado.articulos.find(a => a.id === lote.articulo_id);
    if (!art) { $("#errLote").textContent = "Elige el artículo."; return; }
    const total = totalSeries();
    if (!b.dataset.confirmar) {
      b.dataset.confirmar = "1";
      b.textContent = art.stock < total ? `El stock es ${art.stock} y salen ${total}: ¿confirmar?` : `Confirmar ${total} salida(s) de ${art.nombre}`;
      return;
    }
    b.disabled = true;
    const filas = lote.tickets.flatMap(t => t.series.map(s => ({
      tipo: "salida", articulo_id: art.id, cantidad: 1, serie: s,
      ticket: t.ticket, sucursal: t.sucursal || null, lpn: t.lpn || null,
      nota: [t.ritm, t.sctask].filter(Boolean).join(" · ") || null,
    })));
    const { error } = await supabase.from("movimientos").insert(filas);
    if (error) { $("#errLote").textContent = "No se pudo registrar: " + error.message; b.disabled = false; delete b.dataset.confirmar; return; }
    lote.registrado = true;
    guardarLote();
    aviso(`Se registraron ${filas.length} salidas. El stock ya se descontó.`, true);
    dibujar();
    recargar();
  });

  dibujar();
  (lote.tickets.length ? serie : $("#ltTicket")).focus();
}

// Nombre corto (máx. 8) que se escribe en OPER1 para cada artículo; se recuerda en este navegador
const CLAVE_OPER = "itmexico-nombres-oper";
function nombresOper() {
  try { return JSON.parse(localStorage.getItem(CLAVE_OPER) || "{}"); } catch { return {}; }
}
function nombreOper(art) {
  if (!art) return "";
  return nombresOper()[art.id] || String(art.sku || art.nombre).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}
function guardarNombreOper(art, nombre) {
  const todos = nombresOper();
  todos[art.id] = String(nombre).toUpperCase().replace(/\s/g, "").slice(0, 8);
  try { localStorage.setItem(CLAVE_OPER, JSON.stringify(todos)); } catch { /* sin almacenamiento */ }
}

// Desde Pendientes: agrega tickets al carrito. Regresa cuántos entraron o un mensaje de por qué no.
export function agregarAlCarrito(articuloId, tickets) {
  leerLote();
  if (lote.registrado) return { error: "El carrito actual ya se registró. Ábrelo y dale a “Terminar / empezar otro lote” primero." };
  if (lote.tickets.length && lote.articulo_id && lote.articulo_id !== articuloId) {
    const actual = estado.articulos.find(a => a.id === lote.articulo_id);
    return { error: `El carrito tiene tickets de ${actual?.nombre || "otro artículo"}. Termínalo o vacíalo antes de agregar otro artículo.` };
  }
  lote.articulo_id = articuloId;
  let agregados = 0, repetidos = 0;
  for (const t of tickets) {
    if (lote.tickets.some(x => x.sctask && x.sctask === t.sctask)) { repetidos++; continue; }
    lote.tickets.push({ ticket: t.req, ritm: t.ritm, sctask: t.sctask, piezas: t.cantidad, sucursal: codigoSucursal(t.sucursal), lpn: "", series: [], listo: false });
    agregados++;
  }
  guardarLote();
  return { agregados, repetidos };
}

// Tickets que ya están en el carrito (para marcarlos en Pendientes)
export function tareasEnCarrito() {
  leerLote();
  return new Set(lote.tickets.map(t => t.sctask).filter(Boolean));
}

export function abrirCarrito() {
  abrirLote(recargarApp);
}