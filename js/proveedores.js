import { supabase } from "./supabase.js";
import { estado, articulosDe } from "./estado.js";
import { esc, $ } from "./util.js";

export function renderProveedores() {
  $("#listaProveedores").innerHTML = estado.proveedores.length
    ? estado.proveedores.map(p => `<div class="card">
        <div class="section-head"><b>${esc(p.nombre)}</b><button class="btn small" data-id="${p.id}">Editar</button></div>
        <span>Contacto: ${esc(p.contacto || "—")}</span>
        <span>Correo: ${esc(p.correo || "—")}</span>
        <span>Teléfono: ${esc(p.telefono || "—")}</span>
        <div class="chips">${articulosDe(p.id).map(a => `<span class="chip">${esc(a.nombre)}</span>`).join("")}</div>
      </div>`).join("")
    : `<p class="empty">Aún no hay proveedores.</p>`;
}

export function iniciarProveedores(recargar) {
  $("#btnNuevoProveedor").addEventListener("click", () => abrirProveedor(null, recargar));
  $("#listaProveedores").addEventListener("click", e => {
    const b = e.target.closest("button[data-id]");
    if (b) abrirProveedor(estado.proveedores.find(p => p.id === b.dataset.id), recargar);
  });
}

function abrirProveedor(proveedor, recargar) {
  const nuevo = !proveedor;
  const p = proveedor || { nombre: "", contacto: "", correo: "", telefono: "", notas: "" };
  const modal = $("#modal");

  modal.innerHTML = `<form method="dialog" id="formProveedor">
    <h2>${nuevo ? "Nuevo proveedor" : esc(p.nombre)}</h2>
    <label>Nombre <input name="nombre" required value="${esc(p.nombre)}"></label>
    <label>Contacto <input name="contacto" value="${esc(p.contacto || "")}"></label>
    <label>Correo <input name="correo" type="email" value="${esc(p.correo || "")}"></label>
    <label>Teléfono <input name="telefono" value="${esc(p.telefono || "")}"></label>
    <label>Notas <input name="notas" value="${esc(p.notas || "")}"></label>
    <p class="error" id="errProveedor"></p>
    <div class="row"><button class="btn primary" value="guardar">Guardar</button><button class="btn" value="cancelar" formnovalidate>Cancelar</button></div>
  </form>`;
  modal.showModal();

  $("#formProveedor").addEventListener("submit", async e => {
    if (e.submitter?.value !== "guardar") return;
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    for (const k in datos) datos[k] = datos[k].trim();

    const { error } = nuevo
      ? await supabase.from("proveedores").insert(datos)
      : await supabase.from("proveedores").update(datos).eq("id", p.id);
    if (error) { $("#errProveedor").textContent = error.code === "23505" ? "Ya existe un proveedor con ese nombre." : "No se pudo guardar."; return; }

    modal.close();
    recargar();
  });
}
