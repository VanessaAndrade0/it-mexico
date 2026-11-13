// Herramientas para filtrar y agrupar tablas, como una tabla dinámica de Excel
import { esc } from "./util.js";

export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export const numero = n => Number(n || 0).toLocaleString("es-MX");

// Llena un <select> con opciones, conservando lo que estaba elegido
export function opciones(select, valores, textoTodos = "Todos") {
  const actual = select.value;
  select.innerHTML = `<option value="">${textoTodos}</option>` +
    valores.map(v => typeof v === "object"
      ? `<option value="${esc(v.valor)}">${esc(v.texto)}</option>`
      : `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if ([...select.options].some(o => o.value === actual)) select.value = actual;
}

// Agrupa una lista: devuelve [{ grupo, registros, cantidad }] ordenado de mayor a menor
export function agrupar(lista, clave, cantidad = () => 1, ordenarPorNombre = false) {
  const mapa = new Map();
  for (const item of lista) {
    const g = clave(item) || "(vacío)";
    const fila = mapa.get(g) || { grupo: g, registros: 0, cantidad: 0 };
    fila.registros++;
    fila.cantidad += cantidad(item);
    mapa.set(g, fila);
  }
  const filas = [...mapa.values()];
  return ordenarPorNombre
    ? filas.sort((a, b) => String(b.grupo).localeCompare(String(a.grupo)))
    : filas.sort((a, b) => b.cantidad - a.cantidad || b.registros - a.registros);
}

// Tabla de resumen agrupado. Cada fila se puede tocar para filtrar por ese grupo
export function tablaGrupos(filas, { titulo, registros, cantidad, extra }) {
  const total = filas.reduce((s, f) => s + f.cantidad, 0) || 1;
  const max = Math.max(1, ...filas.map(f => f.cantidad));
  return `<table>
    <thead><tr><th class="num">#</th><th>${esc(titulo)}</th><th class="num">${esc(registros)}</th><th class="num">${esc(cantidad)}</th><th class="num">% del total</th>${extra ? `<th class="num">${esc(extra.titulo)}</th>` : ""}<th class="col-barra"></th></tr></thead>
    <tbody>${filas.map((f, i) => `<tr class="clic grupo" data-grupo="${esc(f.grupo)}" title="Ver el detalle de ${esc(f.grupo)}">
      <td class="num muted">${i + 1}</td>
      <td><b>${esc(f.grupo)}</b></td>
      <td class="num">${numero(f.registros)}</td>
      <td class="num"><b>${numero(f.cantidad)}</b></td>
      <td class="num">${(f.cantidad / total * 100).toFixed(1)}%</td>
      ${extra ? `<td class="num">${extra.valor(f)}</td>` : ""}
      <td class="col-barra"><i class="barra" style="width:${Math.max(2, f.cantidad / max * 100)}%"></i></td>
    </tr>`).join("") || `<tr><td colspan="7" class="empty">Nada coincide con los filtros.</td></tr>`}</tbody>
    <tfoot><tr><td></td><td><b>Total</b></td><td class="num"><b>${numero(filas.reduce((s, f) => s + f.registros, 0))}</b></td><td class="num"><b>${numero(filas.reduce((s, f) => s + f.cantidad, 0))}</b></td><td class="num">100%</td>${extra ? "<td></td>" : ""}<td></td></tr></tfoot>
  </table>`;
}