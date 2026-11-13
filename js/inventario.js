import { supabase } from "./supabase.js";
import { estado, proveedoresDe, bajoMinimo } from "./estado.js";
import { esc, $, descargarExcel } from "./util.js";
import { numero, opciones, agrupar, tablaGrupos } from "./filtros.js";

const estadoDe = a => a.stock <= 0 ? "Agotado" : a.minimo > 0 && a.stock <= a.minimo ? "Bajo mínimo" : "OK";
const proveedoresTexto = a => proveedoresDe(a.id).map(p => p.nombre).join(", ");

const AGRUPAR = {
  categoria: { titulo: "Categoría", clave: a => a.categoria, filtro: "#iCategoria" },
  marca: { titulo: "Marca", clave: a => a.marca, filtro: "#iMarca" },
  proveedor: { titulo: "Proveedor", clave: a => proveedoresTexto(a) },
  ubicacion: { titulo: "Ubicación", clave: a => a.ubicacion },
  estado: { titulo: "Estado", clave: estadoDe, filtro: "#iEstado" },
};

function filtrar() {
  const v = id => $(id).value;
  const q = v("#buscarArticulo").trim().toLowerCase();
  return estado.articulos.filter(a =>
    (!v("#iCategoria") || a.categoria === v("#iCategoria")) &&
    (!v("#iMarca") || a.marca === v("#iMarca")) &&
    (!v("#iProveedor") || proveedoresDe(a.id).some(p => p.nombre === v("#iProveedor"))) &&
    (!v("#iEstado") || estadoDe(a) === v("#iEstado")) &&
    (!q || [a.nombre, a.sku, a.marca, a.modelo, a.ubicacion, a.categoria].join(" ").toLowerCase().includes(q)));
}

export function renderInventario() {
  const unicos = f => [...new Set(estado.articulos.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  opciones($("#iCategoria"), unicos(a => a.categoria));
  opciones($("#iMarca"), unicos(a => a.marca));
  opciones($("#iProveedor"), estado.proveedores.map(p => p.nombre).sort((a, b) => a.localeCompare(b)));

  const lista = filtrar();
  const piezas = lista.reduce((s, a) => s + a.stock, 0);
  $("#contadorInventario").innerHTML = `<b>${numero(lista.length)}</b> artículos · <b>${numero(piezas)}</b> piezas en stock${lista.length !== estado.articulos.length ? ` <span class="muted">(de ${numero(estado.articulos.length)} artículos)</span>` : ""}`;

  const modo = $("#iAgrupar").value;
  if (modo) {
    const g = AGRUPAR[modo];
    $("#tablaArticulos").innerHTML = tablaGrupos(agrupar(lista, g.clave, a => a.stock), {
      titulo: g.titulo, registros: "Artículos", cantidad: "Piezas en stock",
      extra: { titulo: "Agotados o bajo mínimo", valor: f => numero(lista.filter(a => (g.clave(a) || "(vacío)") === f.grupo && estadoDe(a) !== "OK").length) },
    });
  } else {
    $("#tablaArticulos").innerHTML = `<table>
      <thead><tr><th class="num">#</th><th>SKU</th><th>Artículo</th><th>Categoría</th><th>Ubicación</th><th>Proveedores</th><th class="num">Stock</th><th class="num">Mínimo</th></tr></thead>
      <tbody>${lista.length ? lista.map((a, i) => {
        const clase = a.stock <= 0 ? "agotado" : a.minimo > 0 && a.stock <= a.minimo ? "bajo" : "";
        return `<tr class="clic ${clase}" data-id="${a.id}">
          <td class="num muted">${i + 1}</td>
          <td>${esc(a.sku || "—")}</td>
          <td><b>${esc(a.nombre)}</b>${a.marca || a.modelo ? `<div class="nota">${esc([a.marca, a.modelo].filter(Boolean).join(" · "))}</div>` : ""}</td>
          <td>${esc(a.categoria || "—")}</td>
          <td>${esc(a.ubicacion || "—")}</td>
          <td>${esc(proveedoresTexto(a) || "—")}</td>
          <td class="num"><b>${a.stock}</b></td>
          <td class="num">${a.minimo}</td>
        </tr>`;
      }).join("") : `<tr><td colspan="8" class="empty">${estado.articulos.length ? "Nada coincide con los filtros." : "No hay artículos todavía."}</td></tr>`}</tbody>
    </table>`;
  }

  // Alerta de stock bajo
  const bajos = bajoMinimo();
  $("#lowBadge").hidden = !bajos.length;
  $("#lowBadge").textContent = bajos.length;
  $("#alertaBajo").hidden = !bajos.length;
  $("#alertaBajo").innerHTML = `<b>${bajos.length}</b> artículo(s) en o debajo del mínimo: ${bajos.map(a => esc(a.nombre)).join(", ")}`;
}

function descargarInventario() {
  const modo = $("#iAgrupar").value;
  const lista = filtrar();
  try {
    if (modo) {
      const g = AGRUPAR[modo];
      descargarExcel(`IT Mexico - Inventario por ${g.titulo.toLowerCase()}.xlsx`, {
        [g.titulo]: agrupar(lista, g.clave, a => a.stock).map((f, i) => ({ "#": i + 1, [g.titulo]: f.grupo, Artículos: f.registros, "Piezas en stock": f.cantidad })),
      });
    } else {
      descargarExcel("IT Mexico - Inventario filtrado.xlsx", {
        Inventario: lista.map((a, i) => ({
          "#": i + 1, SKU: a.sku || "", Artículo: a.nombre, Marca: a.marca || "", Modelo: a.modelo || "", Categoría: a.categoria || "",
          Ubicación: a.ubicacion || "", Proveedores: proveedoresTexto(a), Stock: a.stock, Mínimo: a.minimo, Estado: estadoDe(a),
        })),
      });
    }
  } catch (error) {
    alert(error.message);
  }
}

export function iniciarInventario(recargar) {
  $("#buscarArticulo").addEventListener("input", renderInventario);
  ["#iCategoria", "#iMarca", "#iProveedor", "#iEstado", "#iAgrupar"].forEach(id => $(id).addEventListener("change", renderInventario));
  $("#btnLimpiarInventario").addEventListener("click", () => {
    ["#buscarArticulo", "#iCategoria", "#iMarca", "#iProveedor", "#iEstado", "#iAgrupar"].forEach(id => { $(id).value = ""; });
    renderInventario();
  });
  $("#btnDescargarInventario").addEventListener("click", descargarInventario);
  $("#btnNuevoArticulo").addEventListener("click", () => abrirArticulo(null, recargar));
  $("#tablaArticulos").addEventListener("click", e => {
    const fila = e.target.closest("tr[data-id]");
    if (fila) return abrirArticulo(estado.articulos.find(a => a.id === fila.dataset.id), recargar);
    // Al tocar un grupo se filtra por él y se regresa a la lista
    const grupo = e.target.closest("tr[data-grupo]");
    if (!grupo) return;
    const g = AGRUPAR[$("#iAgrupar").value];
    if ($("#iAgrupar").value === "proveedor" && grupo.dataset.grupo !== "(vacío)") $("#iProveedor").value = grupo.dataset.grupo.split(", ")[0];
    else if (g?.filtro && grupo.dataset.grupo !== "(vacío)") $(g.filtro).value = grupo.dataset.grupo;
    else if (g) $("#buscarArticulo").value = grupo.dataset.grupo === "(vacío)" ? "" : grupo.dataset.grupo.split(",")[0];
    $("#iAgrupar").value = "";
    renderInventario();
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
    <div class="form-2">
      <label>SKU / número de parte <input name="sku" value="${esc(a.sku || "")}"></label>
      <label>Categoría <input name="categoria" value="${esc(a.categoria || "")}" list="listaCategorias"></label>
      <label>Marca <input name="marca" value="${esc(a.marca || "")}"></label>
      <label>Modelo <input name="modelo" value="${esc(a.modelo || "")}"></label>
      <label>Ubicación <input name="ubicacion" value="${esc(a.ubicacion || "")}" placeholder="Ej. IT-4-04"></label>
      <label>Mínimo para alerta <input name="minimo" type="number" min="0" value="${a.minimo}"></label>
    </div>
    <datalist id="listaCategorias">${[...new Set(estado.articulos.map(x => x.categoria).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    ${nuevo ? `<label>Stock inicial <input name="stock" type="number" min="0" value="0"></label>` : `<p class="muted">Stock actual: <b>${a.stock}</b>. Para cambiarlo registra una entrada, salida o ajuste.</p>`}
    <label>Proveedores</label>
    <div class="checklist">${estado.proveedores.map(p =>
      `<label><input type="checkbox" name="prov" value="${p.id}" ${mios.includes(p.id) ? "checked" : ""}> ${esc(p.nombre)}</label>`).join("") || '<span class="muted">Agrega proveedores en su pestaña.</span>'}</div>
    <p class="error" id="errArticulo"></p>
    <div class="row"><button class="btn primary" value="guardar">Guardar</button><button class="btn" value="cancelar" formnovalidate>Cancelar</button>${nuevo ? "" : `<button class="btn danger" type="button" id="btnEliminarArticulo">Eliminar</button>`}</div>
  </form>`;
  modal.showModal();

  // Eliminar pide un segundo clic para confirmar
  $("#btnEliminarArticulo")?.addEventListener("click", async e => {
    const boton = e.currentTarget;
    if (!boton.dataset.confirmar) {
      boton.dataset.confirmar = "1";
      boton.textContent = "Confirmar: eliminar";
      return;
    }
    const { error } = await supabase.from("articulos").delete().eq("id", a.id);
    if (error) {
      $("#errArticulo").textContent = error.code === "23503"
        ? "Este artículo tiene movimientos y no se puede eliminar. Si ya no se usa, deja su mínimo en 0."
        : "No se pudo eliminar.";
      return;
    }
    modal.close();
    recargar();
  });

  $("#formArticulo").addEventListener("submit", async e => {
    if (e.submitter?.value !== "guardar") return;
    e.preventDefault();
    const f = new FormData(e.target);
    const datos = {
      nombre: f.get("nombre").trim(),
      sku: f.get("sku").trim() || null,
      categoria: f.get("categoria").trim() || null,
      marca: f.get("marca").trim() || null,
      modelo: f.get("modelo").trim() || null,
      ubicacion: f.get("ubicacion").trim() || null,
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