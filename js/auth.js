import { supabase } from "./supabase.js";
import { $, esc } from "./util.js";

// Reglas de contraseña. Las mismas se configuran en Supabase para que el servidor también las exija.
const REGLAS = [
  { texto: "Al menos 10 caracteres", ok: p => p.length >= 10 },
  { texto: "Una mayúscula", ok: p => /[A-ZÁÉÍÓÚÑ]/.test(p) },
  { texto: "Una minúscula", ok: p => /[a-záéíóúñ]/.test(p) },
  { texto: "Un número", ok: p => /\d/.test(p) },
  { texto: "Un símbolo (por ejemplo ! # $ % *)", ok: p => /[^A-Za-z0-9áéíóúñÁÉÍÓÚÑ]/.test(p) },
];
const correoValido = c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
const ESPERA_ENLACE = 60; // segundos entre un envío y otro

// Antes de que Supabase lea el enlace del correo, se revisa a qué vino la persona
const hashInicial = new URLSearchParams(location.hash.slice(1));
const vieneDe = hashInicial.get("type"); // "recovery" (olvidé mi contraseña) o "invite" (invitación)
const errorEnlace = hashInicial.get("error_code");

let alEntrar = null;
let entro = false;

function mostrar(pantalla) {
  $("#login").hidden = pantalla === "app";
  $("#app").hidden = pantalla !== "app";
  $("#loginForm").hidden = pantalla !== "login";
  $("#olvideForm").hidden = pantalla !== "olvide";
  $("#nuevaForm").hidden = pantalla !== "nueva";
  const foco = { login: "#loginEmail", olvide: "#olvideEmail", nueva: "#nuevaPass" }[pantalla];
  if (foco) $(foco).focus();
}

function entrar(sesion) {
  $("#userEmail").textContent = sesion.user.email;
  mostrar("app");
  if (!entro) { entro = true; alEntrar(); }
}

function limpiarEnlace() {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
}

// Lista de reglas que se va palomeando mientras se escribe
function pintarReglas(lista, pass) {
  lista.innerHTML = REGLAS.map(r => `<li class="${r.ok(pass) ? "ok" : ""}">${esc(r.texto)}</li>`).join("");
}

function revisarContrasena(pass, pass2) {
  const falta = REGLAS.filter(r => !r.ok(pass));
  if (falta.length) return "A la contraseña le falta: " + falta.map(r => r.texto.toLowerCase()).join(", ") + ".";
  if (pass !== pass2) return "Las dos contraseñas no son iguales.";
  return "";
}

function traducirError(error) {
  const m = (error?.message || "").toLowerCase();
  if (m.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Primero confirma tu correo con el enlace que te llegó.";
  if (m.includes("rate limit") || error?.status === 429) return "Se hicieron muchos intentos. Espera unos minutos y vuelve a intentar.";
  if (m.includes("same") && m.includes("password")) return "La contraseña nueva debe ser distinta a la anterior.";
  if (m.includes("weak") || m.includes("password should")) return "La contraseña no cumple las reglas de seguridad.";
  if (m.includes("reauthentication")) return "Por seguridad, sal y vuelve a entrar antes de cambiar la contraseña.";
  return "No se pudo completar: " + (error?.message || "error desconocido");
}

export async function iniciarAuth(recargar) {
  alEntrar = recargar;

  // ---------- Entrar ----------
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("#loginEmail").value.trim().toLowerCase();
    const pass = $("#loginPass").value;
    $("#loginError").textContent = "";
    if (!correoValido(email)) { $("#loginError").textContent = "Escribe un correo válido."; return; }
    if (!pass) { $("#loginError").textContent = "Escribe tu contraseña."; return; }
    const boton = e.submitter;
    boton.disabled = true;
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    boton.disabled = false;
    if (error) { $("#loginError").textContent = traducirError(error); return; }
    $("#loginPass").value = "";
  });

  // ---------- Olvidé mi contraseña ----------
  $("#btnOlvide").addEventListener("click", () => {
    $("#olvideEmail").value = $("#loginEmail").value.trim();
    $("#olvideMensaje").textContent = "";
    $("#olvideError").textContent = "";
    mostrar("olvide");
  });
  $("#btnVolverLogin").addEventListener("click", () => mostrar("login"));

  $("#olvideForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("#olvideEmail").value.trim().toLowerCase();
    $("#olvideError").textContent = "";
    if (!correoValido(email)) { $("#olvideError").textContent = "Escribe un correo válido."; return; }
    const boton = $("#btnEnviarEnlace");
    boton.disabled = true;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error && error.status === 429) {
      $("#olvideError").textContent = traducirError(error);
      boton.disabled = false;
      return;
    }
    // Mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados
    $("#olvideMensaje").className = "ok-msg";
    $("#olvideMensaje").textContent = "Si el correo está registrado, en unos minutos te llegará el enlace. Revisa también el correo no deseado.";
    let quedan = ESPERA_ENLACE;
    boton.textContent = `Reenviar en ${quedan} s`;
    const reloj = setInterval(() => {
      quedan--;
      boton.textContent = quedan > 0 ? `Reenviar en ${quedan} s` : "Enviar enlace";
      if (quedan <= 0) { clearInterval(reloj); boton.disabled = false; }
    }, 1000);
  });

  // ---------- Contraseña nueva (enlace del correo o invitación) ----------
  $("#nuevaPass").addEventListener("input", () => { pintarReglas($("#nuevaReglas"), $("#nuevaPass").value); $("#nuevaError").textContent = ""; });
  $("#nuevaForm").addEventListener("submit", async e => {
    e.preventDefault();
    const pass = $("#nuevaPass").value;
    const problema = revisarContrasena(pass, $("#nuevaPass2").value);
    $("#nuevaError").textContent = problema;
    if (problema) return;
    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) { $("#nuevaError").textContent = traducirError(error); return; }
    $("#nuevaPass").value = $("#nuevaPass2").value = "";
    limpiarEnlace();
    const { data } = await supabase.auth.getSession();
    if (data.session) entrar(data.session);
    else mostrar("login");
  });

  // ---------- Cambiar contraseña estando dentro ----------
  $("#btnContrasena").addEventListener("click", abrirCambiarContrasena);

  // ---------- Salir ----------
  $("#btnLogout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.reload(); // así no queda nada de la sesión anterior en pantalla
  });

  // ---------- Al cargar la página ----------
  supabase.auth.onAuthStateChange((evento, sesion) => {
    if (evento === "PASSWORD_RECOVERY") {
      $("#nuevaTitulo").textContent = "Crea tu contraseña nueva.";
      pintarReglas($("#nuevaReglas"), "");
      mostrar("nueva");
      return;
    }
    if (evento === "SIGNED_OUT") { entro = false; mostrar("login"); return; }
    if (sesion && evento === "SIGNED_IN" && vieneDe !== "invite" && vieneDe !== "recovery") entrar(sesion);
  });

  const { data } = await supabase.auth.getSession();
  const sesion = data.session;

  if (errorEnlace) {
    limpiarEnlace();
    mostrar("olvide");
    $("#olvideError").textContent = errorEnlace === "otp_expired"
      ? "El enlace ya caducó o ya se usó. Pide uno nuevo aquí."
      : "El enlace no es válido. Pide uno nuevo aquí.";
    return;
  }
  if (sesion && (vieneDe === "recovery" || vieneDe === "invite")) {
    $("#nuevaTitulo").textContent = vieneDe === "invite"
      ? "Bienvenido. Crea tu contraseña para entrar a IT Mexico."
      : "Crea tu contraseña nueva.";
    pintarReglas($("#nuevaReglas"), "");
    mostrar("nueva");
    return;
  }
  if (sesion) entrar(sesion);
  else mostrar("login");
}

function abrirCambiarContrasena() {
  const modal = $("#modal");
  modal.innerHTML = `<form method="dialog" id="formContrasena" novalidate>
    <h2>Cambiar contraseña</h2>
    <label>Contraseña nueva <input id="cpPass" type="password" autocomplete="new-password"></label>
    <label>Repítela <input id="cpPass2" type="password" autocomplete="new-password"></label>
    <ul class="reglas" id="cpReglas"></ul>
    <p class="error" id="cpError"></p>
    <div class="row"><button class="btn primary" value="guardar">Guardar</button><button class="btn" value="cancelar" formnovalidate>Cancelar</button></div>
  </form>`;
  modal.showModal();
  pintarReglas($("#cpReglas"), "");
  $("#cpPass").addEventListener("input", () => pintarReglas($("#cpReglas"), $("#cpPass").value));
  $("#formContrasena").addEventListener("submit", async e => {
    if (e.submitter?.value !== "guardar") return;
    e.preventDefault();
    const pass = $("#cpPass").value;
    const problema = revisarContrasena(pass, $("#cpPass2").value);
    $("#cpError").textContent = problema;
    if (problema) return;
    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) { $("#cpError").textContent = traducirError(error); return; }
    modal.innerHTML = `<form method="dialog"><h2>Listo</h2><p>Tu contraseña se cambió. La próxima vez entra con la nueva.</p>
      <div class="row"><button class="btn primary" value="ok">Aceptar</button></div></form>`;
  });
}