// /js/conta.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  const elMsg = $("#msg");
  const elUserName = $("#userName");
  const elUserEmail2 = $("#userEmail2");
  const elStatusText = $("#statusText");
  const elStatusSub = $("#statusSub");

  const btnPing = $("#btnPing");
  const btnCopyEmail = $("#btnCopyEmail");
  const btnLogout = $("#logout");

  let USER = null;

  function setMsg(text = "", type = "info") {
    if (!elMsg) return;
    elMsg.textContent = text || "";
    elMsg.style.color =
      type === "error" ? "rgba(255,120,120,.95)" :
      type === "ok"    ? "rgba(102,242,218,.95)" :
                         "rgba(255,255,255,.70)";
  }

  function setStatus(text = "—", sub = "", ok = true) {
    if (elStatusText) elStatusText.textContent = text;
    if (elStatusSub) elStatusSub.textContent = sub || "";
    if (elStatusText) {
      elStatusText.style.color = ok ? "rgba(102,242,218,.95)" : "rgba(255,120,120,.95)";
    }
  }

  async function ping() {
    try {
      setMsg("Testando conexão…", "info");
      setStatus("Verificando…", "Sessão e conexão", true);

      // ping simples: valida sessão e faz query leve
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;

      if (!sessionData?.session?.user) {
        setStatus("Sessão inválida", "Faça login novamente.", false);
        setMsg("Sessão inválida. Redirecionando…", "error");
        setTimeout(() => window.location.replace("/entrar.html?next=/conta.html"), 400);
        return;
      }

      // query ultra leve pra testar RLS e conexão
      const { error } = await supabase
        .from("agenda_reservas")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", sessionData.session.user.id);

      if (error) throw error;

      setStatus("Online ✅", "Sessão OK • Banco OK", true);
      setMsg("Conexão OK ✅", "ok");
    } catch (e) {
      console.error("[conta] ping error:", e);
      setStatus("Erro", "Falha ao validar conexão/RLS.", false);
      setMsg("Erro ao testar conexão. Veja o Console (F12).", "error");
    }
  }

  async function copyEmail() {
    const email = USER?.email || "";
    if (!email) return setMsg("Sem e-mail disponível.", "error");

    try {
      await navigator.clipboard.writeText(email);
      setMsg("E-mail copiado ✅", "ok");
    } catch {
      // fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = email;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setMsg("E-mail copiado ✅", "ok");
      } catch {
        setMsg("Não consegui copiar. Copie manualmente.", "error");
      }
    }
  }

  async function safeLogout() {
    // se seu auth.js já faz bind no #logout, isso aqui não atrapalha.
    try {
      setMsg("Saindo…", "info");
      await supabase.auth.signOut();
    } finally {
      window.location.replace("/entrar.html");
    }
  }

  (async function boot() {
    USER = await requireAuth({ redirectTo: "/entrar.html?next=/conta.html", renderUserInfo: false });
    if (!USER) return;

    // preencher dados
    if (elUserName) elUserName.textContent = "Conta ativa";
    if (elUserEmail2) elUserEmail2.textContent = USER.email || "(sem e-mail)";

    // status inicial
    await ping();

    btnPing?.addEventListener("click", ping);
    btnCopyEmail?.addEventListener("click", copyEmail);

    // logout seguro (se já existir handler no auth.js, ok)
    btnLogout?.addEventListener("click", (e) => {
      e.preventDefault();
      safeLogout();
    });
  })();
})();

