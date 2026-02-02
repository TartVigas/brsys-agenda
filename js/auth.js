import { supabase } from "./supabase.js";

export async function requireAuth({ redirectTo = "/entrar.html", renderUserInfo = true } = {}) {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) console.error("[auth] getSession error:", error);

  if (!session) {
    window.location.replace(redirectTo);
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

  // logout (opcional)
  const btnLogout = document.getElementById("logout");
  if (btnLogout) {
    btnLogout.onclick = async () => {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) console.error("[auth] signOut error:", signOutError);
      window.location.replace("/entrar.html");
    };
  }

  return session.user;
}
