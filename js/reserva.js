// js/reserva.js
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
const statusEl = document.getElementById("status");

const metaEl = document.getElementById("meta");
const msgEl = document.getElementById("msg");

const btnSalvar = document.getElementById("btnSalvar");
const btnExcluir = document.getElementById("btnExcluir");
const btnWhats = document.getElementById("btnWhats");
const btnBack = document.getElementById("btnBack");
const btnBackNF = document.getElementById("btnBackNF");

let USER = null;
let RESERVA_ID = null;
let saving = false;
let deleting = false;

function show(el){ if (el) el.style.display = ""; }
function hide(el){ if (el) el.style.display = "none"; }

function setMsg(text, type="info"){
  if (!msgEl) return;
  msgEl.textContent = text || "";
  msgEl.style.color =
    type === "error" ? "rgba(255,120,120,.95)" :
    type === "ok"    ? "rgba(102,242,218,.95)" :
                       "rgba(255,255,255,.70)";
}

function setLoadingSave(isLoading){
  if (!btnSalvar) return;
  btnSalvar.disabled = !!isLoading;
  btnSalvar.style.opacity = isLoading ? "0.78" : "1";
  btnSalvar.textContent = isLoading ? "Salvando..." : "Salvar alterações";
}

function setLoadingDelete(isLoading){
  if (!btnExcluir) return;
  btnExcluir.disabled = !!isLoading;
  btnExcluir.style.opacity = isLoading ? "0.78" : "1";
  btnExcluir.textContent = isLoading ? "Excluindo..." : "Excluir";
}

function onlyDigits(v){ return (v||"").toString().replace(/\D/g,""); }

function formatPhoneBR(v){
  const d = onlyDigits(v).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function maskDateBR(v){
  const d = onlyDigits(v).slice(0, 8);
  if (!d) return "";
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
  return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
}

function isValidDateBR(s){
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return false;
  const [dd, mm, yyyy] = s.split("/").map(Number);
  if (yyyy < 1900 || yyyy > 2100) return false;
  if (mm < 1 || mm > 12) return false;
  const maxDay = new Date(yyyy, mm, 0).getDate();
  return dd >= 1 && dd <= maxDay;
}

function brToISO(s){
  const [dd, mm, yyyy] = s.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

function isoToBR(iso){
  if (!iso) return "";
  const part = iso.toString().slice(0, 10);
  const [y,m,d] = part.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function compareISO(a,b){
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function getParam(name){
  const p = new URLSearchParams(window.location.search);
  return p.get(name);
}

function getNext(){
  return getParam("next") || "/reservas.html";
}

function setBackLinks(){
  const next = getNext();
  if (btnBack) btnBack.href = next;
  if (btnBackNF) btnBackNF.href = next;
}

function waLink(raw){
  const digits = onlyDigits(raw);
  if (!digits || digits.length < 10) return null;
  const ddi = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${ddi}`;
}

function updateWhatsButton(raw){
  const url = waLink(raw);
  if (!btnWhats) return;

  if (!url) {
    hide(btnWhats);
    btnWhats.href = "#";
    return;
  }

  btnWhats.href = url;
  show(btnWhats);
}

function bindMasks(){
  whatsEl?.addEventListener("input", () => {
    whatsEl.value = formatPhoneBR(whatsEl.value);
    updateWhatsButton(whatsEl.value);
  });

  checkinEl?.addEventListener("input", () => {
    checkinEl.value = maskDateBR(checkinEl.value);
  });

  checkoutEl?.addEventListener("input", () => {
    checkoutEl.value = maskDateBR(checkoutEl.value);
  });
}

async function fetchReserva(id){
  // tenta com status
  try {
    const { data, error } = await supabase
      .from("agenda_reservas")
      .select("id, user_id, nome_hospede, whatsapp, checkin, checkout, observacoes, status, created_at")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (e) {
    // fallback sem status
    const { data, error } = await supabase
      .from("agenda_reservas")
      .select("id, user_id, nome_hospede, whatsapp, checkin, checkout, observacoes, created_at")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data ? { ...data, status: "pendente" } : null;
  }
}

function renderReserva(r){
  if (!r) return;

  if (nomeEl) nomeEl.value = r.nome_hospede || "";
  if (whatsEl) whatsEl.value = formatPhoneBR(r.whatsapp || "");
  if (checkinEl) checkinEl.value = isoToBR(r.checkin);
  if (checkoutEl) checkoutEl.value = isoToBR(r.checkout);
  if (obsEl) obsEl.value = r.observacoes || "";

  if (statusEl) {
    const st = (r.status || "pendente").toString().trim().toLowerCase();
    statusEl.value = ["pendente","confirmada","cancelada"].includes(st) ? st : "pendente";
  }

  updateWhatsButton(r.whatsapp || "");

  if (metaEl) {
    const created = r.created_at ? new Date(r.created_at) : null;
    metaEl.textContent = created ? `Criada em ${created.toLocaleString("pt-BR")}` : "";
  }
}

async function updateReserva(id, payload){
  // tenta com status
  try {
    const { error } = await supabase
      .from("agenda_reservas")
      .update(payload)
      .eq("id", id);

    if (error) throw error;
    return true;
  } catch (e) {
    // fallback sem status
    const clone = { ...payload };
    delete clone.status;

    const { error } = await supabase
      .from("agenda_reservas")
      .update(clone)
      .eq("id", id);

    if (error) throw error;
    return true;
  }
}

async function deleteReserva(id){
  const { error } = await supabase
    .from("agenda_reservas")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

async function onSubmit(e){
  e.preventDefault();
  if (saving) return;

  const nome = (nomeEl?.value || "").trim();
  const whatsMasked = (whatsEl?.value || "").trim();
  const whatsDigits = onlyDigits(whatsMasked);
  const checkinBR = (checkinEl?.value || "").trim();
  const checkoutBR = (checkoutEl?.value || "").trim();
  const obs = (obsEl?.value || "").trim();
  const st = (statusEl?.value || "pendente").trim().toLowerCase();

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

  const checkin = brToISO(checkinBR);
  const checkout = brToISO(checkoutBR);

  if (compareISO(checkout, checkin) <= 0) {
    setMsg("Check-out precisa ser depois do check-in.", "error");
    checkoutEl?.focus();
    return;
  }

  if (whatsDigits && whatsDigits.length < 10) {
    setMsg("WhatsApp incompleto. Inclua DDD.", "error");
    whatsEl?.focus();
    return;
  }

  const payload = {
    nome_hospede: nome,
    whatsapp: whatsDigits ? whatsDigits : null,
    checkin,
    checkout,
    observacoes: obs ? obs : null,
    status: st || "pendente",
  };

  try {
    saving = true;
    setLoadingSave(true);
    setMsg("Salvando...", "info");

    await updateReserva(RESERVA_ID, payload);

    setMsg("Salvo ✅", "ok");
    updateWhatsButton(whatsDigits);

  } catch (err) {
    console.error("[reserva] update error:", err);
    setMsg("Erro ao salvar. Verifique RLS/colunas e tente novamente.", "error");
  } finally {
    saving = false;
    setLoadingSave(false);
  }
}

async function onDelete(){
  if (deleting) return;

  const ok = window.confirm("Excluir esta reserva? Essa ação não pode ser desfeita.");
  if (!ok) return;

  try {
    deleting = true;
    setLoadingDelete(true);
    setMsg("Excluindo...", "info");

    await deleteReserva(RESERVA_ID);

    setMsg("Excluída ✅ Voltando…", "ok");
    setTimeout(() => window.location.replace(getNext()), 350);

  } catch (err) {
    console.error("[reserva] delete error:", err);
    setMsg("Erro ao excluir. Verifique RLS e tente novamente.", "error");
  } finally {
    deleting = false;
    setLoadingDelete(false);
  }
}

async function boot(){
  setBackLinks();

  USER = await requireAuth({
    redirectTo: "/entrar.html?next=" + encodeURIComponent(window.location.pathname + window.location.search),
    renderUserInfo: false
  });
  if (!USER) return;

  RESERVA_ID = getParam("id");
  if (!RESERVA_ID) {
    hide(stateLoading);
    hide(stateForm);
    show(stateNotFound);
    return;
  }

  bindMasks();

  try {
    show(stateLoading);
    hide(stateNotFound);
    hide(stateForm);

    const r = await fetchReserva(RESERVA_ID);

    if (!r) {
      hide(stateLoading);
      hide(stateForm);
      show(stateNotFound);
      return;
    }

    renderReserva(r);

    hide(stateLoading);
    hide(stateNotFound);
    show(stateForm);

    form?.addEventListener("submit", onSubmit);
    btnExcluir?.addEventListener("click", onDelete);

    setMsg("Edite e salve. (V1)", "info");

  } catch (err) {
    console.error("[reserva] fetch error:", err);
    hide(stateLoading);
    hide(stateForm);
    show(stateNotFound);
  }
}

boot();
