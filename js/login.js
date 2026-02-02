import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// 1) URL do projeto (uma única linha)
const SUPABASE_URL = "https://qxocjsthqflgffgqbrhe.supabase.co";

// 2) ANON PUBLIC KEY (uma única linha, sem quebras, sem aspas estranhas)
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4b2Nqc3RocWZsZ2ZmZ3FicmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNTYyMzIsImV4cCI6MjA3ODYzMjIzMn0.DH1LQ1N7tBHMyKlBpuzLU69GBeMhoq-z92CnX0i-7jY";

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ✅ Config
const SUPABASE_URL = "https://SEU_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = "SUA_ANON_KEY_AQUI";

// ✅ Client (padrão bom pra magic link)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// ✅ UI
const emailInput = document.getElementById("email");
const btnLogin = document.getElementById("btnLogin");
const msg = document.getElementById("msg");

function setMsg(text) {
  msg.textContent = text || "";
  console.log("[login]", text);
}

function setLoading(isLoading) {
  btnLogin.disabled = !!isLoading;
  btnLogin.style.opacity = isLoading ? "0.7" : "1";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

btnLogin.addEventListener("click", async () => {
  const email = (emailInput.value || "").trim().toLowerCase();

  if (!email || !isValidEmail(email)) {
    return setMsg("Digite um e-mail válido.");
  }

  try {
    setLoading(true);
    setMsg("Enviando link de acesso...");

    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // ✅ manda cair DIRETO na área logada
        emailRedirectTo: "https://agenda.brsys.com.br/app.html",
        shouldCreateUser: true,
      },
    });

    console.log("[login] data:", data);

    if (error) {
      console.error("[login] error:", error);
      return setMsg("Erro: " + error.message);
    }

    setMsg("Pronto! Verifique seu e-mail (caixa de entrada e spam).");
  } catch (err) {
    console.error("[login] catch:", err);
    setMsg("Erro inesperado. Tente novamente.");
  } finally {
    setLoading(false);
  }
});
