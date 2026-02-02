// js/login.js
import { supabase } from "./supabase.js";

const form = document.getElementById("formLogin");
const emailInput = document.getElementById("email");
const btnSend = document.getElementById("btnSend");
const msg = document.getElementById("msg");

function setMsg(text, type = "info") {
  if (!msg) return;
  msg.textContent = text || "";

  // opcional: feedback sutil (sem criar classes novas)
  msg.style.color =
    type === "error" ? "rgba(255,120,120,.95)" :
    type === "ok"    ? "rgba(102,242,218,.95)" :
                       "rgba(255,255,255,.70)";

  console.log("[login]", text);
}

function setLoading(isLoading) {
  if (!btnSend) return;
  btnSend.disabled = !!isLoading;
  btnSend.style.opacity = isLoading ? "0.75" : "1";
  btnSend.style.transform = "none";

  // mantém o texto original ao terminar
  btnSend.textContent = isLoading ? "Enviando..." : "Enviar link de acesso";
}

function isValidEmail(email) {
  // validação simples e suficiente pro V1
  return typeof email === "string" && /\S+@\S+\.\S+/.test(email);
}

async function sendMagicLink(email) {
  setMsg("Enviando link de acesso...", "info");
  setLoading(true);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: "https://agenda.brsys.com.br/app.html",
      shouldCreateUser: true,
    },
  });

  setLoading(false);

  if (error) {
    console.error("[login] signInWithOtp error:", error);
    setMsg("Erro ao enviar link. Tente novamente em instantes.", "error");
    return;
  }

  setMsg("Pronto! Verifique seu e-mail (entrada ou spam).", "ok");
}

/* ========= Events ========= */
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = (emailInput?.value || "").trim();

  if (!isValidEmail(email)) {
    setMsg("Digite um e-mail válido.", "error");
    emailInput?.focus();
    return;
  }

  await sendMagicLink(email);
});

// fallback: se alguém remover o form por acidente
btnSend?.addEventListener("click", async (e) => {
  if (form) return; // já tem submit handler
  e.preventDefault();

  const email = (emailInput?.value || "").trim();
  if (!isValidEmail(email)) {
    setMsg("Digite um e-mail válido.", "error");
    emailInput?.focus();
    return;
  }

  await sendMagicLink(email);
});

/* ========= Boot ========= */
setMsg("Digite seu e-mail para receber o link de acesso.", "info");
