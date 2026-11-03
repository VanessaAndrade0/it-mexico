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
        <td>${esc(m.articulos?.nombre || "")}${m.nota ? `<div class="nota">${esc(m.nota)}</div>` : ""}</td>
        <td class="num">${m.tipo === "salida" ? "−" : ""}${m.cantidad}</td>
        <td>${esc(m.ticket || "")}</td>
        <td>${esc(m.sucursal || "")}</td>
        <td>${esc(m.solicitante || "")}</td>
        <td>${esc(m.lpn || "")}</td>
        <td>${esc(m.registrado_por || "")}${m.editado_por ? `<div class="nota">Editado por ${esc(m.editado_por)}</div>` : ""}</td>
        <td class="acciones">${m.anulado
          ? `<span class="etiqueta" title="${esc(m.motivo_anulacion || "")}">Anulado</span><div class="nota">${esc(m.anulado_por || "")}</div>`
          : `<button class="btn small" data-editar="${m.id}">Editar</button><button class="btn small danger" data-anular="${m.id}">Anular</button>`}</td>
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

  // Botones Editar y Anular del historial
  $("#tablaMovimientos").addEventListener("click", e => {
    const editar = e.target.closest("[data-editar]");
    const anular = e.target.closest("[data-anular]");
    if (editar) abrirEditar(estado.movimientos.find(m => m.id === editar.dataset.editar), recargar);
    if (anular) abrirAnular(estado.movimientos.find(m => m.id === anular.dataset.anular), recargar);
  });
}

function abrirEditar(m, recargar) {
  if (!m) return;
  const modal = $("#modal");
  modal.innerHTML = `<form method="dialog" id="formEditarMov">
    <h2>Editar movimiento</h2>
    <p class="muted">${m.tipo} de ${m.cantidad} · ${esc(m.articulos?.nombre || "")}. El artículo y la cantidad no se editan: si están mal, anula este movimiento y registra uno nuevo.</p>
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

function abrirAnular(m, recargar) {
  if (!m) return;
  const modal = $("#modal");
  modal.innerHTML = `<form method="dialog" id="formAnular">
    <h2>Anular movimiento</h2>
    <p><b>${m.tipo} de ${m.cantidad}</b> · ${esc(m.articulos?.nombre || "")} · ${formatoFecha(m.fecha)}</p>
    <p class="muted">El stock regresa a como estaba antes de este movimiento. El registro se queda en el historial marcado como anulado.</p>
    <label>Motivo <input name="motivo" required placeholder="Ej. se registró dos veces"></label>
    <p class="error" id="errAnular"></p>
    <div class="row"><button class="btn danger" value="anular">Anular</button><button class="btn" value="cancelar" formnovalidate>Cancelar</button></div>
  </form>`;
  modal.showModal();

  $("#formAnular").addEventListener("submit", async e => {
    if (e.submitter?.value !== "anular") return;
    e.preventDefault();
    const motivo = new FormData(e.target).get("motivo").trim();
    const { error } = await supabase.from("movimientos")
      .update({ anulado: true, motivo_anulacion: motivo })
      .eq("id", m.id);
    if (error) { $("#errAnular").textContent = "No se pudo anular: " + error.message; return; }
    modal.close();
    recargar();
  });
}