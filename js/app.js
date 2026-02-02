// js/app.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

/* =========================
   Helpers
========================= */
const $ = (id) => document.getElementById(id);

function show(el, on = true) {
  if (!el) return;
  el.style.display = on ? "" : "none";
}

function setState(name) {
  show($("stateLoading"), name === "loading");
  show($("stateEmpty"), name === "empty");
  show($("stateList"), name === "list");
}

function onlyDigits(v) {
  return String(v || "").replace(/\D+/g, "");
}

function waLink(phone) {
  const digits = onlyDigits(phone);

  // aceita: 13xxxxxxxxx (11) ou 5513xxxxxxxxx (13)
  if (!digits) return null;

  let full = digits;
  if (digits.length === 11) full = "55" + digits;        // DDD + número
  if (digits.length === 10) full = "55" + digits;        // fixo antigo (ok)
  if (digits.length === 13 && digits.startsWith("55")) full = digits;

  // se ficar muito curto, não cria link
  if (full.length < 12) return null;

  return `https://wa.me/${full}`;
}

// DD/MM/AAAA -> YYYY-MM-DD (date)
function brToISODate(br) {
  const s = String(br || "").trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  // valida real (ex: 31/02)
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (
    d.getUTCFullYear() !== yyyy ||
    d.getUTCMonth() !== (mm - 1) ||
    d.getUTCDate() !== dd
  ) return null;

  const pad = (n) => String(n).padStart(2, "0");
  return `${yyyy}-${pad(mm)}-${pad(dd)}`;
}

// YYYY-MM-DD -> DD/MM/AAAA
function isoToBR(iso) {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function escapeHTML(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   UI: modal
========================= */
const modalBackdrop = $("modalBackdrop");
const formReserva = $("formReserva");

function openModal() {
  if (!modalBackdrop) return;
  modalBackdrop.classList.remove("hidden");
  $("nome")?.focus();
}

function closeModal() {
  if (!modalBackdrop) return;
  modalBackdrop.classList.add("hidden");
  formReserva?.reset();
}

// fecha clicando fora
modalBackdrop?.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

$("cancelar")?.addEventListener("click", closeModal);
$("btnNew")?.addEventListener("click", openModal);
$("btnNew2")?.addEventListener("click", openModal);

/* =========================
   Supabase: CRUD
========================= */

// ajuste aqui se sua tabela tiver nomes diferentes
const TABLE = "agenda_reservas";

// Campos que vamos usar no V1
const SELECT_FIELDS = `
  id,
  nome_hospede,
  whatsapp,
  checkin,
  checkout,
  observacoes,
  created_at
`;

async function fetchReservas(userId) {
  // V1: lista do usuário
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_FIELDS)
    .eq("user_id", userId)
    .order("checkin", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function createReserva(userId, payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert([{ user_id: userId, ...payload }])
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

/* =========================
   Render
========================= */
function renderList(rows) {
  const list = $("list");
  if (!list) return;

  if (!rows || rows.length === 0) {
    list.innerHTML = "";
    return;
  }

  list.innerHTML = rows
    .map((r) => {
      const nome = escapeHTML(r.nome_hospede || "—");
      const whats = escapeHTML(r.whatsapp || "");
      const inBr = isoToBR(r.checkin);
      const outBr = isoToBR(r.checkout);

      const link = waLink(r.whatsapp);
      const waBtn = link
        ? `<a class="btn outline small" href="${link}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`
        : `<button class="btn outline small" disabled title="Sem WhatsApp válido">WhatsApp</button>`;

      const obs = r.observacoes ? `<div class="muted small" style="margin-top:6px;">${escapeHTML(r.observacoes)}</div>` : "";

      return `
        <div class="card" style="padding:14px;margin-bottom:10px;">
          <div class="row" style="align-items:flex-start;gap:12px;">
            <div style="flex:1;">
              <div class="small"><strong>${nome}</strong></div>
              <div class="muted small">Check-in: <span class="mono">${inBr}</span> • Check-out: <span class="mono">${outBr}</span></div>
              ${whats ? `<div class="muted small">WhatsApp: <span class="mono">${whats}</span></div>` : ""}
              ${obs}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
              ${waBtn}
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

/* =========================
   Boot
========================= */
(async function boot() {
  try {
    setState("loading");

    // guarda + pega user
    const user = await requireAuth({ redirectTo: "/entrar.html", renderUserInfo: false });
    if (!user) return;

    // preenche email no topo
    const email = user.email || "(sem e-mail)";
    const elEmail = $("userEmail");
    if (elEmail) elEmail.textContent = email;

    // lista
    const rows = await fetchReservas(user.id);

    if (!rows.length) {
      setState("empty");
      return;
    }

    renderList(rows);
    setState("list");
  } catch (err) {
    console.error("[app] boot error:", err);
    // se der erro, cai no empty mas você vê no console
    setState("empty");
  }
})();

/* =========================
   Form submit
========================= */
formReserva?.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    // revalida sessão
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      window.location.replace("/entrar.html?next=/app.html");
      return;
    }

    const nome = ($("nome")?.value || "").trim();
    const whatsapp = ($("whatsapp")?.value || "").trim();
    const checkinBR = ($("checkin")?.value || "").trim();
    const checkoutBR = ($("checkout")?.value || "").trim();
    const obs = ($("obs")?.value || "").trim();

    if (!nome) {
      alert("Informe o nome do hóspede.");
      $("nome")?.focus();
      return;
    }

    const checkin = brToISODate(checkinBR);
    const checkout = brToISODate(checkoutBR);

    if (!checkin) {
      alert("Check-in inválido. Use DD/MM/AAAA.");
      $("checkin")?.focus();
      return;
    }
    if (!checkout) {
      alert("Check-out inválido. Use DD/MM/AAAA.");
      $("checkout")?.focus();
      return;
    }

    if (checkout < checkin) {
      alert("Check-out não pode ser antes do check-in.");
      $("checkout")?.focus();
      return;
    }

    setState("loading");

    await createReserva(userId, {
      nome_hospede: nome,
      whatsapp: whatsapp || null,
      checkin,
      checkout,
      observacoes: obs || null,
    });

    closeModal();

    // recarrega lista
    const rows = await fetchReservas(userId);

    if (!rows.length) {
      setState("empty");
      return;
    }

    renderList(rows);
    setState("list");
  } catch (err) {
    console.error("[app] createReserva error:", err);
    alert("Erro ao salvar. Tente novamente.");
    setState("list");
  }
});
