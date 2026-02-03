// /js/reserva.js — V2 (PMS status + ocupação via check-in)
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

/* =========================
   WhatsApp (Round 2A)
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

function isoNowBR() {
  return new Date().toLocaleString("pt-BR");
}

/* =========================
   PMS Status (V2)
========================= */
const STATUS = {
  reservado: "reservado",
  hospedado: "hospedado",
  finalizado: "finalizado",
  cancelado: "cancelado",
};

function normalizeStatus(s) {
  const v = String(s || "").toLowerCase().trim();
  if (v === STATUS.hospedado) return STATUS.hospedado;
  if (v === STATUS.finalizado) return STATUS.finalizado;
  if (v === STATUS.cancelado) return STATUS.cancelado;
  return STATUS.reservado; // default seguro
}

function statusLabel(s) {
  const v = normalizeStatus(s);
  if (v === STATUS.hospedado) return "Hospedado";
  if (v === STATUS.finalizado) return "Finalizado";
  if (v === STATUS.cancelado) return "Cancelado";
  return "Reservado";
}

function statusPillTone(s) {
  // só inline style simples pra não mexer no CSS agora
  const v = normalizeStatus(s);
  if (v === STATUS.hospedado) return "rgba(255,210,120,.95)"; // warn
  if (v === STATUS.finalizado) return "rgba(102,242,218,.95)"; // ok
  if (v === STATUS.cancelado) return "rgba(255,120,120,.95)"; // error
  return "rgba(255,255,255,.70)"; // neutro
}

function renderStatusUI(model) {
  const pill = document.getElementById("resStatusPill");
  const hint = document.getElementById("resStatusHint");

  const btnCheckin = document.getElementById("btnCheckin");
  const btnCheckout = document.getElementById("btnCheckout");
  const btnCancelar = document.getElementById("btnCancelar");

  const st = normalizeStatus(model?.status);

  if (pill) {
    pill.textContent = statusLabel(st);
    pill.style.borderColor = "rgba(255,255,255,.12)";
    pill.style.color = statusPillTone(st);
  }

  // Hints rápidos (pra evitar confusão do “ocupa hoje”)
  if (hint) {
    const today = isoTodayLocal();
    const isToday = model?.checkin === today;

    let t = "";
    if (st === STATUS.reservado) {
      t = isToday
        ? "Não ocupa ainda. Só ocupa após Check-in."
        : "Reserva criada. Só ocupa após Check-in.";
    } else if (st === STATUS.hospedado) {
      t = "Ocupando quarto agora (Check-in feito).";
    } else if (st === STATUS.finalizado) {
      t = "Reserva finalizada (Checkout).";
    } else if (st === STATUS.cancelado) {
      t = "Reserva cancelada.";
    }

    hint.textContent = t;
    hint.style.display = t ? "inline" : "none";
  }

  // Botões PMS por status
  const show = (el, on) => { if (el) el.style.display = on ? "" : "none"; };

  show(btnCheckin, st === STATUS.reservado);
  show(btnCancelar, st === STATUS.reservado);

  show(btnCheckout, st === STATUS.hospedado);

  // Mensagem PMS limpa
  setPmsMsg("");
}

/* =========================
   Field mapping (V2)
========================= */
function toFormModel(row) {
  return {
    nome: row?.nome_hospede ?? "",
    whatsapp: row?.whatsapp ?? "",
    checkin: row?.checkin ?? "",
    checkout: row?.checkout ?? "",
    obs: row?.observacoes ?? "",
    status: normalizeStatus(row?.status),     // ✅ novo
    quarto_id: row?.quarto_id ?? null,        // ✅ útil pro mapa
    created_at: row?.created_at ?? null,
    updated_at: row?.updated_at ?? null,
  };
}

function toDbPayload(model) {
  const whatsapp55 = normalizeWhatsappTo55(model.whatsapp);

  // status nunca vem daqui (status é PMS controlado por botões)
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
   Validation (V1 mantém)
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
let original = null; // snapshot do DB
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

  // fill form
  if (nomeEl) nomeEl.value = original.nome || "";

  if (whatsEl) {
    whatsEl.value = formatWhatsappBRFrom55(original.whatsapp);
    maskWhatsappBR(whatsEl);
  }

  if (checkinEl) checkinEl.value = original.checkin || "";
  if (checkoutEl) checkoutEl.value = original.checkout || "";
  if (obsEl) obsEl.value = original.obs || "";

  // meta
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
   Save (update fields)
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
   PMS: update status
========================= */
async function updateStatus(nextStatus) {
  if (changingStatus) return;
  changingStatus = true;

  const cur = readModelFromForm();
  const name = (cur?.nome || original?.nome || "hóspede").trim();

  // Regras mínimas de segurança:
  const st = normalizeStatus(original?.status);
  const today = isoTodayLocal();

  if (nextStatus === STATUS.hospedado) {
    // check-in só faz sentido se hoje >= checkin
    if (today < original.checkin) {
      setPmsMsg("Ainda não chegou a data do check-in.", "error");
      changingStatus = false;
      return;
    }
    if (st !== STATUS.reservado) {
      setPmsMsg("Check-in só é permitido quando a reserva está como Reservado.", "error");
      changingStatus = false;
      return;
    }
  }

  if (nextStatus === STATUS.finalizado) {
    if (st !== STATUS.hospedado) {
      setPmsMsg("Checkout só é permitido quando está Hospedado.", "error");
      changingStatus = false;
      return;
    }
    // opcional: impedir checkout antes da data
    // (mantive livre, porque motel/hotel pode sair antes)
  }

  if (nextStatus === STATUS.cancelado) {
    if (st !== STATUS.reservado) {
      setPmsMsg("Cancelar só é permitido quando está Reservado.", "error");
      changingStatus = false;
      return;
    }
  }

  // Confirmação humana
  let msgConfirm = "";
  if (nextStatus === STATUS.hospedado) msgConfirm = `Confirmar CHECK-IN de "${name}"?`;
  if (nextStatus === STATUS.finalizado) msgConfirm = `Confirmar CHECKOUT de "${name}"?`;
  if (nextStatus === STATUS.cancelado) msgConfirm = `Cancelar a reserva de "${name}"?`;

  if (msgConfirm && !window.confirm(msgConfirm)) {
    changingStatus = false;
    return;
  }

  setPmsMsg("Atualizando status…", "info");

  const { data, error } = await supabase
    .from("agenda_reservas")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", RESERVA_ID)
    .eq("user_id", USER.id)
    .select("*")
    .single();

  changingStatus = false;

  if (error) {
    console.error("[reserva] status update error:", error);
    setPmsMsg("Erro ao atualizar status. Confira se a coluna status existe e RLS permite update.", "error");
    return;
  }

  original = toFormModel(data);
  renderStatusUI(original);
  setPmsMsg(`Status atualizado: ${statusLabel(original.status)} ✅`, "ok");

  // atualiza estado do salvar (pra não ficar “dirty” por nada)
  refreshSaveState();
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

// PMS buttons
btnCheckin?.addEventListener("click", async () => updateStatus(STATUS.hospedado));
btnCheckout?.addEventListener("click", async () => updateStatus(STATUS.finalizado));
btnCancelar?.addEventListener("click", async () => updateStatus(STATUS.cancelado));

/* =========================
   Boot
========================= */
(async function boot() {
  USER = await requireAuth({ redirectTo: "/entrar.html?next=/reserva.html", renderUserInfo: false });
  if (!USER) return;

  await loadReserva();
})();
