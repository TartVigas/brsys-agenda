import { supabase } from "./supabase.js";

async function boot() {
  const el = document.getElementById("userInfo");
  if (!el) return;

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.error("[app] getUser error:", error);
    el.innerHTML = `<p class="muted small">Erro ao carregar usuário.</p>`;
    return;
  }

  if (!user) {
    // não tem user: o guard do auth.js deve redirecionar, mas aqui é fallback
    el.innerHTML = `<p class="muted small">Sessão não encontrada.</p>`;
    return;
  }

  el.innerHTML = `
    <p class="muted small"><strong>Usuário:</strong><br>${user.email ?? "(sem e-mail)"}</p>
  `;
}

boot();
