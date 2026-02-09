// /js/reserva-conta.js — Conta da Reserva (V1 MVP)
// - Lançamentos + Pagamentos vinculados à reserva
// - Totais (Total/Pago/Saldo)
// - Deletar itens
// - Botão "Fechar conta / Checkout" (habilita quando saldo <= 0 e status permite)
// Requer:
// - /js/supabase.js export { supabase }
// - /js/auth.js export { requireAuth }
// Espera query: /reserva.html?id=UUID

import { supabase } from "/js/supabase.js";
import { requireAuth } from "/js/auth.js";

(function () {
  const $ = (s, root = document) => root.querySelector(s);

  // ---------- DOM ----------
  const elContaStatus = $("#contaStatus");
  const elTotalLanc = $("#totalLanc");
  const elTotalPago = $("#totalPago");
  const elSaldo = $("#saldo");
  const elListaLanc = $("#listaLanc");
  const elListaPag = $("#listaPag");
  const elContaMsg = $("#contaMsg");
  const btnFechar = $("#btnFecharConta");

  const formLanc = $("#formLanc");
  const lDesc = $("#lDesc");
  const lValor = $("#lValor");
  const lTipo = $("#lTipo");

  const formPag = $("#formPag");
  const pForma = $("#pForma");
  const pValor = $("#pValor");
  const pObs = $("#pObs");

  // ---------- Config ----------
  // (Preferido) Tabelas MVP
  const T_LANC = "agenda_conta_lancamentos";
  const T_PAG = "agenda_conta_pagamentos";
  // Reserva
  const T_RES = "agenda_reservas";

  // ---------- State ----------
  let USER = null;
  let RESERVA_ID = null;

  let RESERVA = null;      // { id, user_id, status, checkin, checkout, ... }
  let LANC = [];           // rows lançamentos
  let PAG = [];            // rows pagamentos

  // ---------- Utils ----------
  function setMsg(text = "", type = "info") {
    if (!elContaMsg) return;
    elContaMsg.textContent = text || "";
    elContaMsg.style.color =
      type === "error" ? "rgba(255,120,120,.95)" :
      type === "ok" ? "rgba(102,242,218,.95)" :
      "rgba(255,255,255,.70)";
  }

  function escapeHtml(str = "") {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function onlyDigits(v = "") {
    return String(v ?? "").replace(/\D/g, "");
  }

  // Entrada do usuário: "180,00" / "180.00" / "180" -> cents
  function parseMoneyToCents(input) {
    const s0 = String(input ?? "").trim();
    if (!s0) return null;

    // mantém dígitos + separadores
    const s = s0.replace(/[^\d.,-]/g, "").replace(/\s+/g, "");

    // negativa?
    const neg = s.startsWith("-");
    const s1 = s.replace("-", "");

    // Se tem vírgula e ponto, assume vírgula decimal (pt-BR) e remove pontos de milhar
    let normalized = s1;
    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      // 1.234,56 -> 1234.56
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else if (hasComma && !hasDot) {
      // 1234,56 -> 1234.56
      normalized = normalized.replace(",", ".");
    } else {
      // 1234.56 (ok) ou 1234 (ok)
      // nada
    }

    const num = Number(normalized);
    if (!Number.isFinite(num)) return null;

    const cents = Math.round(num * 100);
    return neg ? -cents : cents;
  }

  function centsToBRL(cents) {
    const v = Number(cents ?? 0) / 100;
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function setPill(el, text, tone = "muted") {
    if (!el) return;
    el.textContent = text || "—";
    el.style.border = "1px solid rgba(255,255,255,.12)";
    el.style.padding = "6px 10px";
    el.style.borderRadius = "999px";
    el.style.fontSize = "12px";
    el.style.fontWeight = "900";
    el.style.display = "inline-flex";
    el.style.alignItems = "center";

    el.style.color =
      tone === "ok" ? "rgba(102,242,218,.95)" :
      tone === "warn" ? "rgba(255,210,120,.95)" :
      tone === "error" ? "rgba(255,120,120,.95)" :
      "rgba(255,255,255,.75)";
  }

  function getReservaIdFromUrl() {
    const u = new URL(window.location.href);
    return u.searchParams.get("id");
  }

  function allowCloseByStatus(status) {
    const st = String(status || "").toLowerCase();
    // permita fechar quando está hospedado ou até reservado/hoje (hotel varia)
    // ajuste se você quiser mais restrito
    if (st.includes("final")) return false;
    if (st.includes("cancel")) return false;
    return true;
  }

  // ---------- Render ----------
  function calcTotals() {
    const totalLanc = LANC.reduce((acc, r) => acc + Number(r.valor_centavos || 0), 0);
    const totalPago = PAG.reduce((acc, r) => acc + Number(r.valor_centavos || 0), 0);
    const saldo = totalLanc - totalPago;
    return { totalLanc, totalPago, saldo };
  }

  function renderTotals() {
    const { totalLanc, totalPago, saldo } = calcTotals();

    if (elTotalLanc) elTotalLanc.textContent = centsToBRL(totalLanc);
    if (elTotalPago) elTotalPago.textContent = centsToBRL(totalPago);
    if (elSaldo) elSaldo.textContent = centsToBRL(saldo);

    // status pill
    if (!allowCloseByStatus(RESERVA?.status)) {
      setPill(elContaStatus, "Conta encerrada", "muted");
    } else if (saldo <= 0 && totalLanc > 0) {
      setPill(elContaStatus, "Quitada", "ok");
    } else if (totalLanc === 0) {
      setPill(elContaStatus, "Sem lançamentos", "muted");
    } else {
      setPill(elContaStatus, "Em aberto", "warn");
    }

    // botão fechar conta
    if (!btnFechar) return;

    const canClose = allowCloseByStatus(RESERVA?.status) && (saldo <= 0) && (totalLanc > 0);
    btnFechar.disabled = !canClose;
    btnFechar.style.opacity = canClose ? "1" : ".55";
    btnFechar.classList.toggle("primary", canClose);
    btnFechar.classList.toggle("outline", !canClose);
  }

  function renderLanc() {
    if (!elListaLanc) return;

    if (!LANC.length) {
      elListaLanc.innerHTML = `<div class="muted small">Nenhum lançamento ainda.</div>`;
      return;
    }

    const rows = LANC
      .slice()
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .map((r) => {
        const desc = escapeHtml(r.descricao || "—");
        const tipo = escapeHtml(r.tipo || "—");
        const v = centsToBRL(Number(r.valor_centavos || 0));
        return `
          <div class="list-item">
            <div class="row" style="margin:0;gap:10px;align-items:flex-start;">
              <div style="min-width:0;">
                <div style="font-weight:900;">${desc}</div>
                <div class="muted small" style="margin-top:4px;">${tipo}</div>
              </div>
              <div style="text-align:right;min-width:120px;">
                <div style="font-weight:900;">${v}</div>
                <button class="btn outline small" type="button"
                  data-act="del-lanc" data-id="${escapeHtml(r.id)}"
                  style="margin-top:6px;">Excluir</button>
              </div>
            </div>
          </div>
        `;
      }).join("");

    elListaLanc.innerHTML = rows;
  }

  function renderPag() {
    if (!elListaPag) return;

    if (!PAG.length) {
      elListaPag.innerHTML = `<div class="muted small">Nenhum pagamento ainda.</div>`;
      return;
    }

    const rows = PAG
      .slice()
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .map((r) => {
        const forma = escapeHtml(r.forma || "—");
        const obs = escapeHtml(r.observacao || "");
        const v = centsToBRL(Number(r.valor_centavos || 0));
        return `
          <div class="list-item">
            <div class="row" style="margin:0;gap:10px;align-items:flex-start;">
              <div style="min-width:0;">
                <div style="font-weight:900;">${forma}</div>
                ${obs ? `<div class="muted small" style="margin-top:4px;">${obs}</div>` : `<div class="muted small" style="margin-top:4px;">—</div>`}
              </div>
              <div style="text-align:right;min-width:120px;">
                <div style="font-weight:900;">${v}</div>
                <button class="btn outline small" type="button"
                  data-act="del-pag" data-id="${escapeHtml(r.id)}"
                  style="margin-top:6px;">Excluir</button>
              </div>
            </div>
          </div>
        `;
      }).join("");

    elListaPag.innerHTML = rows;
  }

  function renderAll() {
    renderLanc();
    renderPag();
    renderTotals();
  }

  // ---------- Load ----------
  async function loadReserva() {
    const { data, error } = await supabase
      .from(T_RES)
      .select("id,user_id,status,checkin,checkout,updated_at")
      .eq("id", RESERVA_ID)
      .eq("user_id", USER.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return data;
  }

  async function loadLanc() {
    const { data, error } = await supabase
      .from(T_LANC)
      .select("id,reserva_id,user_id,descricao,tipo,valor_centavos,created_at")
      .eq("reserva_id", RESERVA_ID)
      .eq("user_id", USER.id);

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function loadPag() {
    const { data, error } = await supabase
      .from(T_PAG)
      .select("id,reserva_id,user_id,forma,observacao,valor_centavos,created_at")
      .eq("reserva_id", RESERVA_ID)
      .eq("user_id", USER.id);

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function loadAll() {
    setMsg("Carregando conta…");

    RESERVA = await loadReserva();
    if (!RESERVA) {
      setMsg("Reserva não encontrada (ou sem permissão).", "error");
      return;
    }

    // Se tabela não existir, isso vai cair no catch e a gente mostra msg amigável.
    LANC = await loadLanc();
    PAG = await loadPag();

    setMsg("");
    renderAll();
  }

  // ---------- Mutations ----------
  async function addLanc(e) {
    e.preventDefault();
    setMsg("");

    const desc = String(lDesc?.value || "").trim();
    const tipo = String(lTipo?.value || "extra").trim();
    const cents = parseMoneyToCents(lValor?.value);

    if (!desc) return setMsg("Informe a descrição.", "error");
    if (cents === null) return setMsg("Informe um valor válido (ex: 180,00).", "error");
    if (cents === 0) return setMsg("Valor não pode ser zero.", "error");

    const payload = {
      user_id: USER.id,
      reserva_id: RESERVA_ID,
      descricao: desc,
      tipo,
      valor_centavos: cents,
    };

    setMsg("Adicionando lançamento…");
    const { error } = await supabase.from(T_LANC).insert(payload);

    if (error) {
      console.error("[conta] add lanc error:", error);
      setMsg("Erro ao adicionar lançamento. Verifique tabela/RLS.", "error");
      return;
    }

    // limpa
    lDesc.value = "";
    lValor.value = "";
    lTipo.value = "extra";

    setMsg("Lançamento adicionado ✅", "ok");
    LANC = await loadLanc();
    renderAll();
  }

  async function addPag(e) {
    e.preventDefault();
    setMsg("");

    const forma = String(pForma?.value || "pix").trim();
    const obs = String(pObs?.value || "").trim();
    const cents = parseMoneyToCents(pValor?.value);

    if (cents === null) return setMsg("Informe um valor válido (ex: 180,00).", "error");
    if (cents === 0) return setMsg("Valor não pode ser zero.", "error");

    const payload = {
      user_id: USER.id,
      reserva_id: RESERVA_ID,
      forma,
      observacao: obs || null,
      valor_centavos: cents,
    };

    setMsg("Registrando pagamento…");
    const { error } = await supabase.from(T_PAG).insert(payload);

    if (error) {
      console.error("[conta] add pag error:", error);
      setMsg("Erro ao registrar pagamento. Verifique tabela/RLS.", "error");
      return;
    }

    pValor.value = "";
    pObs.value = "";

    setMsg("Pagamento registrado ✅", "ok");
    PAG = await loadPag();
    renderAll();
  }

  async function delLanc(id) {
    const ok = confirm("Excluir esse lançamento?");
    if (!ok) return;

    setMsg("Excluindo lançamento…");
    const { error } = await supabase
      .from(T_LANC)
      .delete()
      .eq("id", id)
      .eq("user_id", USER.id)
      .eq("reserva_id", RESERVA_ID);

    if (error) {
      console.error("[conta] del lanc error:", error);
      setMsg("Erro ao excluir lançamento.", "error");
      return;
    }

    setMsg("Lançamento excluído ✅", "ok");
    LANC = await loadLanc();
    renderAll();
  }

  async function delPag(id) {
    const ok = confirm("Excluir esse pagamento?");
    if (!ok) return;

    setMsg("Excluindo pagamento…");
    const { error } = await supabase
      .from(T_PAG)
      .delete()
      .eq("id", id)
      .eq("user_id", USER.id)
      .eq("reserva_id", RESERVA_ID);

    if (error) {
      console.error("[conta] del pag error:", error);
      setMsg("Erro ao excluir pagamento.", "error");
      return;
    }

    setMsg("Pagamento excluído ✅", "ok");
    PAG = await loadPag();
    renderAll();
  }

  async function fecharConta() {
    setMsg("");

    if (!RESERVA) return;
    if (!allowCloseByStatus(RESERVA.status)) {
      setMsg("Esta reserva já está encerrada/cancelada.", "error");
      return;
    }

    const { saldo, totalLanc } = calcTotals();
    if (!(saldo <= 0 && totalLanc > 0)) {
      setMsg("Conta não está quitada. Registre pagamentos para fechar.", "error");
      return;
    }

    const ok = confirm("Fechar conta e fazer checkout desta reserva?");
    if (!ok) return;

    setMsg("Fechando conta / checkout…");

    const { error } = await supabase
      .from(T_RES)
      .update({ status: "finalizado", updated_at: new Date().toISOString() })
      .eq("id", RESERVA_ID)
      .eq("user_id", USER.id);

    if (error) {
      console.error("[conta] fechar checkout error:", error);
      setMsg("Erro ao fechar/checkout. Verifique RLS.", "error");
      return;
    }

    setMsg("Conta fechada ✅ Checkout feito ✅", "ok");
    RESERVA = await loadReserva();
    renderAll();
  }

  // ---------- Bind ----------
  function bind() {
    formLanc?.addEventListener("submit", addLanc);
    formPag?.addEventListener("submit", addPag);

    // delegação p/ excluir
    document.addEventListener("click", async (ev) => {
      const btn = ev.target?.closest?.("button[data-act]");
      if (!btn) return;

      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");

      if (act === "del-lanc" && id) await delLanc(id);
      if (act === "del-pag" && id) await delPag(id);
    });

    btnFechar?.addEventListener("click", fecharConta);
  }

  // ---------- Boot ----------
  (async function boot() {
    try {
      USER = await requireAuth({ redirectTo: "/entrar.html?next=/reserva.html", renderUserInfo: false });
      RESERVA_ID = getReservaIdFromUrl();

      if (!RESERVA_ID) {
        setMsg("Link sem ID da reserva.", "error");
        return;
      }

      bind();
      await loadAll();
    } catch (err) {
      console.error("[reserva-conta] boot error:", err);
      // se tabelas não existem, a mensagem abaixo já ajuda
      setMsg("Erro ao carregar conta. Verifique se as tabelas do caixa existem e se o RLS permite.", "error");
    }
  })();
})();
