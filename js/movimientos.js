import { supabase } from "./supabase.js";
import { estado } from "./estado.js";
import { esc, formatoFecha, $ } from "./util.js";

// Convierte una fecha de Supabase al formato que usa <input type="datetime-local">
function aFechaLocal(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function renderMovimientos() {
  // Llenar selects con los datos actuales
  const actual = $("#movArticulo").value;
  $("#movArticulo").innerHTML = `<option value="">— Elige artículo —</option>` +
    estado.articulos.map(a => `<option value="${a.id}">${esc(a.nombre)} (stock ${a.stock})</option>`).join("");
  $("#movArticulo").value = actual;

  $("#movProveedor").innerHTML = `<option value="">— Sin proveedor —</option>` +
    estado.proveedores.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");

  $("#tablaMovimientos").innerHTML = estado.movimientos.length
    ? estado.movimientos.map(m => `<tr class="${m.anulado ? "anulado" : ""}">
        <td>${formatoFecha(m.fecha)}</td>
        <td>${m.tipo}</td>
        <td>${esc(m.articulos?.nombre || "")}${m.serie ? `<div class="nota">S/N ${esc(m.serie)}</div>` : ""}${m.nota ? `<div class="nota">${esc(m.nota)}</div>` : ""}</td>
        <td class="num">${m.tipo === "salida" ? "−" : ""}${m.cantidad}</td>
        <td>${esc(m.ticket || "")}</td>
        <td>${esc(m.sucursal || "")}</td>
        <td>${esc(m.solicitante || "")}</td>
        <td>${esc(m.lpn || "")}</td>
        <td>${m.historico ? `<span class="pill gris">Historial</span>` : esc(m.registrado_por || "")}${m.editado_por ? `<div class="nota">Editado por ${esc(m.editado_por)}</div>` : ""}</td>
        <td class="acciones">${m.anulado ? `<span class="etiqueta">Anulado</span>` : `<button class="btn small" data-editar="${m.id}">Editar</button>`}<button class="btn small danger" data-eliminar="${m.id}">Eliminar</button></td>
      </tr>`).join("")
    : `<tr><td colspan="10" class="empty">Sin movimientos todavía.</td></tr>`;
}

export function iniciarMovimientos(recargar) {
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
    if (editar) abrirEditar(estado.movimientos.find(m => m.id === editar.dataset.editar), recargar);
    if (eliminar) abrirEliminar(estado.movimientos.find(m => m.id === eliminar.dataset.eliminar), recargar);
  });
}

function abrirEditar(m, recargar) {
  if (!m) return;
  const modal = $("#modal");
  modal.innerHTML = `<form method="dialog" id="formEditarMov">
    <h2>Editar movimiento</h2>
    <p class="muted">${m.tipo} de ${m.cantidad} · ${esc(m.articulos?.nombre || "")}. El artículo y la cantidad no se editan: si están mal, elimina este movimiento y registra uno nuevo.</p>
    <label>Fecha <input name="fecha" type="datetime-local" required value="${aFechaLocal(m.fecha)}"></label>
    <label>Ticket (REQ) <input name="ticket" value="${esc(m.ticket || "")}"></label>
    <label>Sucursal <input name="sucursal" maxlength="5" value="${esc(m.sucursal || "")}"></label>
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
    const { error } = await supabase.from("movimientos").update(cambios).eq("id", m.id);
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
    <p><b>${m.tipo} de ${m.cantidad}</b> · ${esc(m.articulos?.nombre || "")} · ${formatoFecha(m.fecha)}</p>
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
    const { error } = await supabase.from("movimientos").delete().eq("id", m.id);
    if (error) { $("#errEliminarMov").textContent = "No se pudo eliminar: " + error.message; return; }
    modal.close();
    recargar();
  });
}