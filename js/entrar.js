// js/entrar.js
import { supabase } from "./supabase.js";

const form = document.getElementById("formLogin");
const emailInput = document.getElementById("email");
const btnSend = document.getElementById("btnSend");
const msg = document.getElementById("msg");

function setMsg(text, type = "info") {
  if (!msg) return;
  msg.textContent = text || "";

  msg.style.color =
    type === "error" ? "rgba(255,120,120,.95)" :
    type === "ok"    ? "rgba(102,242,218,.95)" :
                       "rgba(255,255,255,.70)";
}

function setLoading(isLoading) {
  if (!btnSend) return;
  btnSend.disabled = !!isLoading;
  btnSend.style.opacity = isLoading ? "0.75" : "1";
  btnSend.textContent = isLoading ? "Enviando..." : "Enviar link de acesso";
}

function isValidEmail(email) {
  return typeof email === "string" && /\S+@\S+\.\S+/.test(email);
}

function getNext() {
  const params = new URLSearchParams(window.location.search);
  // default: app.html
  return params.get("next") || "/app.html";
}

function buildRedirectToEntrar() {
  // o link do e-mail deve voltar para o entrar.html com o mesmo next
  const next = encodeURIComponent(getNext());
  return `${window.location.origin}/entrar.html?next=${next}`;
}

async function redirectIfLoggedIn() {
  // se o usuário caiu aqui vindo do link do e-mail, a sessão pode já existir
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.error("[entrar] getSession error:", error);

  if (session) {
    const next = getNext();
    window.location.replace(next);
    return true;
  }
  return false;
}

async function sendMagicLink(email) {
  setMsg("Enviando link de acesso...", "info");
  setLoading(true);

  const emailRedirectTo = buildRedirectToEntrar();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
    },
  });

  setLoading(false);

  if (error) {
    console.error("[entrar] signInWithOtp error:", error);
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

btnSend?.addEventListener("click", async (e) => {
  if (form) return;
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
(async () => {
  // se já estiver logado, sai daqui e vai pro destino
  const moved = await redirectIfLoggedIn();
  if (!moved) {
    setMsg("Digite seu e-mail para receber o link de acesso.", "info");
  }
})();
let sending = false;

async function sendMagicLink(email) {
  if (sending) return;
  sending = true;

  setMsg("Enviando link de acesso...", "info");
  setLoading(true);

  const emailRedirectTo = buildRedirectToEntrar();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
    },
  });

  sending = false;
  setLoading(false);

  if (error) {
    setMsg("Erro ao enviar link. Tente novamente.", "error");
    return;
  }

  setMsg("Pronto! Verifique seu e-mail (entrada ou spam).", "ok");
}
