import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// 🔑 pegue em: Supabase > Project Settings > API
const SUPABASE_URL = "https://https://qxocjsthqflffgqbrhe.supabase.co
.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4b2Nqc3RocWZsZ2ZmZ3FicmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNTYyMzIsImV4cCI6MjA3ODYzMjIzMn0.DH1LQ1N7tBHMyKlBpuzLU69GBeMhoq-z92CnX0i-7jY";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const emailInput = document.getElementById("email");
const btnLogin = document.getElementById("btnLogin");
const msg = document.getElementById("msg");

btnLogin.addEventListener("click", async () => {
  const email = emailInput.value.trim();

  if (!email) {
    msg.textContent = "Digite um e-mail válido.";
    return;
  }

  msg.textContent = "Enviando link de acesso...";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: "https://agenda.brsys.com.br"
    }
  });

  if (error) {
    msg.textContent = "Erro: " + error.message;
  } else {
    msg.textContent = "Pronto! Verifique seu e-mail para acessar.";
  }
});
