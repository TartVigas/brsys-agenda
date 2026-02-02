import { supabase } from "./supabase.js";

async function requireAuth() {
  // pega sessão atual
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error("[auth] getSession error:", error);
  }

  // não logado → volta pro login
  if (!session) {
    window.location.replace("/login.html");
    return;
  }

  // mostra info básica
  const el = document.getElementById("userInfo");
  if (el) {
    const email = session.user?.email || "(sem e-mail)";
    el.innerHTML = `<p class="muted small">Logado como: <strong>${email}</strong></p>`;
  }

  // logout
  const btnLogout = document.getElementById("logout");
  if (btnLogout) {
    btnLogout.onclick = async () => {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) console.error("[auth] signOut error:", signOutError);
      window.location.replace("/login.html");
    };
  }
}

requireAuth();
