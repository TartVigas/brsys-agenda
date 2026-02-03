// /js/reserva-nova.js — cria reserva (V1) + vincula quarto_id (V2 ready)
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
  if (btn) {
    btn.disabled = !!on;
    btn.textContent = on ? "Salvando..." : "Salvar reserva";
  }
}

/* =========================
   WhatsApp helpers (contrato)
   DB armazena digits intl sem "+"
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

/* =========================
   Date helpers (DD/MM/YYYY -> YYYY-MM-DD)
========================= */
function isValidISODate(iso) {
  // espera YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(n => parseInt(n, 10));
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  // checagem real (Date)
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
   Input mask (DD/MM/AAAA)
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
    opt.textContent = `${q.codigo} • ${q.nome}${cap}`;
    sel.appendChild(opt);
  });
}

/* =========================
   Form actions
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

  // validações
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
    quarto_id, // 👈 vínculo com quarto (se existir no schema)
  };
}

async function insertReserva(payload) {
  // tenta inserir com quarto_id (se a coluna existir)
  const { data, error } = await supabase
    .from("agenda_reservas")
    .insert(payload)
    .select("id")
    .single();

  if (!error) return data?.id;

  // fallback: se ainda NÃO criou a coluna quarto_id no banco, a insert vai falhar
  // com “column agenda_reservas.quarto_id does not exist”
  const msg = String(error?.message || "");
  const isMissingColumn = msg.toLowerCase().includes("quarto_id") && msg.toLowerCase().includes("does not exist");
  if (!isMissingColumn) throw error;

  // reenvia sem quarto_id
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
   Boot
========================= */
(async function boot() {
  const user = await requireAuth({
    redirectTo: "/entrar.html?next=/reserva-nova.html",
    renderUserInfo: false,
  });
  if (!user) return;

  // máscaras de data
  maskBRDateInput($("#checkin"));
  maskBRDateInput($("#checkout"));

  // carrega quartos
  await loadQuartos(user.id);

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

      // abre a reserva (tela de edição/detalhe)
      window.location.href = `/reserva.html?id=${encodeURIComponent(id)}`;
    } catch (err) {
      console.error("[reserva-nova] submit error:", err);
      setMsg(err?.message || "Erro ao salvar. Veja o Console (F12).", "error");
    } finally {
      setBusy(false);
    }
  });

  // prefill (opcional): se vier ?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&quarto=uuid
  try {
    const url = new URL(window.location.href);
    const ci = url.searchParams.get("checkin");
    const co = url.searchParams.get("checkout");
    const q = url.searchParams.get("quarto");
    if (ci && isValidISODate(ci) && $("#checkin")) $("#checkin").value = isoToBR(ci);
    if (co && isValidISODate(co) && $("#checkout")) $("#checkout").value = isoToBR(co);
    if (q && $("#quartoId")) $("#quartoId").value = q;
  } catch {}
})();
