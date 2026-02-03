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

/* =========================
   WhatsApp (Round 2A)
   - DB: 5511...
   - UI: (11) 99999-9999
========================= */
function normalizeWhatsappTo55(raw) {
  const d = onlyDigits(raw);
  if (!d) return "";
  if (d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d; // cai na validação
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

  // celular 9 dígitos -> 5-4, fixo 8 dígitos -> 4-4
  if (num.length === 9) return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  return `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
}

function maskWhatsappBR(el) {
  if (!el) return;

  const apply = () => {
    let v = onlyDigits(el.value);

    // Se user colou 55..., remove 55 para exibição
    if (v.startsWith("55")) v = v.slice(2);

    // limita a DDD + número (11 máx)
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
  // IMPORTANTE: model.whatsapp deve manter o formato do DB (55...)
  return {
    nome: row?.nome_hospede ?? "",
    whatsapp: row?.whatsapp ?? "", // 55...
    checkin: row?.checkin ?? "",
    checkout: row?.checkout ?? "",
    obs: row?.observacoes ?? "",
    created_at: row?.created_at ?? null,
    updated_at: row?.updated_at ?? null,
  };
}

function toDbPayload(model) {
  // model.whatsapp aqui pode estar “bonito”, então normaliza p/ 55...
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

  // WhatsApp (Round 2A): obrigatório e válido
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
const btnSalvar = document.getElementById("btnSalvar");
const btnExcluir = document.getElementById("btnExcluir");
const btnWhats = document.getElementById("btnWhats");

/* =========================
   State
========================= */
let USER = null;
let RESERVA_ID = null;
let original = null; // snapshot do DB (whatsapp em 55...)
let saving = false;
let deleting = false;

/* =========================
   Dirty tracking (edição inline)
========================= */
function readModelFromForm() {
  return {
    nome: (nomeEl?.value || "").trim(),
    whatsapp: (whatsEl?.value || "").trim(), // pode estar bonito
    checkin: (checkinEl?.value || "").trim(),
    checkout: (checkoutEl?.value || "").trim(),
    obs: (obsEl?.value || "").trim(),
  };
}

function isDirty() {
  if (!original) return false;
  const cur = readModelFromForm();

  // compara whatsapp normalizado para 55... dos dois lados
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

function refreshSaveState() {
  const cur = readModelFromForm();
  const err = validate(cur);

  if (err) {
    disableSave(true);
    setMsg(err, "error");
    refreshWhatsButton(cur); // botão acompanha mesmo com erro
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
   WhatsApp button (Round 2A)
========================= */
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

  // snapshot (DB)
  original = toFormModel(data);

  // fill form
  if (nomeEl) nomeEl.value = original.nome || "";

  // WhatsApp: exibe bonito, mas mantém original.whatsapp em 55...
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

  refreshWhatsButton({
    ...original,
    whatsapp: original.whatsapp // 55...
  });

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

  // re-render Whats bonito após salvar (garante consistência)
  if (whatsEl) whatsEl.value = formatWhatsappBRFrom55(original.whatsapp);

  refreshWhatsButton({
    ...original,
    whatsapp: original.whatsapp
  });

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
