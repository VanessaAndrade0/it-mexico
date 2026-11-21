import { supabase } from "./supabase.js";
import { estado } from "./estado.js";
import { esc, $, traerTodo, descargarExcel } from "./util.js";
import { numero } from "./filtros.js";

// Piezas enviadas por sucursal, sumando sus dos códigos (se calcula al abrir la pestaña)
let envios = null;         // Map código de 5 -> { piezas, ultimo }
let sinCatalogo = [];      // códigos que aparecen en el historial y no están en el catálogo
let piezasPorCodigo = new Map(); // cualquier código del historial -> piezas (para sugerir)
let pendiente = true;

const visible = () => !document.querySelector('section[data-view="sucursales"]').hidden;
const fechaCorta = iso => iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function renderSucursales() {
  // Lista para el formulario de movimientos
  $("#listaSucursales").innerHTML = estado.sucursales.filter(s => s.activa)
    .map(s => `<option value="${esc(s.codigo)}">${esc([s.codigo_corto && `${s.codigo_corto}`, s.nombre, s.ciudad].filter(Boolean).join(" · "))}</option>`).join("");

  pendiente = true;
  if (visible()) cargarEnvios(); else pintar();
}

async function cargarEnvios() {
  pendiente = false;
  try {
    const movs = await traerTodo(() => supabase.from("movimientos").select("sucursal, cantidad, fecha, tipo, anulado").eq("tipo", "salida").order("id"));
    const porCodigo = new Map(estado.sucursales.flatMap(s => [[s.codigo, s.codigo], ...(s.codigo_corto ? [[s.codigo_corto, s.codigo]] : [])]));
    envios = new Map();
    piezasPorCodigo = new Map();
    const faltan = new Map();
    for (const m of movs) {
      if (m.anulado || !m.sucursal) continue;
      const c = m.sucursal.toUpperCase();
      piezasPorCodigo.set(c, (piezasPorCodigo.get(c) || 0) + Math.abs(m.cantidad));
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
    (!f || (f === "activas" && s.activa) || (f === "inactivas" && !s.activa) || (f === "sinlpn" && !s.codigo_corto)) &&
    (!q || [s.codigo, s.codigo_corto, s.nombre, s.ciudad, s.notas].join(" ").toLowerCase().includes(q)));
}

function pintar() {
  const lista = filtrar();
  const sinLpn = estado.sucursales.filter(s => !s.codigo_corto).length;
  $("#contadorSucursales").innerHTML = `<b>${numero(lista.length)}</b> sucursales${lista.length !== estado.sucursales.length ? ` <span class="muted">(de ${numero(estado.sucursales.length)})</span>` : ""}${sinLpn ? ` · <span class="tarde">${sinLpn} sin código de 4</span>` : ""}`;

  $("#tablaSucursales").innerHTML = `<table>
    <thead><tr><th class="num">#</th><th>Código de 5</th><th>Código de 4</th><th>Nombre</th><th>Ciudad</th><th class="num">Piezas enviadas</th><th>Último envío</th><th>Estado</th></tr></thead>
    <tbody>${lista.length ? lista.map((s, i) => {
      const e = envios?.get(s.codigo);
      return `<tr class="clic" data-id="${s.id}">
        <td class="num muted">${i + 1}</td>
        <td><b>${esc(s.codigo)}</b></td>
        <td>${s.codigo_corto ? `<b>${esc(s.codigo_corto)}</b>` : `<span class="pill camino">Falta</span>`}</td>
        <td>${esc(s.nombre || "—")}</td>
        <td>${esc(s.ciudad || "—")}</td>
        <td class="num">${envios ? numero(e?.piezas || 0) : "…"}</td>
        <td>${envios ? fechaCorta(e?.ultimo) : "…"}</td>
        <td>${s.activa ? `<span class="pill recibido">Activa</span>` : `<span class="pill gris">Inactiva</span>`}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="8" class="empty">${mensajeVacio()}</td></tr>`}</tbody>
  </table>`;

  // Códigos del historial que todavía no están en el catálogo
  const cinco = sinCatalogo.filter(([c]) => /^[A-Z0-9]{5}$/.test(c));
  const otros = sinCatalogo.filter(([c]) => !/^[A-Z0-9]{5}$/.test(c));
  $("#avisoSucursales").hidden = !sinCatalogo.length;
  $("#avisoSucursales").innerHTML = sinCatalogo.length ? `
    ${cinco.length ? `<p><b>${cinco.length}</b> sucursales aparecen en el historial y no están en el catálogo. <button class="btn small primary" id="btnAgregarHistorial">Agregarlas</button></p>` : ""}
    ${otros.length ? `<p>Códigos que no son de 5 caracteres (códigos de 4 o mal escritos): ${otros.map(([c, n]) => `<b>${esc(c)}</b> (${n})`).join(", ")}. <button class="btn small primary" data-revisar>Revisar y corregir</button></p>` : ""}` : "";
}

function mensajeVacio() {
  const q = $("#buscarSucursal").value.trim().toUpperCase();
  const raro = sinCatalogo.find(([c]) => c === q);
  if (raro) return `<b>${esc(q)}</b> no es una sucursal del catálogo; aparece en ${numero(raro[1])} envíos del historial. <button class="btn small primary" data-revisar>Revisar y corregir</button>`;
  return estado.sucursales.length ? "Ninguna sucursal coincide." : "Aún no hay sucursales. Usa “Agregarlas” arriba para traer las del historial.";
}

// ---------- Corregir códigos automáticamente ----------

const esCodigo5 = c => /^[A-Z0-9]{5}$/.test(c);

function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Sucursales de 5 caracteres que podrían ser este código, de la más probable a la menos
function sugerencias(codigo) {
  const candidatos = new Map(); // código de 5 -> puntos
  for (const s of estado.sucursales) candidatos.set(s.codigo, 0);
  for (const [c] of piezasPorCodigo) if (esCodigo5(c)) candidatos.set(c, 0);
  const sumar = (c, pts) => { if (candidatos.has(c)) candidatos.set(c, candidatos.get(c) + pts); };

  if (codigo.length === 4) {
    // El código de 4 es el de 5 con un carácter menos: BME2 -> BJME2, CI05 -> CI005
    for (const c of candidatos.keys()) for (let i = 0; i < 5; i++) if (c.slice(0, i) + c.slice(i + 1) === codigo) sumar(c, 10);
  } else if (codigo.length > 5) {
    // Un carácter de más: NL0029 -> NL029, CIJUIA -> CIJUA
    for (let i = 0; i < codigo.length; i++) sumar(codigo.slice(0, i) + codigo.slice(i + 1), 10);
  }
  for (const c of candidatos.keys()) {
    const d = distancia(codigo, c);
    if (d <= 2) sumar(c, 3 - d);
  }
  return [...candidatos].filter(([, pts]) => pts > 0)
    .sort((a, b) => b[1] - a[1] || (piezasPorCodigo.get(b[0]) || 0) - (piezasPorCodigo.get(a[0]) || 0))
    .slice(0, 5).map(([c]) => c);
}

function abrirRevision(recargar) {
  const raros = sinCatalogo.filter(([c]) => !esCodigo5(c));
  const todos5 = [...new Set([...estado.sucursales.map(s => s.codigo), ...[...piezasPorCodigo.keys()].filter(esCodigo5)])].sort();
  const modal = $("#modal");
  modal.classList.add("ancho");
  modal.innerHTML = `<form method="dialog" id="formRevision">
    <h2>Revisar códigos de sucursal</h2>
    <p class="muted">Para cada código la app propone la sucursal más parecida. Revisa y cambia lo que no sea correcto.</p>
    <ul class="lista-simple ayuda">
      <li><b>Es su código de 4:</b> se guarda como el código de 4 de esa sucursal y sus envíos se suman con ella.</li>
      <li><b>Está mal escrito:</b> los envíos se corrigen al código de 5 que elijas.</li>
    </ul>
    <datalist id="listaCodigos5">${todos5.map(c => `<option value="${esc(c)}">${esc(estado.sucursales.find(s => s.codigo === c)?.nombre || "")}</option>`).join("")}</datalist>
    <div class="table-wrap"><table>
      <thead><tr><th>Código</th><th class="num">Piezas</th><th>¿Qué es?</th><th>Sucursal (5)</th></tr></thead>
      <tbody>${raros.map(([c, n], i) => {
        const sug = sugerencias(c);
        const accion = !sug.length ? "nada" : c.length === 4 ? "lpn" : "corregir";
        return `<tr data-codigo="${esc(c)}">
          <td><b>${esc(c)}</b></td>
          <td class="num">${numero(n)}</td>
          <td><select name="accion-${i}">
            ${c.length === 4 ? `<option value="lpn" ${accion === "lpn" ? "selected" : ""}>Es su código de 4</option>` : ""}
            <option value="corregir" ${accion === "corregir" ? "selected" : ""}>Está mal escrito</option>
            <option value="nada" ${accion === "nada" ? "selected" : ""}>Dejar así</option>
          </select></td>
          <td><input name="destino-${i}" list="listaCodigos5" class="mayus" maxlength="5" value="${esc(sug[0] || "")}" placeholder="Elige sucursal">
            ${sug.length > 1 ? `<div class="nota">También podría ser: ${sug.slice(1).map(x => `<button type="button" class="enlace" data-usar="${esc(x)}">${esc(x)}</button>`).join(" ")}</div>` : ""}
          </td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>
    <p class="error" id="errRevision"></p>
    <div class="row"><button class="btn primary" value="aplicar">Aplicar cambios</button><button class="btn" value="cancelar" formnovalidate>Cancelar</button><span class="muted" id="progRevision"></span></div>
  </form>`;
  modal.addEventListener("close", () => modal.classList.remove("ancho"), { once: true });
  modal.showModal();

  $("#formRevision").addEventListener("click", e => {
    const b = e.target.closest("[data-usar]");
    if (b) b.closest("td").querySelector("input").value = b.dataset.usar;
  });

  $("#formRevision").addEventListener("submit", async e => {
    if (e.submitter?.value !== "aplicar") return;
    e.preventDefault();
    const err = t => { $("#errRevision").textContent = t; };
    const cambios = [...e.target.querySelectorAll("tr[data-codigo]")].map(tr => ({
      codigo: tr.dataset.codigo,
      accion: tr.querySelector("select").value,
      destino: tr.querySelector("input").value.trim().toUpperCase(),
    })).filter(c => c.accion !== "nada");

    // Revisar antes de cambiar nada
    for (const c of cambios) {
      if (!esCodigo5(c.destino)) return err(`Para ${c.codigo} elige una sucursal de 5 caracteres.`);
      if (c.accion === "lpn") {
        const s = estado.sucursales.find(x => x.codigo === c.destino);
        if (s?.codigo_corto && s.codigo_corto !== c.codigo) return err(`${c.destino} ya tiene el código de 4 ${s.codigo_corto}.`);
        if (cambios.some(o => o !== c && o.accion === "lpn" && o.destino === c.destino)) return err(`Elegiste ${c.destino} para dos códigos de 4 distintos.`);
      }
    }
    if (!cambios.length) { modal.close(); return; }

    try {
      let hechos = 0;
      for (const c of cambios) {
        $("#progRevision").textContent = `Aplicando ${++hechos} de ${cambios.length}…`;
        const existe = estado.sucursales.find(x => x.codigo === c.destino);
        if (c.accion === "lpn") {
          const r = existe
            ? await supabase.from("sucursales").update({ codigo_corto: c.codigo }).eq("id", existe.id)
            : await supabase.from("sucursales").insert({ codigo: c.destino, codigo_corto: c.codigo });
          if (r.error) throw r.error;
        } else {
          if (!existe) {
            const r = await supabase.from("sucursales").insert({ codigo: c.destino });
            if (r.error && r.error.code !== "23505") throw r.error;
          }
          const r = await supabase.from("movimientos").update({ sucursal: c.destino }).eq("sucursal", c.codigo).eq("anulado", false);
          if (r.error) throw r.error;
        }
      }
      modal.close();
      recargar();
    } catch (error) {
      console.error(error);
      err("No se pudo terminar: " + error.message + ". Lo que ya se aplicó se queda; vuelve a abrir la revisión para lo que falte.");
    }
  });
}

function abrirSucursal(suc, recargar) {
  const nueva = !suc;
  const s = suc || { codigo: "", codigo_corto: "", nombre: "", ciudad: "", notas: "", activa: true };
  const modal = $("#modal");
  modal.innerHTML = `<form method="dialog" id="formSucursal">
    <h2>${nueva ? "Nueva sucursal" : "Sucursal " + esc(s.codigo)}</h2>
    <div class="form-2">
      <label>Código de 5 caracteres <input name="codigo" required maxlength="5" minlength="5" pattern="[A-Za-z0-9]{5}" value="${esc(s.codigo)}" placeholder="NL023" class="mayus"></label>
      <label>Código de 4 caracteres <input name="codigo_corto" maxlength="4" minlength="4" pattern="[A-Za-z0-9]{4}" value="${esc(s.codigo_corto || "")}" placeholder="NL23" class="mayus"></label>
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
      codigo_corto: f.get("codigo_corto").trim().toUpperCase() || null,
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
        ? (error.message.includes("codigo_corto") ? "Ese código de 4 ya es de otra sucursal." : "Ya existe una sucursal con ese código.")
        : error.code === "23514" ? "El código debe tener 5 caracteres y el otro 4 (letras o números)." : "No se pudo guardar.";
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
        "#": i + 1, "Código de 5": s.codigo, "Código de 4": s.codigo_corto || "", Nombre: s.nombre || "", Ciudad: s.ciudad || "",
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
    if (e.target.closest("[data-revisar]")) abrirRevision(recargar);
  });
  $("#tablaSucursales").addEventListener("click", e => {
    if (e.target.closest("[data-revisar]")) abrirRevision(recargar);
  });
  document.querySelector('#tabs [data-tab="sucursales"]').addEventListener("click", () => { if (pendiente) cargarEnvios(); });
}