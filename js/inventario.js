import { supabase } from "./supabase.js";
import { estado, proveedoresDe, bajoMinimo } from "./estado.js";
import { esc, $ } from "./util.js";

export function renderInventario() {
  const q = $("#buscarArticulo").value.trim().toLowerCase();
  const lista = estado.articulos.filter(a =>
    !q || [a.nombre, a.sku, a.ubicacion, a.categoria].join(" ").toLowerCase().includes(q));

  $("#tablaArticulos").innerHTML = lista.length
    ? lista.map(a => {
        const clase = a.stock <= 0 ? "agotado" : a.minimo > 0 && a.stock <= a.minimo ? "bajo" : "";
        return `<tr class="clic ${clase}" data-id="${a.id}">
          <td>${esc(a.sku || "—")}</td>
          <td><b>${esc(a.nombre)}</b></td>
          <td>${esc(a.categoria || "—")}</td>
          <td>${esc(a.ubicacion || "—")}</td>
          <td>${esc(proveedoresDe(a.id).map(p => p.nombre).join(", ") || "—")}</td>
          <td class="num"><b>${a.stock}</b></td>
          <td class="num">${a.minimo}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="7" class="empty">No hay artículos todavía.</td></tr>`;

  // Alerta de stock bajo
  const bajos = bajoMinimo();
  $("#lowBadge").hidden = !bajos.length;
  $("#lowBadge").textContent = bajos.length;
  $("#alertaBajo").hidden = !bajos.length;
  $("#alertaBajo").innerHTML = `<b>${bajos.length}</b> artículo(s) en o debajo del mínimo: ${bajos.map(a => esc(a.nombre)).join(", ")}`;
}

export function iniciarInventario(recargar) {
  $("#buscarArticulo").addEventListener("input", renderInventario);
  $("#btnNuevoArticulo").addEventListener("click", () => abrirArticulo(null, recargar));
  $("#tablaArticulos").addEventListener("click", e => {
    const fila = e.target.closest("tr[data-id]");
    if (fila) abrirArticulo(estado.articulos.find(a => a.id === fila.dataset.id), recargar);
  });
}

function abrirArticulo(articulo, recargar) {
  const nuevo = !articulo;
  const a = articulo || { nombre: "", sku: "", categoria: "", ubicacion: "", unidad: "pzas", minimo: 0 };
  const mios = nuevo ? [] : proveedoresDe(a.id).map(p => p.id);
  const modal = $("#modal");

  modal.innerHTML = `<form method="dialog" id="formArticulo">
    <h2>${nuevo ? "Nuevo artículo" : esc(a.nombre)}</h2>
    <label>Nombre <input name="nombre" required value="${esc(a.nombre)}"></label>
    <label>SKU <input name="sku" value="${esc(a.sku || "")}"></label>
    <label>Categoría <input name="categoria" value="${esc(a.categoria || "")}"></label>
    <label>Ubicación <input name="ubicacion" value="${esc(a.ubicacion || "")}"></label>
    <label>Mínimo para alerta <input name="minimo" type="number" min="0" value="${a.minimo}"></label>
    ${nuevo ? `<label>Stock inicial <input name="stock" type="number" min="0" value="0"></label>` : `<p class="muted">Stock actual: <b>${a.stock}</b>. Para cambiarlo registra una entrada, salida o ajuste.</p>`}
    <label>Proveedores</label>
    <div class="checklist">${estado.proveedores.map(p =>
      `<label><input type="checkbox" name="prov" value="${p.id}" ${mios.includes(p.id) ? "checked" : ""}> ${esc(p.nombre)}</label>`).join("") || '<span class="muted">Agrega proveedores en su pestaña.</span>'}</div>
    <p class="error" id="errArticulo"></p>
    <div class="row"><button class="btn primary" value="guardar">Guardar</button><button class="btn" value="cancelar" formnovalidate>Cancelar</button></div>
  </form>`;
  modal.showModal();

  $("#formArticulo").addEventListener("submit", async e => {
    if (e.submitter?.value !== "guardar") return;
    e.preventDefault();
    const f = new FormData(e.target);
    const datos = {
      nombre: f.get("nombre").trim(),
      sku: f.get("sku").trim(),
      categoria: f.get("categoria").trim(),
      ubicacion: f.get("ubicacion").trim(),
      minimo: Number(f.get("minimo")) || 0,
    };
    if (nuevo) datos.stock = Number(f.get("stock")) || 0;

    const { data, error } = nuevo
      ? await supabase.from("articulos").insert(datos).select().single()
      : await supabase.from("articulos").update(datos).eq("id", a.id).select().single();
    if (error) { $("#errArticulo").textContent = error.code === "23505" ? "Ya existe un artículo con ese nombre." : "No se pudo guardar."; return; }

    // Guardar qué proveedores surten este artículo
    await supabase.from("articulo_proveedor").delete().eq("articulo_id", data.id);
    const elegidos = f.getAll("prov").map(proveedor_id => ({ articulo_id: data.id, proveedor_id }));
    if (elegidos.length) await supabase.from("articulo_proveedor").insert(elegidos);

    modal.close();
    recargar();
  });
}
