// /js/reserva-nova.js — cria reserva (V1.7)
// - suporta query: ?quarto_id=UUID (novo) OU ?quarto=UUID (legado)
// - suporta query: ?walkin=1 -> preenche checkin=hoje, checkout=amanhã
// - mantém contrato WhatsApp: DB armazena digits intl sem "+": 5513997408157

import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

const $ = (sel, root = document) => root.querySelector(sel);

/* =========================
   UI helpers
========================= */
function setMsg(text = "", type = "info") {
  const el = $("#msg");
  if (!el) return;

  el.textContent = text || "";
  el.style.color =
    type === "error" ? "rgba(255,120,120,.95)" :
    type === "ok"    ? "rgba(102,242,218,.95)" :
                       "rgba(255,255,255,.70)";
}

function setBusy(on) {
  const btn = $("#btnSalvar");
  if (!btn) return;
  btn.disabled = !!on;
  btn.textContent = on ? "Salvando..." : "Salvar reserva";
}

/* =========================
   Helpers: digits / WhatsApp
========================= */
function onlyDigits(v = "") {
  return String(v).replace(/\D/g, "");
}

function normalizeWhatsappIntl(raw) {
  const d = onlyDigits(raw);
  if (!d) return "";
  if (d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

// máscara visual simples: (DD) 9xxxx-xxxx / (DD) xxxx-xxxx
function maskBRPhoneInput(el) {
  if (!el) return;
  el.addEventListener("input", () => {
    const d = onlyDigits(el.value).slice(0, 11);
    if (!d) { el.value = ""; return; }
    // tenta formatar como BR (sem +55 na tela, só DDD+num)
    // se usuário digitou 55..., remove pro display
    const local = d.startsWith("55") ? d.slice(2) : d;
    const ddd = local.slice(0, 2);
    const num = local.slice(2);

    if (num.length <= 8) {
      // fixo
      const a = num.slice(0, 4);
      const b = num.slice(4, 8);
      el.value = `(${ddd}) ${a}${b ? "-" + b : ""}`.trim();
      return;
    } else {
      // celular 9 dígitos
      const a = num.slice(0, 5);
      const b = num.slice(5, 9);
      el.value = `(${ddd}) ${a}${b ? "-" + b : ""}`.trim();
      return;
    }
  });
}

/* =========================
   Date helpers
========================= */
function pad2(n) { return String(n).padStart(2, "0"); }

function isoTodayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoAddDays(iso, days = 1) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const dt = new Date(`${iso}T00:00:00`);
  dt.setDate(dt.getDate() + Number(days || 0));
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function isValidISODate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(n => parseInt(n, 10));
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(`${iso}T00:00:00`);
  return dt.getFullYear() === y && (dt.getMonth() + 1) === m && dt.getDate() === d;
}

function brToISO(br) {
  const s = String(br || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const dd = m[1], mm = m[2], yyyy = m[3];
  const iso = `${yyyy}-${mm}-${dd}`;
  return isValidISODate(iso) ? iso : "";
}

function isoToBR(iso) {
  const s = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/* =========================
   Input mask: DD/MM/AAAA
========================= */
function maskBRDateInput(el) {
  if (!el) return;
  el.addEventListener("input", () => {
    const d = onlyDigits(el.value).slice(0, 8);
    let out = "";
    if (d.length >= 1) out = d.slice(0, 2);
    if (d.length >= 3) out = `${d.slice(0, 2)}/${d.slice(2, 4)}`;
    if (d.length >= 5) out = `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}`;
    el.value = out;
  });
}

/* =========================
   Rooms
========================= */
async function loadQuartos(userId) {
  const sel = $("#quartoId");
  if (!sel) return;

  sel.innerHTML = `<option value="">(sem quarto)</option>`;

  const { data, error } = await supabase
    .from("agenda_quartos")
    .select("id,codigo,nome,tipo,capacidade,ordem,ativo")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .order("codigo", { ascending: true });

  if (error) {
    console.error("[reserva-nova] loadQuartos error:", error);
    setMsg("Não consegui carregar os quartos. Confira RLS/tabela.", "error");
    return;
  }

  (data || []).forEach((q) => {
    const opt = document.createElement("option");
    opt.value = q.id;
    const cap = q.capacidade ? ` • cap ${q.capacidade}` : "";
    opt.textContent = `${q.codigo || ""} • ${q.nome || "Quarto"}${cap}`.trim();
    sel.appendChild(opt);
  });
}

/* =========================
   Form
========================= */
function clearForm() {
  $("#nome") && ($("#nome").value = "");
  $("#whatsapp") && ($("#whatsapp").value = "");
  $("#checkin") && ($("#checkin").value = "");
  $("#checkout") && ($("#checkout").value = "");
  $("#obs") && ($("#obs").value = "");
  $("#quartoId") && ($("#quartoId").value = "");
  setMsg("");
}

function getFormPayload(userId) {
  const nome_hospede = ($("#nome")?.value || "").trim();
  const whatsappRaw = ($("#whatsapp")?.value || "").trim();
  const checkinBR = ($("#checkin")?.value || "").trim();
  const checkoutBR = ($("#checkout")?.value || "").trim();
  const observacoes = ($("#obs")?.value || "").trim();
  const quarto_id = ($("#quartoId")?.value || "").trim() || null;

  const checkin = brToISO(checkinBR);
  const checkout = brToISO(checkoutBR);
  const whatsapp = normalizeWhatsappIntl(whatsappRaw) || null;

  if (!nome_hospede) throw new Error("Informe o nome do hóspede.");
  if (!checkin) throw new Error("Check-in inválido. Use DD/MM/AAAA.");
  if (!checkout) throw new Error("Check-out inválido. Use DD/MM/AAAA.");
  if (checkout <= checkin) throw new Error("Check-out precisa ser maior que o check-in.");

  return {
    user_id: userId,
    nome_hospede,
    whatsapp,
    checkin,
    checkout,
    observacoes: observacoes || null,
    quarto_id,
  };
}

async function insertReserva(payload) {
  const { data, error } = await supabase
    .from("agenda_reservas")
    .insert(payload)
    .select("id")
    .single();

  if (!error) return data?.id;

  // fallback (caso coluna quarto_id ainda não exista)
  const msg = String(error?.message || "").toLowerCase();
  const isMissingColumn = msg.includes("quarto_id") && msg.includes("does not exist");
  if (!isMissingColumn) throw error;

  const { quarto_id, ...payloadNoRoom } = payload;
  const { data: d2, error: e2 } = await supabase
    .from("agenda_reservas")
    .insert(payloadNoRoom)
    .select("id")
    .single();

  if (e2) throw e2;
  return d2?.id;
}

/* =========================
   Prefill from URL
   - ?checkin=YYYY-MM-DD
   - ?checkout=YYYY-MM-DD
   - ?quarto_id=UUID (novo)
   - ?quarto=UUID (legado)
   - ?walkin=1 -> preenche hoje/amanhã (se campos vazios)
========================= */
function applyPrefillFromURL() {
  try {
    const url = new URL(window.location.href);

    const ci = url.searchParams.get("checkin");
    const co = url.searchParams.get("checkout");

    const quartoIdNew = url.searchParams.get("quarto_id");
    const quartoIdOld = url.searchParams.get("quarto");
    const quartoId = (quartoIdNew || quartoIdOld || "").trim();

    const walkin = url.searchParams.get("walkin") === "1";

    // datas
    if (walkin) {
      const today = isoTodayLocal();
      const tomorrow = isoAddDays(today, 1);

      const inEl = $("#checkin");
      const outEl = $("#checkout");

      // só preenche se estiver vazio (não briga com usuário)
      if (inEl && !inEl.value) inEl.value = isoToBR(today);
      if (outEl && !outEl.value) outEl.value = isoToBR(tomorrow);

      // sugestão leve na obs se estiver vazia
      const obsEl = $("#obs");
      if (obsEl && !obsEl.value) obsEl.value = "Walk-in";
    } else {
      if (ci && isValidISODate(ci) && $("#checkin")) $("#checkin").value = isoToBR(ci);
      if (co && isValidISODate(co) && $("#checkout")) $("#checkout").value = isoToBR(co);
    }

    // quarto (não seta aqui ainda se a lista não carregou; guardamos)
    return { quartoId };
  } catch {
    return { quartoId: "" };
  }
}

/* =========================
   Boot
========================= */
(async function boot() {
  const user = await requireAuth({
    redirectTo: "/entrar.html?next=/reserva-nova.html",
    renderUserInfo: false,
  });
  if (!user) return;

  // máscaras
  maskBRDateInput($("#checkin"));
  maskBRDateInput($("#checkout"));
  maskBRPhoneInput($("#whatsapp"));

  // prefill (pega quartoId para aplicar após carregar select)
  const { quartoId } = applyPrefillFromURL();

  // carrega quartos
  await loadQuartos(user.id);

  // aplica quarto após carregar options
  if (quartoId && $("#quartoId")) {
    $("#quartoId").value = quartoId;
  }

  // limpar
  $("#btnLimpar")?.addEventListener("click", () => clearForm());

  // submit
  $("#formReserva")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      setBusy(true);
      setMsg("Validando…", "info");

      const payload = getFormPayload(user.id);

      setMsg("Salvando…", "info");
      const id = await insertReserva(payload);

      setMsg("Reserva criada ✅", "ok");
      window.location.href = `/reserva.html?id=${encodeURIComponent(id)}`;
    } catch (err) {
      console.error("[reserva-nova] submit error:", err);
      setMsg(err?.message || "Erro ao salvar. Veja o Console (F12).", "error");
    } finally {
      setBusy(false);
    }
  });
})();
