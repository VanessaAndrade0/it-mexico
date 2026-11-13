// Funciones pequeñas que se usan en varias partes

// Evita que un texto escrito por el usuario se interprete como HTML
export function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function formatoFecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const $ = selector => document.querySelector(selector);

// Supabase entrega máximo 1000 filas por consulta: se piden por partes hasta tener todo
export async function traerTodo(consulta) {
  const todo = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999);
    if (error) throw error;
    todo.push(...data);
    if (data.length < 1000) return todo;
  }
}

// Descarga una tabla como Excel (necesita SheetJS)
export function descargarExcel(nombreArchivo, hojas) {
  if (!window.XLSX) throw new Error("No se cargó el lector de Excel");
  const libro = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const hoja = XLSX.utils.json_to_sheet(filas.length ? filas : [{ "": "Sin datos" }]);
    XLSX.utils.book_append_sheet(libro, hoja, nombre.slice(0, 31));
  }
  XLSX.writeFile(libro, nombreArchivo);
}