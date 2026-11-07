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