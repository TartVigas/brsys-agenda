// /js/reserva.js
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

function toWaLink(phoneRaw, text = "") {
  const digits = onlyDigits(phoneRaw);
  if (!digits) return null;

  // assume BR default 55
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  const qs = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${full}${qs}`;
}

function setMsg(text = "", type = "info") {
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = text || "";

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
  const d = new Date();
  return d.toLocaleString("pt-BR");
}

/* =========================
   Field mapping (V1)
   (contrato oficial)
========================= */
function toFormModel(row) {
  return {
    nome: row?.nome_hospede ?? "",
    whatsapp: row?.whatsapp ?? "",
    checkin: row?.checkin ?? "",
    checkout: row?.checkout ?? "",
    obs: row?.observacoes ?? "",
    created_at: row?.created_at ?? null,
    updated_at: row?.updated_at ?? null,
  };
}

function toDbPayload(model) {
  return {
    nome_hospede: model.nome || null,
    whatsapp: model.whatsapp || null,
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
  if (!model.nome || model.nome.trim().length < 2) {
    return "Informe o nome do hóspede.";
  }

  if (!model.checkin || !model.checkout) {
    return "Informe check-in e check-out.";
  }

  // date inputs são YYYY-MM-DD
  if (model.checkout <= model.checkin) {
    return "Check-out precisa ser depois do check-in.";
  }

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
const btnSalvar = document.getElementById("btnSalvar");
const btnExcluir = document.getElementById("btnExcluir");
const btnWhats = document.getElementById("btnWhats");

/* =========================
   State
========================= */
let USER = null;
let RESERVA_ID = null;
let original = null; // snapshot do que veio do DB
let saving = false;
let deleting = false;

/* =========================
   Dirty tracking (edição inline)
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

  return (
    cur.nome !== original.nome ||
    cur.whatsapp !== original.whatsapp ||
    cur.checkin !== original.checkin ||
    cur.checkout !== original.checkout ||
    cur.obs !== original.obs
  );
}

function refreshSaveState() {
  const cur = readModelFromForm();
  const err = validate(cur);

  if (err) {
    disableSave(true);
    setMsg(err, "error");
    return;
  }

  if (!isDirty()) {
    disableSave(true);
    setMsg("Sem alterações.", "info");
    return;
  }

  disableSave(false);
  setMsg("Alterações prontas para salvar.", "info");
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
   WhatsApp button
========================= */
function refreshWhatsButton(model) {
  if (!btnWhats) return;

  const name = model?.nome || "Olá";
  const phone = model?.whatsapp || "";
  const link = toWaLink(phone, `Olá ${name}! Aqui é da recepção 🙂`);

  if (!link) {
    btnWhats.style.display = "none";
    btnWhats.href = "#";
    return;
  }

  btnWhats.style.display = "";
  btnWhats.href = link;
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

  const { data, error } = await supabase
    .from("agenda_reservas")
    .select("*")
    .eq("id", RESERVA_ID)
    .eq("user_id", USER.id)
    .maybeSingle();

  if (error) {
    console.error("[reserva] load error:", error);
    showState("notfound");
    return;
  }

  if (!data) {
    showState("notfound");
    return;
  }

  // snapshot
  original = toFormModel(data);

  // fill form
  if (nomeEl) nomeEl.value = original.nome || "";
  if (whatsEl) whatsEl.value = original.whatsapp || "";
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

  refreshWhatsButton(original);

  showState("form");
  bindDirtyListeners();
  refreshSaveState();
}

/* =========================
   Save (update)
========================= */
async function saveReserva() {
  if (saving) return;
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

  // atualiza snapshot + tela
  original = toFormModel(data);
  refreshWhatsButton(original);

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
   Delete
========================= */
async function deleteReserva() {
  if (deleting) return;
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
  setTimeout(() => {
    window.location.replace("/reservas.html");
  }, 600);
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

/* =========================
   Boot
========================= */
(async function boot() {
  USER = await requireAuth({ redirectTo: "/entrar.html?next=/reserva.html", renderUserInfo: false });
  if (!USER) return;

  await loadReserva();
})();
