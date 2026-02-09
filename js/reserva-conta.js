// /js/reserva-conta.js — Conta da Reserva (V1.1 - JOIN SAFE + COLUMN SAFE)
// - JOIN SAFE: usa reserva_id e user_id
// - COLUMN SAFE: se coluna não existir (ex: obs), faz fallback automático
// - Totais: Total (lancamentos), Pago (pagamentos), Saldo = Total - Pago
// - Compatível com reserva.html (ids do seu HTML)

import { supabase } from "/js/supabase.js";
import { requireAuth } from "/js/auth.js";

const $ = (sel, root = document) => root.querySelector(sel);

const elStatus = $("#contaStatus");
const elTotalLanc = $("#totalLanc");
const elTotalPago = $("#totalPago");
const elSaldo = $("#saldo");
const elListaLanc = $("#listaLanc");
const elListaPag = $("#listaPag");
const elMsg = $("#contaMsg");
const elBtnFechar = $("#btnFecharConta");

const formLanc = $("#formLanc");
const formPag = $("#formPag");

// Inputs Lançamentos
const inLDesc = $("#lDesc");
const inLValor = $("#lValor");
const inLTipo = $("#lTipo");

// Inputs Pagamentos
const inPForma = $("#pForma");
const inPValor = $("#pValor");
const inPObs = $("#pObs");

const STATE = {
  user: null,
  reservaId: null,
  lancamentos: [],
  pagamentos: [],
};

function setPill(text, tone = "info") {
  if (!elStatus) return;
  elStatus.textContent = text || "—";
  elStatus.style.borderColor =
    tone === "error" ? "rgba(255,120,120,.35)" :
    tone === "ok" ? "rgba(102,242,218,.35)" :
    "rgba(255,255,255,.18)";
  elStatus.style.color =
    tone === "error" ? "rgba(255,120,120,.92)" :
    tone === "ok" ? "rgba(102,242,218,.95)" :
    "rgba(255,255,255,.78)";
}

function setMsg(text = "", tone = "info") {
  if (elMsg) {
    elMsg.textContent = text || "";
    elMsg.style.color =
      tone === "error" ? "rgba(255,120,120,.92)" :
      tone === "ok" ? "rgba(102,242,218,.95)" :
      "rgba(255,255,255,.70)";
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseMoneyBR(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return NaN;
  let s = raw.replace(/[^\d,.\-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replaceAll(".", "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function fmtBRL(n) {
  const v = Number(n || 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getReservaIdFromURL() {
  const url = new URL(window.location.href);
  return (url.searchParams.get("id") || "").trim();
}

function isMissingColumnError(err, colName) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") && msg.includes(String(colName || "").toLowerCase());
}

function computeTotals() {
  const total = STATE.lancamentos.reduce((acc, x) => acc + Number(x.valor || 0), 0);
  const pago = STATE.pagamentos.reduce((acc, x) => acc + Number(x.valor || 0), 0);
  const saldo = total - pago;
  return { total, pago, saldo };
}

/* =========================
   LOAD — column safe
========================= */

async function loadLancamentos(userId, reservaId) {
  // aqui supomos que descrição/valor/tipo existem. Se não, o erro vai aparecer no console.
  const { data, error } = await supabase
    .from("agenda_lancamentos")
    .select("id,reserva_id,descricao,valor,tipo,created_at")
    .eq("user_id", userId)
    .eq("reserva_id", reservaId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function loadPagamentos(userId, reservaId) {
  // TENTA com obs
  {
    const { data, error } = await supabase
      .from("agenda_pagamentos")
      .select("id,reserva_id,forma,valor,obs,created_at")
      .eq("user_id", userId)
      .eq("reserva_id", reservaId)
      .order("created_at", { ascending: false });

    if (!error) return Array.isArray(data) ? data : [];

    // Fallback: sem obs
    if (isMissingColumnError(error, "obs")) {
      const { data: d2, error: e2 } = await supabase
        .from("agenda_pagamentos")
        .select("id,reserva_id,forma,valor,created_at")
        .eq("user_id", userId)
        .eq("reserva_id", reservaId)
        .order("created_at", { ascending: false });

      if (e2) throw e2;

      // injeta obs=null para manter render consistente
      return (Array.isArray(d2) ? d2 : []).map((x) => ({ ...x, obs: null }));
    }

    throw error;
  }
}

/* =========================
   INSERT — column safe
========================= */

async function insertLancamento(userId, reservaId, payload) {
  const { data, error } = await supabase
    .from("agenda_lancamentos")
    .insert({
      user_id: userId,
      reserva_id: reservaId,
      descricao: payload.descricao,
      valor: payload.valor,
      tipo: payload.tipo || "extra",
    })
    .select("id")
    .single();

  if (error) throw error;
  return data?.id;
}

async function insertPagamento(userId, reservaId, payload) {
  // tenta com obs
  const attempt1 = await supabase
    .from("agenda_pagamentos")
    .insert({
      user_id: userId,
      reserva_id: reservaId,
      forma: payload.forma || "pix",
      valor: payload.valor,
      obs: payload.obs || null,
    })
    .select("id")
    .single();

  if (!attempt1.error) return attempt1.data?.id;

  // fallback sem obs
  if (isMissingColumnError(attempt1.error, "obs")) {
    const attempt2 = await supabase
      .from("agenda_pagamentos")
      .insert({
        user_id: userId,
        reserva_id: reservaId,
        forma: payload.forma || "pix",
        valor: payload.valor,
      })
      .select("id")
      .single();

    if (attempt2.error) throw attempt2.error;
    return attempt2.data?.id;
  }

  throw attempt1.error;
}

async function deleteLancamento(userId, id) {
  const { error } = await supabase
    .from("agenda_lancamentos")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);

  if (error) throw error;
}

async function deletePagamento(userId, id) {
  const { error } = await supabase
    .from("agenda_pagamentos")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);

  if (error) throw error;
}

/* =========================
   RENDER
========================= */

function renderTotals() {
  const { total, pago, saldo } = computeTotals();
  if (elTotalLanc) elTotalLanc.textContent = fmtBRL(total);
  if (elTotalPago) elTotalPago.textContent = fmtBRL(pago);
  if (elSaldo) elSaldo.textContent = fmtBRL(saldo);

  if (elBtnFechar) {
    const ok = saldo <= 0.0000001 && (STATE.lancamentos.length || STATE.pagamentos.length);
    elBtnFechar.disabled = !ok;
    elBtnFechar.style.opacity = ok ? "1" : ".55";
  }

  if (saldo <= 0.0000001 && (STATE.lancamentos.length || STATE.pagamentos.length)) setPill("Quitada", "ok");
  else if ((STATE.lancamentos.length || STATE.pagamentos.length)) setPill("Em aberto", "info");
  else setPill("Sem movimentos", "info");
}

function renderLancamentos() {
  if (!elListaLanc) return;

  if (!STATE.lancamentos.length) {
    elListaLanc.innerHTML = `<div class="muted small">Nenhum lançamento.</div>`;
    return;
  }

  elListaLanc.innerHTML = STATE.lancamentos
    .map((x) => {
      const desc = escapeHtml(x.descricao || "—");
      const tipo = escapeHtml(x.tipo || "extra");
      const valor = fmtBRL(Number(x.valor || 0));

      return `
        <div class="card" style="padding:12px;margin-top:10px;">
          <div class="row" style="align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <div>
              <div class="small"><strong>${desc}</strong></div>
              <div class="muted small">Tipo: <span class="mono">${tipo}</span></div>
            </div>
            <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
              <div class="h2" style="font-size:16px;margin:0;">${valor}</div>
              <button class="btn outline small" type="button" data-del-lanc="${escapeHtml(x.id)}">Remover</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  elListaLanc.querySelectorAll("[data-del-lanc]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del-lanc");
      if (!id) return;
      if (!confirm("Remover este lançamento?")) return;

      try {
        btn.disabled = true;
        await deleteLancamento(STATE.user.id, id);
        await refresh();
        setMsg("Lançamento removido ✅", "ok");
      } catch (e) {
        console.error("[conta] delete lancamento:", e);
        setMsg("Erro ao remover lançamento.", "error");
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function renderPagamentos() {
  if (!elListaPag) return;

  if (!STATE.pagamentos.length) {
    elListaPag.innerHTML = `<div class="muted small">Nenhum pagamento.</div>`;
    return;
  }

  elListaPag.innerHTML = STATE.pagamentos
    .map((x) => {
      const forma = escapeHtml(x.forma || "pix");
      const obs = escapeHtml(x.obs || "");
      const valor = fmtBRL(Number(x.valor || 0));

      return `
        <div class="card" style="padding:12px;margin-top:10px;">
          <div class="row" style="align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <div>
              <div class="small"><strong>${forma.toUpperCase()}</strong></div>
              ${obs ? `<div class="muted small">${obs}</div>` : `<div class="muted small">—</div>`}
            </div>
            <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
              <div class="h2" style="font-size:16px;margin:0;">${valor}</div>
              <button class="btn outline small" type="button" data-del-pag="${escapeHtml(x.id)}">Remover</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  elListaPag.querySelectorAll("[data-del-pag]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del-pag");
      if (!id) return;
      if (!confirm("Remover este pagamento?")) return;

      try {
        btn.disabled = true;
        await deletePagamento(STATE.user.id, id);
        await refresh();
        setMsg("Pagamento removido ✅", "ok");
      } catch (e) {
        console.error("[conta] delete pagamento:", e);
        setMsg("Erro ao remover pagamento.", "error");
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function renderAll() {
  renderTotals();
  renderLancamentos();
  renderPagamentos();
}

/* =========================
   REFRESH
========================= */
async function refresh() {
  if (!STATE.user?.id || !STATE.reservaId) return;

  try {
    const [lanc, pag] = await Promise.all([
      loadLancamentos(STATE.user.id, STATE.reservaId),
      loadPagamentos(STATE.user.id, STATE.reservaId),
    ]);

    STATE.lancamentos = lanc;
    STATE.pagamentos = pag;

    renderAll();
  } catch (e) {
    console.error("[conta] refresh error:", e);

    const msg = String(e?.message || "").toLowerCase();
    if (msg.includes("reserva_id") && msg.includes("does not exist")) {
      setMsg("Banco ainda sem vínculo (reserva_id) em lançamentos/pagamentos. Crie a coluna no Supabase.", "error");
      setPill("Indisponível", "error");
      return;
    }

    setMsg("Não foi possível carregar a conta agora.", "error");
    setPill("Erro", "error");
  }
}

/* =========================
   BIND FORMS
========================= */
function bindLancForm() {
  if (!formLanc) return;

  inLValor?.addEventListener("input", () => {
    inLValor.value = String(inLValor.value || "").replace(/[^\d,.\-]/g, "");
  });

  formLanc.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!STATE.user?.id || !STATE.reservaId) return;

    const desc = (inLDesc?.value || "").trim();
    const tipo = (inLTipo?.value || "extra").trim();
    const valorNum = parseMoneyBR(inLValor?.value || "");

    if (!desc) {
      setMsg("Informe a descrição do lançamento.", "error");
      inLDesc?.focus();
      return;
    }
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      setMsg("Valor inválido (use ex: 180,00).", "error");
      inLValor?.focus();
      return;
    }

    try {
      setMsg("Salvando lançamento…", "info");
      const btn = formLanc.querySelector("button[type='submit']");
      if (btn) btn.disabled = true;

      await insertLancamento(STATE.user.id, STATE.reservaId, { descricao: desc, tipo, valor: valorNum });

      if (inLDesc) inLDesc.value = "";
      if (inLValor) inLValor.value = "";

      await refresh();
      setMsg("Lançamento adicionado ✅", "ok");
    } catch (err) {
      console.error("[conta] insertLancamento:", err);
      setMsg("Erro ao adicionar lançamento.", "error");
    } finally {
      const btn = formLanc.querySelector("button[type='submit']");
      if (btn) btn.disabled = false;
    }
  });
}

function bindPagForm() {
  if (!formPag) return;

  inPValor?.addEventListener("input", () => {
    inPValor.value = String(inPValor.value || "").replace(/[^\d,.\-]/g, "");
  });

  formPag.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!STATE.user?.id || !STATE.reservaId) return;

    const forma = (inPForma?.value || "pix").trim();
    const valorNum = parseMoneyBR(inPValor?.value || "");
    const obs = (inPObs?.value || "").trim();

    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      setMsg("Valor inválido (use ex: 180,00).", "error");
      inPValor?.focus();
      return;
    }

    try {
      setMsg("Registrando pagamento…", "info");
      const btn = formPag.querySelector("button[type='submit']");
      if (btn) btn.disabled = true;

      await insertPagamento(STATE.user.id, STATE.reservaId, { forma, valor: valorNum, obs: obs || null });

      if (inPValor) inPValor.value = "";
      if (inPObs) inPObs.value = "";

      await refresh();
      setMsg("Pagamento registrado ✅", "ok");
    } catch (err) {
      console.error("[conta] insertPagamento:", err);
      setMsg("Erro ao registrar pagamento.", "error");
    } finally {
      const btn = formPag.querySelector("button[type='submit']");
      if (btn) btn.disabled = false;
    }
  });
}

function bindFecharConta() {
  if (!elBtnFechar) return;
  elBtnFechar.addEventListener("click", () => {
    const { saldo } = computeTotals();
    if (saldo > 0.0000001) {
      setMsg("Ainda existe saldo em aberto.", "error");
      return;
    }
    setMsg("Conta quitada ✅ Agora você pode fazer o Checkout no topo.", "ok");
  });
}

/* =========================
   BOOT
========================= */
(async function boot() {
  try {
    const user = await requireAuth({
      redirectTo: `/entrar.html?next=${encodeURIComponent(location.pathname + location.search)}`,
      renderUserInfo: false,
    });

    if (!user?.id) return;

    const reservaId = getReservaIdFromURL();
    if (!reservaId) {
      setPill("Sem reserva", "error");
      setMsg("URL sem parâmetro ?id= (reserva).", "error");
      return;
    }

    STATE.user = user;
    STATE.reservaId = reservaId;

    setPill("Carregando…", "info");
    setMsg("");

    bindLancForm();
    bindPagForm();
    bindFecharConta();

    await refresh();
  } catch (e) {
    console.error("[conta] boot error:", e);
    setPill("Erro", "error");
    setMsg("Falha ao iniciar a Conta.", "error");
  }
})();
