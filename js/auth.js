import { supabase } from "./supabase.js";

export async function requireAuth({
  redirectTo = "/entrar.html",
  renderUserInfo = true,
  preserveNext = true,
} = {}) {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) console.error("[auth] getSession error:", error);

  // não logado → volta pro login (com next opcional)
  if (!session) {
    const next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
    const url = preserveNext ? `${redirectTo}?next=${next}` : redirectTo;
    window.location.replace(url);
    return null;
  }

  // mostra info básica (opcional)
  if (renderUserInfo) {
    const el = document.getElementById("userInfo");
    if (el) {
      const email = session.user?.email || "(sem e-mail)";
      el.innerHTML = `<p class="muted small">Logado como: <strong>${email}</strong></p>`;
    }
  }

  // logout
  const btnLogout = document.getElementById("logout");
  if (btnLogout) {
    btnLogout.onclick = async () => {
      try {
        btnLogout.disabled = true;
        btnLogout.setAttribute("aria-busy", "true");

        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) console.error("[auth] signOut error:", signOutError);
      } finally {
        window.location.replace("/entrar.html");
      }
    };
  }

  return session.user;
}
