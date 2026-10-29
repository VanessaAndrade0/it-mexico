import { supabase } from "./supabase.js";
import { $ } from "./util.js";

// Muestra login o la app según haya sesión, y avisa a app.js cuando alguien entra
export function iniciarAuth(alEntrar) {
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    $("#loginError").textContent = "";
    const { error } = await supabase.auth.signInWithPassword({
      email: $("#loginEmail").value.trim(),
      password: $("#loginPass").value,
    });
    if (error) $("#loginError").textContent = "Correo o contraseña incorrectos.";
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
