/* BRsys Agenda — landing JS (minimal, safe) */
(function () {
  const WA = "https://wa.me/5513997408157";

  // 1) Upgrade links de CTA para "botão" se ainda estiverem como link simples
  const ctaCandidates = Array.from(document.querySelectorAll("a"))
    .filter(a => (a.textContent || "").toLowerCase().includes("agenda brsys") || (a.textContent || "").toLowerCase().includes("whatsapp"));

  ctaCandidates.forEach(a => {
    // mantém o href, mas garante target + aparência
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");

    // se já tiver classe/estilo, não atrapalha; se não tiver, aplica um "botão"
    if (!a.classList.contains("btn")) a.classList.add("btn");
  });

  // 2) Botão flutuante do WhatsApp (alta conversão)
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

  // 3) Log simples (depois vira GA/Pixel)
  const track = (name) => {
    try { console.log("[BRsys Agenda]", name, new Date().toISOString()); } catch(e) {}
  };

  fab.addEventListener("click", () => track("click_whatsapp_fab"));
  ctaCandidates.forEach(a => a.addEventListener("click", () => track("click_cta_link")));

})();

