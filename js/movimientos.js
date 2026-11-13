import { supabase } from "./supabase.js";
import { estado } from "./estado.js";
import { esc, formatoFecha, $, traerTodo, descargarExcel } from "./util.js";
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
  opciones($("#fSucursal"), unicos(m => m.sucursal).sort());
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
    (!v("#fSucursal") || m.sucursal === v("#fSucursal")) &&
    (!v("#fMetodo") || metodoDe(m) === v("#fMetodo")) &&
    (!v("#fOrigen") || (v("#fOrigen") === "historial") === !!m.historico) &&
    (!texto || [m.ticket, m.lpn, m.serie, m.solicitante, m.nota, m.orden_compra].join(" ").toLowerCase().includes(texto)));
}

// Cómo se agrupa y qué filtro se aplica al tocar un grupo
const AGRUPAR = {
  articulo: { titulo: "Artículo", clave: m => m.articulos?.nombre, filtro: "#fArticulo" },
  categoria: { titulo: "Categoría", clave: m => m.articulos?.categoria, filtro: "#fCategoria" },
  sucursal: { titulo: "Sucursal", clave: m => m.sucursal, filtro: "#fSucursal" },
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

export function iniciarMovimientos(recargar) {
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
    const movimiento = {
      tipo,
      articulo_id: $("#movArticulo").value,
      cantidad,
      ticket: $("#movTicket").value.trim().toUpperCase() || null,
      sucursal: $("#movSucursal").value.trim().toUpperCase() || null,
      solicitante: $("#movSolicitante").value.trim() || null,
      lpn: $("#movLpn").value.trim() || null,
      proveedor_id: tipo === "entrada" ? $("#movProveedor").value || null : null,
      nota: $("#movNota").value.trim() || null,
    };
    const { error } = await supabase.from("movimientos").insert(movimiento);
    if (error) { $("#movMensaje").textContent = "No se pudo registrar."; return; }

    e.target.reset();
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