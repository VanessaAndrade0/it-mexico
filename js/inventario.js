import { supabase } from "./supabase.js";
import { estado, proveedoresDe, bajoMinimo } from "./estado.js";
import { esc, $, descargarExcel, pitido, traerTodo } from "./util.js";
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
  $("#btnConteo").addEventListener("click", () => abrirConteo(recargar));
  $("#btnPedir").addEventListener("click", abrirPedir);
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

// ---------- Conteo físico con el escáner Zebra ----------
// El Zebra escribe el código como si fuera teclado y al final da Enter.
// El conteo se guarda en este navegador mientras se hace, por si se cierra la ventana.
const CLAVE_CONTEO = "itmexico-conteo";
let conteo = {};       // id del artículo -> piezas contadas
let desconocidos = {}; // código que no existe en el inventario -> lecturas

const normal = t => String(t ?? "").trim().toUpperCase();

function guardarConteo() {
  try { localStorage.setItem(CLAVE_CONTEO, JSON.stringify({ conteo, desconocidos })); } catch { /* sin almacenamiento, sigue en memoria */ }
}

function leerConteo() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_CONTEO) || "null");
    conteo = g?.conteo || {};
    desconocidos = g?.desconocidos || {};
  } catch { conteo = {}; desconocidos = {}; }
  // si un artículo se eliminó mientras tanto, se quita del conteo
  for (const id of Object.keys(conteo)) if (!estado.articulos.some(a => a.id === id)) delete conteo[id];
}

function buscarPorCodigo(codigo) {
  const c = normal(codigo);
  if (!c) return null;
  return estado.articulos.find(a => normal(a.sku) === c) || estado.articulos.find(a => normal(a.nombre) === c) || null;
}

function sumarLectura(codigo, piezas = 1) {
  const a = buscarPorCodigo(codigo);
  if (a) conteo[a.id] = (conteo[a.id] || 0) + piezas;
  else desconocidos[normal(codigo)] = (desconocidos[normal(codigo)] || 0) + piezas;
  return a;
}

function filasConteo(todos) {
  const lista = todos ? estado.articulos : estado.articulos.filter(a => a.id in conteo);
  return lista
    .map(a => ({ a, contado: conteo[a.id] || 0, dif: (conteo[a.id] || 0) - a.stock }))
    .sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif) || x.a.nombre.localeCompare(y.a.nombre));
}

function abrirConteo(recargar) {
  leerConteo();
  const modal = $("#modal");
  modal.classList.add("ancho");
  modal.innerHTML = `<form method="dialog" id="formConteo">
    <h2>Conteo físico</h2>
    <p class="ayuda">Escanea cada pieza con el Zebra: cada lectura suma 1. Si son varias piezas iguales, escribe la cantidad en <b>Piezas</b> y luego escanea una vez.
      Si el escáner guardó el conteo en Excel, cárgalo y se suma igual. Nada cambia en el inventario hasta que apliques los ajustes.</p>
    <div class="conteo-captura">
      <label>Piezas <input id="ctPiezas" type="number" min="1" value="1"></label>
      <label>Código o SKU <input id="ctCodigo" autocomplete="off" placeholder="Escanea aquí"></label>
      <label>Excel del escáner <input id="ctArchivo" type="file" accept=".xlsx,.xls,.csv,.txt"></label>
    </div>
    <div id="ctUltimo" class="lectura" hidden></div>
    <label class="check"><input type="checkbox" id="ctTodos"> Mostrar todo el inventario (lo que no se escaneó cuenta como 0)</label>
    <div id="ctResumen" class="contador"></div>
    <div class="table-wrap" id="ctTabla"></div>
    <div id="ctDesconocidos"></div>
    <p class="error" id="errConteo"></p>
    <div class="row">
      <button class="btn" type="button" id="ctDescargar">Descargar reporte</button>
      <button class="btn" type="button" id="ctReiniciar">Empezar de nuevo</button>
      <button class="btn primary empuja solo-editor" type="button" id="ctAplicar">Aplicar ajustes</button>
      <button class="btn" value="cerrar">Cerrar</button>
    </div>
  </form>`;
  modal.addEventListener("close", () => modal.classList.remove("ancho"), { once: true });
  modal.showModal();

  const codigo = $("#ctCodigo");
  const aviso = (texto, bien) => {
    $("#ctUltimo").hidden = false;
    $("#ctUltimo").className = `lectura ${bien ? "ok" : "mal"}`;
    $("#ctUltimo").innerHTML = texto;
  };

  const dibujar = () => {
    const todos = $("#ctTodos").checked;
    const filas = filasConteo(todos);
    const conDif = filas.filter(f => f.dif !== 0);
    const nd = Object.keys(desconocidos).length;
    $("#ctResumen").innerHTML = `<b>${numero(Object.keys(conteo).length)}</b> artículos contados · <b>${numero(conDif.length)}</b> con diferencia` +
      (nd ? ` · <b>${nd}</b> código(s) no encontrados` : "");
    $("#ctTabla").innerHTML = `<table>
      <thead><tr><th>Artículo</th><th>SKU</th><th>Ubicación</th><th class="num">Sistema</th><th class="num">Contado</th><th class="num">Diferencia</th></tr></thead>
      <tbody>${filas.length ? filas.map(f => `<tr class="${f.dif ? "bajo" : ""}">
        <td><b>${esc(f.a.nombre)}</b></td>
        <td>${esc(f.a.sku || "—")}</td>
        <td>${esc(f.a.ubicacion || "—")}</td>
        <td class="num">${f.a.stock}</td>
        <td class="num"><input class="contado" type="number" min="0" value="${f.contado}" data-contado="${f.a.id}"></td>
        <td class="num"><b class="${f.dif > 0 ? "dif-mas" : f.dif < 0 ? "dif-menos" : ""}">${f.dif > 0 ? "+" : ""}${f.dif}</b></td>
      </tr>`).join("") : `<tr><td colspan="6" class="empty">Todavía no hay lecturas.</td></tr>`}</tbody>
    </table>`;
    $("#ctDesconocidos").innerHTML = nd ? `<div class="alert critico"><b>Códigos que no están en el inventario:</b>
      ${Object.entries(desconocidos).map(([c, n]) => `${esc(c)} (${n})`).join(", ")}.
      Revisa que el artículo tenga ese SKU o dalo de alta; estas lecturas no generan ajustes.</div>` : "";
    $("#ctAplicar").disabled = !conDif.length;
    $("#ctAplicar").textContent = conDif.length ? `Aplicar ${conDif.length} ajuste(s)` : "Sin diferencias";
    delete $("#ctAplicar").dataset.confirmar;
  };

  // Lectura del escáner (o escrita a mano y Enter)
  codigo.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault(); // que el Enter no cierre la ventana
    if (!codigo.value.trim()) return;
    const piezas = Math.max(1, Math.round(Number($("#ctPiezas").value)) || 1);
    const a = sumarLectura(codigo.value, piezas);
    guardarConteo();
    pitido(!!a);
    aviso(a ? `+${piezas} · <b>${esc(a.nombre)}</b> → llevas ${conteo[a.id]}` : `No existe en el inventario: <b>${esc(normal(codigo.value))}</b>`, !!a);
    codigo.value = "";
    $("#ctPiezas").value = 1;
    dibujar();
  });
  $("#ctPiezas").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); codigo.focus(); } });

  // Corregir a mano lo contado
  $("#ctTabla").addEventListener("change", e => {
    const input = e.target.closest("[data-contado]");
    if (!input) return;
    conteo[input.dataset.contado] = Math.max(0, Math.round(Number(input.value)) || 0);
    guardarConteo();
    dibujar();
    codigo.focus();
  });

  $("#ctTodos").addEventListener("change", dibujar);

  // Excel del escáner: una lectura por fila, o código en una columna y cantidad en la siguiente
  $("#ctArchivo").addEventListener("change", async e => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    try {
      if (!window.XLSX) throw new Error("No se cargó el lector de Excel");
      const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
      const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1, defval: "", raw: false });
      let lecturas = 0, piezas = 0, noEncontradas = 0;
      for (const fila of filas) {
        const celdas = fila.map(c => String(c).trim());
        const i = celdas.findIndex(Boolean);
        if (i < 0) continue;
        const cod = celdas[i];
        if (/^(sku|c[oó]digo|barcode|item|art[ií]culo)$/i.test(cod)) continue; // encabezado
        const n = Number(celdas[i + 1]);
        const cant = Number.isInteger(n) && n > 0 ? n : 1;
        if (!sumarLectura(cod, cant)) noEncontradas++;
        lecturas++;
        piezas += cant;
      }
      guardarConteo();
      aviso(`Se cargó <b>${esc(archivo.name)}</b>: ${numero(lecturas)} lecturas, ${numero(piezas)} piezas${noEncontradas ? `, ${noEncontradas} sin encontrar` : ""}.`, !noEncontradas);
      dibujar();
    } catch (error) {
      aviso(`No se pudo leer el archivo: ${esc(error.message)}`, false);
    }
    e.target.value = "";
    codigo.focus();
  });

  $("#ctDescargar").addEventListener("click", () => {
    try {
      const fecha = new Date().toLocaleDateString("es-MX").replaceAll("/", "-");
      descargarExcel(`IT Mexico - Conteo fisico ${fecha}.xlsx`, {
        Conteo: filasConteo($("#ctTodos").checked).map(f => ({
          SKU: f.a.sku || "", Artículo: f.a.nombre, Ubicación: f.a.ubicacion || "", Sistema: f.a.stock, Contado: f.contado, Diferencia: f.dif,
        })),
        "No encontrados": Object.entries(desconocidos).map(([c, n]) => ({ Código: c, Lecturas: n })),
      });
    } catch (error) {
      $("#errConteo").textContent = error.message;
    }
  });

  $("#ctReiniciar").addEventListener("click", e => {
    const boton = e.currentTarget;
    if (!boton.dataset.confirmar) { boton.dataset.confirmar = "1"; boton.textContent = "Confirmar: borrar lecturas"; return; }
    conteo = {}; desconocidos = {};
    guardarConteo();
    delete boton.dataset.confirmar;
    boton.textContent = "Empezar de nuevo";
    $("#ctUltimo").hidden = true;
    dibujar();
    codigo.focus();
  });

  // Ajustes: la diferencia se registra como movimiento de tipo "ajuste" y el stock queda igual a lo contado
  $("#ctAplicar").addEventListener("click", async e => {
    const boton = e.currentTarget;
    const todos = $("#ctTodos").checked;
    if (!boton.dataset.confirmar) {
      boton.dataset.confirmar = "1";
      boton.textContent = todos ? "Confirmar (incluye lo no escaneado en 0)" : "Confirmar ajustes";
      return;
    }
    boton.disabled = true;
    $("#errConteo").textContent = "";
    // Se vuelve a leer el stock por si alguien registró un movimiento mientras se contaba
    const ids = (todos ? estado.articulos : estado.articulos.filter(a => a.id in conteo)).map(a => a.id);
    const { data: actuales, error: errLeer } = await supabase.from("articulos").select("id, stock").in("id", ids);
    if (errLeer) { $("#errConteo").textContent = "No se pudo leer el stock actual."; boton.disabled = false; return; }
    const fecha = new Date().toLocaleDateString("es-MX");
    const ajustes = actuales
      .map(a => ({ a, contado: conteo[a.id] || 0 }))
      .filter(x => x.contado !== x.a.stock)
      .map(x => ({
        tipo: "ajuste", articulo_id: x.a.id, cantidad: x.contado - x.a.stock,
        nota: `Conteo físico ${fecha}: sistema ${x.a.stock}, contado ${x.contado}`,
      }));
    if (ajustes.length) {
      const { error } = await supabase.from("movimientos").insert(ajustes);
      if (error) { $("#errConteo").textContent = "No se pudieron registrar los ajustes: " + error.message; boton.disabled = false; return; }
    }
    conteo = {}; desconocidos = {};
    guardarConteo();
    modal.close();
    recargar();
  });

  dibujar();
  codigo.focus();
}

// ---------- Qué pedir: punto de pedido con el consumo real ----------
// Con las salidas de los últimos meses se calcula cuánto se gasta al día,
// para cuántos días alcanza lo que hay y cuánto conviene pedir.
// El tiempo de entrega sale de los trucks ya recibidos (de la orden a la llegada).
const CLAVE_OBJETIVO = "itmexico-objetivo";
const DIA = 864e5;
const diasEntre = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / DIA));

function tiemposDeEntrega() {
  const porArticulo = {}, todos = [];
  for (const t of estado.trucks) {
    if (t.estado !== "recibido" || !t.fecha_orden || !t.fecha) continue;
    const d = diasEntre(t.fecha_orden, t.fecha);
    todos.push(d);
    for (const ra of t.recepcion_articulos || []) (porArticulo[ra.articulo_id] ||= []).push(d);
  }
  const prom = l => Math.round(l.reduce((a, b) => a + b, 0) / l.length);
  return { porArticulo: Object.fromEntries(Object.entries(porArticulo).map(([k, l]) => [k, prom(l)])), general: todos.length ? prom(todos) : 30, conDatos: todos.length };
}

function enCamino() {
  const c = {};
  for (const t of estado.trucks) {
    if (t.estado === "recibido") continue;
    for (const ra of t.recepcion_articulos || []) c[ra.articulo_id] = (c[ra.articulo_id] || 0) + ra.cantidad;
  }
  return c;
}

function calcularPedido(salidas, objetivo) {
  const ahora = Date.now();
  const entrega = tiemposDeEntrega();
  const camino = enCamino();
  const suma = (id, dias) => salidas.filter(m => m.articulo_id === id && ahora - new Date(m.fecha) <= dias * DIA).reduce((t, m) => t + Math.abs(m.cantidad), 0);
  return estado.articulos.map(a => {
    const s30 = suma(a.id, 30), s90 = suma(a.id, 90), s180 = suma(a.id, 180);
    const diario = s90 ? s90 / 90 : s180 / 180; // si no hubo salidas en 90 días se usa el semestre
    const tarda = entrega.porArticulo[a.id] ?? entrega.general;
    const viene = camino[a.id] || 0;
    const alcanza = diario ? Math.floor(a.stock / diario) : null;
    const puntoPedido = Math.ceil(diario * tarda) + (a.minimo || 0);
    const sugerido = Math.max(0, Math.ceil(diario * (tarda + objetivo)) + (a.minimo || 0) - a.stock - viene);
    const disponible = a.stock + viene;
    const estadoPedido = (diario && disponible <= puntoPedido) || (a.minimo > 0 && disponible <= a.minimo) ? "Pedir ya"
      : diario && alcanza !== null && alcanza <= tarda + 15 ? "Pronto"
      : "Bien";
    return { a, s30, mensual: Math.round(diario * 30 * 10) / 10, alcanza, tarda, propio: a.id in entrega.porArticulo, viene, puntoPedido, sugerido: estadoPedido === "Bien" ? 0 : Math.max(sugerido, a.minimo > 0 && disponible <= a.minimo ? a.minimo - disponible + 1 : 0), estado: estadoPedido };
  });
}

async function abrirPedir() {
  const modal = $("#modal");
  modal.classList.add("ancho", "extra");
  modal.innerHTML = `<form method="dialog" class="pedir">
    <h2>Qué pedir</h2>
    <p class="ayuda">Se calcula con las salidas reales de los últimos 3 meses. <b>Tarda en llegar</b> es el promedio de días entre la orden y la llegada de los trucks recibidos con ese artículo; si todavía no hay, se usa el promedio de todos los trucks.
      <b>Sugerido</b> es lo que falta para cubrir el tiempo de entrega más los días que elijas, sin contar lo que ya viene en camino.</p>
    <div class="row">
      <label>Quiero tener para
        <select id="pdObjetivo"><option value="30">1 mes</option><option value="60">2 meses</option><option value="90">3 meses</option></select>
      </label>
      <label class="check"><input type="checkbox" id="pdTodos"> Mostrar también los que están bien o no se mueven</label>
    </div>
    <div id="pdResumen" class="contador">Calculando…</div>
    <div class="table-wrap" id="pdTabla"></div>
    <p class="error" id="errPedir"></p>
    <div class="row">
      <button class="btn" type="button" id="pdDescargar">Descargar Excel</button>
      <button class="btn primary empuja" value="cerrar">Cerrar</button>
    </div>
  </form>`;
  modal.addEventListener("close", () => modal.classList.remove("ancho", "extra"), { once: true });
  modal.showModal();

  try { $("#pdObjetivo").value = localStorage.getItem(CLAVE_OBJETIVO) || "60"; } catch { /* se queda en 2 meses */ }

  let salidas;
  try {
    const desde = new Date(Date.now() - 180 * DIA).toISOString();
    salidas = (await traerTodo(() => supabase.from("movimientos").select("articulo_id, cantidad, fecha, anulado").eq("tipo", "salida").gte("fecha", desde)))
      .filter(m => !m.anulado);
  } catch (error) {
    $("#pdResumen").textContent = "";
    $("#errPedir").textContent = "No se pudieron leer las salidas: " + error.message;
    return;
  }

  const ORDEN = { "Pedir ya": 0, "Pronto": 1, "Bien": 2 };
  let filas = [];
  const dibujar = () => {
    const objetivo = Number($("#pdObjetivo").value);
    filas = calcularPedido(salidas, objetivo)
      .filter(f => $("#pdTodos").checked || f.estado !== "Bien")
      .sort((x, y) => ORDEN[x.estado] - ORDEN[y.estado] || (x.alcanza ?? 1e9) - (y.alcanza ?? 1e9) || x.a.nombre.localeCompare(y.a.nombre));
    const ya = filas.filter(f => f.estado === "Pedir ya").length, pronto = filas.filter(f => f.estado === "Pronto").length;
    $("#pdResumen").innerHTML = `<b>${ya}</b> para pedir ya · <b>${pronto}</b> para pedir pronto · ${numero(salidas.length)} salidas analizadas`;
    $("#pdTabla").innerHTML = `<table>
      <thead><tr><th>Artículo</th><th>Proveedor</th><th class="num">Stock</th><th class="num">En camino</th><th class="num">Salidas 30 días</th><th class="num">Prom. al mes</th><th class="num">Le alcanza</th><th class="num">Tarda en llegar</th><th class="num">Sugerido</th><th>Estado</th></tr></thead>
      <tbody>${filas.length ? filas.map(f => `<tr>
        <td><b>${esc(f.a.nombre)}</b>${f.a.sku ? `<div class="nota">${esc(f.a.sku)}</div>` : ""}</td>
        <td>${esc(proveedoresTexto(f.a) || "—")}</td>
        <td class="num">${f.a.stock}</td>
        <td class="num">${f.viene || "—"}</td>
        <td class="num">${f.s30}</td>
        <td class="num">${f.mensual || "—"}</td>
        <td class="num">${f.alcanza === null ? "—" : `${numero(f.alcanza)} días`}</td>
        <td class="num">${f.tarda} días${f.propio ? "" : '<div class="nota">promedio general</div>'}</td>
        <td class="num"><b>${f.sugerido || "—"}</b></td>
        <td><span class="pill ${f.estado === "Pedir ya" ? "atrasado" : f.estado === "Pronto" ? "camino" : "recibido"}">${f.estado}</span></td>
      </tr>`).join("") : `<tr><td colspan="10" class="empty">Nada que pedir por ahora.</td></tr>`}</tbody>
    </table>`;
  };

  $("#pdObjetivo").addEventListener("change", e => {
    try { localStorage.setItem(CLAVE_OBJETIVO, e.target.value); } catch { /* sin almacenamiento */ }
    dibujar();
  });
  $("#pdTodos").addEventListener("change", dibujar);
  $("#pdDescargar").addEventListener("click", () => {
    try {
      descargarExcel(`IT Mexico - Que pedir ${new Date().toLocaleDateString("es-MX").replaceAll("/", "-")}.xlsx`, {
        "Qué pedir": filas.map(f => ({
          Estado: f.estado, Proveedor: proveedoresTexto(f.a), SKU: f.a.sku || "", Artículo: f.a.nombre, Stock: f.a.stock, "En camino": f.viene,
          "Salidas 30 días": f.s30, "Promedio al mes": f.mensual, "Le alcanza (días)": f.alcanza ?? "", "Tarda en llegar (días)": f.tarda,
          "Punto de pedido": f.puntoPedido, Sugerido: f.sugerido,
        })),
      });
    } catch (error) { $("#errPedir").textContent = error.message; }
  });
  dibujar();
}