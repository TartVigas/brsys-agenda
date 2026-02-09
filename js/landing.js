/* Agenda PMS BRsys — landing.js (safe + CRO) V1.2
   - Só mexe em CTAs marcados (data-wa) ou IDs conhecidos
   - WhatsApp com mensagem pré-pronta (dinâmica)
   - FAB WhatsApp inteligente + tracking simples
*/
(function () {
  const PHONE = "5513997408157";
  const BASE_WA = `https://wa.me/${PHONE}`;

  // ===== Tracking (simples, mas útil) =====
  function track(name, extra) {
    try {
      const payload = {
        name,
        ts: new Date().toISOString(),
        path: location.pathname,
        ref: document.referrer || "",
        ...extra,
      };

      // contador local (para você ter noção do uso sem analytics)
      const key = "brsys_agenda_events";
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      arr.push(payload);
      // mantém só os últimos 50
      while (arr.length > 50) arr.shift();
      localStorage.setItem(key, JSON.stringify(arr));

      console.log("[Agenda PMS BRsys]", payload);

      // opcional futuro: se você criar um endpoint /t, pode ligar beacon aqui
      // navigator.sendBeacon?.("/t", JSON.stringify(payload));
    } catch (e) {}
  }

  // ===== Utils =====
  const $ = (sel, root = document) => root.querySelector(sel);

  function getUTMs() {
    const p = new URLSearchParams(location.search);
    const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
    const out = {};
    keys.forEach((k) => {
      const v = p.get(k);
      if (v) out[k] = v;
    });
    return out;
  }

  function safeVal(v) {
    return (v || "").toString().trim();
  }

  // Se você tiver futuramente um input de email na landing, já captura.
  // Ex.: <input id="leadEmail" type="email" ...>
  function getLeadEmail() {
    const el = $("#leadEmail") || $('input[type="email"]');
    return el ? safeVal(el.value) : "";
  }

  // Se você marcar plano no HTML:
  // <a data-wa data-plan="Lite">...</a>
  function getPlanFromEl(el) {
    return el?.getAttribute?.("data-plan") || "";
  }

  function buildMessage(extra) {
    const utm = getUTMs();
    const email = getLeadEmail();

    const lines = [
      "Quero testar o Agenda PMS BRsys (V1).",
      "Nome da hospedagem: ",
      "Cidade/UF: ",
      `Meu e-mail: ${email || ""}`,
      "",
      "Rotina principal (opcional): day use / pernoite / ambos: ",
    ];

    if (extra?.plan) lines.push(`Plano de interesse: ${extra.plan}`);

    // Se tiver UTM/referrer, ajuda a rastrear origem
    const ref = document.referrer ? document.referrer.slice(0, 120) : "";
    const utmStr = Object.keys(utm).length ? JSON.stringify(utm) : "";
    if (utmStr || ref) {
      lines.push("");
      lines.push("—");
      if (utmStr) lines.push("UTM: " + utmStr);
      if (ref) lines.push("Ref: " + ref);
    }

    return encodeURIComponent(lines.join("\n"));
  }

  function makeWaLink(extra) {
    return `${BASE_WA}?text=${buildMessage(extra)}`;
  }

  // Helper: transformar âncora em CTA WhatsApp
  function bindWhatsApp(el, trackName) {
    if (!el) return;

    const plan = getPlanFromEl(el);
    el.href = makeWaLink({ plan });
    el.target = "_blank";
    el.rel = "noopener noreferrer";

    // não força a classe se já existe outline ou btn
    if (!el.classList.contains("btn") && !el.classList.contains("outline")) {
      // se for link comum marcado com data-wa, vira botão
      el.classList.add("btn");
    }

    el.addEventListener("click", () =>
      track(trackName || "click_cta_whatsapp", { plan: plan || undefined })
    );
  }

  // ===== 1) CTAs por ID (se existirem) =====
  bindWhatsApp(document.getElementById("ctaWaTeste"), "click_whatsapp_teste");
  bindWhatsApp(document.getElementById("ctaWaFinal"), "click_whatsapp_final");

  // ===== 2) CTAs marcados no HTML: <a data-wa>...</a> =====
  document.querySelectorAll("a[data-wa]").forEach((a) => {
    bindWhatsApp(a, "click_whatsapp_datawa");
  });

  // ===== 3) FAB WhatsApp (botão flutuante) =====
  const fab = document.createElement("a");
  fab.href = makeWaLink();
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

  // FAB aparece depois de descer um pouco (melhor UX)
  function setFabVisibility() {
    const y = window.scrollY || 0;
    const shouldShow = y > 220;
    fab.style.opacity = shouldShow ? "1" : "0";
    fab.style.pointerEvents = shouldShow ? "auto" : "none";
    fab.style.transform = shouldShow ? "translateY(0)" : "translateY(8px)";
  }

  // evita animação em usuários com reduce motion
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!reduceMotion) {
    fab.style.transition = "opacity .18s ease, transform .18s ease";
  }

  setFabVisibility();
  window.addEventListener("scroll", setFabVisibility, { passive: true });

  // ===== 4) Scroll suave: links internos (#) =====
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (!id || id === "#") return;

      const target = document.querySelector(id);
      if (!target) return;

      e.preventDefault();

      // respeita reduce motion
      if (reduceMotion) {
        target.scrollIntoView({ block: "start" });
      } else {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      track("click_anchor", { id: id.replace("#", "") });
    });
  });

  track("landing_ready");
})();
