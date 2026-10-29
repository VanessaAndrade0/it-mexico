import { supabase } from "./supabase.js";
import { estado } from "./estado.js";
import { esc, formatoFecha, $ } from "./util.js";

export function renderMovimientos() {
  // Llenar selects con los datos actuales
  const actual = $("#movArticulo").value;
  $("#movArticulo").innerHTML = `<option value="">— Elige artículo —</option>` +
    estado.articulos.map(a => `<option value="${a.id}">${esc(a.nombre)} (stock ${a.stock})</option>`).join("");
  $("#movArticulo").value = actual;

  $("#movProveedor").innerHTML = `<option value="">— Sin proveedor —</option>` +
    estado.proveedores.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");

  $("#tablaMovimientos").innerHTML = estado.movimientos.length
    ? estado.movimientos.map(m => `<tr>
        <td>${formatoFecha(m.fecha)}</td>
        <td>${m.tipo}</td>
        <td>${esc(m.articulos?.nombre || "")}</td>
        <td class="num">${m.tipo === "salida" ? "−" : ""}${m.cantidad}</td>
        <td>${esc(m.ticket || "")}</td>
        <td>${esc(m.sucursal || "")}</td>
        <td>${esc(m.solicitante || "")}</td>
        <td>${esc(m.lpn || "")}</td>
        <td>${esc(m.registrado_por || "")}</td>
      </tr>`).join("")
    : `<tr><td colspan="9" class="empty">Sin movimientos todavía.</td></tr>`;
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
}
