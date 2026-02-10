// /js/reserva.js — Detalhe/Edição da reserva (V1.7 - DAY USE + STATUS SAFE)
// Compatível com reserva.html (ids do HTML)
// - Carrega por ?id=UUID
// - DAY USE: permite checkin == checkout
// - Ações PMS: check-in / checkout / cancelar (status compatível com constraint)
//   -> checkin:    status='hospedado'
//   -> checkout:   status='finalizado'
//   -> cancelar:   status='cancelado'
// - Salvar só habilita quando houver mudanças + validação ok
// - Sem JOIN (robusto)

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
let ROW = null;
let SNAPSHOT = null;

/* =========================
   UI helpers
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
   Status (DB enum) + labels (PT-BR)
========================= */
const STATUS = Object.freeze({
  QUOTE: "quote",
  RESERVED: "reserved",
  CONFIRMED: "confirmed",
  IN_HOUSE: "in_house",
  CHECKED_OUT: "checked_out",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
});

function statusLabel(db) {
  const s = String(db || "").toLowerCase();
  return ({
    quote: "Orçamento",
    reserved: "Reservada",
    confirmed: "Confirmada",
    in_house: "Hospedado",
    checked_out: "Finalizada",
    cancelled: "Cancelada",
    no_show: "No-show",
  })[s] || (s ? s : "—");
}

// “Visão” (timeline) independente do status do DB
function statusFrom(r) {
  const t = todayISO();
  const ci = String(r?.checkin || "");
  const co = String(r?.checkout || "");
  const stDb = String(r?.status || "").toLowerCase();

  if (stDb === STATUS.CANCELLED) return { key: "past", label: "Cancelada" };
  if (stDb === STATUS.CHECKED_OUT) return { key: "past", label: "Finalizada" };
  if (stDb === STATUS.NO_SHOW) return { key: "past", label: "No-show" };

  // FUTURA
  if (ci && ci > t) return { key: "future", label: "Futura" };

  // HOJE (inclui day-use)
  if (ci && ci === t) return { key: "today", label: "Hoje" };

  // EM ANDAMENTO (pelo período)
  if (ci && co && ci < t && co >= t) return { key: "today", label: "Em andamento" };

  // PASSADA (mas não finalizada no DB)
  if (co && co < t) return { key: "past", label: "Passada" };

  return { key: "all", label: statusLabel(stDb) || "Ativa" };
}

function setStatusUI(r) {
  const st = statusFrom(r);
  if (elPill) elPill.textContent = st.label || "—";

  const t = todayISO();
  const ci = String(r?.checkin || "");
  const co = String(r?.checkout || "");
  const db = String(r?.status || "").toLowerCase();

  let hint = "";
  if (ci && co && ci === co) hint = "Day use (check-in = check-out).";
  if (db) hint = hint ? `${hint} ${statusLabel(db)}.` : `${statusLabel(db)}.`;
  if (co === t) hint = hint ? `${hint} Saída hoje.` : "Saída hoje.";

  if (elHint) {
    elHint.style.display = hint ? "" : "none";
    elHint.textContent = hint;
  }

  // Botões PMS
  // check-in: reserved/confirmed -> in_house
  // checkout: in_house -> checked_out
  // cancelar: enquanto não estiver checked_out/cancelled/no_show
  const canCheckin = (db === STATUS.RESERVED || db === STATUS.CONFIRMED);
  const canCheckout = (db === STATUS.IN_HOUSE);
  const canCancel = ![STATUS.CHECKED_OUT, STATUS.CANCELLED, STATUS.NO_SHOW].includes(db);

  if (btnCheckin) btnCheckin.style.display = canCheckin ? "" : "none";
  if (btnCheckout) btnCheckout.style.display = canCheckout ? "" : "none";
  if (btnCancelar) btnCancelar.style.display = canCancel ? "" : "none";
}

/* =========================
   Dirty check + validation
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

function isValidDates() {
  const ci = (elCheckin?.value || "").trim();
  const co = (elCheckout?.value || "").trim();
  if (!ci || !co) return false;
  // ✅ day-use permitido, só bloqueia co < ci
  if (co < ci) return false;
  return true;
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
    `<strong>Status DB:</strong> ${escapeHtml(statusLabel(r.status))}`,
    `<strong>Visão:</strong> ${escapeHtml(st.label)}`
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
   Boot + binds
========================= */
function getIdFromQuery() {
  const sp = new URLSearchParams(location.search);
  return (sp.get("id") || "").trim();
}

function bindInputs() {
  [elNome, elWhats, elCheckin, elCheckout, elObs].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      refreshWhatsBtn();
      updateSaveEnabled();

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
// CHECK-IN -> in_house
btnCheckin?.addEventListener("click", async () => {
  try {
    if (!USER?.id || !RES_ID) return;
    setPmsMsg("Fazendo check-in…");

    const updated = await updateReserva(USER.id, RES_ID, { status: STATUS.IN_HOUSE });
    ROW = updated;
    fillForm(ROW);
    setPmsMsg("Check-in feito ✅", "ok");
  } catch (e) {
    console.error("[reserva] checkin error:", e);
    setPmsMsg("Erro ao fazer check-in.", "error");
  }
});

// CHECKOUT -> checked_out
btnCheckout?.addEventListener("click", async () => {
  try {
    if (!USER?.id || !RES_ID) return;

    const ok = confirm("Fechar / Checkout dessa hospedagem?");
    if (!ok) return;

    setPmsMsg("Fazendo checkout…");

    const updated = await updateReserva(USER.id, RES_ID, { status: STATUS.CHECKED_OUT });
    ROW = updated;
    fillForm(ROW);
    setPmsMsg("Checkout feito ✅", "ok");
  } catch (e) {
    console.error("[reserva] checkout error:", e);
    setPmsMsg("Erro ao fazer checkout.", "error");
  }
});

// CANCELAR -> cancelled
btnCancelar?.addEventListener("click", async () => {
  try {
    if (!USER?.id || !RES_ID) return;

    const ok = confirm("Cancelar esta reserva? (Ela ficará como 'Cancelada')");
    if (!ok) return;

    setPmsMsg("Cancelando…");

    const updated = await updateReserva(USER.id, RES_ID, { status: STATUS.CANCELLED });
    ROW = updated;
    fillForm(ROW);
    setPmsMsg("Reserva cancelada ✅", "ok");
  } catch (e) {
    console.error("[reserva] cancel error:", e);
    setPmsMsg("Erro ao cancelar.", "error");
  }
});

  // EXCLUIR
  btnExcluir?.addEventListener("click", async () => {
    try {
      if (!USER?.id || !RES_ID) return;

      const ok = confirm("Excluir esta reserva PERMANENTEMENTE?");
      if (!ok) return;

      setMsg("Excluindo…");
      await deleteReserva(USER.id, RES_ID);
      window.location.replace("/reservas.html");
    } catch (e) {
      console.error("[reserva] delete error:", e);
      setMsg("Erro ao excluir.", "error");
    }
  });

  // SALVAR (form submit)
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

      if (checkout < checkin) { alert("Check-out não pode ser antes do check-in."); elCheckout?.focus(); return; }

      setMsg("Salvando…");

      const updated = await updateReserva(USER.id, RES_ID, {
        nome_hospede: nome,
        whatsapp: whatsapp ? normalizePhoneTo55(whatsapp) : null, // mantém padrão 55...
        checkin,
        checkout,
        observacoes: obs || null,
      });

      ROW = updated;
      fillForm(ROW);
      setMsg("Salvo com sucesso ✅", "ok");
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
      renderUserInfo: false
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
  } catch (err) {
    console.error("[reserva] boot error:", err);
    show("notfound");
  }
})();
