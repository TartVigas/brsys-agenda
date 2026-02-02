/* BRsys Agenda — landing JS (minimal, safe) */
(function () {
  const WA = "https://wa.me/5513997408157";

  // CTA links vira botão (se tiver texto compatível)
  const ctaCandidates = Array.from(document.querySelectorAll("a"))
    .filter(a => {
      const t = (a.textContent || "").toLowerCase();
      return t.includes("agenda brsys") || t.includes("whatsapp");
    });

  ctaCandidates.forEach(a => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
    if (!a.classList.contains("btn")) a.classList.add("btn");
  });

  // Botão flutuante WhatsApp
  const fab = document.createElement("a");
  fab.href = WA;
  fab.target = "_blank";
  fab.rel = "noopener noreferrer";
  fab.className = "wa-fab";
  fab.setAttribute("aria-label", "Falar no WhatsApp");
  fab.innerHTML = `
    <span class="wa-dot"></span>
    <span class="wa-text">WhatsApp</span>
  `;
  document.body.appendChild(fab);

  // Log simples
  const track = (name) => {
    try { console.log("[BRsys Agenda]", name, new Date().toISOString()); } catch (e) {}
  };

  fab.addEventListener("click", () => track("click_whatsapp_fab"));
  ctaCandidates.forEach(a => a.addEventListener("click", () => track("click_cta_link")));
})();
