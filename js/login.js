// js/login.js
import { supabase } from "./supabase.js";

const emailInput = document.getElementById("email");
const btnLogin   = document.getElementById("btnLogin");
const msg        = document.getElementById("msg");

function setMsg(text) {
  msg.textContent = text;
  console.log("[login]", text);
}

btnLogin.addEventListener("click", async () => {
  const email = emailInput.value.trim();

  if (!email || !email.includes("@")) {
    setMsg("Digite um e-mail válido.");
    return;
  }

  setMsg("Enviando link de acesso...");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: "https://agenda.brsys.com.br/app.html",
      shouldCreateUser: true
    }
  });

  if (error) {
    console.error("[login] error:", error);
    setMsg("Erro ao enviar link. Tente novamente.");
    return;
  }

  setMsg("Pronto! Verifique seu e-mail (entrada ou spam).");
});
