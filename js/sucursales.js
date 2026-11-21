import { supabase } from "./supabase.js";
import { estado } from "./estado.js";
import { esc, $, traerTodo, descargarExcel } from "./util.js";
import { numero } from "./filtros.js";

// Piezas enviadas por sucursal, sumando sus dos códigos (se calcula al abrir la pestaña)
let envios = null;         // Map código de 5 -> { piezas, ultimo }
let sinCatalogo = [];      // códigos que aparecen en el historial y no están en el catálogo
let pendiente = true;

const visible = () => !document.querySelector('section[data-view="sucursales"]').hidden;
const fechaCorta = iso => iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function renderSucursales() {
  // Lista para el formulario de movimientos
  $("#listaSucursales").innerHTML = estado.sucursales.filter(s => s.activa)
    .map(s => `<option value="${esc(s.codigo)}">${esc([s.codigo_lpn && `LPN ${s.codigo_lpn}`, s.nombre, s.ciudad].filter(Boolean).join(" · "))}</option>`).join("");

  pendiente = true;
  if (visible()) cargarEnvios(); else pintar();
}

async function cargarEnvios() {
  pendiente = false;
  try {
    const movs = await traerTodo(() => supabase.from("movimientos").select("sucursal, cantidad, fecha, tipo, anulado").eq("tipo", "salida").order("id"));
    const porCodigo = new Map(estado.sucursales.flatMap(s => [[s.codigo, s.codigo], ...(s.codigo_lpn ? [[s.codigo_lpn, s.codigo]] : [])]));
    envios = new Map();
    const faltan = new Map();
    for (const m of movs) {
      if (m.anulado || !m.sucursal) continue;
      const c = m.sucursal.toUpperCase();
      const codigo = porCodigo.get(c);
      if (!codigo) { faltan.set(c, (faltan.get(c) || 0) + Math.abs(m.cantidad)); continue; }
      const e = envios.get(codigo) || { piezas: 0, ultimo: null };
      e.piezas += Math.abs(m.cantidad);
      if (!e.ultimo || m.fecha > e.ultimo) e.ultimo = m.fecha;
      envios.set(codigo, e);
    }
    sinCatalogo = [...faltan].sort((a, b) => b[1] - a[1]);
  } catch (error) {
    console.error(error);
  }
  pintar();
}

function filtrar() {
  const q = $("#buscarSucursal").value.trim().toLowerCase();
  const f = $("#filtroSucursal").value;
  return estado.sucursales.filter(s =>
    (!f || (f === "activas" && s.activa) || (f === "inactivas" && !s.activa) || (f === "sinlpn" && !s.codigo_lpn)) &&
    (!q || [s.codigo, s.codigo_lpn, s.nombre, s.ciudad, s.notas].join(" ").toLowerCase().includes(q)));
}

function pintar() {
  const lista = filtrar();
  const sinLpn = estado.sucursales.filter(s => !s.codigo_lpn).length;
  $("#contadorSucursales").innerHTML = `<b>${numero(lista.length)}</b> sucursales${lista.length !== estado.sucursales.length ? ` <span class="muted">(de ${numero(estado.sucursales.length)})</span>` : ""}${sinLpn ? ` · <span class="tarde">${sinLpn} sin código LPN</span>` : ""}`;

  $("#tablaSucursales").innerHTML = `<table>
    <thead><tr><th class="num">#</th><th>Código</th><th>Código LPN</th><th>Nombre</th><th>Ciudad</th><th class="num">Piezas enviadas</th><th>Último envío</th><th>Estado</th></tr></thead>
    <tbody>${lista.length ? lista.map((s, i) => {
      const e = envios?.get(s.codigo);
      return `<tr class="clic" data-id="${s.id}">
        <td class="num muted">${i + 1}</td>
        <td><b>${esc(s.codigo)}</b></td>
        <td>${s.codigo_lpn ? `<b>${esc(s.codigo_lpn)}</b>` : `<span class="pill camino">Falta</span>`}</td>
        <td>${esc(s.nombre || "—")}</td>
        <td>${esc(s.ciudad || "—")}</td>
        <td class="num">${envios ? numero(e?.piezas || 0) : "…"}</td>
        <td>${envios ? fechaCorta(e?.ultimo) : "…"}</td>
        <td>${s.activa ? `<span class="pill recibido">Activa</span>` : `<span class="pill gris">Inactiva</span>`}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="8" class="empty">${estado.sucursales.length ? "Ninguna sucursal coincide." : "Aún no hay sucursales. Agrega una o usa “Agregar las del historial”."}</td></tr>`}</tbody>
  </table>`;

  // Códigos del historial que todavía no están en el catálogo
  const cinco = sinCatalogo.filter(([c]) => /^[A-Z0-9]{5}$/.test(c));
  const otros = sinCatalogo.filter(([c]) => !/^[A-Z0-9]{5}$/.test(c));
  $("#avisoSucursales").hidden = !sinCatalogo.length;
  $("#avisoSucursales").innerHTML = sinCatalogo.length ? `
    ${cinco.length ? `<p><b>${cinco.length}</b> sucursales aparecen en el historial y no están en el catálogo. <button class="btn small primary" id="btnAgregarHistorial">Agregarlas</button></p>` : ""}
    ${otros.length ? `<p>Códigos de 4 caracteres (o con errores) sin sucursal asignada: ${otros.map(([c, n]) => `<b>${esc(c)}</b> (${n})`).join(", ")}. Si es un código LPN, ponlo en su sucursal al editarla.</p>` : ""}` : "";
}

function abrirSucursal(suc, recargar) {
  const nueva = !suc;
  const s = suc || { codigo: "", codigo_lpn: "", nombre: "", ciudad: "", notas: "", activa: true };
  const modal = $("#modal");
  modal.innerHTML = `<form method="dialog" id="formSucursal">
    <h2>${nueva ? "Nueva sucursal" : "Sucursal " + esc(s.codigo)}</h2>
    <div class="form-2">
      <label>Código (5 caracteres) <input name="codigo" required maxlength="5" minlength="5" pattern="[A-Za-z0-9]{5}" value="${esc(s.codigo)}" placeholder="NL023" class="mayus"></label>
      <label>Código LPN (4 caracteres) <input name="codigo_lpn" maxlength="4" minlength="4" pattern="[A-Za-z0-9]{4}" value="${esc(s.codigo_lpn || "")}" placeholder="NL23" class="mayus"></label>
      <label>Nombre <input name="nombre" value="${esc(s.nombre || "")}"></label>
      <label>Ciudad <input name="ciudad" value="${esc(s.ciudad || "")}"></label>
    </div>
    <label>Notas <input name="notas" value="${esc(s.notas || "")}"></label>
    <label class="check"><input type="checkbox" name="activa" ${s.activa ? "checked" : ""}> Activa (sale en la lista al registrar movimientos)</label>
    <p class="error" id="errSucursal"></p>
    <div class="row"><button class="btn primary" value="guardar">Guardar</button><button class="btn" value="cancelar" formnovalidate>Cancelar</button>${nueva ? "" : `<button class="btn danger" type="button" id="btnEliminarSucursal">Eliminar</button>`}</div>
  </form>`;
  modal.showModal();

  $("#btnEliminarSucursal")?.addEventListener("click", async e => {
    const boton = e.currentTarget;
    if (!boton.dataset.confirmar) { boton.dataset.confirmar = "1"; boton.textContent = "Confirmar: eliminar"; return; }
    const { error } = await supabase.from("sucursales").delete().eq("id", s.id);
    if (error) { $("#errSucursal").textContent = "No se pudo eliminar."; return; }
    modal.close();
    recargar();
  });

  $("#formSucursal").addEventListener("submit", async e => {
    if (e.submitter?.value !== "guardar") return;
    e.preventDefault();
    const f = new FormData(e.target);
    const datos = {
      codigo: f.get("codigo").trim().toUpperCase(),
      codigo_lpn: f.get("codigo_lpn").trim().toUpperCase() || null,
      nombre: f.get("nombre").trim() || null,
      ciudad: f.get("ciudad").trim() || null,
      notas: f.get("notas").trim() || null,
      activa: !!f.get("activa"),
    };
    const { error } = nueva
      ? await supabase.from("sucursales").insert(datos)
      : await supabase.from("sucursales").update(datos).eq("id", s.id);
    if (error) {
      $("#errSucursal").textContent = error.code === "23505"
        ? (error.message.includes("codigo_lpn") ? "Ese código LPN ya es de otra sucursal." : "Ya existe una sucursal con ese código.")
        : error.code === "23514" ? "El código debe tener 5 caracteres y el código LPN 4 (letras o números)." : "No se pudo guardar.";
      return;
    }
    modal.close();
    recargar();
  });
}

async function agregarDelHistorial(recargar) {
  const nuevas = sinCatalogo.filter(([c]) => /^[A-Z0-9]{5}$/.test(c)).map(([codigo]) => ({ codigo }));
  if (!nuevas.length) return;
  const { error } = await supabase.from("sucursales").insert(nuevas);
  if (error) { alert("No se pudieron agregar: " + error.message); return; }
  recargar();
}

function descargar() {
  try {
    descargarExcel("IT Mexico - Sucursales.xlsx", {
      Sucursales: filtrar().map((s, i) => ({
        "#": i + 1, Código: s.codigo, "Código LPN": s.codigo_lpn || "", Nombre: s.nombre || "", Ciudad: s.ciudad || "",
        "Piezas enviadas": envios?.get(s.codigo)?.piezas || 0, "Último envío": fechaCorta(envios?.get(s.codigo)?.ultimo),
        Estado: s.activa ? "Activa" : "Inactiva", Notas: s.notas || "",
      })),
    });
  } catch (error) {
    alert(error.message);
  }
}

export function iniciarSucursales(recargar) {
  $("#btnNuevaSucursal").addEventListener("click", () => abrirSucursal(null, recargar));
  $("#buscarSucursal").addEventListener("input", pintar);
  $("#filtroSucursal").addEventListener("change", pintar);
  $("#btnDescargarSucursales").addEventListener("click", descargar);
  $("#tablaSucursales").addEventListener("click", e => {
    const fila = e.target.closest("tr[data-id]");
    if (fila) abrirSucursal(estado.sucursales.find(s => s.id === fila.dataset.id), recargar);
  });
  $("#avisoSucursales").addEventListener("click", e => {
    if (e.target.closest("#btnAgregarHistorial")) agregarDelHistorial(recargar);
  });
  document.querySelector('#tabs [data-tab="sucursales"]').addEventListener("click", () => { if (pendiente) cargarEnvios(); });
}