// /js/mapa.js — Mapa de Quartos (V1.2)
// Fonte: view public.agenda_quartos_mapa
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  const elToday   = $("#todayLabel");
  const elMsg     = $("#msg");
  const elLoading = $("#stateLoading");
  const elEmpty   = $("#stateEmpty");
  const elGrid    = $("#grid");
  const elSearch  = $("#qSearch");
  const elFilter  = $("#qFilter");
  const btnReload = $("#btnReload");

  let USER = null;
  let ALL = []; // rows do mapa

  const DEBUG = new URLSearchParams(location.search).get("debug") === "1";

  /* =========================
     Helpers (date, text, ui)
  ========================= */

  function isoToday() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function fmtBR(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  }

  function escapeHtml(str = "") {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function onlyDigits(v = "") {
    return String(v).replace(/\D/g, "");
  }

  // DB guarda 55...
  function normalizePhone55(raw) {
    const d = onlyDigits(raw);
    if (!d) return "";
    if (d.startsWith("55")) return d;
    if (d.length === 10 || d.length === 11) return `55${d}`;
    // fallback: retorna como está (pode ser intl)
    return d;
  }

  function waLink(phone55, text = "") {
    const w = normalizePhone55(phone55);
    if (!w) return null;

    // regra simples BR: 55 + DDD + numero => 12 ou 13 dígitos
    if (w.startsWith("55") && !(w.length === 12 || w.length === 13)) return null;

    const qs = text ? `?text=${encodeURIComponent(text)}` : "";
    return `https://wa.me/${w}${qs}`;
  }

  function setMsg(text = "", type = "info") {
    if (!elMsg) return;
    elMsg.textContent = text || "";
    elMsg.style.color =
      type === "error" ? "rgba(255,120,120,.95)" :
      type === "ok" ? "rgba(102,242,218,.95)" :
      "rgba(255,255,255,.70)";
  }

  function show(el, on = true) {
    if (!el) return;
    el.style.display = on ? "" : "none";
  }

  function logSbError(ctx, error) {
    if (!error) return;
    const payload = {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    };
    console.error(`[mapa:${ctx}]`, payload);

    if (DEBUG) {
      setMsg(
        `Erro (${ctx}): ${payload.message || "—"}${payload.code ? ` • code=${payload.code}` : ""}`,
        "error"
      );
    }
  }

  function disableBtn(btn, on = true) {
    if (!btn) return;
    btn.disabled = on;
    btn.style.opacity = on ? "0.7" : "";
    btn.style.pointerEvents = on ? "none" : "";
  }

  function statusPill(st) {
    const map = {
      livre:           { t: "Livre",      c: "rgba(102,242,218,.95)" },
      ocupado:         { t: "Ocupado",    c: "rgba(255,210,120,.95)" },
      reservado_hoje:  { t: "Entra hoje", c: "rgba(160,200,255,.95)" },
      reservado_futuro:{ t: "Reservado",  c: "rgba(255,255,255,.75)" },
      bloqueado:       { t: "Bloqueado",  c: "rgba(255,120,120,.90)" },
      limpeza:         { t: "Limpeza",    c: "rgba(255,245,160,.92)" },
    };
    const s = map[st] || { t: st || "—", c: "rgba(255,255,255,.75)" };
    return `<span class="pill" style="border-color:rgba(255,255,255,.12);color:${s.c};">${escapeHtml(s.t)}</span>`;
  }

  function roomTitle(r) {
    const codigo = r.codigo ? escapeHtml(r.codigo) : "";
    const nome = r.nome ? escapeHtml(r.nome) : "Quarto";
    if (codigo && nome) return `${codigo} • ${nome}`;
    return codigo || nome;
  }

  function roomMeta(r) {
    const tipo = r.tipo ? escapeHtml(r.tipo) : "—";
    const cap = r.capacidade ?? "—";
    return `${tipo} • Cap: ${escapeHtml(String(cap))}`;
  }

  /* =========================
     Actions (checkin/checkout/walkin)
  ========================= */

  async function actionCheckin(reservaId) {
    setMsg("Fazendo check-in…", "info");

    const { error } = await supabase
      .from("agenda_reservas")
      .update({ status: "hospedado", updated_at: new Date().toISOString() })
      .eq("id", reservaId)
      .eq("user_id", USER.id);

    if (error) {
      logSbError("checkin", error);
      setMsg("Erro ao fazer check-in. Verifique permissões/RLS.", "error");
      return;
    }

    setMsg("Check-in feito ✅", "ok");
    await load();
  }

  async function actionCheckout(reservaId) {
    const ok = confirm("Fechar / Checkout dessa hospedagem?");
    if (!ok) return;

    setMsg("Fazendo checkout…", "info");

    const { error } = await supabase
      .from("agenda_reservas")
      .update({ status: "finalizado", updated_at: new Date().toISOString() })
      .eq("id", reservaId)
      .eq("user_id", USER.id);

    if (error) {
      logSbError("checkout", error);
      setMsg("Erro ao fazer checkout. Verifique permissões/RLS.", "error");
      return;
    }

    setMsg("Checkout feito ✅", "ok");
    await load();
  }

  // Walk-in: cria reserva já como "hospedado"
  async function actionWalkin(quartoId) {
    const nome = prompt("Walk-in: nome do hóspede?");
    if (!nome) return;

    const wpp = prompt("WhatsApp (opcional, pode colar com DDD):") || "";
    const today = isoToday();

    // checkout default: amanhã
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const checkout = `${yyyy}-${mm}-${dd}`;

    setMsg("Criando walk-in…", "info");

    const phone55 = normalizePhone55(wpp);
    const payload = {
      user_id: USER.id,
      quarto_id: quartoId,
      nome_hospede: nome.trim(),
      whatsapp: phone55 ? phone55 : null,
      checkin: today,
      checkout,
      observacoes: "walk-in",
      status: "hospedado",
    };

    const { data, error } = await supabase
      .from("agenda_reservas")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      logSbError("walkin", error);
      setMsg("Erro ao criar walk-in. Verifique permissões/RLS.", "error");
      return;
    }

    setMsg("Walk-in criado ✅", "ok");
    window.location.href = `/reserva.html?id=${encodeURIComponent(data.id)}`;
  }

  /* =========================
     Render
  ========================= */

  function renderCard(r) {
    const st = r.mapa_status || "—";

    const occName  = r.nome_hospede ? escapeHtml(r.nome_hospede) : "";
    const occOut   = r.checkout ? fmtBR(r.checkout) : "—";
    const occResId = r.reserva_id;

    const nextName  = r.next_nome_hospede ? escapeHtml(r.next_nome_hospede) : "";
    const nextIn    = r.next_checkin ? fmtBR(r.next_checkin) : "—";
    const nextResId = r.next_reserva_id;

    const waOcc  = waLink(r.whatsapp, `Olá ${occName || "Olá"}! Aqui é da recepção 🙂`);
    const waNext = waLink(r.next_whatsapp, `Olá ${nextName || "Olá"}! Aqui é da recepção 🙂`);

    let body = "";
    let actions = "";

    if (st === "ocupado") {
      body = `
        <div class="muted small" style="margin-top:8px;">
          <strong>${occName || "Hóspede"}</strong><br/>
          Sai: <span class="mono">${escapeHtml(occOut)}</span>
        </div>
      `;
      actions = `
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px;">
          <a class="btn outline small" href="/reserva.html?id=${encodeURIComponent(occResId)}">Abrir</a>
          ${waOcc ? `<a class="btn outline small" target="_blank" rel="noopener noreferrer" href="${waOcc}">WhatsApp</a>` : ""}
          <button class="btn primary small" data-act="checkout" data-id="${encodeURIComponent(occResId)}">Checkout</button>
        </div>
      `;
    } else if (st === "reservado_hoje") {
      body = `
        <div class="muted small" style="margin-top:8px;">
          Entra hoje: <strong>${nextName || "Reserva"}</strong><br/>
          Check-in: <span class="mono">${escapeHtml(nextIn)}</span>
        </div>
      `;
      actions = `
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px;">
          <a class="btn outline small" href="/reserva.html?id=${encodeURIComponent(nextResId)}">Abrir</a>
          ${waNext ? `<a class="btn outline small" target="_blank" rel="noopener noreferrer" href="${waNext}">WhatsApp</a>` : ""}
          <button class="btn primary small" data-act="checkin" data-id="${encodeURIComponent(nextResId)}">Fazer check-in</button>
        </div>
      `;
    } else if (st === "reservado_futuro") {
      body = `
        <div class="muted small" style="margin-top:8px;">
          Próxima: <strong>${nextName || "Reserva"}</strong><br/>
          Entra: <span class="mono">${escapeHtml(nextIn)}</span>
        </div>
      `;
      actions = `
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px;">
          <a class="btn outline small" href="/reserva.html?id=${encodeURIComponent(nextResId)}">Abrir</a>
          ${waNext ? `<a class="btn outline small" target="_blank" rel="noopener noreferrer" href="${waNext}">WhatsApp</a>` : ""}
        </div>
      `;
    } else {
      body = `<div class="muted small" style="margin-top:8px;">Livre agora.</div>`;
      actions = `
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px;">
          <button class="btn primary small" data-act="walkin" data-room="${encodeURIComponent(r.quarto_id)}">Walk-in</button>
          <a class="btn outline small" href="/reserva-nova.html?quarto=${encodeURIComponent(r.quarto_id)}">Reservar</a>
        </div>
      `;
    }

    return `
      <div class="mini-card"
           data-status="${escapeHtml(st)}"
           data-search="${escapeHtml((r.codigo||"")+" "+(r.nome||"")+" "+(r.tipo||""))}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div style="font-weight:900;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${roomTitle(r)}
          </div>
          ${statusPill(st)}
        </div>

        <div class="muted small" style="margin-top:6px;">${roomMeta(r)}</div>
        ${body}
        ${actions}
      </div>
    `;
  }

  function applyFilter() {
    if (!elGrid) return;

    const q = (elSearch?.value || "").trim().toLowerCase();
    const f = (elFilter?.value || "all").trim();

    const cards = Array.from(elGrid.children || []);
    for (const card of cards) {
      const st = card.getAttribute("data-status") || "";
      const s = (card.getAttribute("data-search") || "").toLowerCase();

      const okStatus = (f === "all") ? true : (st === f);
      const okSearch = !q ? true : s.includes(q);

      card.style.display = (okStatus && okSearch) ? "" : "none";
    }
  }

  /* =========================
     Load
  ========================= */

  async function load() {
    show(elLoading, true);
    show(elEmpty, false);
    show(elGrid, false);
    setMsg("");

    const { data, error } = await supabase
      .from("agenda_quartos_mapa")
      .select("*")
      .eq("user_id", USER.id)
      .order("ordem", { ascending: true })
      .order("codigo", { ascending: true });

    if (error) {
      logSbError("load", error);
      setMsg("Erro ao carregar mapa. Verifique view/RLS.", "error");
      show(elLoading, false);
      show(elEmpty, true);
      if (elEmpty) elEmpty.innerHTML = `<p class="muted">Erro ao carregar mapa.</p>`;
      return;
    }

    ALL = data || [];
    show(elLoading, false);

    if (!ALL.length) {
      show(elEmpty, true);
      return;
    }

    if (elGrid) {
      elGrid.innerHTML = ALL.map(renderCard).join("");
    }

    show(elGrid, true);
    applyFilter();
  }

  /* =========================
     Events (bind once)
  ========================= */

  function bind() {
    btnReload?.addEventListener("click", load);
    elSearch?.addEventListener("input", applyFilter);
    elFilter?.addEventListener("change", applyFilter);

    // Delegation (bind UMA vez, fora do load)
    elGrid?.addEventListener("click", async (ev) => {
      const btn = ev.target?.closest?.("button[data-act]");
      if (!btn) return;

      const act = btn.getAttribute("data-act");

      // anti double-click
      disableBtn(btn, true);

      try {
        if (act === "walkin") {
          const room = btn.getAttribute("data-room");
          if (room) await actionWalkin(room);
          return;
        }

        if (act === "checkin") {
          const id = btn.getAttribute("data-id");
          if (id) await actionCheckin(id);
          return;
        }

        if (act === "checkout") {
          const id = btn.getAttribute("data-id");
          if (id) await actionCheckout(id);
          return;
        }
      } finally {
        // se não redirecionou, reabilita
        disableBtn(btn, false);
      }
    });
  }

  /* =========================
     Boot
  ========================= */

  (async function boot() {
    USER = await requireAuth({ redirectTo: "/entrar.html?next=/mapa.html", renderUserInfo: false });
    if (!USER) return;

    const today = isoToday();
    if (elToday) elToday.textContent = `Hoje: ${fmtBR(today)} • Livre/Reservado/Ocupado`;

    bind();
    await load();
  })();
})();
