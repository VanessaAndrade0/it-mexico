import { supabase } from "./supabase.js";
import { estado } from "./estado.js";
import { esc, formatoFecha, $ } from "./util.js";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS_AVISO = 2; // avisar cuando falten 2 días o menos para la llegada estimada

// ---------- Fechas ("2026-11-07"), sin pasar por la zona horaria ----------

function fechaCorta(fecha) {
  if (!fecha) return "—";
  const [a, m, d] = fecha.split("-");
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a}`;
}

function hoy() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Días de la fecha a a la fecha b (b - a)
function diasEntre(a, b) {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

const dias = n => `${n} ${Math.abs(n) === 1 ? "día" : "días"}`;

// ---------- Datos de cada truck ----------

const lineasDe = t => t.recepcion_articulos || [];
const piezasDe = t => lineasDe(t).reduce((suma, l) => suma + l.cantidad, 0);
const nombreDe = t => t.orden_compra ? `OC ${t.orden_compra}` : `truck ${t.truck}`;

// recibido | atrasado | pronto | en_camino
function situacion(t) {
  if (t.estado === "recibido") return { tipo: "recibido" };
  if (!t.fecha_estimada) return { tipo: "en_camino" };
  const faltan = diasEntre(hoy(), t.fecha_estimada);
  if (faltan < 0) return { tipo: "atrasado", dias: -faltan };
  if (faltan <= DIAS_AVISO) return { tipo: "pronto", dias: faltan };
  return { tipo: "en_camino", dias: faltan };
}

function etiquetaEstado(t) {
  const s = situacion(t);
  if (s.tipo === "recibido") return `<span class="pill recibido">Recibido</span><div class="nota">${esc(t.recibido_por || "")}</div>`;
  if (s.tipo === "atrasado") return `<span class="pill atrasado">Atrasado ${dias(s.dias)}</span>`;
  if (s.tipo === "pronto") return `<span class="pill camino">${s.dias === 0 ? "Llega hoy" : s.dias === 1 ? "Llega mañana" : `Llega en ${dias(s.dias)}`}</span>`;
  return `<span class="pill gris">En camino</span>`;
}

function resumenArticulos(t) {
  const lineas = lineasDe(t);
  const texto = lineas.slice(0, 3).map(l => `${esc(l.articulos?.nombre || "")} ×${l.cantidad}`).join(", ");
  return (lineas.length > 3 ? `${texto} y ${lineas.length - 3} más` : texto) || "—";
}

function celdaLlegada(t) {
  if (t.estado === "recibido") {
    return `${fechaCorta(t.fecha)}${t.fecha_estimada ? `<div class="nota">Estimada ${fechaCorta(t.fecha_estimada)}</div>` : ""}`;
  }
  return t.fecha_estimada ? `<span class="muted">Estimada</span> ${fechaCorta(t.fecha_estimada)}` : `<span class="muted">Sin fecha estimada</span>`;
}

function celdaDias(t) {
  if (!t.fecha_orden) return `<span class="muted">—</span>`;
  if (t.estado !== "recibido") return `<span class="muted">Lleva ${dias(diasEntre(t.fecha_orden, hoy()))}</span>`;
  const total = diasEntre(t.fecha_orden, t.fecha);
  let detalle = "";
  if (t.fecha_estimada) {
    const retraso = diasEntre(t.fecha_estimada, t.fecha);
    detalle = retraso > 0 ? `<div class="nota tarde">${dias(retraso)} tarde</div>`
      : retraso < 0 ? `<div class="nota">${dias(-retraso)} antes</div>`
      : `<div class="nota">A tiempo</div>`;
  }
  return `<b>${dias(total)}</b>${detalle}`;
}

// ---------- Pantalla ----------

function renderAlertas() {
  const avisos = estado.trucks
    .map(t => ({ t, s: situacion(t) }))
    .filter(({ s }) => s.tipo === "atrasado" || s.tipo === "pronto")
    .sort((a, b) => a.t.fecha_estimada.localeCompare(b.t.fecha_estimada));

  $("#alertasTrucks").innerHTML = avisos.map(({ t, s }) => {
    const que = `<b>${esc(nombreDe(t))}</b>${t.proveedores?.nombre ? ` de ${esc(t.proveedores.nombre)}` : ""}: ${resumenArticulos(t)}`;
    return s.tipo === "atrasado"
      ? `<div class="alert critico">Atrasado ${dias(s.dias)} · ${que}. Se esperaba el ${fechaCorta(t.fecha_estimada)}.</div>`
      : `<div class="alert">${s.dias === 0 ? "Llega hoy" : s.dias === 1 ? "Llega mañana" : `Llega en ${dias(s.dias)}`} · ${que}.</div>`;
  }).join("");

  const atrasados = avisos.filter(a => a.s.tipo === "atrasado").length;
  const pronto = avisos.length - atrasados;

  // Aviso también en la pantalla de Inventario, que es la que se ve al entrar
  const partes = [];
  if (atrasados) partes.push(`<b>${atrasados}</b> ${atrasados === 1 ? "truck atrasado" : "trucks atrasados"}`);
  if (pronto) partes.push(`<b>${pronto}</b> ${pronto === 1 ? "truck llega" : "trucks llegan"} en los próximos ${DIAS_AVISO} días`);
  $("#alertaTrucksInicio").hidden = !avisos.length;
  $("#alertaTrucksInicio").className = atrasados ? "alert critico" : "alert";
  $("#alertaTrucksInicio").innerHTML = `${partes.join(" y ")}. <button class="btn small" data-ir-trucks>Ver trucks</button>`;
  $("#trucksBadge").hidden = !avisos.length;
  $("#trucksBadge").textContent = avisos.length;
  $("#trucksBadge").classList.toggle("info", !atrasados);
}

function renderEntregas() {
  const grupos = {};
  for (const t of estado.trucks) {
    if (t.estado !== "recibido" || !t.fecha_orden || !t.fecha) continue;
    const nombre = t.proveedores?.nombre || "Sin proveedor";
    (grupos[nombre] ||= []).push(t);
  }

  const filas = Object.entries(grupos).map(([nombre, lista]) => {
    const tiempos = lista.map(t => diasEntre(t.fecha_orden, t.fecha));
    const conEstimada = lista.filter(t => t.fecha_estimada);
    const aTiempo = conEstimada.filter(t => t.fecha <= t.fecha_estimada).length;
    return {
      nombre,
      cantidad: lista.length,
      promedio: tiempos.reduce((a, b) => a + b, 0) / tiempos.length,
      min: Math.min(...tiempos),
      max: Math.max(...tiempos),
      tiempos,
      aTiempo: conEstimada.length ? `${aTiempo} de ${conEstimada.length} (${Math.round(aTiempo / conEstimada.length * 100)}%)` : "—",
    };
  }).sort((a, b) => a.promedio - b.promedio);

  $("#tablaEntregas").innerHTML = filas.length
    ? filas.map(f => `<tr>
        <td><b>${esc(f.nombre)}</b></td>
        <td class="num">${f.cantidad}</td>
        <td class="num"><b>${f.promedio.toFixed(1)} días</b></td>
        <td class="num">${dias(f.min)}</td>
        <td class="num">${dias(f.max)}</td>
        <td class="num">${f.aTiempo}</td>
      </tr>`).join("")
    : `<tr><td colspan="6" class="empty">Aparecerá cuando reciban trucks que tengan fecha de orden.</td></tr>`;

  renderGrafica(filas);
}

// Escala "bonita" para el eje: pasos de 1, 2, 5, 10, 20, 50...
function pasoEje(maximo) {
  const bruto = Math.max(1, maximo) / 5;
  const base = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 5, 10].map(m => m * base).find(p => p >= bruto);
}

// Gráfica por proveedor: cada punto chico es un truck, la barra va del más rápido al más lento
// y el punto grande es el promedio
function renderGrafica(filas) {
  const caja = $("#graficaEntregas");
  caja.hidden = !filas.length;
  if (!filas.length) { caja.innerHTML = ""; return; }

  const maximo = Math.max(...filas.map(f => f.max));
  const paso = pasoEje(maximo);
  const tope = Math.ceil(maximo / paso) * paso || paso;
  const pos = v => `${(v / tope) * 100}%`;
  const marcas = [];
  for (let v = 0; v <= tope; v += paso) marcas.push(v);
  const lineas = marcas.map(v => `<i class="guia" style="left:${pos(v)}"></i>`).join("");

  const filasHtml = filas.map(f => `<div class="fila-entrega">
      <span class="prov" title="${esc(f.nombre)}">${esc(f.nombre)}</span>
      <div class="pista">${lineas}
        <i class="rango" style="left:${pos(f.min)};width:calc(${pos(f.max)} - ${pos(f.min)})"></i>
        ${f.tiempos.map(t => `<i class="punto" style="left:${pos(t)}" title="${t} días"></i>`).join("")}
        <i class="punto grande" style="left:${pos(f.promedio)}" title="Promedio ${f.promedio.toFixed(1)} días"></i>
      </div>
      <b class="valor">${f.promedio.toFixed(1)} días</b>
    </div>`).join("");

  caja.innerHTML = `<div class="grafica-entregas" role="img" aria-label="Días de entrega promedio por proveedor">
      ${filasHtml}
      <div class="fila-entrega eje"><span></span><div class="pista">${marcas.map(v => `<span class="marca" style="left:${pos(v)}">${v}</span>`).join("")}</div><span></span></div>
      <p class="eje-titulo">Días desde la orden de compra hasta la llegada</p>
    </div>
    <p class="leyenda"><span><i class="punto grande"></i> Promedio</span><span><i class="punto"></i> Cada truck</span><span><i class="rango"></i> Del más rápido al más lento</span></p>`;
}

export function renderTrucks() {
  const q = $("#buscarTruck").value.trim().toLowerCase();
  const filtro = $("#filtroTruck").value;

  const lista = estado.trucks.filter(t => {
    const s = situacion(t).tipo;
    const pasaFiltro = !filtro
      || (filtro === "recibido" && s === "recibido")
      || (filtro === "en_camino" && s !== "recibido")
      || (filtro === "atrasado" && s === "atrasado");
    const texto = [t.orden_compra, t.truck, t.lpn, t.proveedores?.nombre, t.notas, ...lineasDe(t).map(l => l.articulos?.nombre)].join(" ").toLowerCase();
    return pasaFiltro && (!q || texto.includes(q));
  });

  $("#tablaTrucks").innerHTML = lista.length
    ? lista.map(t => `<tr class="clic" data-id="${t.id}">
        <td><b>${esc(t.orden_compra || "—")}</b>${t.fecha_orden ? `<div class="nota">Ordenado ${fechaCorta(t.fecha_orden)}</div>` : ""}</td>
        <td>${esc(t.truck || "—")}${t.lpn ? `<div class="nota">LPN ${esc(t.lpn)}</div>` : ""}</td>
        <td>${esc(t.proveedores?.nombre || "—")}</td>
        <td>${resumenArticulos(t)}<div class="nota">${piezasDe(t)} piezas</div></td>
        <td>${celdaLlegada(t)}</td>
        <td class="num">${celdaDias(t)}</td>
        <td>${etiquetaEstado(t)}</td>
        <td class="acciones">${t.estado === "en_camino" ? `<button class="btn small primary" data-recibir="${t.id}">Recibir</button>` : ""}<button class="btn small danger" data-eliminar="${t.id}">Eliminar</button></td>
      </tr>`).join("")
    : `<tr><td colspan="8" class="empty">${estado.trucks.length ? "Ningún truck coincide." : "Aún no hay trucks. Agrega el primero con “+ Nuevo truck”."}</td></tr>`;

  renderAlertas();
  renderEntregas();
}

export function iniciarTrucks(recargar) {
  $("#buscarTruck").addEventListener("input", renderTrucks);
  $("#filtroTruck").addEventListener("change", renderTrucks);
  $("#btnNuevoTruck").addEventListener("click", () => abrirTruck(null, recargar));
  $("#btnImportarTrucks").addEventListener("click", () => abrirImportar(recargar));
  $("#alertaTrucksInicio").addEventListener("click", e => {
    if (e.target.closest("[data-ir-trucks]")) document.querySelector('#tabs [data-tab="trucks"]').click();
  });

  $("#tablaTrucks").addEventListener("click", e => {
    const buscar = id => estado.trucks.find(t => t.id === id);
    const recibir = e.target.closest("[data-recibir]");
    const eliminar = e.target.closest("[data-eliminar]");
    const fila = e.target.closest("tr[data-id]");
    if (recibir) return abrirRecibir(buscar(recibir.dataset.recibir), recargar);
    if (eliminar) return abrirEliminar(buscar(eliminar.dataset.eliminar), recargar);
    if (fila) abrirTruck(buscar(fila.dataset.id), recargar);
  });
}

// ---------- Formulario ----------

function filaLinea(linea = {}) {
  const opciones = estado.articulos.map(a =>
    `<option value="${a.id}" ${a.id === linea.articulo_id ? "selected" : ""}>${esc(a.nombre)}</option>`).join("");
  return `<div class="linea">
    <select name="articulo" aria-label="Artículo"><option value="">— Elige artículo —</option>${opciones}</select>
    <input name="cantidad" type="number" min="1" value="${linea.cantidad || 1}" aria-label="Cantidad">
    <button type="button" class="btn small" data-quitar aria-label="Quitar artículo">×</button>
  </div>`;
}

function abrirTruck(truck, recargar) {
  const nuevo = !truck;
  const t = truck || { orden_compra: "", fecha_orden: hoy(), fecha_estimada: "", truck: "", proveedor_id: "", lpn: "", notas: "", estado: "en_camino" };
  const recibido = t.estado === "recibido";
  const modal = $("#modal");

  modal.innerHTML = `<form method="dialog" id="formTruck">
    <h2>${nuevo ? "Nuevo truck" : esc(nombreDe(t))}</h2>
    ${nuevo ? "" : `<p>${etiquetaEstado(t)} <span class="muted">Registrado por ${esc(t.creado_por || "—")}${t.recibido_en ? ` · recibido ${formatoFecha(t.recibido_en)}` : ""}</span></p>`}
    <div class="form-2">
      <label>Orden de compra <input name="orden_compra" value="${esc(t.orden_compra || "")}" placeholder="Ej. PO-778"></label>
      <label>Proveedor
        <select name="proveedor"><option value="">— Sin proveedor —</option>${estado.proveedores.map(p =>
          `<option value="${p.id}" ${p.id === t.proveedor_id ? "selected" : ""}>${esc(p.nombre)}</option>`).join("")}</select>
      </label>
      <label>Fecha de la orden <input name="fecha_orden" type="date" value="${t.fecha_orden || ""}"></label>
      <label>Llegada estimada <input name="fecha_estimada" type="date" value="${t.fecha_estimada || ""}"></label>
      <label>Número de truck <input name="truck" value="${esc(t.truck || "")}" placeholder="Si ya lo tienes"></label>
      <label>LPN <input name="lpn" value="${esc(t.lpn || "")}"></label>
    </div>
    <label>Notas <input name="notas" value="${esc(t.notas || "")}"></label>
    <label>Artículos que trae</label>
    ${recibido
      ? `<ul class="lista-simple">${lineasDe(t).map(l => `<li>${esc(l.articulos?.nombre || "")} <b>×${l.cantidad}</b></li>`).join("")}</ul>
         <label>Fecha real de llegada <input name="fecha" type="date" required value="${t.fecha || ""}"></label>
         <p class="muted">Ya se dio entrada al inventario. Si los artículos están mal, elimina el truck y regístralo de nuevo.</p>`
      : `<div id="lineasTruck" class="lineas">${(nuevo || !lineasDe(t).length ? [{}] : lineasDe(t)).map(filaLinea).join("")}</div>
         <button type="button" class="btn small" id="btnAgregarLinea">+ Agregar artículo</button>
         <label class="check"><input type="checkbox" name="recibirYa" id="recibirYa"> Ya llegó: dar entrada al inventario ahora</label>
         <label id="fechaLlegadaWrap" hidden>Fecha real de llegada <input name="fecha" type="date" value="${hoy()}"></label>`}
    <p class="error" id="errTruck"></p>
    <div class="row"><button class="btn primary" value="guardar">Guardar</button><button class="btn" value="cancelar" formnovalidate>Cancelar</button></div>
  </form>`;
  modal.showModal();

  if (!recibido) {
    $("#btnAgregarLinea").addEventListener("click", () => $("#lineasTruck").insertAdjacentHTML("beforeend", filaLinea()));
    $("#lineasTruck").addEventListener("click", e => {
      if (e.target.closest("[data-quitar]")) e.target.closest(".linea").remove();
    });
    $("#recibirYa").addEventListener("change", e => { $("#fechaLlegadaWrap").hidden = !e.target.checked; });
  }

  $("#formTruck").addEventListener("submit", async e => {
    if (e.submitter?.value !== "guardar") return;
    e.preventDefault();
    const f = new FormData(e.target);
    const error = msg => { $("#errTruck").textContent = msg; };

    const datos = {
      orden_compra: f.get("orden_compra").trim().toUpperCase() || null,
      fecha_orden: f.get("fecha_orden") || null,
      fecha_estimada: f.get("fecha_estimada") || null,
      truck: f.get("truck").trim().toUpperCase() || null,
      proveedor_id: f.get("proveedor") || null,
      lpn: f.get("lpn").trim() || null,
      notas: f.get("notas").trim() || null,
    };
    if (!datos.orden_compra && !datos.truck) return error("Escribe la orden de compra o el número de truck.");
    if (datos.fecha_orden && datos.fecha_estimada && datos.fecha_estimada < datos.fecha_orden) {
      return error("La llegada estimada no puede ser antes de la fecha de la orden.");
    }
    if (recibido) {
      datos.fecha = f.get("fecha");
      if (datos.fecha_orden && datos.fecha < datos.fecha_orden) return error("La llegada no puede ser antes de la fecha de la orden.");
    }

    // Juntar los artículos (si un artículo se repite, se suman las cantidades)
    let lineas = [];
    if (!recibido) {
      const porArticulo = {};
      for (const fila of e.target.querySelectorAll(".linea")) {
        const articulo = fila.querySelector("[name=articulo]").value;
        const cantidad = Math.round(Number(fila.querySelector("[name=cantidad]").value));
        if (!articulo) continue; // fila vacía: se ignora
        if (!(cantidad > 0)) return error("Cada artículo necesita una cantidad mayor a 0.");
        porArticulo[articulo] = (porArticulo[articulo] || 0) + cantidad;
      }
      lineas = Object.entries(porArticulo).map(([articulo_id, cantidad]) => ({ articulo_id, cantidad }));
      if (f.get("recibirYa") && !lineas.length) return error("Agrega al menos un artículo para darle entrada.");
    }

    const res = nuevo
      ? await supabase.from("recepciones").insert(datos).select().single()
      : await supabase.from("recepciones").update(datos).eq("id", t.id).select().single();
    if (res.error) return error("No se pudo guardar el truck.");
    const id = res.data.id;

    if (!recibido) {
      await supabase.from("recepcion_articulos").delete().eq("recepcion_id", id);
      if (lineas.length) {
        const ins = await supabase.from("recepcion_articulos").insert(lineas.map(l => ({ ...l, recepcion_id: id })));
        if (ins.error) return error("Se guardó el truck, pero no sus artículos. Ábrelo e inténtalo de nuevo.");
      }
      if (f.get("recibirYa")) {
        const rec = await supabase.rpc("recibir_truck", { p_recepcion: id, p_fecha: f.get("fecha") || hoy() });
        if (rec.error) return error("Se guardó el truck, pero no se pudo dar entrada: " + rec.error.message);
      }
    }

    modal.close();
    recargar();
  });
}

function abrirRecibir(t, recargar) {
  if (!t) return;
  const modal = $("#modal");
  modal.innerHTML = `<form method="dialog" id="formRecibir">
    <h2>Recibir ${esc(nombreDe(t))}</h2>
    <p class="muted">Se da entrada al inventario de todo esto:</p>
    <ul class="lista-simple">${lineasDe(t).map(l => `<li>${esc(l.articulos?.nombre || "")} <b>×${l.cantidad}</b></li>`).join("") || "<li>Sin artículos</li>"}</ul>
    <label>Fecha real de llegada <input name="fecha" type="date" required value="${hoy()}"></label>
    <p class="error" id="errRecibir"></p>
    <div class="row"><button class="btn primary" value="recibir">Recibir</button><button class="btn" value="cancelar" formnovalidate>Cancelar</button></div>
  </form>`;
  modal.showModal();

  $("#formRecibir").addEventListener("submit", async e => {
    if (e.submitter?.value !== "recibir") return;
    e.preventDefault();
    const fecha = new FormData(e.target).get("fecha");
    const { error } = await supabase.rpc("recibir_truck", { p_recepcion: t.id, p_fecha: fecha });
    if (error) { $("#errRecibir").textContent = error.message; return; }
    modal.close();
    recargar();
  });
}

function abrirEliminar(t, recargar) {
  if (!t) return;
  const modal = $("#modal");
  modal.innerHTML = `<form method="dialog" id="formEliminarTruck">
    <h2>Eliminar ${esc(nombreDe(t))}</h2>
    <p class="muted">${t.estado === "recibido"
      ? `Ya se recibió: se quitan del inventario las ${piezasDe(t)} piezas que entraron y sus entradas se borran del historial.`
      : "Todavía no se recibe, así que el inventario no cambia."} No se puede recuperar.</p>
    <p class="error" id="errEliminarTruck"></p>
    <div class="row"><button class="btn danger" value="eliminar">Eliminar</button><button class="btn" value="cancelar" formnovalidate>Cancelar</button></div>
  </form>`;
  modal.showModal();

  $("#formEliminarTruck").addEventListener("submit", async e => {
    if (e.submitter?.value !== "eliminar") return;
    e.preventDefault();
    const { error } = await supabase.from("recepciones").delete().eq("id", t.id);
    if (error) { $("#errEliminarTruck").textContent = "No se pudo eliminar: " + error.message; return; }
    modal.close();
    recargar();
  });
}

// ===================== IMPORTAR TRUCKS DESDE EXCEL =====================
// Sirve si cada fila es un truck o si cada fila es un artículo de un truck:
// las filas con la misma orden de compra (o el mismo número de truck) se juntan.

const CAMPOS_IMPORTAR = [
  { clave: "fecha_orden", etiqueta: "Fecha de la orden", buscar: /fecha.*(orden|oc|po)|order.*date|po.*date|ordered|fecha.*compra/i },
  { clave: "fecha_estimada", etiqueta: "Llegada estimada", buscar: /estimad|\beta\b|expected|promesa|compromiso/i },
  { clave: "fecha", etiqueta: "Llegada real", buscar: /lleg|recib|arriv|received|delivered|real/i },
  { clave: "orden_compra", etiqueta: "Orden de compra", buscar: /orden|\bo\.?c\.?\b|\bpo\b|p\.o\.|purchase/i },
  { clave: "truck", etiqueta: "Número de truck", buscar: /truck|cami[oó]n|tracking|gu[ií]a/i },
  { clave: "proveedor", etiqueta: "Proveedor", buscar: /provee|vendor|supplier/i },
  { clave: "lpn", etiqueta: "LPN", buscar: /lpn/i },
  { clave: "articulo", etiqueta: "Artículo", buscar: /art[ií]culo|descrip|item|producto|material/i },
  { clave: "cantidad", etiqueta: "Cantidad", buscar: /cant|qty|quantity|piezas|pzas/i },
  { clave: "notas", etiqueta: "Notas", buscar: /nota|coment|observ|comment/i },
];

const imp = { libro: null, encabezados: [], filas: [], mapa: {}, plan: null };
const limpio = v => String(v ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const clave = v => limpio(v).toLowerCase();
const pad = n => String(n).padStart(2, "0");

// Fecha de Excel (número de serie o texto) -> "AAAA-MM-DD"; null si viene vacía, false si no se entiende
function fechaDe(v, formato) {
  if (v === "" || v == null) return null;
  if (typeof v === "number") {
    const p = XLSX.SSF.parse_date_code(v);
    return p && p.y >= 2000 ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : false;
  }
  const t = limpio(v);
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return fechaDe(`${m[3]}/${m[2]}/${m[1]}`, "dmy");
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (!m) return false;
  let [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 100) y += 2000;
  let dia, mes;
  if (formato === "mdy" || (formato === "auto" && b > 12)) { mes = a; dia = b; } else { dia = a; mes = b; }
  // Que la fecha exista de verdad (31/02 no)
  const d = new Date(Date.UTC(y, mes - 1, dia));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia || y < 2000) return false;
  return `${y}-${pad(mes)}-${pad(dia)}`;
}

function leerHojaImportar() {
  const filas = XLSX.utils.sheet_to_json(imp.libro.Sheets[$("#trkHoja").value], { header: 1, defval: "", raw: true });
  let h = filas.findIndex(f => f.filter(c => typeof c === "string" && c.trim()).length >= 2);
  if (h < 0) h = 0;
  imp.encabezados = (filas[h] || []).map((c, i) => limpio(c) || `Columna ${i + 1}`);
  imp.filas = filas.slice(h + 1).map((f, i) => Object.assign(f, { _fila: h + 2 + i })).filter(f => f.some(c => limpio(c)));

  const usadas = new Set();
  imp.mapa = {};
  for (const campo of CAMPOS_IMPORTAR) {
    const i = imp.encabezados.findIndex((e, idx) => !usadas.has(idx) && campo.buscar.test(e));
    imp.mapa[campo.clave] = i;
    if (i >= 0) usadas.add(i);
  }
  $("#trkMapa").innerHTML = CAMPOS_IMPORTAR.map(c => `<label>${c.etiqueta}
      <select data-campo="${c.clave}"><option value="-1">— No usar —</option>${imp.encabezados.map((e, i) =>
        `<option value="${i}" ${i === imp.mapa[c.clave] ? "selected" : ""}>${esc(e)}</option>`).join("")}</select>
    </label>`).join("");
  armarPlanImportar();
}

function armarPlanImportar() {
  const m = imp.mapa, formato = $("#trkFormato").value;
  const val = (f, campo) => m[campo] >= 0 ? f[m[campo]] : "";
  const txt = (f, campo) => limpio(val(f, campo));
  const avisos = [];
  const grupos = new Map();

  for (const f of imp.filas) {
    const oc = txt(f, "orden_compra").toUpperCase();
    const truck = txt(f, "truck").toUpperCase();
    if (!oc && !truck) continue;
    const k = oc ? "oc:" + oc : "t:" + truck;
    let g = grupos.get(k);
    if (!g) {
      const fechas = {};
      for (const campo of ["fecha_orden", "fecha_estimada", "fecha"]) {
        const fe = fechaDe(val(f, campo), formato);
        if (fe === false) avisos.push(`Fila ${f._fila}: no se entendió la fecha “${limpio(val(f, campo))}”; se deja vacía.`);
        fechas[campo] = fe || null;
      }
      if (fechas.fecha_orden && fechas.fecha && fechas.fecha < fechas.fecha_orden) {
        avisos.push(`Fila ${f._fila}: la llegada real de ${oc || truck} es antes de la orden; se importa como en camino para que la revises.`);
        fechas.fecha = null;
      }
      g = { oc, truck, proveedor: txt(f, "proveedor"), lpn: txt(f, "lpn"), notas: txt(f, "notas"), ...fechas, lineas: new Map() };
      grupos.set(k, g);
    }
    const articulo = txt(f, "articulo");
    if (articulo) {
      const textoCant = limpio(val(f, "cantidad")).replace(/,/g, "");
      const cant = textoCant === "" ? 1 : Math.round(Number(textoCant));
      if (!(cant > 0)) { avisos.push(`Fila ${f._fila}: cantidad “${textoCant}” no válida para ${articulo}; se omite.`); continue; }
      const kk = clave(articulo);
      const l = g.lineas.get(kk) || { nombre: articulo, cantidad: 0 };
      l.cantidad += cant;
      g.lineas.set(kk, l);
    }
  }

  // Los que ya existen en la app (misma orden de compra o mismo truck) se saltan
  const ocs = new Set(estado.trucks.map(t => (t.orden_compra || "").toUpperCase()).filter(Boolean));
  const trucks = new Set(estado.trucks.map(t => (t.truck || "").toUpperCase()).filter(Boolean));
  const lista = [...grupos.values()].map(g => ({ ...g, existe: g.oc ? ocs.has(g.oc) : trucks.has(g.truck) }));
  const nuevos = lista.filter(g => !g.existe);
  const articulosNuevos = new Set(nuevos.flatMap(g => [...g.lineas.keys()]).filter(k => !estado.articulos.some(a => clave(a.nombre) === k)));
  const recibidos = nuevos.filter(g => g.fecha).length;
  imp.plan = { nuevos, articulosNuevos };

  $("#trkResumen").innerHTML = m.orden_compra < 0 && m.truck < 0
    ? `<span class="error">Elige la columna de la orden de compra o la del número de truck.</span>`
    : `<ul class="lista-simple">
        <li><b>${nuevos.length}</b> trucks nuevos: <b>${recibidos}</b> ya ${recibidos === 1 ? "recibido" : "recibidos"} (con llegada real) y <b>${nuevos.length - recibidos}</b> en camino.</li>
        ${lista.length - nuevos.length ? `<li>${lista.length - nuevos.length} ya estaban en la app y se saltan.</li>` : ""}
        ${articulosNuevos.size ? `<li><b>${articulosNuevos.size}</b> artículos no existen en el inventario y se crean con stock 0.</li>` : ""}
        ${avisos.length ? `<li class="tarde"><b>${avisos.length}</b> avisos:<div class="avisos-import">${avisos.slice(0, 30).map(a => `<div>${esc(a)}</div>`).join("")}${avisos.length > 30 ? `<div>Y ${avisos.length - 30} más.</div>` : ""}</div></li>` : ""}
      </ul>`;

  const fc = f => f ? f.split("-").reverse().join("/") : "";
  $("#trkVista").innerHTML = lista.length ? `<table><thead><tr><th>Orden de compra</th><th>Truck</th><th>Proveedor</th><th>Orden</th><th>Estimada</th><th>Llegó</th><th>Artículos</th><th></th></tr></thead><tbody>
    ${lista.slice(0, 8).map(g => `<tr>
      <td><b>${esc(g.oc)}</b></td><td>${esc(g.truck)}</td><td>${esc(g.proveedor)}</td>
      <td>${fc(g.fecha_orden)}</td><td>${fc(g.fecha_estimada)}</td><td>${fc(g.fecha)}</td>
      <td>${[...g.lineas.values()].map(l => `${esc(l.nombre)} ×${l.cantidad}`).join(", ") || '<span class="muted">—</span>'}</td>
      <td>${g.existe ? `<span class="pill gris">Ya existe</span>` : g.fecha ? `<span class="pill recibido">Recibido</span>` : `<span class="pill camino">En camino</span>`}</td>
    </tr>`).join("")}</tbody></table>${lista.length > 8 ? `<p class="muted pie-tabla">Y ${lista.length - 8} más.</p>` : ""}` : "";
  $("#btnTrkImportar").disabled = !nuevos.length;
}

async function importarTrucks(recargar) {
  const { nuevos } = imp.plan;
  const darEntrada = $("#trkEntrada").checked;
  const prog = t => { $("#progTrk").textContent = t; };
  $("#btnTrkImportar").disabled = true;
  try {
    // 1. Proveedores que falten
    const provPorNombre = new Map(estado.proveedores.map(p => [clave(p.nombre), p.id]));
    const faltanProv = [...new Set(nuevos.map(g => g.proveedor).filter(Boolean))].filter(n => !provPorNombre.has(clave(n)));
    if (faltanProv.length) {
      const { data, error } = await supabase.from("proveedores").insert(faltanProv.map(nombre => ({ nombre }))).select("id, nombre");
      if (error) throw error;
      data.forEach(p => provPorNombre.set(clave(p.nombre), p.id));
    }

    // 2. Artículos que falten (stock 0)
    const artPorNombre = new Map(estado.articulos.map(a => [clave(a.nombre), a.id]));
    const faltanArt = new Map();
    for (const g of nuevos) for (const [k, l] of g.lineas) if (!artPorNombre.has(k)) faltanArt.set(k, l.nombre);
    if (faltanArt.size) {
      prog(`Creando ${faltanArt.size} artículos…`);
      const { data, error } = await supabase.from("articulos").insert([...faltanArt.values()].map(nombre => ({ nombre, stock: 0, minimo: 0 }))).select("id, nombre");
      if (error) throw error;
      data.forEach(a => artPorNombre.set(clave(a.nombre), a.id));
    }

    // 3. Trucks: los que ya llegaron entran como recibidos; si se pidió dar entrada, se reciben con la función de la app
    let hechos = 0;
    for (const g of nuevos) {
      prog(`Guardando trucks… ${++hechos} de ${nuevos.length}`);
      const recibirConEntrada = darEntrada && g.fecha && g.lineas.size;
      const datos = {
        orden_compra: g.oc || null, truck: g.truck || null, proveedor_id: provPorNombre.get(clave(g.proveedor)) || null,
        lpn: g.lpn || null, notas: g.notas || null, fecha_orden: g.fecha_orden, fecha_estimada: g.fecha_estimada,
        ...(g.fecha && !recibirConEntrada
          ? { estado: "recibido", fecha: g.fecha, recibido_por: "Importado de Excel", recibido_en: new Date().toISOString() }
          : { estado: "en_camino", fecha: null }),
      };
      const res = await supabase.from("recepciones").insert(datos).select("id").single();
      if (res.error) throw res.error;
      const lineas = [...g.lineas].map(([k, l]) => ({ recepcion_id: res.data.id, articulo_id: artPorNombre.get(k), cantidad: l.cantidad })).filter(l => l.articulo_id);
      if (lineas.length) {
        const ins = await supabase.from("recepcion_articulos").insert(lineas);
        if (ins.error) throw ins.error;
      }
      if (recibirConEntrada) {
        const rec = await supabase.rpc("recibir_truck", { p_recepcion: res.data.id, p_fecha: g.fecha });
        if (rec.error) throw new Error(`${g.oc || g.truck}: ${rec.error.message}`);
      }
    }
    $("#modal").close();
    recargar();
  } catch (error) {
    console.error(error);
    $("#errTrk").textContent = "No se pudo terminar: " + error.message + ". Los trucks que ya se guardaron se quedan; si vuelves a importar el archivo, esos se saltan.";
    $("#btnTrkImportar").disabled = false;
  }
}

function abrirImportar(recargar) {
  const modal = $("#modal");
  modal.classList.add("ancho");
  modal.innerHTML = `<form method="dialog" id="formImpTrk">
    <h2>Importar trucks desde Excel</h2>
    <p class="muted">Cada fila puede ser un truck o un artículo de un truck: las filas con la misma orden de compra (o el mismo número de truck) se juntan. Los que tienen llegada real entran como recibidos; los demás, en camino. Los que ya están en la app se saltan.</p>
    <label>Archivo (.xlsx, .xls o .csv) <input type="file" id="trkArchivo" accept=".xlsx,.xls,.csv"></label>
    <div id="trkPaso2" class="pasos-excel" hidden>
      <div class="form-grid">
        <label>Hoja <select id="trkHoja"></select></label>
        <label>Formato de fechas en texto
          <select id="trkFormato">
            <option value="dmy">Día/mes/año</option>
            <option value="mdy">Mes/día/año</option>
            <option value="auto">Adivinar</option>
          </select>
        </label>
      </div>
      <h3>¿Qué columna es cada dato?</h3>
      <div class="form-grid" id="trkMapa"></div>
      <h3>Resumen</h3>
      <div id="trkResumen"></div>
      <div class="table-wrap" id="trkVista"></div>
      <label class="check"><input type="checkbox" id="trkEntrada"> Dar entrada al inventario de los trucks que ya llegaron (solo si ese material todavía no está contado en el stock)</label>
    </div>
    <p class="error" id="errTrk"></p>
    <div class="row"><button class="btn primary" value="importar" id="btnTrkImportar" disabled>Importar</button><button class="btn" value="cancelar" formnovalidate>Cancelar</button><span class="muted" id="progTrk"></span></div>
  </form>`;
  modal.addEventListener("close", () => modal.classList.remove("ancho"), { once: true });
  modal.showModal();

  $("#trkArchivo").addEventListener("change", async e => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    if (!window.XLSX) { $("#errTrk").textContent = "No se cargó el lector de Excel. Revisa tu conexión y recarga la página."; return; }
    try {
      imp.libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
      const visibles = imp.libro.SheetNames.filter((n, i) => !imp.libro.Workbook?.Sheets?.[i]?.Hidden);
      $("#trkHoja").innerHTML = (visibles.length ? visibles : imp.libro.SheetNames).map(n => `<option>${esc(n)}</option>`).join("");
      $("#trkPaso2").hidden = false;
      $("#errTrk").textContent = "";
      leerHojaImportar();
    } catch (error) {
      console.error(error);
      $("#errTrk").textContent = "No se pudo abrir el archivo. Revisa que sea .xlsx, .xls o .csv.";
    }
  });
  $("#trkHoja").addEventListener("change", leerHojaImportar);
  $("#trkFormato").addEventListener("change", armarPlanImportar);
  $("#trkMapa").addEventListener("change", e => {
    const s = e.target.closest("select[data-campo]");
    if (s) { imp.mapa[s.dataset.campo] = Number(s.value); armarPlanImportar(); }
  });
  $("#formImpTrk").addEventListener("submit", e => {
    if (e.submitter?.value !== "importar") return;
    e.preventDefault();
    importarTrucks(recargar);
  });
}