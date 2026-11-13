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

// Hojas que tiene sentido importar: visibles y que no sean tablas dinámicas ("Row Labels")
function hojasUtiles(libro) {
  const utiles = libro.SheetNames.filter((nombre, i) => {
    if (libro.Workbook?.Sheets?.[i]?.Hidden) return false;
    const primera = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, defval: "" }).find(f => f.some(c => String(c).trim()));
    return !primera || !primera.some(c => /^row labels$/i.test(String(c).trim()));
  });
  return utiles.length ? utiles : libro.SheetNames;
}

// ===================== IMPORTAR HISTORIAL DE ENVÍOS =====================
// Formato del "Inventory Master File": una fila por pieza, con Description, Serial number,
// Quantity (1 = en existencia), Shipped out, BOL (REQ), Branch y LPN.

const COLS_HIST = {
  desc: /^description$/i,
  marca: /^brand$/i,
  modelo: /^model$/i,
  costo: /^cost/i,
  oc: /^po$/i,
  flete: /freight/i,
  parte: /part ?number/i,
  serie: /serial/i,
  cantidad: /^quantity$/i,
  proveedor: /^vendor$/i,
  ubicacion: /^location$/i,
  enviado: /shipped ?out/i,
  ticket: /^bol$/i,
  sucursal: /^branch$/i,
  metodo: /shipping ?method/i,
  lpn: /lpn|track/i,
};

const hist = { hojas: [], plan: null };

// Limpia celdas: espacios raros, guiones y "N/A" cuentan como vacío
const celda = v => {
  const t = String(v ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return /^(-|n\/a|na|none)$/i.test(t) ? "" : t;
};

// Fecha de Excel (número de serie o texto) -> "AAAA-MM-DD", o null si no es válida
function fechaExcel(v) {
  if (typeof v === "number") {
    const p = XLSX.SSF.parse_date_code(v);
    if (p && p.y >= 2000) return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
    return null;
  }
  const m = celda(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m && Number(m[1]) >= 2000 ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

function leerHojasHistorial(libro) {
  const hojas = [];
  for (const nombre of libro.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, defval: "", raw: true });
    const h = filas.findIndex(f => f.some(c => COLS_HIST.desc.test(celda(c))) && f.some(c => COLS_HIST.enviado.test(celda(c))));
    if (h < 0) continue;
    const enc = filas[h].map(celda);
    const col = {};
    for (const [k, re] of Object.entries(COLS_HIST)) col[k] = enc.findIndex(e => re.test(e));
    const datos = filas.slice(h + 1).filter(f => f.some(c => celda(c) !== ""));
    let envios = 0, existencia = 0, fechaMax = "";
    for (const f of datos) {
      const fecha = fechaExcel(f[col.enviado]);
      if (fecha) { envios++; if (fecha > fechaMax) fechaMax = fecha; }
      else if (Number(f[col.cantidad]) === 1 && celda(f[col.enviado]) === "") existencia++;
    }
    hojas.push({ nombre, col, datos, envios, existencia, fechaMax, categoria: /acces/i.test(nombre) ? "Accesorio" : "Equipo" });
  }
  return hojas;
}

// Artículos que en el archivo aparecen con nombres distintos y son el mismo: se guardan con un solo nombre
function nombreUnificado(nombre, modelo) {
  if (/^lenovo server$/i.test(nombre) && /^st50$/i.test(modelo)) return "ST50 Lenovo Server";
  if (/^optiplex 3000 thin client$/i.test(nombre)) return "Dell Optiplex 3000 Thin Client";
  if (/^cisco 5 port switch$/i.test(nombre)) return "Cisco 5-port network switch";
  if (/^usb (keyboard ?& ?mouse|mouse ?& ?keyboard)$/i.test(nombre)) return "USB Keyboard & Mouse";
  if (/^pc speakers \(pair\)$/i.test(nombre)) return "PC speakers (pair)";
  // En 2023 se usaba guion donde 2024 usa apóstrofo: "7- Network Cable" = "7' Network Cable"
  return nombre
    .replace(/^(\d+)- (network cable)/i, "$1' $2")
    .replace(/^backpack (\d+)-$/i, "Backpack $1'");
}
const claveHist = nombre => clave(nombre);

// Cada sucursal tiene un código de 4 y otro de 5 caracteres; otro largo es un error de captura
const sucursalValida = codigo => !codigo || /^[A-Z0-9]{4,5}$/.test(codigo);

// Número de una celda de costo, o null si está vacía
const costo = v => {
  const t = celda(v).replace(/[$,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

function armarPlanHistorial() {
  const elegidas = hist.hojas.filter((h, i) => document.getElementById(`hist-${i}`)?.checked);
  const existentes = new Map(estado.articulos.map(a => [claveHist(a.nombre), a]));
  const articulos = new Map(); // clave -> datos del artículo
  const movimientos = [];
  const omitidas = { sinFecha: 0, sinDescripcion: 0 };
  const sucursalesRaras = new Map();
  const repetidas = new Map();
  let fechaMin = "", fechaMax = "";

  // Para el stock se usa, por categoría, la hoja con los envíos más recientes
  const masReciente = {};
  for (const h of elegidas) if (!masReciente[h.categoria] || h.fechaMax > masReciente[h.categoria].fechaMax) masReciente[h.categoria] = h;

  for (const h of elegidas) {
    const c = h.col;
    for (const f of h.datos) {
      const original = celda(f[c.desc]);
      if (!original) { omitidas.sinDescripcion++; continue; }
      const nombre = nombreUnificado(original, c.modelo >= 0 ? celda(f[c.modelo]) : "");
      const k = claveHist(nombre);
      if (!articulos.has(k)) articulos.set(k, { nombre, sku: "", marca: "", modelo: "", categoria: h.categoria, ubicacion: "", proveedores: new Set(), existencia: 0, existe: existentes.get(k) || null });
      const art = articulos.get(k);
      if (!art.sku && c.parte >= 0) art.sku = celda(f[c.parte]);
      if (!art.marca && c.marca >= 0) art.marca = celda(f[c.marca]);
      if (!art.modelo && c.modelo >= 0) art.modelo = celda(f[c.modelo]);
      if (!art.ubicacion && c.ubicacion >= 0) art.ubicacion = celda(f[c.ubicacion]);
      if (c.proveedor >= 0 && celda(f[c.proveedor])) art.proveedores.add(celda(f[c.proveedor]));

      const fecha = fechaExcel(f[c.enviado]);
      if (!fecha) {
        if (Number(f[c.cantidad]) === 1 && celda(f[c.enviado]) === "") {
          if (masReciente[h.categoria] === h) art.existencia++;
        } else omitidas.sinFecha++;
        continue;
      }
      if (!fechaMin || fecha < fechaMin) fechaMin = fecha;
      if (fecha > fechaMax) fechaMax = fecha;

      const bol = celda(f[c.ticket]);
      const esTicket = /^(REQ|RITM|INC)\d+/i.test(bol);
      const mov = {
        tipo: "salida", cantidad: 1, historico: true, articuloClave: k,
        fecha: new Date(...fecha.split("-").map((n, i) => i === 1 ? Number(n) - 1 : Number(n)), 12).toISOString(),
        ticket: esTicket ? bol.toUpperCase() : null,
        sucursal: celda(f[c.sucursal]).toUpperCase() || null,
        lpn: c.lpn >= 0 ? celda(f[c.lpn]) || null : null,
        serie: c.serie >= 0 ? celda(f[c.serie]) || null : null,
        metodo_envio: c.metodo >= 0 ? celda(f[c.metodo]) || null : null,
        costo_usd: c.costo >= 0 ? costo(f[c.costo]) : null,
        costo_envio: c.flete >= 0 ? costo(f[c.flete]) : null,
        orden_compra: c.oc >= 0 ? celda(f[c.oc]) || null : null,
        nota: bol && !esTicket ? `BOL: ${bol}` : null,
      };
      if (!sucursalValida(mov.sucursal)) sucursalesRaras.set(mov.sucursal, (sucursalesRaras.get(mov.sucursal) || 0) + 1);
      // Clave para no duplicar si se importa otra vez el mismo archivo
      const firma = [fecha, mov.ticket, mov.sucursal, mov.serie, k, mov.lpn].join("|");
      const n = (repetidas.get(firma) || 0) + 1;
      repetidas.set(firma, n);
      mov.clave_importacion = `${firma}#${n}`;
      movimientos.push(mov);
    }
  }

  hist.plan = { articulos: [...articulos.values()], movimientos, omitidas, fechaMin, fechaMax, masReciente };
  const nuevos = hist.plan.articulos.filter(a => !a.existe).length;
  const existencia = hist.plan.articulos.reduce((s, a) => s + a.existencia, 0);
  const fuentes = Object.values(masReciente).map(h => h.nombre).join(" y ");
  $("#histResumen").innerHTML = elegidas.length ? `
    <ul class="lista-simple">
      <li><b>${movimientos.length.toLocaleString("es-MX")}</b> envíos del ${fechaCorta(fechaMin)} al ${fechaCorta(fechaMax)} (se guardan como historial y no cambian el stock).</li>
      <li><b>${hist.plan.articulos.length}</b> artículos: <b>${nuevos}</b> nuevos y <b>${hist.plan.articulos.length - nuevos}</b> que ya existen.</li>
      <li><b>${existencia}</b> piezas seguían en existencia según ${esc(fuentes)}.</li>
      ${omitidas.sinFecha ? `<li>Se omiten <b>${omitidas.sinFecha}</b> filas sin fecha de envío válida (por ejemplo, con año 1900).</li>` : ""}
      ${sucursalesRaras.size ? `<li class="tarde">Sucursales que no tienen 4 o 5 caracteres: ${[...sucursalesRaras].map(([k, n]) => `<b>${esc(k)}</b> (${n})`).join(", ")}. Se importan así; puedes corregirlas en el Excel antes o editarlas después en Movimientos.</li>` : ""}
    </ul>` : `<p class="muted">Elige al menos una hoja.</p>`;
  $("#btnHistImportar").disabled = !movimientos.length;
}

const fechaCorta = f => f ? f.split("-").reverse().join("/") : "—";

function mostrarHistorial(hojas) {
  hist.hojas = hojas;
  $("#histHojas").innerHTML = hojas.map((h, i) => `<label class="check"><input type="checkbox" id="hist-${i}" checked>
    <span><b>${esc(h.nombre)}</b> · ${h.categoria} · ${h.envios.toLocaleString("es-MX")} envíos${h.fechaMax ? ` hasta ${fechaCorta(h.fechaMax)}` : ""} · ${h.existencia} en existencia</span></label>`).join("");
  $("#histPaso2").hidden = false;
  armarPlanHistorial();
}

async function importarHistorial(recargar) {
  const msg = t => { $("#histMensaje").textContent = t; };
  const plan = hist.plan;
  const usarStock = $("#histStock").checked;
  $("#btnHistImportar").disabled = true;

  try {
    // 1. Proveedores
    msg("Revisando proveedores…");
    const provPorNombre = new Map(estado.proveedores.map(p => [clave(p.nombre), p.id]));
    const faltan = [...new Set(plan.articulos.flatMap(a => [...a.proveedores]))].filter(n => !provPorNombre.has(clave(n)));
    if (faltan.length) {
      const { data, error } = await supabase.from("proveedores").insert(faltan.map(nombre => ({ nombre }))).select("id, nombre");
      if (error) throw error;
      data.forEach(p => provPorNombre.set(clave(p.nombre), p.id));
    }

    // 2. Artículos nuevos
    const ids = new Map(plan.articulos.filter(a => a.existe).map(a => [claveHist(a.nombre), a.existe.id]));
    const nuevos = plan.articulos.filter(a => !a.existe);
    msg(`Creando ${nuevos.length} artículos…`);
    await enLotes(nuevos, 500, async lote => {
      const res = await supabase.from("articulos").insert(lote.map(a => ({
        nombre: a.nombre, sku: a.sku || null, marca: a.marca || null, modelo: a.modelo || null,
        categoria: a.categoria, ubicacion: a.ubicacion || null,
        minimo: 0, stock: usarStock ? a.existencia : 0,
      }))).select("id, nombre");
      res.data?.forEach(a => ids.set(claveHist(a.nombre), a.id));
      return res;
    });

    // 3. A los que ya existían se les completan los datos que tengan vacíos
    for (const a of plan.articulos.filter(a => a.existe)) {
      const cambios = {};
      for (const campo of ["sku", "marca", "modelo", "ubicacion"]) if (a[campo] && !a.existe[campo]) cambios[campo] = a[campo];
      if (!a.existe.categoria) cambios.categoria = a.categoria;
      if (Object.keys(cambios).length) {
        const { error } = await supabase.from("articulos").update(cambios).eq("id", a.existe.id);
        if (error) throw error;
      }
    }

    // Stock de los que ya existían (solo si se pidió)
    const ajustes = usarStock
      ? plan.articulos.filter(a => a.existe && a.existencia !== a.existe.stock)
          .map(a => ({ tipo: "ajuste", articulo_id: a.existe.id, cantidad: a.existencia - a.existe.stock, nota: "Existencia según Excel importado" }))
      : [];
    if (ajustes.length) await enLotes(ajustes, 500, lote => supabase.from("movimientos").insert(lote));

    // 4. Proveedor de cada artículo
    const relaciones = plan.articulos.flatMap(a => [...a.proveedores].map(n => ({ articulo_id: ids.get(claveHist(a.nombre)), proveedor_id: provPorNombre.get(clave(n)) })))
      .filter(r => r.articulo_id && r.proveedor_id);
    if (relaciones.length) {
      await enLotes(relaciones, 500, lote => supabase.from("articulo_proveedor").upsert(lote, { onConflict: "articulo_id,proveedor_id", ignoreDuplicates: true }));
    }

    // 5. Envíos como historial (los que ya estaban se saltan)
    let agregados = 0, hechos = 0;
    const filas = plan.movimientos.map(({ articuloClave, ...m }) => ({ ...m, articulo_id: ids.get(articuloClave) })).filter(m => m.articulo_id);
    await enLotes(filas, 500, async lote => {
      const res = await supabase.from("movimientos").upsert(lote, { onConflict: "clave_importacion", ignoreDuplicates: true }).select("id");
      agregados += res.data?.length || 0;
      hechos += lote.length;
      msg(`Guardando envíos… ${hechos.toLocaleString("es-MX")} de ${filas.length.toLocaleString("es-MX")}`);
      return res;
    });

    const repetidos = filas.length - agregados;
    msg(`Listo: ${agregados.toLocaleString("es-MX")} envíos agregados al historial${repetidos ? ` (${repetidos.toLocaleString("es-MX")} ya estaban)` : ""}, ${nuevos.length} artículos nuevos${faltan.length ? `, ${faltan.length} proveedores nuevos` : ""}${usarStock ? " y stock actualizado" : ""}.`);
    await recargar();
    armarPlanHistorial();
  } catch (error) {
    console.error(error);
    msg("No se pudo terminar: " + (error.message || error) + ". Puedes volver a importar el mismo archivo: lo que ya se guardó no se duplica.");
  } finally {
    $("#btnHistImportar").disabled = false;
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
      ["Costo de envíos del mes (USD)", Math.round(salidas.reduce((s, m) => s + (Number(m.costo_envio) || 0), 0) * 100) / 100],
      ["Trucks recibidos", recibidos.length],
      ["Promedio de días de entrega", promedio === null ? "—" : Math.round(promedio * 10) / 10],
    ]);
    resumen["!cols"] = [{ wch: 40 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(libro, resumen, "Resumen");

    XLSX.utils.book_append_sheet(libro, hojaDesde(estado.articulos.map(a => ({
      SKU: a.sku || "", Artículo: a.nombre, Marca: a.marca || "", Modelo: a.modelo || "", Categoría: a.categoria || "", Ubicación: a.ubicacion || "",
      Proveedores: proveedoresDe(a.id).map(p => p.nombre).join(", "), Stock: a.stock, Mínimo: a.minimo,
      Estado: a.stock <= 0 ? "Agotado" : a.minimo > 0 && a.stock <= a.minimo ? "Bajo mínimo" : "OK",
    })), [14, 34, 14, 16, 14, 14, 22, 8, 8, 12]), "Inventario hoy");

    XLSX.utils.book_append_sheet(libro, hojaDesde(salidas.map(m => ({
      Fecha: aFecha(m.fecha), Artículo: m.articulos?.nombre || "", Cantidad: m.cantidad, Ticket: m.ticket || "",
      Sucursal: m.sucursal || "", "Quién pidió": m.solicitante || "", LPN: m.lpn || "", "Número de serie": m.serie || "",
      "Método de envío": m.metodo_envio || "", "Costo de envío (USD)": m.costo_envio ?? "", Registró: m.historico ? "Historial importado" : m.registrado_por || "", Nota: m.nota || "",
    })), [18, 34, 10, 14, 10, 20, 18, 18, 16, 18, 22, 24]), "Salidas");

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
      const datos = await archivo.arrayBuffer();

      // Si es el archivo maestro (una fila por pieza), se manda al importador de historial
      const hojasHist = leerHojasHistorial(XLSX.read(datos, { type: "array" }));
      if (hojasHist.length) {
        $("#impPaso2").hidden = true;
        $("#impMensaje").textContent = "Este archivo es el registro de envíos (una fila por pieza). Lo abrí en “Importar historial de envíos”, aquí abajo.";
        mostrarHistorial(hojasHist);
        $("#histArchivo").closest(".card").scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      imp.libro = XLSX.read(datos, { type: "array", cellDates: true });
      const hojas = hojasUtiles(imp.libro);
      $("#impHoja").innerHTML = hojas.map(n => `<option>${esc(n)}</option>`).join("");
      $("#impPaso2").hidden = false;
      $("#impMensaje").textContent = "";
      leerHoja();
    } catch (error) {
      console.error(error);
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

  $("#histArchivo").addEventListener("change", async e => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    if (!window.XLSX) { $("#histMensaje").textContent = "No se cargó el lector de Excel. Revisa tu conexión y recarga la página."; return; }
    try {
      $("#histMensaje").textContent = "Leyendo el archivo…";
      const hojas = leerHojasHistorial(XLSX.read(await archivo.arrayBuffer(), { type: "array" }));
      $("#histMensaje").textContent = "";
      if (!hojas.length) {
        $("#histPaso2").hidden = true;
        $("#histMensaje").textContent = "No encontré hojas con las columnas Description y Shipped out. Si es un inventario normal, usa “Importar inventario”.";
        return;
      }
      mostrarHistorial(hojas);
    } catch (error) {
      console.error(error);
      $("#histMensaje").textContent = "No se pudo abrir el archivo. Revisa que sea .xlsx o .xls.";
    }
  });
  $("#histHojas").addEventListener("change", armarPlanHistorial);
  $("#btnHistImportar").addEventListener("click", () => importarHistorial(recargar));
}