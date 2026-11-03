import { supabase } from "./supabase.js";
import { $ } from "./util.js";

function mensajeError(error) {
  const msg = error?.message || "";
  if (msg.includes("Invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (msg.includes("Email not confirmed")) return "La cuenta no está confirmada. Créala de nuevo con 'Auto Confirm User' marcado.";
  if (msg.includes("Invalid API key") || msg.includes("No API key")) return "La llave de js/config.js no es correcta.";
  if (msg.includes("Failed to fetch")) return "No se pudo conectar con Supabase. Revisa la URL de js/config.js.";
  return "Error: " + msg;
}

export function iniciarAuth(alEntrar) {
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    $("#loginError").textContent = "";
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: $("#loginEmail").value.trim(),
        password: $("#loginPass").value,
      });
      if (error) {
        console.error(error);
        $("#loginError").textContent = mensajeError(error);
      }
    } catch (err) {
      console.error(err);
      $("#loginError").textContent = mensajeError(err);
    }
  });

  $("#btnLogout").addEventListener("click", () => supabase.auth.signOut());

  supabase.auth.onAuthStateChange((_evento, sesion) => {
    const conSesion = !!sesion;
    $("#login").hidden = conSesion;
    $("#app").hidden = !conSesion;
    if (conSesion) {
      $("#userEmail").textContent = sesion.user.email;
      alEntrar();
    }
  });
}