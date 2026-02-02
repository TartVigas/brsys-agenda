import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// 1) URL do projeto (uma única linha)
const SUPABASE_URL = "https://qxocjsthqflffgqbrhe.supabase.co";

// 2) ANON PUBLIC KEY (uma única linha, sem quebras, sem aspas estranhas)
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4b2Nqc3RocWZsZ2ZmZ3FicmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNTYyMzIsImV4cCI6MjA3ODYzMjIzMn0.DH1LQ1N7tBHMyKlBpuzLU69GBeMhoq-z92CnX0i-7jY";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { detectSessionInUrl: true, persistSession: true }
});

const emailInput = document.getElementById("email");
const btnLogin = document.getElementById("btnLogin");
const msg = document.getElementById("msg");

function setMsg(t) {
  msg.textContent = t;
  console.log("[login]", t);
}

btnLogin.addEventListener("click", async () => {
  const email = emailInput.value.trim();

  if (!email) return setMsg("Digite um e-mail válido.");

  setMsg("Enviando link de acesso...");

  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: "https://agenda.brsys.com.br",
      shouldCreateUser: true
    }
  });

  console.log("[login] data:", data);

  if (error) {
    console.error("[login] error:", error);
    return setMsg("Erro: " + error.message);
  }

  setMsg("Pronto! Verifique seu e-mail (caixa de entrada e spam).");
});
