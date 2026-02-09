// /js/reserva.js — Detalhe/Edição da reserva (V1.6 - DAY USE + PMS actions)
// Compatível com /reserva.html (ids do HTML)
// - Carrega reserva por ?id=UUID
// - DAY USE: permite checkin == checkout
// - Status pill + ações: Check-in / Checkout / Cancelar (atualiza coluna "status")
// - WhatsApp button (wa.me) com normalização BR
// - Salvar alterações habilita só quando muda algo
// - Exclusão com confirmação
// - Sem JOIN (robusto). Se quiser mostrar quarto, deixe para a tela Mapa/Reservas.

import { supabase } from "/js/supabase.js";
import { requireAuth } from "/js/auth.js";

const $ = (id) => document.getElementById(id);

/* =========================
   Elements
========================= */
const elLoading = $("stateLoading");
const elNotFound = $("stateNotFound");
const elFormWrap = $("stateForm");

const elMeta = $("meta");
const elPmsMsg = $("pmsMsg");

const elPill = $("resStatusPill");
const elHint = $("resStatusHint");

const elNome = $("nome");
const elWhats = $("whatsapp");
const elBtnWhats = $("btnWhats");
const elCheckin = $("checkin");
const elCheckout = $("checkout");
const elObs = $("obs");

const elMsg = $("msg");
const btnSalvar = $("btnSalvar");
const btnExcluir = $("btnExcluir");

const btnCheckin = $("btnCheckin");
const btnCheckout = $("btnCheckout");
const btnCancelar = $("btnCancelar");

/* =========================
   Config
========================= */
const TABLE = "agenda_reservas";

// Campos mínimos (mantém robusto)
const FIELDS = `
  id,
  user_id,
  nome_hospede,
  whatsapp,
  checkin,
  checkout,
  observacoes,
  status,
  quarto_id,
  created_at,
  updated_at
`;

/* =========================
   State
========================= */
let USER = null;
let RES_ID = null;
let ROW = null;        // dado atual
let SNAPSHOT = null;   // para detectar mudanças

/* =========================
   Helpers
========================= */
function show(which) {
  if (elLoading) elLoading.style.display = which === "loading" ? "" : "none";
  if (elNotFound) elNotFound.style.display = which === "notfound" ? "" : "none";
  if (elFormWrap) elFormWrap.style.display = which === "form" ? "" : "none";
}

function setMsg(text = "", type = "info") {
  if (!elMsg) return;
  elMsg.textContent = text || "";
  elMsg.style.color =
    type === "error" ? "rgba(255,120,120,.92)" :
    type === "ok"    ? "rgba(120,255,200,.92)" :
                       "rgba(255,255,255,.75)";
}

function setPmsMsg(text = "", type = "info", showIt = true) {
  if (!elPmsMsg) return;
  elPmsMsg.textContent = text || "";
  elPmsMsg.style.display = showIt && text ? "" : "none";
  elPmsMsg.style.color =
    type === "error" ? "rgba(255,120,120,.92)" :
    type === "ok"    ? "rgba(120,255,200,.92)" :
                       "rgba(255,255,255,.75)";
}

function pad2(n){ return String(n).padStart(2,"0"); }
function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function formatDateBR(iso) {
  if (!iso || typeof iso !== "string") return "—";
  const [y,m,d] = iso.split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

function onlyDigits(v) {
  return String(v || "").replace(/\D+/g, "");
}

function normalizePhoneTo55(raw) {
  const d = onlyDigits(raw);
  if (!d) return "";
  if (d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

function waLink(rawPhone) {
  const phone55 = normalizePhoneTo55(rawPhone);
  if (!phone55) return "";
  // mínimo razoável: 55 + DDD + numero
  if (phone55.length < 12) return "";
  return `https://wa.me/${phone55}`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   Status (DAY USE)
========================= */
/**
 * Regras:
 * - past:
 *   - status DB cancel/final/encerr OR checkout < hoje
 * - today:
 *   - checkin == hoje (inclui day-use checkin==checkout==hoje)
 *   - OR (checkin < hoje AND checkout >= hoje) -> em andamento
 * - future:
 *   - checkin > hoje
 */
function statusFrom(r) {
  const stDb = String(r?.status || "").toLowerCase();
  if (stDb.includes("cancel")) return { key: "past", label: "Cancelada" };
  if (stDb.includes("final"))  return { key: "past", label: "Finalizada" };
  if (stDb.includes("encerr")) return { key: "past", label: "Encerrada" };

  const t = todayISO();
  const ci = String(r?.checkin || "");
  const co = String(r?.checkout || "");

  if (ci && ci > t) return { key: "future", label: "Futura" };

  if (ci && ci === t) return { key: "today", label: "Hoje" };

  if (ci && co && ci < t && co >= t) return { key: "today", label: "Em andamento" };

  if (co && co < t) return { key: "past", label: "Passada" };

  return { key: "all", label: "Ativa" };
}

function setStatusUI(r) {
  const st = statusFrom(r);
  if (elPill) elPill.textContent = st.label || "—";

  // hint simples
  const t = todayISO();
  const ci = String(r?.checkin || "");
  const co = String(r?.checkout || "");

  let hint = "";
  if (ci && co && ci === co) hint = "Day use (check-in = check-out).";
  if (ci === t) hint = hint ? `${hint} Chegada hoje.` : "Chegada hoje.";
  if (ci < t && co >= t) hint = hint ? `${hint} Em andamento.` : "Em andamento.";
  if (co === t && ci < t) hint = hint ? `${hint} Saída hoje.` : "Saída hoje.";

  if (elHint) {
    elHint.style.display = hint ? "" : "none";
    elHint.textContent = hint;
  }

  // ações PMS (MVP)
  const key = st.key;

  // Mostra check-in se: futura ou hoje (ainda não em andamento), e não cancelada/finalizada
  // Sem "dt efetiva" no DB, a gente usa status + datas como orientação.
  const canCheckin =
    key === "future" || (key === "today" && ci === t);

  // Mostra checkout se: em andamento ou hoje (checkout==hoje)
  const canCheckout =
    (key === "today" && ci < t && co >= t) || (key === "today" && co === t);

  const canCancel = st.key !== "past";

  if (btnCheckin) btnCheckin.style.display = canCheckin ? "" : "none";
  if (btnCheckout) btnCheckout.style.display = canCheckout ? "" : "none";
  if (btnCancelar) btnCancelar.style.display = canCancel ? "" : "none";
}

/* =========================
   Dirty check
========================= */
function takeSnapshot() {
  SNAPSHOT = {
    nome: (elNome?.value || "").trim(),
    whatsapp: (elWhats?.value || "").trim(),
    checkin: (elCheckin?.value || "").trim(),
    checkout: (elCheckout?.value || "").trim(),
    obs: (elObs?.value || "").trim(),
  };
  updateSaveEnabled();
}

function currentState() {
  return {
    nome: (elNome?.value || "").trim(),
    whatsapp: (elWhats?.value || "").trim(),
    checkin: (elCheckin?.value || "").trim(),
    checkout: (elCheckout?.value || "").trim(),
    obs: (elObs?.value || "").trim(),
  };
}

function isDirty() {
  if (!SNAPSHOT) return false;
  const cur = currentState();
  return (
    cur.nome !== SNAPSHOT.nome ||
    cur.whatsapp !== SNAPSHOT.whatsapp ||
    cur.checkin !== SNAPSHOT.checkin ||
    cur.checkout !== SNAPSHOT.checkout ||
    cur.obs !== SNAPSHOT.obs
  );
}

function updateSaveEnabled() {
  if (!btnSalvar) return;
  const ok =
    (elNome?.value || "").trim().length > 0 &&
    (elCheckin?.value || "").trim().length > 0 &&
    (elCheckout?.value || "").trim().length > 0 &&
    isValidDates() &&
    isDirty();

  btnSalvar.disabled = !ok;
}

/* =========================
   Validation (DAY USE)
========================= */
function isValidDates() {
  const ci = (elCheckin?.value || "").trim();
  const co = (elCheckout?.value || "").trim();
  if (!ci || !co) return false;

  // DAY USE permitido (co === ci)
  if (co < ci) return false;

  return true;
}

/* =========================
   WhatsApp UI
========================= */
function refreshWhatsBtn() {
  if (!elBtnWhats) return;
  const link = waLink(elWhats?.value || "");
  if (!link) {
    elBtnWhats.style.display = "none";
    elBtnWhats.setAttribute("href", "#");
    return;
  }
  elBtnWhats.style.display = "";
  elBtnWhats.setAttribute("href", link);
}

/* =========================
   Supabase ops
========================= */
async function loadReserva(userId, id) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(FIELDS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function updateReserva(userId, id, patch) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select(FIELDS)
    .single();

  if (error) throw error;
  return data;
}

async function deleteReserva(userId, id) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

/* =========================
   Render
========================= */
function renderMeta(r) {
  if (!elMeta) return;

  const ci = r.checkin || "";
  const co = r.checkout || "";
  const st = statusFrom(r);

  const meta = [
    `<strong>ID:</strong> <span class="mono">${escapeHtml(r.id)}</span>`,
    `<strong>Período:</strong> ${escapeHtml(formatDateBR(ci))} → ${escapeHtml(formatDateBR(co))}`,
    `<strong>Tipo:</strong> ${ci && co && ci === co ? "Day use" : "Diária"}`,
    `<strong>Estado:</strong> ${escapeHtml(st.label)}`
  ];

  elMeta.innerHTML = meta.join(" &nbsp;•&nbsp; ");
}

function fillForm(r) {
  if (elNome) elNome.value = r.nome_hospede || "";
  if (elWhats) elWhats.value = r.whatsapp || "";
  if (elCheckin) elCheckin.value = r.checkin || "";
  if (elCheckout) elCheckout.value = r.checkout || "";
  if (elObs) elObs.value = r.observacoes || "";

  refreshWhatsBtn();
  renderMeta(r);
  setStatusUI(r);
  takeSnapshot();
}

/* =========================
   Boot
========================= */
function getIdFromQuery() {
  const sp = new URLSearchParams(location.search);
  const id = sp.get("id") || "";
  return id.trim();
}

function bindInputs() {
  [elNome, elWhats, elCheckin, elCheckout, elObs].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      refreshWhatsBtn();
      updateSaveEnabled();
      // Atualiza meta/status conforme mexe em datas
      if (ROW) {
        const temp = {
          ...ROW,
          nome_hospede: (elNome?.value || "").trim(),
          whatsapp: (elWhats?.value || "").trim(),
          checkin: (elCheckin?.value || "").trim(),
          checkout: (elCheckout?.value || "").trim(),
          observacoes: (elObs?.value || "").trim(),
        };
        renderMeta(temp);
        setStatusUI(temp);
      }
    });
  });
}

function bindActions() {
  btnCheckin?.addEventListener("click", async () => {
    try {
      if (!USER?.id || !RES_ID) return;

      // "checkin" (ação): marca status como "em_andamento"
      setPmsMsg("Aplicando check-in…");
      const updated = await updateReserva(USER.id, RES_ID, { status: "em_andamento" });
      ROW = updated;
      fillForm(ROW);
      setPmsMsg("Check-in aplicado.", "ok");
    } catch (e) {
      console.error("[reserva] checkin error:", e);
      setPmsMsg("Erro ao aplicar check-in.", "error");
    }
  });

  btnCheckout?.addEventListener("click", async () => {
    try {
      if (!USER?.id || !RES_ID) return;

      // "checkout" (ação): marca status como "finalizada"
      setPmsMsg("Aplicando checkout…");
      const updated = await updateReserva(USER.id, RES_ID, { status: "finalizada" });
      ROW = updated;
      fillForm(ROW);
      setPmsMsg("Checkout aplicado. Reserva finalizada.", "ok");
    } catch (e) {
      console.error("[reserva] checkout error:", e);
      setPmsMsg("Erro ao aplicar checkout.", "error");
    }
  });

  btnCancelar?.addEventListener("click", async () => {
    try {
      if (!USER?.id || !RES_ID) return;

      const ok = confirm("Cancelar esta reserva? (Ela ficará como 'Cancelada')"); // MVP
      if (!ok) return;

      setPmsMsg("Cancelando…");
      const updated = await updateReserva(USER.id, RES_ID, { status: "cancelada" });
      ROW = updated;
      fillForm(ROW);
      setPmsMsg("Reserva cancelada.", "ok");
    } catch (e) {
      console.error("[reserva] cancel error:", e);
      setPmsMsg("Erro ao cancelar.", "error");
    }
  });

  btnExcluir?.addEventListener("click", async () => {
    try {
      if (!USER?.id || !RES_ID) return;

      const ok = confirm("Excluir esta reserva PERMANENTEMENTE?");
      if (!ok) return;

      setMsg("Excluindo…");
      await deleteReserva(USER.id, RES_ID);

      // volta pra lista
      window.location.replace("/reservas.html");
    } catch (e) {
      console.error("[reserva] delete error:", e);
      setMsg("Erro ao excluir.", "error");
    }
  });

  // salvar (form submit)
  $("formReserva")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      if (!USER?.id || !RES_ID) return;

      const nome = (elNome?.value || "").trim();
      const whatsapp = (elWhats?.value || "").trim();
      const checkin = (elCheckin?.value || "").trim();
      const checkout = (elCheckout?.value || "").trim();
      const obs = (elObs?.value || "").trim();

      if (!nome) { alert("Informe o nome do hóspede."); elNome?.focus(); return; }
      if (!checkin) { alert("Informe o check-in."); elCheckin?.focus(); return; }
      if (!checkout) { alert("Informe o check-out."); elCheckout?.focus(); return; }

      // DAY USE permitido, mas checkout não pode ser antes
      if (checkout < checkin) { alert("Check-out não pode ser antes do check-in."); elCheckout?.focus(); return; }

      setMsg("Salvando…");

      const updated = await updateReserva(USER.id, RES_ID, {
        nome_hospede: nome,
        whatsapp: whatsapp || null,
        checkin,
        checkout,
        observacoes: obs || null,
      });

      ROW = updated;
      fillForm(ROW);
      setMsg("Salvo com sucesso.", "ok");
    } catch (err) {
      console.error("[reserva] save error:", err);
      setMsg("Erro ao salvar. Tente novamente.", "error");
    }
  });
}

(async function boot() {
  try {
    show("loading");
    setMsg("");
    setPmsMsg("", "info", false);

    USER = await requireAuth({
      redirectTo: "/entrar.html?next=/reserva.html",
      renderUserInfo: true // preenche hotelBadge/userInfo se existir no layout
    });

    RES_ID = getIdFromQuery();
    if (!RES_ID) {
      show("notfound");
      return;
    }

    const row = await loadReserva(USER.id, RES_ID);

    if (!row) {
      show("notfound");
      return;
    }

    ROW = row;

    show("form");
    fillForm(ROW);
    bindInputs();
    bindActions();

    // se abriu com #conta, o HTML já faz scroll (ok)
  } catch (err) {
    console.error("[reserva] boot error:", err);
    show("notfound");
  }
})();
