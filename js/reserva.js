// /js/reserva.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

const stateLoading = document.getElementById("stateLoading");
const stateNotFound = document.getElementById("stateNotFound");
const stateForm = document.getElementById("stateForm");

const form = document.getElementById("formReserva");
const nomeEl = document.getElementById("nome");
const whatsEl = document.getElementById("whatsapp");
const checkinEl = document.getElementById("checkin");
const checkoutEl = document.getElementById("checkout");
const obsEl = document.getElementById("obs");

const metaEl = document.getElementById("meta");
const msgEl = document.getElementById("msg");

const btnSalvar = document.getElementById("btnSalvar");
const btnExcluir = document.getElementById("btnExcluir");
const btnWhats = document.getElementById("btnWhats");

let USER = null;
let RESERVA_ID = null;
let original = null;
let saving = false;
let deleting = false;

function show(which) {
  if (stateLoading) stateLoading.style.display = which === "loading" ? "" : "none";
  if (stateNotFound) stateNotFound.style.display = which === "notfound" ? "" : "none";
  if (stateForm) stateForm.style.display = which === "form" ? "" : "none";
}

function setMsg(text, type = "info") {
  if (!msgEl) return;
  msgEl.textContent = text || "";
  msgEl.style.color =
    type === "error" ? "rgba(255,120,120,.95)" :
    type === "ok"    ? "rgba(102,242,218,.95)" :
                       "rgba(255,255,255,.70)";
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getId() {
  const p = new URLSearchParams(window.location.search);
  return p.get("id");
}

function ymd(isoOrDate) {
  // garante YYYY-MM-DD (o input date usa isso)
  if (!isoOrDate) return "";
  if (typeof isoOrDate === "string") return isoOrDate.slice(0, 10);
  try {
    const d = new Date(isoOrDate);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  } catch {
    return "";
  }
}

function waLink(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${full}`;
}

function currentForm() {
  return {
    nome_hospede: (nomeEl?.value || "").trim(),
    whatsapp: (whatsEl?.value || "").trim(),
    checkin: (checkinEl?.value || "").trim(),
    checkout: (checkoutEl?.value || "").trim(),
    observacoes: (obsEl?.value || "").trim(),
  };
}

function isDirty() {
  if (!original) return false;
  const now = currentForm();
  return (
    now.nome_hospede !== (original.nome_hospede || "") ||
    now.whatsapp !== (original.whatsapp || "") ||
    now.checkin !== ymd(original.checkin) ||
    now.checkout !== ymd(original.checkout) ||
    now.observacoes !== (original.observacoes || "")
  );
}

function refreshUI() {
  const dirty = isDirty();
  if (btnSalvar) btnSalvar.disabled = !dirty || saving;

  const wa = waLink(whatsEl?.value || "");
  if (btnWhats) {
    if (wa) {
      btnWhats.style.display = "";
      btnWhats.href = wa;
    } else {
      btnWhats.style.display = "none";
      btnWhats.href = "#";
    }
  }
}

function bindChangeEvents() {
  const onAny = () => {
    if (isDirty()) setMsg("Alterações pendentes. Clique em Salvar.", "info");
    else setMsg("", "info");
    refreshUI();
  };

  [nomeEl, whatsEl, checkinEl, checkoutEl, obsEl].forEach((el) => {
    el?.addEventListener("input", onAny);
    el?.addEventListener("change", onAny);
  });
}

function fillForm(row) {
  if (!row) return;
  original = row;

  if (nomeEl) nomeEl.value = row.nome_hospede || "";
  if (whatsEl) whatsEl.value = row.whatsapp || "";
  if (checkinEl) checkinEl.value = ymd(row.checkin);
  if (checkoutEl) checkoutEl.value = ymd(row.checkout);
  if (obsEl) obsEl.value = row.observacoes || "";

  if (metaEl) {
    metaEl.innerHTML = `ID: <span class="mono">${esc(row.id)}</span> • Criada em: <span class="mono">${esc(String(row.created_at || "").slice(0,19).replace("T"," "))}</span>`;
  }

  setMsg("", "info");
  refreshUI();
}

async function fetchReserva() {
  show("loading");
  setMsg("", "info");

  const { data, error } = await supabase
    .from("agenda_reservas")
    .select("id, user_id, nome_hospede, whatsapp, checkin, checkout, observacoes, created_at, updated_at")
    .eq("id", RESERVA_ID)
    .maybeSingle();

  if (error) {
    console.error("[reserva] fetch error:", error);
    show("notfound");
    return null;
  }

  if (!data) {
    show("notfound");
    return null;
  }

  show("form");
  fillForm(data);
  return data;
}

function validateBasic(payload) {
  if (!payload.nome_hospede) return "Digite o nome do hóspede.";
  if (!payload.checkin) return "Informe a data de check-in.";
  if (!payload.checkout) return "Informe a data de check-out.";

  // check-out não pode ser <= check-in
  if (payload.checkout <= payload.checkin) {
    return "Check-out deve ser depois do check-in.";
  }

  return null;
}

async function save() {
  if (saving) return;
  if (!RESERVA_ID) return;

  const payload = currentForm();
  const err = validateBasic(payload);
  if (err) {
    setMsg(err, "error");
    return;
  }

  saving = true;
  refreshUI();
  setMsg("Salvando…", "info");

  const { data, error } = await supabase
    .from("agenda_reservas")
    .update({
      nome_hospede: payload.nome_hospede,
      whatsapp: payload.whatsapp || null,
      checkin: payload.checkin,
      checkout: payload.checkout,
      observacoes: payload.observacoes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", RESERVA_ID)
    .select("id, user_id, nome_hospede, whatsapp, checkin, checkout, observacoes, created_at, updated_at")
    .maybeSingle();

  saving = false;

  if (error) {
    console.error("[reserva] update error:", error);
    setMsg("Erro ao salvar. Tente novamente.", "error");
    refreshUI();
    return;
  }

  // atualiza o "original" pra voltar a ficar limpo
  fillForm(data);
  setMsg("Salvo com sucesso ✅", "ok");
  refreshUI();
}

async function remove() {
  if (deleting) return;
  if (!RESERVA_ID) return;

  const ok = confirm("Excluir esta reserva? Essa ação não pode ser desfeita.");
  if (!ok) return;

  deleting = true;
  if (btnExcluir) btnExcluir.disabled = true;
  setMsg("Excluindo…", "info");

  const { error } = await supabase
    .from("agenda_reservas")
    .delete()
    .eq("id", RESERVA_ID);

  deleting = false;
  if (btnExcluir) btnExcluir.disabled = false;

  if (error) {
    console.error("[reserva] delete error:", error);
    setMsg("Erro ao excluir. Tente novamente.", "error");
    return;
  }

  // volta pra lista
  window.location.replace("/reservas.html");
}

/* ========= Boot ========= */
(async () => {
  USER = await requireAuth({
    redirectTo: "/entrar.html?next=/reserva.html",
    renderUserInfo: false,
  });

  if (!USER) return;

  RESERVA_ID = getId();
  if (!RESERVA_ID) {
    show("notfound");
    return;
  }

  bindChangeEvents();

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await save();
  });

  btnExcluir?.addEventListener("click", async () => {
    await remove();
  });

  await fetchReserva();
})();
