// /js/reserva.js — V2 corrigido (status compatível com CHECK em inglês + fallback seguro)
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

/* =========================
   Helpers
========================= */
function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function onlyDigits(s = "") {
  return String(s).replace(/\D/g, "");
}

function isoTodayLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoNowBR() {
  return new Date().toLocaleString("pt-BR");
}

/* =========================
   WhatsApp
========================= */
function normalizeWhatsappTo55(raw) {
  const d = onlyDigits(raw);
  if (!d) return "";
  if (d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

function validateWhatsapp55(w) {
  if (!/^\d+$/.test(w)) return false;
  if (!w.startsWith("55")) return false;
  if (!(w.length === 12 || w.length === 13)) return false;
  const ddd = w.slice(2, 4);
  if (ddd === "00") return false;
  return true;
}

function formatWhatsappBRFrom55(v) {
  const d = onlyDigits(v);
  if (!d) return "";
  const br = d.startsWith("55") ? d.slice(2) : d;
  if (br.length < 10) return br;

  const ddd = br.slice(0, 2);
  const num = br.slice(2);

  if (num.length === 9) return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  return `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
}

function maskWhatsappBR(el) {
  if (!el) return;

  const apply = () => {
    let v = onlyDigits(el.value);
    if (v.startsWith("55")) v = v.slice(2);
    v = v.slice(0, 11);

    if (v.length >= 7) el.value = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
    else if (v.length >= 3) el.value = `(${v.slice(0, 2)}) ${v.slice(2)}`;
    else el.value = v;
  };

  el.addEventListener("input", apply);
  el.addEventListener("paste", () => setTimeout(apply, 0));
  el.addEventListener("blur", apply);
}

function toWaLinkFrom55(phone55, text = "") {
  const w = normalizeWhatsappTo55(phone55);
  if (!validateWhatsapp55(w)) return null;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${w}${q}`;
}

/* =========================
   Msg / UI
========================= */
function setMsg(text = "", type = "info") {
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = text || "";
  el.style.color =
    type === "error" ? "rgba(255,120,120,.95)" :
    type === "ok"    ? "rgba(102,242,218,.95)" :
                       "rgba(255,255,255,.70)";
}

function setPmsMsg(text = "", type = "info") {
  const el = document.getElementById("pmsMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.display = text ? "block" : "none";
  el.style.color =
    type === "error" ? "rgba(255,120,120,.95)" :
    type === "ok"    ? "rgba(102,242,218,.95)" :
                       "rgba(255,255,255,.70)";
}

function showState(which) {
  const loading = document.getElementById("stateLoading");
  const notFound = document.getElementById("stateNotFound");
  const form = document.getElementById("stateForm");

  if (loading) loading.style.display = which === "loading" ? "" : "none";
  if (notFound) notFound.style.display = which === "notfound" ? "" : "none";
  if (form) form.style.display = which === "form" ? "" : "none";
}

function disableSave(disabled) {
  const btn = document.getElementById("btnSalvar");
  if (!btn) return;
  btn.disabled = !!disabled;
  btn.style.opacity = disabled ? "0.7" : "1";
}

/* =========================
   STATUS (DB em inglês) + labels em PT
   Importante: como não temos a lista completa do CHECK,
   trabalhamos com um conjunto comum e fallback seguro.
========================= */
const DB_STATUS = {
  quote: "quote",
  reserved: "reserved",
  confirmed: "confirmed",
  inhouse: "in_house",       // comum (nem sempre existe)
  checkedin: "checked_in",    // comum (nem sempre existe)
  checkedout: "checked_out",  // comum (nem sempre existe)
  cancelled: "cancelled",     // comum (nem sempre existe)
  noshow: "no_show",          // comum (nem sempre existe)
  done: "done",               // comum (nem sempre existe)
};

const STATUS_LABEL_PT = {
  [DB_STATUS.quote]: "Orçamento",
  [DB_STATUS.reserved]: "Reservado",
  [DB_STATUS.confirmed]: "Confirmado",
  [DB_STATUS.inhouse]: "Hospedado",
  [DB_STATUS.checkedin]: "Check-in",
  [DB_STATUS.checkedout]: "Checkout",
  [DB_STATUS.cancelled]: "Cancelado",
  [DB_STATUS.noshow]: "No-show",
  [DB_STATUS.done]: "Finalizado",
};

// Conjunto preferido para botões (ordem de tentativa)
const PREFERRED = {
  CHECKIN: [DB_STATUS.inhouse, DB_STATUS.checkedin, DB_STATUS.confirmed], // tenta nessa ordem
  CHECKOUT: [DB_STATUS.checkedout, DB_STATUS.done],
  CANCEL: [DB_STATUS.cancelled],
};

function normalizeDbStatus(s) {
  const v = String(s || "").toLowerCase().trim();
  // se já for um dos conhecidos, mantém; senão fallback "reserved"
  const known = new Set(Object.values(DB_STATUS));
  if (known.has(v)) return v;
  return DB_STATUS.reserved;
}

function statusLabel(s) {
  const v = normalizeDbStatus(s);
  return STATUS_LABEL_PT[v] || "Reservado";
}

function statusPillTone(s) {
  const v = normalizeDbStatus(s);
  if (v === DB_STATUS.inhouse || v === DB_STATUS.checkedin) return "rgba(255,210,120,.95)";
  if (v === DB_STATUS.checkedout || v === DB_STATUS.done) return "rgba(102,242,218,.95)";
  if (v === DB_STATUS.cancelled || v === DB_STATUS.noshow) return "rgba(255,120,120,.95)";
  if (v === DB_STATUS.confirmed) return "rgba(160,200,255,.95)";
  return "rgba(255,255,255,.70)";
}

/**
 * Tenta atualizar status com uma lista de candidatos.
 * Se o banco rejeitar (check constraint), tenta o próximo.
 */
async function tryUpdateStatus(candidates, baseWhere) {
  let lastErr = null;

  for (const st of candidates) {
    const { data, error } = await supabase
      .from("agenda_reservas")
      .update({ status: st, updated_at: new Date().toISOString() })
      .match(baseWhere)
      .select("*")
      .single();

    if (!error) return { data, used: st };
    lastErr = error;

    const msg = String(error?.message || "").toLowerCase();
    const isConstraint = msg.includes("check constraint") || msg.includes("violates");
    // se for constraint, tenta próximo; se for outra coisa, para
    if (!isConstraint) break;
  }

  throw lastErr || new Error("Não foi possível atualizar o status.");
}

function renderStatusUI(model) {
  const pill = document.getElementById("resStatusPill");
  const hint = document.getElementById("resStatusHint");

  const btnCheckin = document.getElementById("btnCheckin");
  const btnCheckout = document.getElementById("btnCheckout");
  const btnCancelar = document.getElementById("btnCancelar");

  const st = normalizeDbStatus(model?.status);

  if (pill) {
    pill.textContent = statusLabel(st);
    pill.style.borderColor = "rgba(255,255,255,.12)";
    pill.style.color = statusPillTone(st);
  }

  if (hint) {
    const today = isoTodayLocal();
    const isToday = model?.checkin === today;

    let t = "";
    if (st === DB_STATUS.reserved || st === DB_STATUS.confirmed || st === DB_STATUS.quote) {
      t = isToday
        ? "Só ocupa após Check-in."
        : "Reserva criada. Só ocupa após Check-in.";
    } else if (st === DB_STATUS.inhouse || st === DB_STATUS.checkedin) {
      t = "Ocupando quarto agora (Check-in feito).";
    } else if (st === DB_STATUS.checkedout || st === DB_STATUS.done) {
      t = "Reserva finalizada (Checkout).";
    } else if (st === DB_STATUS.cancelled) {
      t = "Reserva cancelada.";
    }

    hint.textContent = t;
    hint.style.display = t ? "inline" : "none";
  }

  // Botões: liberamos check-in quando estiver "reserved/confirmed/quote"
  const show = (el, on) => { if (el) el.style.display = on ? "" : "none"; };

  const canCheckin = [DB_STATUS.quote, DB_STATUS.reserved, DB_STATUS.confirmed].includes(st);
  const canCheckout = [DB_STATUS.inhouse, DB_STATUS.checkedin].includes(st);
  const canCancel = [DB_STATUS.quote, DB_STATUS.reserved, DB_STATUS.confirmed].includes(st);

  show(btnCheckin, canCheckin);
  show(btnCancelar, canCancel);
  show(btnCheckout, canCheckout);

  setPmsMsg("");
}

/* =========================
   Field mapping
========================= */
function toFormModel(row) {
  return {
    nome: row?.nome_hospede ?? "",
    whatsapp: row?.whatsapp ?? "",
    checkin: row?.checkin ?? "",
    checkout: row?.checkout ?? "",
    obs: row?.observacoes ?? "",
    status: normalizeDbStatus(row?.status),
    quarto_id: row?.quarto_id ?? null,
    created_at: row?.created_at ?? null,
    updated_at: row?.updated_at ?? null,
  };
}

function toDbPayload(model) {
  const whatsapp55 = normalizeWhatsappTo55(model.whatsapp);
  return {
    nome_hospede: model.nome || null,
    whatsapp: whatsapp55 || null,
    checkin: model.checkin || null,
    checkout: model.checkout || null,
    observacoes: model.obs || null,
    updated_at: new Date().toISOString(),
  };
}

/* =========================
   Validation
========================= */
function validate(model) {
  if (!model.nome || model.nome.trim().length < 2) return "Informe o nome do hóspede.";
  if (!model.checkin || !model.checkout) return "Informe check-in e check-out.";
  if (model.checkout <= model.checkin) return "Check-out precisa ser depois do check-in.";

  const w55 = normalizeWhatsappTo55(model.whatsapp);
  if (!w55) return "Informe o WhatsApp do hóspede.";
  if (!validateWhatsapp55(w55)) return "WhatsApp inválido. Use DDD + número (ex.: 11999998888).";

  return null;
}

/* =========================
   DOM Refs
========================= */
const form = document.getElementById("formReserva");
const nomeEl = document.getElementById("nome");
const whatsEl = document.getElementById("whatsapp");
const checkinEl = document.getElementById("checkin");
const checkoutEl = document.getElementById("checkout");
const obsEl = document.getElementById("obs");

const metaEl = document.getElementById("meta");
const btnExcluir = document.getElementById("btnExcluir");
const btnWhats = document.getElementById("btnWhats");

const btnCheckin = document.getElementById("btnCheckin");
const btnCheckout = document.getElementById("btnCheckout");
const btnCancelar = document.getElementById("btnCancelar");

/* =========================
   State
========================= */
let USER = null;
let RESERVA_ID = null;
let original = null;
let saving = false;
let deleting = false;
let changingStatus = false;

/* =========================
   Dirty tracking
========================= */
function readModelFromForm() {
  return {
    nome: (nomeEl?.value || "").trim(),
    whatsapp: (whatsEl?.value || "").trim(),
    checkin: (checkinEl?.value || "").trim(),
    checkout: (checkoutEl?.value || "").trim(),
    obs: (obsEl?.value || "").trim(),
  };
}

function isDirty() {
  if (!original) return false;
  const cur = readModelFromForm();

  const curW = normalizeWhatsappTo55(cur.whatsapp);
  const origW = normalizeWhatsappTo55(original.whatsapp);

  return (
    cur.nome !== original.nome ||
    curW !== origW ||
    cur.checkin !== original.checkin ||
    cur.checkout !== original.checkout ||
    cur.obs !== original.obs
  );
}

function refreshWhatsButton(model) {
  if (!btnWhats) return;

  const name = (model?.nome || "Olá").trim() || "Olá";
  const w55 = normalizeWhatsappTo55(model?.whatsapp || "");
  const link = toWaLinkFrom55(w55, `Olá ${name}! Aqui é da recepção 🙂`);

  if (!link) {
    btnWhats.style.display = "none";
    btnWhats.href = "#";
    return;
  }

  btnWhats.style.display = "";
  btnWhats.href = link;
}

function refreshSaveState() {
  const cur = readModelFromForm();
  const err = validate(cur);

  if (err) {
    disableSave(true);
    setMsg(err, "error");
    refreshWhatsButton(cur);
    return;
  }

  if (!isDirty()) {
    disableSave(true);
    setMsg("Sem alterações.", "info");
    refreshWhatsButton(cur);
    return;
  }

  disableSave(false);
  setMsg("Alterações prontas para salvar.", "info");
  refreshWhatsButton(cur);
}

function bindDirtyListeners() {
  const handler = () => refreshSaveState();
  nomeEl?.addEventListener("input", handler);
  whatsEl?.addEventListener("input", handler);
  checkinEl?.addEventListener("change", handler);
  checkoutEl?.addEventListener("change", handler);
  obsEl?.addEventListener("input", handler);
}

/* =========================
   Load
========================= */
async function loadReserva() {
  RESERVA_ID = qs("id");
  if (!RESERVA_ID) {
    showState("notfound");
    return;
  }

  showState("loading");
  setMsg("");
  setPmsMsg("");

  const { data, error } = await supabase
    .from("agenda_reservas")
    .select("*")
    .eq("id", RESERVA_ID)
    .eq("user_id", USER.id)
    .maybeSingle();

  if (error || !data) {
    console.error("[reserva] load error:", error);
    showState("notfound");
    return;
  }

  original = toFormModel(data);

  if (nomeEl) nomeEl.value = original.nome || "";

  if (whatsEl) {
    whatsEl.value = formatWhatsappBRFrom55(original.whatsapp);
    maskWhatsappBR(whatsEl);
  }

  if (checkinEl) checkinEl.value = original.checkin || "";
  if (checkoutEl) checkoutEl.value = original.checkout || "";
  if (obsEl) obsEl.value = original.obs || "";

  if (metaEl) {
    const created = original.created_at ? new Date(original.created_at).toLocaleString("pt-BR") : "—";
    const updated = original.updated_at ? new Date(original.updated_at).toLocaleString("pt-BR") : null;

    metaEl.innerHTML = `
      <span class="muted small">
        ID: <span class="mono">${escapeHtml(String(RESERVA_ID))}</span>
        • Criada: <strong>${escapeHtml(created)}</strong>
        ${updated ? ` • Atualizada: <strong>${escapeHtml(updated)}</strong>` : ""}
      </span>
    `;
  }

  refreshWhatsButton({ ...original, whatsapp: original.whatsapp });
  renderStatusUI(original);

  showState("form");
  bindDirtyListeners();
  refreshSaveState();
}

/* =========================
   Save (update)
========================= */
async function saveReserva() {
  if (saving || changingStatus) return;
  saving = true;

  const cur = readModelFromForm();
  const err = validate(cur);

  if (err) {
    setMsg(err, "error");
    saving = false;
    return;
  }

  if (!isDirty()) {
    setMsg("Nada para salvar.", "info");
    saving = false;
    return;
  }

  disableSave(true);
  setMsg("Salvando alterações…", "info");

  const payload = toDbPayload(cur);

  const { data, error } = await supabase
    .from("agenda_reservas")
    .update(payload)
    .eq("id", RESERVA_ID)
    .eq("user_id", USER.id)
    .select("*")
    .single();

  saving = false;

  if (error) {
    console.error("[reserva] update error:", error);
    setMsg("Erro ao salvar. Verifique conexão/RLS e tente novamente.", "error");
    refreshSaveState();
    return;
  }

  original = toFormModel(data);

  if (whatsEl) whatsEl.value = formatWhatsappBRFrom55(original.whatsapp);

  refreshWhatsButton({ ...original, whatsapp: original.whatsapp });
  renderStatusUI(original);

  if (metaEl) {
    const created = original.created_at ? new Date(original.created_at).toLocaleString("pt-BR") : "—";
    const updated = original.updated_at ? new Date(original.updated_at).toLocaleString("pt-BR") : isoNowBR();

    metaEl.innerHTML = `
      <span class="muted small">
        ID: <span class="mono">${escapeHtml(String(RESERVA_ID))}</span>
        • Criada: <strong>${escapeHtml(created)}</strong>
        • Atualizada: <strong>${escapeHtml(updated)}</strong>
      </span>
    `;
  }

  setMsg("Salvo com sucesso ✅", "ok");
  refreshSaveState();
}

/* =========================
   PMS: update status (com fallback)
========================= */
async function updateStatus(kind) {
  if (changingStatus) return;
  changingStatus = true;

  const cur = readModelFromForm();
  const name = (cur?.nome || original?.nome || "hóspede").trim();

  const st = normalizeDbStatus(original?.status);
  const today = isoTodayLocal();

  // Regras mínimas:
  if (kind === "checkin") {
    if (today < original.checkin) {
      setPmsMsg("Ainda não chegou a data do check-in.", "error");
      changingStatus = false;
      return;
    }
    if (![DB_STATUS.quote, DB_STATUS.reserved, DB_STATUS.confirmed].includes(st)) {
      setPmsMsg("Check-in só é permitido quando a reserva está em Orçamento/Reservado/Confirmado.", "error");
      changingStatus = false;
      return;
    }
  }

  if (kind === "checkout") {
    if (![DB_STATUS.inhouse, DB_STATUS.checkedin].includes(st)) {
      setPmsMsg("Checkout só é permitido quando está Hospedado/Check-in.", "error");
      changingStatus = false;
      return;
    }
  }

  if (kind === "cancel") {
    if (![DB_STATUS.quote, DB_STATUS.reserved, DB_STATUS.confirmed].includes(st)) {
      setPmsMsg("Cancelar só é permitido quando a reserva está em Orçamento/Reservado/Confirmado.", "error");
      changingStatus = false;
      return;
    }
  }

  let msgConfirm = "";
  if (kind === "checkin") msgConfirm = `Confirmar CHECK-IN de "${name}"?`;
  if (kind === "checkout") msgConfirm = `Confirmar CHECKOUT de "${name}"?`;
  if (kind === "cancel") msgConfirm = `Cancelar a reserva de "${name}"?`;

  if (msgConfirm && !window.confirm(msgConfirm)) {
    changingStatus = false;
    return;
  }

  setPmsMsg("Atualizando status…", "info");

  const where = { id: RESERVA_ID, user_id: USER.id };

  try {
    let candidates = [DB_STATUS.reserved];

    if (kind === "checkin") candidates = PREFERRED.CHECKIN.filter(Boolean);
    if (kind === "checkout") candidates = PREFERRED.CHECKOUT.filter(Boolean);
    if (kind === "cancel") candidates = PREFERRED.CANCEL.filter(Boolean);

    const { data, used } = await tryUpdateStatus(candidates, where);

    original = toFormModel(data);
    renderStatusUI(original);

    setPmsMsg(`Status atualizado: ${statusLabel(used)} ✅`, "ok");
    refreshSaveState();
  } catch (error) {
    console.error("[reserva] status update error:", error);
    setPmsMsg(
      "Não consegui atualizar o status (provável CHECK constraint no banco). " +
      "Me mande a lista completa do constraint para mapear corretamente.",
      "error"
    );
  } finally {
    changingStatus = false;
  }
}

/* =========================
   Delete
========================= */
async function deleteReserva() {
  if (deleting || changingStatus) return;
  deleting = true;

  const name = (nomeEl?.value || "esta reserva").trim();
  const ok = window.confirm(`Excluir "${name}"? Essa ação não pode ser desfeita.`);
  if (!ok) {
    deleting = false;
    return;
  }

  setMsg("Excluindo…", "info");
  disableSave(true);

  const { error } = await supabase
    .from("agenda_reservas")
    .delete()
    .eq("id", RESERVA_ID)
    .eq("user_id", USER.id);

  deleting = false;

  if (error) {
    console.error("[reserva] delete error:", error);
    setMsg("Erro ao excluir. Verifique RLS e tente novamente.", "error");
    refreshSaveState();
    return;
  }

  setMsg("Reserva excluída ✅ Redirecionando…", "ok");
  setTimeout(() => window.location.replace("/reservas.html"), 600);
}

/* =========================
   Events
========================= */
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  await saveReserva();
});

btnExcluir?.addEventListener("click", async () => {
  await deleteReserva();
});

// PMS buttons (se existirem no HTML)
btnCheckin?.addEventListener("click", async () => updateStatus("checkin"));
btnCheckout?.addEventListener("click", async () => updateStatus("checkout"));
btnCancelar?.addEventListener("click", async () => updateStatus("cancel"));

/* =========================
   Boot
========================= */
(async function boot() {
  USER = await requireAuth({ redirectTo: "/entrar.html?next=/reserva.html", renderUserInfo: false });
  if (!USER) return;

  await loadReserva();
})();
