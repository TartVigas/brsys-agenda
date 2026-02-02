import { supabase } from "./supabase.js";

/* =========================
   Utils: segurança básica
========================= */
function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

/* =========================
   Utils: Datas BR ⇄ ISO
   Aceita:
   - 05022026
   - 05/02/2026
   - 05-02-2026
========================= */
function normalizeBRDate(value) {
  if (!value) return null;

  const digits = String(value).replace(/\D/g, "").slice(0, 8);
  if (digits.length !== 8) return null;

  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);

  return `${d}/${m}/${y}`;
}

function isValidBRDate(br) {
  // br = DD/MM/AAAA
  if (!br) return false;
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yy = Number(m[3]);

  if (yy < 1900 || yy > 2100) return false;
  if (mm < 1 || mm > 12) return false;

  const daysInMonth = new Date(yy, mm, 0).getDate(); // mm=1..12 ok
  if (dd < 1 || dd > daysInMonth) return false;

  return true;
}

function brToISO(value) {
  // retorna YYYY-MM-DD ou null
  const br = normalizeBRDate(value);
  if (!br || !isValidBRDate(br)) return null;

  const [d, m, y] = br.split("/");
  return `${y}-${m}-${d}`;
}

function isoToBR(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

/* =========================
   Elements
========================= */
const modal = document.getElementById("modalBackdrop");
const form = document.getElementById("formReserva");
const btnCancel = document.getElementById("cancelar");

const stateLoading = document.getElementById("stateLoading");
const stateEmpty = document.getElementById("stateEmpty");
const stateList = document.getElementById("stateList");
const listEl = document.getElementById("list");

const inputCheckin = document.getElementById("checkin");
const inputCheckout = document.getElementById("checkout");

/* =========================
   State UI
========================= */
function show(which) {
  if (!stateLoading || !stateEmpty || !stateList) return;

  stateLoading.style.display = which === "loading" ? "" : "none";
  stateEmpty.style.display = which === "empty" ? "" : "none";
  stateList.style.display = which === "list" ? "" : "none";
}

/* =========================
   Modal
========================= */
function openModal() {
  modal?.classList.remove("hidden");
}
function closeModal() {
  modal?.classList.add("hidden");
  form?.reset();
}

document.getElementById("btnNew")?.addEventListener("click", openModal);
document.getElementById("btnNew2")?.addEventListener("click", openModal);
btnCancel?.addEventListener("click", closeModal);

// fechar ao clicar fora do modal (opcional, elegante)
modal?.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

/* =========================
   Máscara de data BR (input)
========================= */
function maskDateInput(el) {
  if (!el) return;

  el.addEventListener("input", () => {
    let v = el.value.replace(/\D/g, "").slice(0, 8);

    if (v.length >= 5) el.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
    else if (v.length >= 3) el.value = `${v.slice(0, 2)}/${v.slice(2)}`;
    else el.value = v;
  });

  // ao sair do campo, normaliza pra DD/MM/AAAA se tiver 8 dígitos
  el.addEventListener("blur", () => {
    const n = normalizeBRDate(el.value);
    if (n) el.value = n;
  });
}

maskDateInput(inputCheckin);
maskDateInput(inputCheckout);

/* =========================
   Load Reservas
========================= */
async function loadReservas() {
  show("loading");

  const { data, error } = await supabase
    .from("reservas")
    .select("*")
    .order("checkin", { ascending: true });

  if (error) {
    console.error("[reservas] select error:", error);
    show("empty");
    return;
  }

  if (!data || data.length === 0) {
    show("empty");
    return;
  }

  if (listEl) {
    listEl.innerHTML = data.map((r) => `
      <article class="item">
        <strong>${escapeHtml(r.nome)}</strong>
        <div class="muted small">
          ${escapeHtml(isoToBR(r.checkin))} → ${escapeHtml(isoToBR(r.checkout))}
          ${r.whatsapp ? " • " + escapeHtml(r.whatsapp) : ""}
        </div>
      </article>
    `).join("");
  }

  show("list");
}

/* =========================
   Submit (Insert)
========================= */
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nome = form.nome.value.trim();
  const whatsapp = form.whatsapp.value.trim();
  const checkinBR = form.checkin.value;
  const checkoutBR = form.checkout.value;
  const obs = form.obs.value.trim();

  if (!nome) {
    alert("Preencha o nome do hóspede.");
    return;
  }

  const checkin = brToISO(checkinBR);
  const checkout = brToISO(checkoutBR);

  if (!checkin || !checkout) {
    alert("Data inválida. Use DD/MM/AAAA.");
    return;
  }

  // comparação ISO funciona (YYYY-MM-DD)
  if (checkout < checkin) {
    alert("Check-out não pode ser antes do check-in.");
    return;
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    console.error("[auth] getUser error:", userErr);
    alert("Sessão não encontrada. Faça login novamente.");
    window.location.href = "/entrar.html";
    return;
  }

  const payload = {
    user_id: userData.user.id,
    nome,
    whatsapp: whatsapp || null,
    checkin,
    checkout,
    obs: obs || null,
  };

  const { error } = await supabase.from("reservas").insert(payload);

  if (error) {
    console.error("[reservas] insert error:", error);
    alert("Erro ao salvar reserva. Veja o console.");
    return;
  }

  closeModal();
  await loadReservas();
});

/* =========================
   Boot
========================= */
loadReservas();
