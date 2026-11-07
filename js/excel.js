import { supabase } from "./supabase.js";
import { estado, proveedoresDe } from "./estado.js";
import { esc, $ } from "./util.js";

// XLSX viene de la librería SheetJS que se carga en index.html

const CAMPOS = [
  { clave: "nombre", etiqueta: "Artículo (nombre)", requerido: true, buscar: /art[ií]culo|descrip|item|producto|nombre|material/i },
  { clave: "sku", etiqueta: "SKU / código", buscar: /sku|c[oó]digo|part|no\.? ?parte|clave/i },
  { clave: "stock", etiqueta: "Stock / existencia", buscar: /stock|exist|cantidad|qty|quantity|on ?hand|inventario/i },
  { clave: "minimo", etiqueta: "Mínimo", buscar: /m[ií]n/i },
  { clave: "categoria", etiqueta: "Categoría", buscar: /categ|tipo|familia/i },
  { clave: "ubicacion", etiqueta: "Ubicación", buscar: /ubic|locat|rack|anaquel|bin/i },
  { clave: "proveedor", etiqueta: "Proveedor", buscar: /provee|vendor|supplier/i },
];

const imp = { libro: null, encabezados: [], filas: [], mapa: {}, plan: [] };

const texto = v => String(v ?? "").trim();
const numero = v => {
  const limpio = String(v ?? "").replace(/,/g, "").trim();
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const clave = v => texto(v).toLowerCase();

// ===================== IMPORTAR =====================

function leerHoja() {
  const hoja = imp.libro.Sheets[$("#impHoja").value];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "", raw: true });
  // La fila de encabezados es la primera que tiene al menos 2 textos
  let h = filas.findIndex(f => f.filter(c => typeof c === "string" && c.trim()).length >= 2);
  if (h < 0) h = 0;
  imp.encabezados = (filas[h] || []).map((c, i) => texto(c) || `Columna ${i + 1}`);
  imp.filas = filas.slice(h + 1).filter(f => f.some(c => texto(c) !== ""));

  // Adivinar qué columna es cada dato
  const usadas = new Set();
  imp.mapa = {};
  for (const campo of CAMPOS) {
    const i = imp.encabezados.findIndex((e, idx) => !usadas.has(idx) && campo.buscar.test(e));
    imp.mapa[campo.clave] = i;
    if (i >= 0) usadas.add(i);
  }
  $("#impMapa").innerHTML = CAMPOS.map(c => `<label>${c.etiqueta}${c.requerido ? " *" : ""}
      <select data-campo="${c.clave}"><option value="-1">— No usar —</option>${imp.encabezados.map((e, i) =>
        `<option value="${i}" ${i === imp.mapa[c.clave] ? "selected" : ""}>${esc(e)}</option>`).join("")}</select>
    </label>`).join("");
  armarPlan();
}

// Convierte las filas del Excel en lo que se va a crear o actualizar
function armarPlan() {
  const m = imp.mapa;
  const val = (fila, campo) => m[campo] >= 0 ? fila[m[campo]] : "";
  const existentes = new Map();
  for (const a of estado.articulos) {
    existentes.set("n:" + clave(a.nombre), a);
    if (a.sku) existentes.set("s:" + clave(a.sku), a);
  }

  const porNombre = new Map();
  let sinNombre = 0;
  for (const fila of imp.filas) {
    const nombre = texto(val(fila, "nombre"));
    if (!nombre) { sinNombre++; continue; }
    const stock = numero(val(fila, "stock"));
    const previo = porNombre.get(clave(nombre));
    if (previo) { // el mismo artículo en varias filas: se suman las existencias
      if (stock !== null) previo.stock = (previo.stock ?? 0) + stock;
      continue;
    }
    const sku = texto(val(fila, "sku"));
    porNombre.set(clave(nombre), {
      nombre,
      sku,
      stock,
      minimo: numero(val(fila, "minimo")),
      categoria: texto(val(fila, "categoria")),
      ubicacion: texto(val(fila, "ubicacion")),
      proveedores: texto(val(fila, "proveedor")).split(/[,;/]/).map(texto).filter(Boolean),
      existe: existentes.get("n:" + clave(nombre)) || (sku && existentes.get("s:" + clave(sku))) || null,
    });
  }
  imp.plan = [...porNombre.values()];

  const nuevos = imp.plan.filter(p => !p.existe).length;
  const actualizar = imp.plan.length - nuevos;
  $("#impResumen").innerHTML = m.nombre < 0
    ? `<span class="error">Elige qué columna tiene el nombre del artículo.</span>`
    : `<b>${imp.plan.length}</b> artículos: <b>${nuevos}</b> nuevos y <b>${actualizar}</b> que ya existen.${sinNombre ? ` Se ignoran ${sinNombre} filas sin nombre.` : ""}`;

  $("#impVista").innerHTML = imp.plan.length
    ? `<table><thead><tr><th>Artículo</th><th>SKU</th><th class="num">Stock</th><th class="num">Mínimo</th><th>Categoría</th><th>Ubicación</th><th>Proveedor</th><th></th></tr></thead><tbody>
      ${imp.plan.slice(0, 8).map(p => `<tr>
        <td><b>${esc(p.nombre)}</b></td><td>${esc(p.sku)}</td>
        <td class="num">${p.stock ?? "—"}${p.existe && p.stock !== null && p.stock !== p.existe.stock ? `<div class="nota">antes ${p.existe.stock}</div>` : ""}</td>
        <td class="num">${p.minimo ?? "—"}</td><td>${esc(p.categoria)}</td><td>${esc(p.ubicacion)}</td><td>${esc(p.proveedores.join(", "))}</td>
        <td>${p.existe ? `<span class="pill gris">Ya existe</span>` : `<span class="pill recibido">Nuevo</span>`}</td>
      </tr>`).join("")}
      </tbody></table>${imp.plan.length > 8 ? `<p class="muted pie-tabla">Y ${imp.plan.length - 8} más.</p>` : ""}`
    : `<p class="empty">No se encontraron artículos en esta hoja.</p>`;
  $("#btnImportar").disabled = m.nombre < 0 || !imp.plan.length;
}

async function enLotes(lista, tam, fn) {
  for (let i = 0; i < lista.length; i += tam) {
    const { error } = await fn(lista.slice(i, i + tam));
    if (error) throw error;
  }
}

async function importar(recargar) {
  const msg = t => { $("#impMensaje").textContent = t; };
  const actualizarStock = $("#impStock").checked;
  $("#btnImportar").disabled = true;

  try {
    // 1. Proveedores que no existen todavía
    msg("Revisando proveedores…");
    const provPorNombre = new Map(estado.proveedores.map(p => [clave(p.nombre), p.id]));
    const faltan = [...new Set(imp.plan.flatMap(p => p.proveedores))].filter(n => !provPorNombre.has(clave(n)));
    if (faltan.length) {
      const { data, error } = await supabase.from("proveedores").insert(faltan.map(nombre => ({ nombre }))).select("id, nombre");
      if (error) throw error;
      data.forEach(p => provPorNombre.set(clave(p.nombre), p.id));
    }

    // 2. Artículos nuevos (con su stock inicial)
    const nuevos = imp.plan.filter(p => !p.existe);
    const ids = new Map(imp.plan.filter(p => p.existe).map(p => [clave(p.nombre), p.existe.id]));
    msg(`Creando ${nuevos.length} artículos…`);
    await enLotes(nuevos, 500, async lote => {
      const res = await supabase.from("articulos").insert(lote.map(p => ({
        nombre: p.nombre, sku: p.sku || null, categoria: p.categoria || null, ubicacion: p.ubicacion || null,
        minimo: Math.max(0, p.minimo ?? 0), stock: p.stock ?? 0,
      }))).select("id, nombre");
      res.data?.forEach(a => ids.set(clave(a.nombre), a.id));
      return res;
    });

    // 3. Artículos que ya existían: se completan sus datos y, si se pidió, se ajusta el stock
    const existentes = imp.plan.filter(p => p.existe);
    let i = 0;
    for (const p of existentes) {
      msg(`Actualizando artículos… ${++i} de ${existentes.length}`);
      const cambios = {};
      if (p.sku) cambios.sku = p.sku;
      if (p.categoria) cambios.categoria = p.categoria;
      if (p.ubicacion) cambios.ubicacion = p.ubicacion;
      if (p.minimo !== null) cambios.minimo = Math.max(0, p.minimo);
      if (Object.keys(cambios).length) {
        const { error } = await supabase.from("articulos").update(cambios).eq("id", p.existe.id);
        if (error) throw error;
      }
    }
    const ajustes = actualizarStock
      ? existentes.filter(p => p.stock !== null && p.stock !== p.existe.stock)
          .map(p => ({ tipo: "ajuste", articulo_id: p.existe.id, cantidad: p.stock - p.existe.stock, nota: "Ajuste al importar Excel" }))
      : [];
    if (ajustes.length) {
      msg(`Ajustando el stock de ${ajustes.length} artículos…`);
      await enLotes(ajustes, 500, lote => supabase.from("movimientos").insert(lote));
    }

    // 4. Qué proveedor surte cada artículo
    const relaciones = imp.plan.flatMap(p => p.proveedores.map(n => ({ articulo_id: ids.get(clave(p.nombre)), proveedor_id: provPorNombre.get(clave(n)) })))
      .filter(r => r.articulo_id && r.proveedor_id);
    if (relaciones.length) {
      await enLotes(relaciones, 500, lote => supabase.from("articulo_proveedor")
        .upsert(lote, { onConflict: "articulo_id,proveedor_id", ignoreDuplicates: true }));
    }

    msg(`Listo: ${nuevos.length} artículos nuevos, ${existentes.length} actualizados${ajustes.length ? `, ${ajustes.length} ajustes de stock` : ""}${faltan.length ? ` y ${faltan.length} proveedores nuevos` : ""}.`);
    await recargar();
    armarPlan();
  } catch (error) {
    console.error(error);
    msg("No se pudo terminar de importar: " + (error.message || error) + ". Lo que ya se guardó se queda; puedes volver a importar el mismo archivo.");
  } finally {
    $("#btnImportar").disabled = false;
  }
}

// ===================== EXPORTAR =====================

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Supabase entrega máximo 1000 filas por consulta: se piden por partes
async function traerTodo(consulta) {
  const todo = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999);
    if (error) throw error;
    todo.push(...data);
    if (data.length < 1000) return todo;
  }
}

// Las fechas se escriben como número de serie de Excel con formato, para que no cambien de día por la zona horaria
const BASE_EXCEL = Date.UTC(1899, 11, 30);
const aFecha = iso => {
  if (!iso) return "";
  const d = new Date(iso);
  const v = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()) - BASE_EXCEL) / 86400000;
  return { t: "n", v, z: "dd/mm/yyyy hh:mm" };
};
const fechaDia = f => {
  if (!f) return "";
  const [a, m, d] = f.split("-").map(Number);
  return { t: "n", v: (Date.UTC(a, m - 1, d) - BASE_EXCEL) / 86400000, z: "dd/mm/yyyy" };
};
const diasEntre = (a, b) => Math.round(fechaDia(b).v - fechaDia(a).v);

function hojaDesde(filas, anchos) {
  if (!filas.length) filas = [{ "": "Sin datos en este mes" }];
  const columnas = Object.keys(filas[0]);
  const hoja = XLSX.utils.aoa_to_sheet([columnas, ...filas.map(f => columnas.map(c => f[c]))]);
  if (anchos) hoja["!cols"] = anchos.map(w => ({ wch: w }));
  return hoja;
}

function agrupar(lista, llave) {
  const g = {};
  for (const m of lista) {
    const k = llave(m) || "Sin dato";
    g[k] ||= { piezas: 0, veces: 0 };
    g[k].piezas += m.cantidad;
    g[k].veces++;
  }
  return Object.entries(g).sort((a, b) => b[1].piezas - a[1].piezas);
}

async function exportarMes() {
  const msg = t => { $("#expMensaje").textContent = t; };
  const valor = $("#expMes").value;
  if (!valor) return msg("Elige un mes.");
  const [anio, mes] = valor.split("-").map(Number);
  const inicio = new Date(anio, mes - 1, 1), fin = new Date(anio, mes, 1);
  const nombreMes = `${MESES[mes - 1]} ${anio}`;
  $("#btnExportar").disabled = true;
  msg("Preparando el reporte…");

  try {
    const movs = await traerTodo(() => supabase.from("movimientos")
      .select("*, articulos(nombre), proveedores(nombre)")
      .gte("fecha", inicio.toISOString()).lt("fecha", fin.toISOString())
      .order("fecha"));
    const vivos = movs.filter(m => !m.anulado);
    const salidas = vivos.filter(m => m.tipo === "salida");
    const entradas = vivos.filter(m => m.tipo === "entrada");
    const ajustes = vivos.filter(m => m.tipo === "ajuste");

    const enMes = f => f && f >= `${valor}-01` && f < `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, "0")}-01`;
    const trucks = estado.trucks.filter(t => enMes(t.fecha) || enMes(t.fecha_orden));
    const recibidos = trucks.filter(t => t.estado === "recibido" && enMes(t.fecha));
    const conTiempo = recibidos.filter(t => t.fecha_orden);
    const promedio = conTiempo.length ? conTiempo.reduce((s, t) => s + diasEntre(t.fecha_orden, t.fecha), 0) / conTiempo.length : null;
    const bajos = estado.articulos.filter(a => a.minimo > 0 && a.stock <= a.minimo);
    const suma = l => l.reduce((s, m) => s + m.cantidad, 0);

    const libro = XLSX.utils.book_new();

    // Resumen
    const resumen = XLSX.utils.aoa_to_sheet([
      [`IT Mexico · Reporte de ${nombreMes}`],
      [`Generado el ${new Date().toLocaleString("es-MX")}`],
      [],
      ["Concepto", "Valor"],
      ["Artículos en inventario", estado.articulos.length],
      ["Piezas en stock (hoy)", estado.articulos.reduce((s, a) => s + a.stock, 0)],
      ["Artículos en o debajo del mínimo (hoy)", bajos.length],
      ["Salidas del mes (entregas)", salidas.length],
      ["Piezas entregadas", suma(salidas)],
      ["Entradas del mes", entradas.length],
      ["Piezas recibidas", suma(entradas)],
      ["Ajustes del mes", ajustes.length],
      ["Trucks recibidos", recibidos.length],
      ["Promedio de días de entrega", promedio === null ? "—" : Math.round(promedio * 10) / 10],
    ]);
    resumen["!cols"] = [{ wch: 40 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(libro, resumen, "Resumen");

    XLSX.utils.book_append_sheet(libro, hojaDesde(estado.articulos.map(a => ({
      SKU: a.sku || "", Artículo: a.nombre, Categoría: a.categoria || "", Ubicación: a.ubicacion || "",
      Proveedores: proveedoresDe(a.id).map(p => p.nombre).join(", "), Stock: a.stock, Mínimo: a.minimo,
      Estado: a.stock <= 0 ? "Agotado" : a.minimo > 0 && a.stock <= a.minimo ? "Bajo mínimo" : "OK",
    })), [14, 34, 16, 14, 22, 8, 8, 12]), "Inventario hoy");

    XLSX.utils.book_append_sheet(libro, hojaDesde(salidas.map(m => ({
      Fecha: aFecha(m.fecha), Artículo: m.articulos?.nombre || "", Cantidad: m.cantidad, Ticket: m.ticket || "",
      Sucursal: m.sucursal || "", "Quién pidió": m.solicitante || "", LPN: m.lpn || "", Registró: m.registrado_por || "", Nota: m.nota || "",
    })), [18, 34, 10, 14, 10, 20, 16, 26, 24]), "Salidas");

    XLSX.utils.book_append_sheet(libro, hojaDesde(entradas.map(m => ({
      Fecha: aFecha(m.fecha), Artículo: m.articulos?.nombre || "", Cantidad: m.cantidad, Proveedor: m.proveedores?.nombre || "",
      LPN: m.lpn || "", Registró: m.registrado_por || "", Nota: m.nota || "",
    })), [18, 34, 10, 20, 16, 26, 24]), "Entradas");

    XLSX.utils.book_append_sheet(libro, hojaDesde(agrupar(salidas, m => m.articulos?.nombre).map(([k, v]) => ({
      Artículo: k, "Piezas entregadas": v.piezas, Entregas: v.veces,
    })), [34, 18, 10]), "Consumo por artículo");

    XLSX.utils.book_append_sheet(libro, hojaDesde(agrupar(salidas, m => m.sucursal).map(([k, v]) => ({
      Sucursal: k, "Piezas entregadas": v.piezas, Entregas: v.veces,
    })), [14, 18, 10]), "Consumo por sucursal");

    XLSX.utils.book_append_sheet(libro, hojaDesde(trucks.map(t => ({
      "Orden de compra": t.orden_compra || "", "Fecha de orden": fechaDia(t.fecha_orden), Proveedor: t.proveedores?.nombre || "",
      Truck: t.truck || "", LPN: t.lpn || "", "Llegada estimada": fechaDia(t.fecha_estimada), "Llegada real": fechaDia(t.fecha),
      "Días de entrega": t.fecha_orden && t.fecha ? diasEntre(t.fecha_orden, t.fecha) : "",
      "Días de retraso": t.fecha_estimada && t.fecha ? diasEntre(t.fecha_estimada, t.fecha) : "",
      Estado: t.estado === "recibido" ? "Recibido" : "En camino",
      Artículos: (t.recepcion_articulos || []).map(l => `${l.articulos?.nombre} ×${l.cantidad}`).join(", "),
    })), [16, 14, 20, 12, 14, 16, 14, 14, 14, 12, 40]), "Trucks");

    const porProv = {};
    for (const t of conTiempo) (porProv[t.proveedores?.nombre || "Sin proveedor"] ||= []).push(t);
    XLSX.utils.book_append_sheet(libro, hojaDesde(Object.entries(porProv).map(([nombre, lista]) => {
      const tiempos = lista.map(t => diasEntre(t.fecha_orden, t.fecha));
      const conEst = lista.filter(t => t.fecha_estimada);
      return {
        Proveedor: nombre, "Trucks recibidos": lista.length,
        "Promedio de días": Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length * 10) / 10,
        "Más rápido": Math.min(...tiempos), "Más lento": Math.max(...tiempos),
        "A tiempo": conEst.length ? `${conEst.filter(t => t.fecha <= t.fecha_estimada).length} de ${conEst.length}` : "",
      };
    }), [24, 16, 16, 12, 12, 10]), "Tiempos de entrega");

    XLSX.writeFile(libro, `IT Mexico - Reporte ${MESES[mes - 1]} ${anio}.xlsx`);
    msg(`Se descargó el reporte de ${nombreMes}.`);
  } catch (error) {
    console.error(error);
    msg("No se pudo generar el reporte: " + (error.message || error));
  } finally {
    $("#btnExportar").disabled = false;
  }
}

// ===================== ARRANQUE =====================

export function iniciarExcel(recargar) {
  const hoy = new Date();
  $("#expMes").value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

  $("#impArchivo").addEventListener("change", async e => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    if (!window.XLSX) { $("#impMensaje").textContent = "No se cargó el lector de Excel. Revisa tu conexión y recarga la página."; return; }
    try {
      imp.libro = XLSX.read(await archivo.arrayBuffer(), { type: "array", cellDates: true });
      $("#impHoja").innerHTML = imp.libro.SheetNames.map(n => `<option>${esc(n)}</option>`).join("");
      $("#impPaso2").hidden = false;
      $("#impMensaje").textContent = "";
      leerHoja();
    } catch {
      $("#impMensaje").textContent = "No se pudo abrir el archivo. Revisa que sea .xlsx, .xls o .csv.";
    }
  });
  $("#impHoja").addEventListener("change", leerHoja);
  $("#impMapa").addEventListener("change", e => {
    const s = e.target.closest("select[data-campo]");
    if (s) { imp.mapa[s.dataset.campo] = Number(s.value); armarPlan(); }
  });
  $("#btnImportar").addEventListener("click", () => importar(recargar));
  $("#btnExportar").addEventListener("click", exportarMes);
}