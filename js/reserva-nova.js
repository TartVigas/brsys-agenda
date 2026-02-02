// js/reserva-nova.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

const form = document.getElementById("formReserva");
const nomeEl = document.getElementById("nome");
const whatsEl = document.getElementById("whatsapp");
const checkinEl = document.getElementById("checkin");
const checkoutEl = document.getElementById("checkout");
const obsEl = document.getElementById("obs");

const btnSalvar = document.getElementById("btnSalvar");
const btnLimpar = document.getElementById("btnLimpar");
const msgEl = document.getElementById("msg");

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
  btnSalvar.style.opacity = isLoading ? "0.78" : "1";
  btnSalvar.textContent = isLoading ? "Salvando..." : "Salvar reserva";
}

function getNext() {
  const params = new URLSearchParams(window.location.search);
  return params.get("next") || "/reservas.html";
}

function onlyDigits(v) {
  return (v || "").toString().replace(/\D/g, "");
}

function formatPhoneBR(v) {
  const d = onlyDigits(v).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function formatDateBR(v) {
  const d = onlyDigits(v).slice(0, 8);
  if (!d) return "";
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
  return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
}

function parseBRDateToISO(br) {
  // "DD/MM/AAAA" => "AAAA-MM-DD"
  const s = (br || "").trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);

  if (yyyy < 1900 || yyyy > 2100) return null;
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  const iso = `${String(yyyy).padStart(4,"0")}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;

  // valida data real (ex: 31/02)
  const dt = new Date(iso + "T00:00:00");
  const ok =
    dt.getFullYear() === yyyy &&
    (dt.getMonth() + 1) === mm &&
    dt.getDate() === dd;

  return ok ? iso : null;
}

function compareISO(a, b) {
  // retorna -1, 0, 1
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

async function insertReserva(payload) {
  // 1) tenta com status
  try {
    const { data, error } = await supabase
      .from("agenda_reservas")
      .insert(payload)
      .select("id")
      .single();

    if (error) throw error;
    return data; // {id}
  } catch (e) {
    // 2) fallback sem status (se coluna não existir)
    const clone = { ...payload };
    delete clone.status;

    const { data, error } = await supabase
      .from("agenda_reservas")
      .insert(clone)
      .select("id")
      .single();

    if (error) throw error;
    return data;
  }
}

function cleanText(v) {
  return (v || "").toString().trim();
}

function cleanPhone(v) {
  const d = onlyDigits(v);
  // guarda como digitado? prefiro armazenar só dígitos no banco (V1)
  return d || null;
}

function resetForm() {
  form?.reset();
  setMsg("", "info");
  nomeEl?.focus();
}

async function onSubmit(e) {
  e.preventDefault();
  if (saving) return;

  const nome = cleanText(nomeEl?.value);
  const whatsapp_raw = cleanText(whatsEl?.value);
  const checkin_br = cleanText(checkinEl?.value);
  const checkout_br = cleanText(checkoutEl?.value);
  const obs = cleanText(obsEl?.value);

  if (!nome) {
    setMsg("Digite o nome do hóspede.", "error");
    nomeEl?.focus();
    return;
  }

  const checkin = parseBRDateToISO(checkin_br);
  const checkout = parseBRDateToISO(checkout_br);

  if (!checkin) {
    setMsg("Check-in inválido. Use DD/MM/AAAA.", "error");
    checkinEl?.focus();
    return;
  }
  if (!checkout) {
    setMsg("Check-out inválido. Use DD/MM/AAAA.", "error");
    checkoutEl?.focus();
    return;
  }

  if (compareISO(checkout, checkin) <= 0) {
    setMsg("O check-out precisa ser depois do check-in.", "error");
    checkoutEl?.focus();
    return;
  }

  const payload = {
    // user_id normalmente é preenchido por trigger/RLS? mas vamos garantir caso não tenha.
    user_id: USER?.id,
    nome_hospede: nome,
    whatsapp: cleanPhone(whatsapp_raw),
    checkin,
    checkout,
    observacoes: obs || null,
    status: "pendente", // V1 default
  };

  try {
    saving = true;
    setLoading(true);
    setMsg("Salvando reserva...", "info");

    const created = await insertReserva(payload);

    setMsg("Reserva criada ✅", "ok");

    const next = encodeURIComponent(getNext());

    if (created?.id) {
      // vai pro detalhe
      window.location.replace(`/reserva.html?id=${encodeURIComponent(created.id)}&next=${next}`);
    } else {
      // fallback
      window.location.replace(getNext());
    }
  } catch (err) {
    console.error("[reserva-nova] insert error:", err);
    setMsg("Erro ao salvar. Verifique RLS/policies e tente novamente.", "error");
  } finally {
    saving = false;
    setLoading(false);
  }
}

/* ========= Máscaras leves ========= */
whatsEl?.addEventListener("input", () => {
  const before = whatsEl.value;
  const after = formatPhoneBR(before);
  if (before !== after) whatsEl.value = after;
});

checkinEl?.addEventListener("input", () => {
  const before = checkinEl.value;
  const after = formatDateBR(before);
  if (before !== after) checkinEl.value = after;
});

checkoutEl?.addEventListener("input", () => {
  const before = checkoutEl.value;
  const after = formatDateBR(before);
  if (before !== after) checkoutEl.value = after;
});

/* ========= Botões ========= */
btnLimpar?.addEventListener("click", (e) => {
  e.preventDefault();
  resetForm();
});

/* ========= Boot ========= */
async function boot() {
  USER = await requireAuth({
    redirectTo: "/entrar.html?next=" + encodeURIComponent(window.location.pathname + window.location.search),
    renderUserInfo: false
  });
  if (!USER) return;

  setMsg("Preencha e salve. Depois você edita detalhes.", "info");
  nomeEl?.focus();
}

form?.addEventListener("submit", onSubmit);
boot();
