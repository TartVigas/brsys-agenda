// /js/app.js — Home bootstrap (V1.2)
// Responsabilidade:
// - garantir auth
// - preencher email no topo
// - logout fallback (caso auth.js não binde)
// OBS: o dashboard/contagens/listas ficam em /js/home.js

import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

const $ = (sel, root = document) => root.querySelector(sel);

(function () {
  const elEmail = $("#userEmail");
  const btnLogout = $("#logout");

  async function boot() {
    const user = await requireAuth({
      redirectTo: "/entrar.html?next=/app.html",
      renderUserInfo: false,
    });
    if (!user) return;

    // email
    if (elEmail) elEmail.textContent = user.email || "(sem e-mail)";

    // logout fallback (se auth.js já cuidar, ok — duplicação não quebra)
    if (btnLogout) {
      btnLogout.addEventListener("click", async () => {
        try {
          await supabase.auth.signOut();
        } catch (e) {
          // ignore
        } finally {
          window.location.href = "/entrar.html";
        }
      }, { once: true });
    }
  }

  boot().catch((err) => console.error("[app] boot error:", err));
})();
