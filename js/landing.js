/* BRsys Agenda — landing.js (safe + CRO)
   - Só mexe em CTAs marcados (data-wa) ou IDs conhecidos
   - WhatsApp com mensagem pré-pronta
   - FAB WhatsApp com tracking básico
*/
(function () {
  const PHONE = "5513997408157";
  const BASE_WA = `https://wa.me/${PHONE}`;

  // Mensagem padrão (CRO)
  const MSG = encodeURIComponent(
    "Quero testar a Agenda BRsys (V1).\n" +
    "Nome da hospedagem: \n" +
    "Cidade/UF: \n" +
    "Meu e-mail: "
  );

  const WA_LINK = `${BASE_WA}?text=${MSG}`;

  // Helper: transformar âncora em CTA WhatsApp
  function bindWhatsApp(el, trackName) {
    if (!el) return;

    el.href = WA_LINK;
    el.target = "_blank";
    el.rel = "noopener noreferrer";

    // opcional: garantir classe btn (mas não forçar outline)
    if (!el.classList.contains("btn")) el.classList.add("btn");

    el.addEventListener("click", () => track(trackName || "click_cta_whatsapp"));
  }

  // Tracking simples
  function track(name) {
    try {
      console.log("[BRsys Agenda]", name, new Date().toISOString());
    } catch (e) {}
  }

  // 1) CTAs por ID (se existirem)
  bindWhatsApp(document.getElementById("ctaWaTeste"), "click_whatsapp_teste");
  bindWhatsApp(document.getElementById("ctaWaFinal"), "click_whatsapp_final");

  // 2) CTAs marcados no HTML: <a data-wa>...</a>
  document.querySelectorAll("a[data-wa]").forEach((a) => {
    bindWhatsApp(a, "click_whatsapp_datawa");
  });

  // 3) FAB WhatsApp (botão flutuante)
  const fab = document.createElement("a");
  fab.href = WA_LINK;
  fab.target = "_blank";
  fab.rel = "noopener noreferrer";
  fab.className = "wa-fab";
  fab.setAttribute("aria-label", "Falar no WhatsApp");
  fab.innerHTML = `
    <span class="wa-dot" aria-hidden="true"></span>
    <span class="wa-text">WhatsApp</span>
  `;

  document.body.appendChild(fab);
  fab.addEventListener("click", () => track("click_whatsapp_fab"));

  // 4) Scroll suave: links internos (#)
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      track("click_anchor_" + id.replace("#", ""));
    });
  });

  track("landing_ready");
})();
