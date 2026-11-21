import { supabase } from "./supabase.js";
import { esc, $ } from "./util.js";

// Agenda del equipo: tablero de tareas con recados y calendario de eventos
const ag = { tareas: [], comentarios: [], eventos: [], vista: "tablero", mes: null, cargado: false };

const COLUMNAS = [
  { estado: "pendiente", titulo: "Por hacer" },
  { estado: "en_proceso", titulo: "En proceso" },
  { estado: "hecho", titulo: "Hecho" },
];
const SIGUIENTE = { pendiente: "en_proceso", en_proceso: "hecho" };
const TIPOS = { evento: "Evento", reunion: "Reunión", viaje: "Viaje", vacaciones: "Vacaciones", recordatorio: "Recordatorio" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIAS_HECHO = 30; // las tareas terminadas se dejan de ver en el tablero después de estos días

// ---------- Fechas (siempre como texto AAAA-MM-DD, hora de Ciudad de México) ----------
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const aFecha = s => new Date(s + "T12:00:00Z");
const aTexto = d => d.toISOString().slice(0, 10);
const sumarDias = (s, n) => { const d = aFecha(s); d.setUTCDate(d.getUTCDate() + n); return aTexto(d); };
const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 864e5);
const fechaBonita = s => { if (!s) return ""; const d = aFecha(s); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)}`; };
const fechaHora = iso => new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// ---------- Personas ----------
const yo = () => ($("#userEmail")?.textContent || "").trim().toLowerCase();
const nombre = correo => { if (!correo) return ""; const n = correo.split("@")[0].replace(/[._]/g, " "); return n.charAt(0).toUpperCase() + n.slice(1); };
const esMia = t => !!t.asignado_a && t.asignado_a.toLowerCase() === yo();
function personas() {
  const s = new Set([yo(), ...ag.tareas.flatMap(t => [t.asignado_a, t.creado_por]), ...ag.comentarios.map(c => c.autor), ...ag.eventos.map(e => e.creado_por)]
    .filter(Boolean).map(x => x.toLowerCase()));
  return [...s].sort();
}

const visible = () => !document.querySelector('section[data-view="agenda"]').hidden;
const recadosDe = id => ag.comentarios.filter(c => c.tarea_id === id);

function vence(t) {
  if (!t.fecha_limite || t.estado === "hecho") return null;
  const d = diasEntre(hoy(), t.fecha_limite);
  if (d < 0) return { clase: "atrasado", texto: `Venció ${fechaBonita(t.fecha_limite)}` };
  if (d === 0) return { clase: "camino", texto: "Vence hoy" };
  if (d === 1) return { clase: "camino", texto: "Vence mañana" };
  return { clase: "gris", texto: `Vence ${fechaBonita(t.fecha_limite)}` };
}

// ---------- Cargar ----------
export function renderAgenda() { cargar(); }

async function cargar() {
  const [t, c, e] = await Promise.all([
    supabase.from("tareas").select("*").order("creado_en", { ascending: false }),
    supabase.from("tarea_comentarios").select("*").order("creado_en"),
    supabase.from("eventos").select("*").order("fecha_inicio"),
  ]);
  const error = t.error || c.error || e.error;
  if (error) {
    $("#agAvisos").innerHTML = `<div class="alert critico">No se pudo cargar la agenda: ${esc(error.message)}. ¿Ya ejecutaste <b>sql/09_agenda.sql</b> en Supabase?</div>`;
    return;
  }
  ag.tareas = t.data || [];
  ag.comentarios = c.data || [];
  ag.eventos = e.data || [];
  ag.cargado = true;
  pintar();
}

function pintar() {
  pintarBadge();
  pintarAvisos();
  $("#listaPersonas").innerHTML = personas().map(p => `<option value="${esc(p)}">${esc(nombre(p))}</option>`).join("");
  if (ag.vista === "tablero") pintarTablero(); else pintarCalendario();
}

// Pendientes que ya vencieron o vencen hoy, para mí o para todos
function urgentes() {
  return ag.tareas.filter(t => t.estado !== "hecho" && t.fecha_limite && t.fecha_limite <= hoy() && (!t.asignado_a || esMia(t)));
}

function pintarBadge() {
  const n = urgentes().length;
  $("#agendaBadge").hidden = !n;
  $("#agendaBadge").textContent = n;
}

function pintarAvisos() {
  const h = hoy();
  const fuera = ag.eventos.filter(e => (e.tipo === "viaje" || e.tipo === "vacaciones") && e.fecha_inicio <= h && e.fecha_fin >= h);
  const avisos = fuera.map(e => `<div class="alert info">✈ <b>${esc(e.persona || nombre(e.creado_por) || "Alguien")}</b> está de ${TIPOS[e.tipo].toLowerCase()}${e.fecha_fin > h ? ` hasta el ${fechaBonita(e.fecha_fin)}` : " (regresa mañana)"}: ${esc(e.titulo)}</div>`);
  const u = urgentes();
  if (u.length) avisos.push(`<div class="alert critico"><b>${u.length === 1 ? "1 tarea vencida o para hoy" : `${u.length} tareas vencidas o para hoy`}:</b> ${u.slice(0, 4).map(t => `<button class="enlace" data-tarea="${t.id}">${esc(t.titulo)}</button>`).join(", ")}${u.length > 4 ? "…" : ""}</div>`);
  $("#agAvisos").innerHTML = avisos.join("");
}

// ---------- Tablero ----------
function filtrarTareas() {
  const q = $("#agBuscar").value.trim().toLowerCase();
  const para = $("#agPara").value;
  return ag.tareas.filter(t =>
    (!para || (para === "mias" ? esMia(t) : para === "todos" ? !t.asignado_a : (t.asignado_a || "").toLowerCase() === para)) &&
    (!q || [t.titulo, t.descripcion, t.asignado_a, ...recadosDe(t.id).map(c => c.texto)].join(" ").toLowerCase().includes(q)));
}

function ordenar(a, b) {
  if (a.estado === "hecho") return (b.completada_en || "").localeCompare(a.completada_en || "");
  if (a.prioridad !== b.prioridad) return a.prioridad === "alta" ? -1 : 1;
  if (a.fecha_limite !== b.fecha_limite) return !a.fecha_limite ? 1 : !b.fecha_limite ? -1 : a.fecha_limite.localeCompare(b.fecha_limite);
  return a.orden - b.orden;
}

function pintarTablero() {
  const sel = $("#agPara");
  const elegido = sel.value;
  sel.innerHTML = `<option value="">De todos</option><option value="mias">Mis tareas</option><option value="todos">Sin asignar</option>` +
    personas().filter(p => p !== yo()).map(p => `<option value="${esc(p)}">Para ${esc(nombre(p))}</option>`).join("");
  sel.value = [...sel.options].some(o => o.value === elegido) ? elegido : "";

  const lista = filtrarTareas();
  const limite = sumarDias(hoy(), -DIAS_HECHO);
  $("#kanban").innerHTML = COLUMNAS.map(col => {
    let tareas = lista.filter(t => t.estado === col.estado).sort(ordenar);
    let ocultas = 0;
    if (col.estado === "hecho") {
      const recientes = tareas.filter(t => !t.completada_en || t.completada_en.slice(0, 10) >= limite);
      ocultas = tareas.length - recientes.length;
      tareas = recientes;
    }
    return `<div class="columna" data-estado="${col.estado}">
      <div class="columna-head"><b>${col.titulo}</b><span class="contador-col">${tareas.length}</span></div>
      <div class="columna-lista">${tareas.map(tarjeta).join("") || `<p class="vacio-col">${col.estado === "pendiente" ? "Nada pendiente" : "—"}</p>`}</div>
      ${ocultas ? `<p class="muted pie-col">${ocultas} terminadas hace más de ${DIAS_HECHO} días (búscalas arriba)</p>` : ""}
    </div>`;
  }).join("");
}

function tarjeta(t) {
  const v = vence(t);
  const n = recadosDe(t.id).length;
  return `<article class="tarjeta${t.prioridad === "alta" ? " alta" : ""}${t.estado === "hecho" ? " hecha" : ""}" draggable="true" data-tarea="${t.id}">
    <div class="tarjeta-titulo">${esc(t.titulo)}</div>
    <div class="tarjeta-meta">
      ${t.prioridad === "alta" && t.estado !== "hecho" ? `<span class="pill atrasado">Urgente</span>` : ""}
      ${v ? `<span class="pill ${v.clase}">${v.texto}</span>` : ""}
      ${t.estado === "hecho" && t.completada_en ? `<span class="pill recibido">✓ ${fechaHora(t.completada_en)}</span>` : ""}
    </div>
    <div class="tarjeta-pie">
      <span>${t.asignado_a ? `Para <b>${esc(nombre(t.asignado_a))}</b>` : `<span class="muted">Para todos</span>`}</span>
      <span class="muted">${n ? `💬 ${n}` : ""}</span>
      ${SIGUIENTE[t.estado] ? `<button class="btn small mover" data-mover="${t.id}" title="Pasar a ${COLUMNAS.find(c => c.estado === SIGUIENTE[t.estado]).titulo}">${t.estado === "pendiente" ? "Empezar ›" : "Terminar ✓"}</button>` : ""}
    </div>
  </article>`;
}

async function moverTarea(id, estadoNuevo) {
  const t = ag.tareas.find(x => x.id === id);
  if (!t || t.estado === estadoNuevo) return;
  const antes = t.estado;
  t.estado = estadoNuevo; // se ve el cambio de inmediato
  if (estadoNuevo === "hecho") t.completada_en = new Date().toISOString();
  pintar();
  const { error } = await supabase.from("tareas").update({ estado: estadoNuevo, orden: Date.now() / 1000 }).eq("id", id);
  if (error) { t.estado = antes; pintar(); alert("No se pudo mover: " + error.message); return; }
  cargar();
}

// ---------- Calendario ----------
function itemsDelDia(dia) {
  const eventos = ag.eventos.filter(e => e.fecha_inicio <= dia && e.fecha_fin >= dia)
    .sort((a, b) => (b.fecha_fin > b.fecha_inicio) - (a.fecha_fin > a.fecha_inicio) || (a.hora || "").localeCompare(b.hora || ""));
  const tareas = ag.tareas.filter(t => t.fecha_limite === dia && t.estado !== "hecho");
  return { eventos, tareas };
}

function pintarCalendario() {
  const mes = ag.mes || hoy().slice(0, 7);
  ag.mes = mes;
  const [a, m] = mes.split("-").map(Number);
  $("#calMes").textContent = `${MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1)} ${a}`;

  const primero = `${mes}-01`;
  const desfase = (aFecha(primero).getUTCDay() + 6) % 7; // lunes = 0
  const inicio = sumarDias(primero, -desfase);
  const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const semanas = Math.ceil((desfase + diasMes) / 7);
  const h = hoy();

  let html = DIAS.map(d => `<div class="cal-dia-nombre">${d}</div>`).join("");
  for (let i = 0; i < semanas * 7; i++) {
    const dia = sumarDias(inicio, i);
    const { eventos, tareas } = itemsDelDia(dia);
    const chips = [
      ...eventos.map(e => `<button class="chip tipo-${e.tipo}" data-evento="${e.id}" title="${esc(TIPOS[e.tipo] + ": " + e.titulo)}">${e.hora && e.fecha_inicio === dia ? `<b>${esc(e.hora)}</b> ` : ""}${esc(e.persona && (e.tipo === "viaje" || e.tipo === "vacaciones") ? `${e.persona}: ${e.titulo}` : e.titulo)}</button>`),
      ...tareas.map(t => `<button class="chip tarea${t.fecha_limite < h ? " vencida" : ""}" data-tarea="${t.id}" title="Fecha límite: ${esc(t.titulo)}">☐ ${esc(t.titulo)}</button>`),
    ];
    const max = 3;
    html += `<div class="cal-dia${dia.slice(0, 7) !== mes ? " fuera" : ""}${dia === h ? " hoy" : ""}" data-dia="${dia}">
      <span class="cal-num">${aFecha(dia).getUTCDate()}</span>
      ${chips.slice(0, max).join("")}
      ${chips.length > max ? `<button class="chip mas" data-verdia="${dia}">+${chips.length - max} más</button>` : ""}
    </div>`;
  }
  $("#cal").innerHTML = html;

  // Lista del mes (en celular es la forma cómoda de leerlo)
  const fin = `${mes}-${String(diasMes).padStart(2, "0")}`;
  const delMes = [
    ...ag.eventos.filter(e => e.fecha_inicio <= fin && e.fecha_fin >= primero).map(e => ({ fecha: e.fecha_inicio < primero ? primero : e.fecha_inicio, html: filaEvento(e) })),
    ...ag.tareas.filter(t => t.estado !== "hecho" && t.fecha_limite >= primero && t.fecha_limite <= fin).map(t => ({ fecha: t.fecha_limite, html: filaTarea(t) })),
  ].sort((x, y) => x.fecha.localeCompare(y.fecha));
  $("#calLista").innerHTML = delMes.length ? delMes.map(x => x.html).join("") : `<p class="muted">No hay nada agendado este mes. Toca un día para agregar un evento.</p>`;
}

function rango(e) {
  return e.fecha_fin > e.fecha_inicio ? `${fechaBonita(e.fecha_inicio)} – ${fechaBonita(e.fecha_fin)}` : fechaBonita(e.fecha_inicio);
}
const filaEvento = e => `<button class="fila-agenda" data-evento="${e.id}"><span class="punto tipo-${e.tipo}"></span><span class="fa-fecha">${rango(e)}${e.hora ? ` · ${esc(e.hora)}` : ""}</span><span><b>${esc(e.titulo)}</b>${e.persona ? ` <span class="muted">· ${esc(e.persona)}</span>` : ""} <span class="muted">· ${TIPOS[e.tipo]}</span></span></button>`;
const filaTarea = t => `<button class="fila-agenda" data-tarea="${t.id}"><span class="punto tarea"></span><span class="fa-fecha">${fechaBonita(t.fecha_limite)}</span><span>☐ <b>${esc(t.titulo)}</b> <span class="muted">· fecha límite${t.asignado_a ? ` · para ${esc(nombre(t.asignado_a))}` : ""}</span></span></button>`;

function verDia(dia) {
  const { eventos, tareas } = itemsDelDia(dia);
  const modal = $("#modal");
  const d = aFecha(dia);
  modal.innerHTML = `<form method="dialog">
    <h2>${DIAS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}</h2>
    <div class="lista-agenda">${[...eventos.map(filaEvento), ...tareas.map(filaTarea)].join("")}</div>
    <div class="row"><button class="btn primary" type="button" id="btnEventoDia">+ Evento este día</button><button class="btn" value="cerrar">Cerrar</button></div>
  </form>`;
  modal.showModal();
  modal.querySelector(".lista-agenda").addEventListener("click", clicAbrir);
  $("#btnEventoDia").addEventListener("click", () => abrirEvento(null, dia));
}

// ---------- Ventana de tarea ----------
function abrirTarea(tarea) {
  const nueva = !tarea;
  const t = tarea || { titulo: "", descripcion: "", estado: "pendiente", prioridad: "normal", asignado_a: "", fecha_limite: "" };
  const modal = $("#modal");
  modal.innerHTML = `<form method="dialog" id="formTarea">
    <h2>${nueva ? "Nueva tarea" : "Tarea"}</h2>
    ${nueva ? "" : `<p class="muted">Creada por ${esc(nombre(t.creado_por) || "—")} el ${fechaHora(t.creado_en)}${t.completada_en ? ` · terminada ${fechaHora(t.completada_en)}` : ""}</p>`}
    <label>Qué hay que hacer <input name="titulo" required maxlength="200" value="${esc(t.titulo)}" placeholder="Ej. Enviar 2 monitores a NL023"></label>
    <label>Detalles <textarea name="descripcion" rows="3" placeholder="Opcional: ticket REQ, a quién llamar, dónde está el material…">${esc(t.descripcion || "")}</textarea></label>
    <div class="form-2">
      <label>Para quién <input name="asignado_a" list="listaPersonas" value="${esc(t.asignado_a || "")}" placeholder="Correo, o vacío = para todos"></label>
      <label>Fecha límite <input name="fecha_limite" type="date" value="${t.fecha_limite || ""}"></label>
      <label>Prioridad
        <select name="prioridad"><option value="normal">Normal</option><option value="alta" ${t.prioridad === "alta" ? "selected" : ""}>Urgente</option></select>
      </label>
      <label>Estado
        <select name="estado">${COLUMNAS.map(c => `<option value="${c.estado}" ${c.estado === t.estado ? "selected" : ""}>${c.titulo}</option>`).join("")}</select>
      </label>
    </div>
    ${nueva ? `<label>Recado <textarea name="recado" rows="2" placeholder="Opcional: deja un mensaje para quien la tome"></textarea></label>` : `
    <div class="recados">
      <b>Recados</b>
      <div id="listaRecados">${recadosHtml(t.id)}</div>
      <div class="recado-nuevo">
        <textarea id="textoRecado" rows="2" placeholder="Escribe un recado…"></textarea>
        <button class="btn small" type="button" id="btnRecado">Dejar recado</button>
      </div>
    </div>`}
    <p class="error" id="errTarea"></p>
    <div class="row">
      <button class="btn primary" value="guardar">Guardar</button>
      <button class="btn" value="cancelar" formnovalidate>Cancelar</button>
      ${nueva ? "" : `<button class="btn danger empuja" type="button" id="btnBorrarTarea">Eliminar</button>`}
    </div>
  </form>`;
  modal.showModal();

  if (!nueva) {
    $("#btnRecado").addEventListener("click", async () => {
      const texto = $("#textoRecado").value.trim();
      if (!texto) return;
      $("#btnRecado").disabled = true;
      const { data, error } = await supabase.from("tarea_comentarios").insert({ tarea_id: t.id, texto }).select().single();
      $("#btnRecado").disabled = false;
      if (error) { $("#errTarea").textContent = "No se guardó el recado: " + error.message; return; }
      ag.comentarios.push({ tarea_id: t.id, texto, autor: yo(), creado_en: new Date().toISOString(), ...data });
      $("#textoRecado").value = "";
      $("#listaRecados").innerHTML = recadosHtml(t.id);
      pintar();
    });
    borrarEnDosClics($("#btnBorrarTarea"), async () => {
      const { error } = await supabase.from("tareas").delete().eq("id", t.id);
      if (error) { $("#errTarea").textContent = "No se pudo eliminar: " + error.message; return; }
      modal.close();
      cargar();
    });
  }

  $("#formTarea").addEventListener("submit", async e => {
    if (e.submitter?.value !== "guardar") return;
    e.preventDefault();
    const f = new FormData(e.target);
    const datos = {
      titulo: f.get("titulo").trim(),
      descripcion: f.get("descripcion").trim() || null,
      asignado_a: f.get("asignado_a").trim().toLowerCase() || null,
      fecha_limite: f.get("fecha_limite") || null,
      prioridad: f.get("prioridad"),
      estado: f.get("estado"),
    };
    if (!datos.titulo) { $("#errTarea").textContent = "Escribe qué hay que hacer."; return; }
    let res;
    if (nueva) {
      res = await supabase.from("tareas").insert({ ...datos, orden: Date.now() / 1000 }).select().single();
      const recado = (f.get("recado") || "").trim();
      if (!res.error && recado && res.data?.id) await supabase.from("tarea_comentarios").insert({ tarea_id: res.data.id, texto: recado });
    } else {
      res = await supabase.from("tareas").update(datos).eq("id", t.id);
    }
    if (res.error) { $("#errTarea").textContent = "No se pudo guardar: " + res.error.message; return; }
    modal.close();
    cargar();
  });
}

function recadosHtml(id) {
  const lista = recadosDe(id);
  return lista.length
    ? lista.map(c => `<div class="recado"><div class="recado-autor"><b>${esc(nombre(c.autor) || "—")}</b> <span class="muted">${fechaHora(c.creado_en)}</span></div><div class="recado-texto">${esc(c.texto)}</div></div>`).join("")
    : `<p class="muted">Todavía no hay recados.</p>`;
}

// ---------- Ventana de evento ----------
function abrirEvento(evento, dia) {
  const nuevo = !evento;
  const e = evento || { titulo: "", tipo: "evento", fecha_inicio: dia || hoy(), fecha_fin: dia || hoy(), hora: "", persona: "", notas: "" };
  const modal = $("#modal");
  modal.innerHTML = `<form method="dialog" id="formEvento">
    <h2>${nuevo ? "Nuevo evento" : "Evento"}</h2>
    ${nuevo ? "" : `<p class="muted">Agendado por ${esc(nombre(e.creado_por) || "—")}</p>`}
    <label>Título <input name="titulo" required maxlength="200" value="${esc(e.titulo)}" placeholder="Ej. Viaje a Monterrey, junta mensual"></label>
    <div class="form-2">
      <label>Tipo
        <select name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === e.tipo ? "selected" : ""}>${v}</option>`).join("")}</select>
      </label>
      <label>Hora <input name="hora" maxlength="40" value="${esc(e.hora || "")}" placeholder="Opcional, ej. 10:00"></label>
      <label>Desde <input name="fecha_inicio" type="date" required value="${e.fecha_inicio}"></label>
      <label>Hasta <input name="fecha_fin" type="date" required value="${e.fecha_fin}"></label>
    </div>
    <label>Quién <input name="persona" maxlength="80" value="${esc(e.persona || "")}" placeholder="Ej. Jesús (para viajes y vacaciones)"></label>
    <label>Notas <textarea name="notas" rows="3" placeholder="Dónde, a quién contactar mientras no está, pendientes…">${esc(e.notas || "")}</textarea></label>
    <p class="error" id="errEvento"></p>
    <div class="row">
      <button class="btn primary" value="guardar">Guardar</button>
      <button class="btn" value="cancelar" formnovalidate>Cancelar</button>
      ${nuevo ? "" : `<button class="btn danger empuja" type="button" id="btnBorrarEvento">Eliminar</button>`}
    </div>
  </form>`;
  modal.showModal();

  const inicio = modal.querySelector('[name="fecha_inicio"]');
  const fin = modal.querySelector('[name="fecha_fin"]');
  inicio.addEventListener("change", () => { if (!fin.value || fin.value < inicio.value) fin.value = inicio.value; });

  if (!nuevo) borrarEnDosClics($("#btnBorrarEvento"), async () => {
    const { error } = await supabase.from("eventos").delete().eq("id", e.id);
    if (error) { $("#errEvento").textContent = "No se pudo eliminar: " + error.message; return; }
    modal.close();
    cargar();
  });

  $("#formEvento").addEventListener("submit", async ev => {
    if (ev.submitter?.value !== "guardar") return;
    ev.preventDefault();
    const f = new FormData(ev.target);
    const datos = {
      titulo: f.get("titulo").trim(),
      tipo: f.get("tipo"),
      fecha_inicio: f.get("fecha_inicio"),
      fecha_fin: f.get("fecha_fin"),
      hora: f.get("hora").trim() || null,
      persona: f.get("persona").trim() || null,
      notas: f.get("notas").trim() || null,
    };
    if (!datos.titulo) { $("#errEvento").textContent = "Escribe un título."; return; }
    if (datos.fecha_fin < datos.fecha_inicio) { $("#errEvento").textContent = "La fecha final no puede ser antes de la inicial."; return; }
    const { error } = nuevo
      ? await supabase.from("eventos").insert(datos)
      : await supabase.from("eventos").update(datos).eq("id", e.id);
    if (error) { $("#errEvento").textContent = "No se pudo guardar: " + error.message; return; }
    modal.close();
    ag.mes = datos.fecha_inicio.slice(0, 7);
    cargar();
  });
}

function borrarEnDosClics(boton, accion) {
  boton.addEventListener("click", () => {
    if (boton.dataset.confirmar) { accion(); return; }
    boton.dataset.confirmar = "1";
    boton.textContent = "¿Seguro? Clic otra vez";
    setTimeout(() => { delete boton.dataset.confirmar; boton.textContent = "Eliminar"; }, 4000);
  });
}

// Abre la tarea o evento al que se le dio clic (en el tablero, calendario, avisos o listas)
function clicAbrir(e) {
  const t = e.target.closest("[data-tarea]");
  const ev = e.target.closest("[data-evento]");
  if (t) { e.preventDefault(); abrirTarea(ag.tareas.find(x => x.id === t.dataset.tarea)); return true; }
  if (ev) { e.preventDefault(); abrirEvento(ag.eventos.find(x => x.id === ev.dataset.evento)); return true; }
  return false;
}

function cambiarVista(vista) {
  ag.vista = vista;
  document.querySelectorAll("#agVista button").forEach(b => b.classList.toggle("active", b.dataset.v === vista));
  $("#agTablero").hidden = vista !== "tablero";
  $("#agCalendario").hidden = vista !== "calendario";
  pintar();
}

// ---------- Inicio ----------
export function iniciarAgenda() {
  $("#agVista").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) cambiarVista(b.dataset.v); });
  $("#btnNuevaTarea").addEventListener("click", () => abrirTarea(null));
  $("#btnNuevoEvento").addEventListener("click", () => abrirEvento(null));
  $("#agBuscar").addEventListener("input", pintarTablero);
  $("#agPara").addEventListener("change", pintarTablero);
  $("#agAvisos").addEventListener("click", clicAbrir);

  // Tablero: clic para abrir, botón para avanzar, y arrastrar entre columnas
  const kanban = $("#kanban");
  kanban.addEventListener("click", e => {
    const mover = e.target.closest("[data-mover]");
    if (mover) { const t = ag.tareas.find(x => x.id === mover.dataset.mover); moverTarea(t.id, SIGUIENTE[t.estado]); return; }
    clicAbrir(e);
  });
  kanban.addEventListener("dragstart", e => {
    const card = e.target.closest(".tarjeta");
    if (!card) return;
    e.dataTransfer.setData("text/plain", card.dataset.tarea);
    e.dataTransfer.effectAllowed = "move";
    card.classList.add("arrastrando");
  });
  kanban.addEventListener("dragend", e => e.target.closest(".tarjeta")?.classList.remove("arrastrando"));
  kanban.addEventListener("dragover", e => {
    const col = e.target.closest(".columna");
    if (!col) return;
    e.preventDefault();
    kanban.querySelectorAll(".columna").forEach(c => c.classList.toggle("encima", c === col));
  });
  kanban.addEventListener("dragleave", e => { if (!kanban.contains(e.relatedTarget)) kanban.querySelectorAll(".columna").forEach(c => c.classList.remove("encima")); });
  kanban.addEventListener("drop", e => {
    const col = e.target.closest(".columna");
    kanban.querySelectorAll(".columna").forEach(c => c.classList.remove("encima"));
    if (!col) return;
    e.preventDefault();
    moverTarea(e.dataTransfer.getData("text/plain"), col.dataset.estado);
  });

  // Calendario
  const mover = n => { const [a, m] = ag.mes.split("-").map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); ag.mes = aTexto(d).slice(0, 7); pintarCalendario(); };
  $("#calPrev").addEventListener("click", () => mover(-1));
  $("#calNext").addEventListener("click", () => mover(1));
  $("#calHoy").addEventListener("click", () => { ag.mes = hoy().slice(0, 7); pintarCalendario(); });
  $("#cal").addEventListener("click", e => {
    const mas = e.target.closest("[data-verdia]");
    if (mas) { verDia(mas.dataset.verdia); return; }
    if (clicAbrir(e)) return;
    const dia = e.target.closest(".cal-dia");
    if (dia) abrirEvento(null, dia.dataset.dia);
  });
  $("#calLista").addEventListener("click", clicAbrir);

  // Al abrir la pestaña, y cada minuto mientras está abierta, trae lo que dejaron los demás
  $("#tabs").addEventListener("click", e => { if (e.target.closest('[data-tab="agenda"]')) cargar(); });
  setInterval(() => { if (visible() && !$("#modal").open && !document.hidden) cargar(); }, 60000);
}