// js/reserva-nova.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

const form = document.getElementById("formReserva");
const nomeEl = document.getElementById("nome");
const whatsEl = document.getElementById("whatsapp");
const checkinEl = document.getElementById("checkin");
const checkoutEl = document.getElementById("checkout");
const obsEl = document.getElementById("obs");
const msgEl = document.getElementById("msg");
const btnSalvar = document.getElementById("btnSalvar");
const btnLimpar = document.getElementById("btnLimpar");

let USER = null;
let saving = false;

function setMsg(text, type = "info") {
  if (!msgEl) return;
  msgEl.textContent = text || "";

  msgEl.style.color =
    type === "error" ? "rgba(255,120,120,.95)" :
    type === "ok"    ? "rgba(102,242,218,.95)" :
                       "rgba(255,255,255,.70)";
}

function setLoading(isLoading) {
  if (!btnSalvar) return;
  btnSalvar.disabled = !!isLoading;
  btnSalvar.style.opacity = isLoading ? "0.75" : "1";
  btnSalvar.textContent = isLoading ? "Salvando..." : "Salvar reserva";
}

function onlyDigits(v) {
  return (v || "").toString().replace(/\D/g, "");
}

/** formata WhatsApp BR básico: (11) 99999-9999 */
function formatPhoneBR(v) {
  const d = onlyDigits(v).slice(0, 11);
  if (!d) return "";

  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

/** máscara DD/MM/AAAA */
function maskDateBR(v) {
  const d = onlyDigits(v).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
  return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
}

/** valida DD/MM/AAAA (simples) */
function isValidDateBR(s) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return false;

  const [dd, mm, yyyy] = s.split("/").map(Number);
  if (yyyy < 2020 || yyyy > 2100) return false;
  if (mm < 1 || mm > 12) return false;

  const maxDay = new Date(yyyy, mm, 0).getDate();
  if (dd < 1 || dd > maxDay) return false;

  return true;
}

/** converte DD/MM/AAAA -> YYYY-MM-DD */
function brToISO(s) {
  const [dd, mm, yyyy] = s.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

function compareISO(a, b) {
  // ISO date lexical compare funciona
  if (!a || !b) return 0;
  return a < b ? -1 : a > b ? 1 : 0;
}

function bindMasks() {
  whatsEl?.addEventListener("input", () => {
    const caret = whatsEl.selectionStart || 0;
    const before = whatsEl.value;
    whatsEl.value = formatPhoneBR(before);
    // não tenta preservar caret com perfeição no V1
  });

  checkinEl?.addEventListener("input", () => {
    checkinEl.value = maskDateBR(checkinEl.value);
  });

  checkoutEl?.addEventListener("input", () => {
    checkoutEl.value = maskDateBR(checkoutEl.value);
  });
}

function clearForm() {
  if (nomeEl) nomeEl.value = "";
  if (whatsEl) whatsEl.value = "";
  if (checkinEl) checkinEl.value = "";
  if (checkoutEl) checkoutEl.value = "";
  if (obsEl) obsEl.value = "";
  setMsg("", "info");
  nomeEl?.focus();
}

async function insertReserva(payload) {
  const { error } = await supabase
    .from("agenda_reservas")
    .insert(payload);

  if (error) throw error;
}

async function onSubmit(e) {
  e.preventDefault();
  if (saving) return;

  const nome = (nomeEl?.value || "").trim();
  const whatsappMasked = (whatsEl?.value || "").trim();
  const whatsappDigits = onlyDigits(whatsappMasked); // guarda só números
  const checkinBR = (checkinEl?.value || "").trim();
  const checkoutBR = (checkoutEl?.value || "").trim();
  const obs = (obsEl?.value || "").trim();

  if (!nome) {
    setMsg("Informe o nome do hóspede.", "error");
    nomeEl?.focus();
    return;
  }

  if (!isValidDateBR(checkinBR)) {
    setMsg("Check-in inválido. Use DD/MM/AAAA.", "error");
    checkinEl?.focus();
    return;
  }

  if (!isValidDateBR(checkoutBR)) {
    setMsg("Check-out inválido. Use DD/MM/AAAA.", "error");
    checkoutEl?.focus();
    return;
  }

  const checkinISO = brToISO(checkinBR);
  const checkoutISO = brToISO(checkoutBR);

  if (compareISO(checkoutISO, checkinISO) <= 0) {
    setMsg("Check-out precisa ser depois do check-in.", "error");
    checkoutEl?.focus();
    return;
  }

  // whatsapp opcional, mas se tiver, valida tamanho mínimo (DDD + 8/9)
  if (whatsappDigits && whatsappDigits.length < 10) {
    setMsg("WhatsApp parece incompleto. Inclua DDD.", "error");
    whatsEl?.focus();
    return;
  }

  const payload = {
    user_id: USER.id,
    nome_hospede: nome,
    whatsapp: whatsappDigits ? whatsappDigits : null,
    checkin: checkinISO,
    checkout: checkoutISO,
    observacoes: obs ? obs : null,
    // status: "reservado" // se você tiver coluna status, pode habilitar
  };

  try {
    saving = true;
    setLoading(true);
    setMsg("Salvando reserva...", "info");

    await insertReserva(payload);

    setMsg("Reserva salva! Indo para a lista…", "ok");

    // leve delay pra feedback visual
    setTimeout(() => {
      window.location.replace("/reservas.html");
    }, 450);

  } catch (err) {
    console.error("[reserva-nova] insert error:", err);
    setMsg("Erro ao salvar. Verifique RLS/colunas e tente novamente.", "error");
  } finally {
    saving = false;
    setLoading(false);
  }
}

async function boot() {
  USER = await requireAuth({ redirectTo: "/entrar.html?next=/reserva-nova.html", renderUserInfo: false });
  if (!USER) return;

  bindMasks();
  form?.addEventListener("submit", onSubmit);

  btnLimpar?.addEventListener("click", () => clearForm());

  setMsg("Preencha e salve. Depois evoluímos para editar/excluir.", "info");
  nomeEl?.focus();
}

boot();

