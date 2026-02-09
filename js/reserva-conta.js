// /js/reserva-conta.js — Conta da Reserva (V1)
// - Lançamentos + Pagamentos vinculados à reserva
// - Totais: total / pago / saldo + pill status
// - Botão "Fechar conta / Checkout" (habilita quando saldo <= 0)
// - DEPENDE do /js/reserva.js setar window.__RESERVA_ID (preferencial)
//   OU pegar ?id=... da URL
//
// Tabelas esperadas (Supabase):
// - agenda_lancamentos: id, user_id, reserva_id, descricao, valor, tipo, created_at
// - agenda_pagamentos:  id, user_id, reserva_id, forma, valor, obs, created_at
// (Se seus nomes/colunas forem diferentes, ajusta aqui no topo)
//
// Observação: não altera Supabase/RLS, apenas consome.

import { supabase } from "/js/supabase.js";
import { requireAuth } from "/js/auth.js";

(function () {
  const $ = (s, root = document) => root.querySelector(s);

  // ---------- binds (HTML ids) ----------
  const elContaStatus = $("#contaStatus");
  const elTotalLanc = $("#totalLanc");
  const elTotalPago = $("#totalPago");
  const elSaldo = $("#saldo");
  const elContaMsg = $("#contaMsg");
  const btnFecharConta = $("#btnFecharConta");

  // Forms
  const formLanc = $("#formLanc");
  const lDesc = $("#lDesc");
  const lValor = $("#lValor");
  const lTipo = $("#lTipo");
  const listaLanc = $("#listaLanc");

  const formPag = $("#formPag");
  const pForma = $("#pForma");
  const pValor = $("#pValor");
  const pObs = $("#pObs");
  const listaPag = $("#listaPag");

  // PMS buttons (optional, in reserva.html)
  const btnCheckout = $("#btnCheckout");
  const btnCheckin = $("#btnCheckin");

  // ---------- config: table + field names ----------
  const TB_LANC = "agenda_lancamentos";
  const TB_PAG = "agenda_pagamentos";
  const TB_RES = "agenda_reservas";

  const COL = {
    user_id: "user_id",
    reserva_id: "reserva_id",
    lanc_desc: "descricao",
    lanc_valor: "valor",
    lanc_tipo: "tipo",
    pag_forma: "forma",
    pag_valor: "valor",
    pag_obs: "obs",
    status: "status",
    updated_at: "updated_at",
  };

  // ---------- state ----------
  let USER = null;
  let RESERVA_ID = null;

  let LANC = [];
  let PAGS = [];

  // ---------- utils ----------
  function setMsg(text = "", type = "info") {
    if (!elContaMsg) return;
    elContaMsg.textContent = text || "";
    elContaMsg.style.color =
      type === "error"
        ? "rgba(255,120,120,.95)"
        : type === "ok"
        ? "rgba(102,242,218,.95)"
        : "rgba(255,255,255,.70)";
  }

  function setPill(el, label, type = "info") {
    if (!el) return;
    el.textContent = label;
    el.style.display = "";
    el.style.border = "1px solid rgba(255,255,255,.12)";
    el.style.borderRadius = "999px";
    el.style.padding = "6px 10px";
    el.style.fontSize = "12px";
    el.style.fontWeight = "900";

    if (type === "ok") {
      el.style.color = "rgba(102,242,218,.98)";
      el.style.background = "rgba(102,242,218,.08)";
      return;
    }
    if (type === "warn") {
      el.style.color = "rgba(255,210,120,.98)";
      el.style.background = "rgba(255,210,120,.08)";
      return;
    }
    if (type === "error") {
      el.style.color = "rgba(255,120,120,.98)";
      el.style.background = "rgba(255,120,120,.08)";
      return;
    }
    el.style.color = "rgba(255,255,255,.80)";
    el.style.background = "rgba(255,255,255,.06)";
  }

  function onlyDigits(v = "") {
    return String(v).replace(/\D/g, "");
  }

  function parseBRL(v) {
    // aceita: "180", "180.50", "180,50", "R$ 180,50"
    const raw = String(v ?? "").trim();
    if (!raw) return NaN;

    // remove currency/space
    let s = raw.replace(/[R$\s]/g, "");

    // se vier no padrão BR: 1.234,56 -> 1234.56
    // remove pontos de milhar, troca vírgula por ponto
    if (s.includes(",") && s.includes(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (s.includes(",")) {
      s = s.replace(",", ".");
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function moneyBRL(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "R$ 0,00";
    return v.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    });
  }

  function isoToBR(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function sumValues(list, colName) {
    return (list || []).reduce((acc, it) => {
      const n = Number(it?.[colName]);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
  }

  function getReservaIdFromUrl() {
    const u = new URL(window.location.href);
    return u.searchParams.get("id");
  }

  // ---------- render ----------
  function renderTotals() {
    const total = sumValues(LANC, COL.lanc_valor);
    const pago = sumValues(PAGS, COL.pag_valor);
    const saldo = total - pago;

    if (elTotalLanc) elTotalLanc.textContent = moneyBRL(total);
    if (elTotalPago) elTotalPago.textContent = moneyBRL(pago);
    if (elSaldo) elSaldo.textContent = moneyBRL(saldo);

    // status pill
    if (saldo <= 0 && total > 0) {
      setPill(elContaStatus, "Quitada", "ok");
    } else if (total <= 0) {
      setPill(elContaStatus, "Sem lançamentos", "info");
    } else if (saldo > 0) {
      setPill(elContaStatus, "Em aberto", "warn");
    } else {
      setPill(elContaStatus, "OK", "ok");
    }

    // botão fechar conta
    if (btnFecharConta) {
      const canClose = total > 0 && saldo <= 0;
      btnFecharConta.disabled = !canClose;
      btnFecharConta.style.opacity = canClose ? "1" : ".55";
      btnFecharConta.title = canClose
        ? "Fechar conta e fazer checkout"
        : "Registre lançamentos e pagamentos para liberar o checkout.";
    }

    return { total, pago, saldo };
  }

  function renderLancamentos() {
    if (!listaLanc) return;

    if (!LANC.length) {
      listaLanc.innerHTML = `<div class="muted small">Nenhum lançamento ainda.</div>`;
      return;
    }

    listaLanc.innerHTML = LANC.map((l) => {
      const id = l.id;
      const desc = escapeHtml(l[COL.lanc_desc] || "—");
      const tipo = escapeHtml(l[COL.lanc_tipo] || "—");
      const valor = moneyBRL(l[COL.lanc_valor]);
      const dt = isoToBR(l.created_at);

      return `
        <div class="list-item" data-lanc-id="${escapeHtml(id)}">
          <div class="row" style="margin:0;gap:10px;flex-wrap:wrap;align-items:flex-start;">
            <div style="min-width:200px;flex:1;">
              <div style="font-weight:900;">${desc}</div>
              <div class="muted small" style="margin-top:6px;">
                <span class="pill" style="padding:5px 9px;border-color:rgba(255,255,255,.10);">${tipo}</span>
                <span style="opacity:.6"> • </span>
                <span class="mono">${escapeHtml(dt)}</span>
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:10px;">
              <div style="font-weight:900;">${escapeHtml(valor)}</div>
              <button class="btn outline small" data-act="del-lanc" data-id="${escapeHtml(id)}" type="button">Remover</button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderPagamentos() {
    if (!listaPag) return;

    if (!PAGS.length) {
      listaPag.innerHTML = `<div class="muted small">Nenhum pagamento ainda.</div>`;
      return;
    }

    listaPag.innerHTML = PAGS.map((p) => {
      const id = p.id;
      const forma = escapeHtml(p[COL.pag_forma] || "—");
      const valor = moneyBRL(p[COL.pag_valor]);
      const obs = escapeHtml(p[COL.pag_obs] || "");
      const dt = isoToBR(p.created_at);

      return `
        <div class="list-item" data-pag-id="${escapeHtml(id)}">
          <div class="row" style="margin:0;gap:10px;flex-wrap:wrap;align-items:flex-start;">
            <div style="min-width:200px;flex:1;">
              <div style="font-weight:900;">${forma.toUpperCase()}</div>
              <div class="muted small" style="margin-top:6px;">
                <span class="mono">${escapeHtml(dt)}</span>
                ${obs ? `<span style="opacity:.6"> • </span><span>${obs}</span>` : ""}
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:10px;">
              <div style="font-weight:900;">${escapeHtml(valor)}</div>
              <button class="btn outline small" data-act="del-pag" data-id="${escapeHtml(id)}" type="button">Remover</button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAll() {
    renderLancamentos();
    renderPagamentos();
    renderTotals();
  }

  // ---------- data load ----------
  async function loadAll() {
    setMsg("Carregando conta…", "info");

    // lançamentos
    const qLanc = supabase
      .from(TB_LANC)
      .select("id, created_at, descricao, valor, tipo, reserva_id, user_id")
      .eq(COL.user_id, USER.id)
      .eq(COL.reserva_id, RESERVA_ID)
      .order("created_at", { ascending: false });

    const qPag = supabase
      .from(TB_PAG)
      .select("id, created_at, forma, valor, obs, reserva_id, user_id")
      .eq(COL.user_id, USER.id)
      .eq(COL.reserva_id, RESERVA_ID)
      .order("created_at", { ascending: false });

    const [{ data: dl, error: el }, { data: dp, error: ep }] = await Promise.all([qLanc, qPag]);

    if (el || ep) {
      console.error("[reserva-conta] load error", el || ep);
      setMsg("Erro ao carregar conta. Verifique RLS/tabelas.", "error");
      return;
    }

    LANC = Array.isArray(dl) ? dl : [];
    PAGS = Array.isArray(dp) ? dp : [];

    setMsg("");
    renderAll();
  }

  // ---------- actions ----------
  async function addLancamento() {
    const desc = String(lDesc?.value || "").trim();
    const tipo = String(lTipo?.value || "extra").trim();
    const valor = parseBRL(lValor?.value);

    if (!desc) return setMsg("Informe a descrição do lançamento.", "error");
    if (!Number.isFinite(valor) || valor <= 0) return setMsg("Informe um valor válido (ex: 180,00).", "error");

    setMsg("Adicionando lançamento…", "info");

    const payload = {
      [COL.user_id]: USER.id,
      [COL.reserva_id]: RESERVA_ID,
      [COL.lanc_desc]: desc,
      [COL.lanc_valor]: valor,
      [COL.lanc_tipo]: tipo,
    };

    const { error } = await supabase.from(TB_LANC).insert(payload);

    if (error) {
      console.error("[reserva-conta] add lanc error", error);
      setMsg("Erro ao adicionar lançamento. Verifique tabela/RLS.", "error");
      return;
    }

    // limpa form
    if (lDesc) lDesc.value = "";
    if (lValor) lValor.value = "";
    if (lTipo) lTipo.value = "extra";

    setMsg("Lançamento adicionado ✅", "ok");
    await loadAll();
  }

  async function addPagamento() {
    const forma = String(pForma?.value || "pix").trim();
    const valor = parseBRL(pValor?.value);
    const obs = String(pObs?.value || "").trim();

    if (!Number.isFinite(valor) || valor <= 0) return setMsg("Informe um valor válido (ex: 180,00).", "error");

    setMsg("Registrando pagamento…", "info");

    const payload = {
      [COL.user_id]: USER.id,
      [COL.reserva_id]: RESERVA_ID,
      [COL.pag_forma]: forma,
      [COL.pag_valor]: valor,
      [COL.pag_obs]: obs || null,
    };

    const { error } = await supabase.from(TB_PAG).insert(payload);

    if (error) {
      console.error("[reserva-conta] add pag error", error);
      setMsg("Erro ao registrar pagamento. Verifique tabela/RLS.", "error");
      return;
    }

    // limpa form
    if (pValor) pValor.value = "";
    if (pObs) pObs.value = "";

    setMsg("Pagamento registrado ✅", "ok");
    await loadAll();
  }

  async function delLancamento(id) {
    const ok = confirm("Remover este lançamento?");
    if (!ok) return;

    setMsg("Removendo lançamento…", "info");

    const { error } = await supabase
      .from(TB_LANC)
      .delete()
      .eq("id", id)
      .eq(COL.user_id, USER.id)
      .eq(COL.reserva_id, RESERVA_ID);

    if (error) {
      console.error("[reserva-conta] del lanc error", error);
      setMsg("Erro ao remover lançamento.", "error");
      return;
    }

    setMsg("Lançamento removido ✅", "ok");
    await loadAll();
  }

  async function delPagamento(id) {
    const ok = confirm("Remover este pagamento?");
    if (!ok) return;

    setMsg("Removendo pagamento…", "info");

    const { error } = await supabase
      .from(TB_PAG)
      .delete()
      .eq("id", id)
      .eq(COL.user_id, USER.id)
      .eq(COL.reserva_id, RESERVA_ID);

    if (error) {
      console.error("[reserva-conta] del pag error", error);
      setMsg("Erro ao remover pagamento.", "error");
      return;
    }

    setMsg("Pagamento removido ✅", "ok");
    await loadAll();
  }

  async function doCheckout() {
    const totals = renderTotals();
    if (!(totals.total > 0 && totals.saldo <= 0)) {
      setMsg("A conta precisa estar quitada para fazer checkout.", "error");
      return;
    }

    const ok = confirm("Fechar conta e fazer checkout desta reserva?");
    if (!ok) return;

    setMsg("Fazendo checkout…", "info");

    // OBS: status precisa existir no CHECK constraint do seu DB
    // Se seu constraint não aceitar "finalizado", troque por um status válido (ex: "encerrada")
    const nextStatus = "finalizado";

    const { error } = await supabase
      .from(TB_RES)
      .update({ [COL.status]: nextStatus, [COL.updated_at]: new Date().toISOString() })
      .eq("id", RESERVA_ID)
      .eq(COL.user_id, USER.id);

    if (error) {
      console.error("[reserva-conta] checkout error", error);
      setMsg("Erro ao fazer checkout. Verifique status permitido no DB.", "error");
      return;
    }

    setMsg("Checkout feito ✅", "ok");

    // se tiver botão checkout na reserva, força refresh visual (opcional)
    try {
      btnCheckout?.click?.();
    } catch (e) {}

    // volta pra reservas ou mapa (você escolhe)
    setTimeout(() => {
      window.location.href = "/reservas.html";
    }, 600);
  }

  // ---------- bind events ----------
  function bindEvents() {
    formLanc?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await addLancamento();
    });

    formPag?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await addPagamento();
    });

    // delegation remove
    listaLanc?.addEventListener("click", async (e) => {
      const b = e.target?.closest?.("button[data-act='del-lanc']");
      if (!b) return;
      const id = b.getAttribute("data-id");
      if (id) await delLancamento(id);
    });

    listaPag?.addEventListener("click", async (e) => {
      const b = e.target?.closest?.("button[data-act='del-pag']");
      if (!b) return;
      const id = b.getAttribute("data-id");
      if (id) await delPagamento(id);
    });

    btnFecharConta?.addEventListener("click", async () => {
      await doCheckout();
    });

    // UX: Enter no valor adiciona
    lValor?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        formLanc?.requestSubmit?.();
      }
    });
    pValor?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        formPag?.requestSubmit?.();
      }
    });
  }

  // ---------- boot ----------
  (async function boot() {
    // se a página não tiver os elementos, não faz nada
    if (!elTotalLanc && !formLanc && !formPag) return;

    USER = await requireAuth({
      redirectTo: "/entrar.html?next=/reserva.html",
      renderUserInfo: false,
    });

    if (!USER) return;

    // pega reservaId:
    // 1) window.__RESERVA_ID (se /js/reserva.js setar)
    // 2) querystring ?id=
    RESERVA_ID = window.__RESERVA_ID || getReservaIdFromUrl();

    if (!RESERVA_ID) {
      setMsg("Reserva inválida (sem id).", "error");
      return;
    }

    bindEvents();
    await loadAll();
  })();
})();
