// js/reservas.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

let CURRENT_USER = null;
let ALL = [];
let FILTER = "all"; // all | today | future

function toISODate(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtBR(isoDate) {
  if (!isoDate) return "—";
  const [y, m, d] = String(isoDate).split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

function onlyDigits(v) {
  return (v || "").toString().replace(/\D/g, "");
}

function normalizeText(v) {
  return (v || "").toString().trim().toLowerCase();
}

function setState(which) {
  const loading = document.getElementById("stateLoading");
  const empty = document.getElementById("stateEmpty");
  const list = document.getElementById("stateList");

  if (loading) loading.style.display = which === "loading" ? "block" : "none";
  if (empty) empty.style.display = which === "empty" ? "block" : "none";
  if (list) list.style.display = which === "list" ? "block" : "none";
}

function setActiveFilter(filterKey) {
  FILTER = filterKey;
  document.querySelectorAll(".seg-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.filter === filterKey);
  });
}

function applyFilterAndSearch() {
  const qEl = document.getElementById("q");
  const queryRaw = qEl ? qEl.value : "";
  const q = normalizeText(queryRaw);
  const qDigits = onlyDigits(queryRaw);

  const today = toISODate(new Date());

  let rows = [...ALL];

  // filtro por período
  if (FILTER === "today") {
    rows = rows.filter((r) => r.checkin === today || r.checkout === today);
  } else if (FILTER === "future") {
    rows = rows.filter((r) => r.checkin && r.checkin > today);
  }

  // busca por nome ou whatsapp
  if (q) {
    rows = rows.filter((r) => {
      const nome = normalizeText(r.nome_hospede);
      const whats = onlyDigits(r.whatsapp);
      const obs = normalizeText(r.observacoes);

      if (nome.includes(q)) return true;
      if (obs.includes(q)) return true;

      if (qDigits && whats.includes(qDigits)) return true;
      return false;
    });
  }

  renderList(rows);
}

function renderList(rows) {
  const list = document.getElementById("stateList");
  if (!rows || rows.length === 0) {
    setState("empty");
    if (list) list.innerHTML = "";
    return;
  }

  setState("list");

  list.innerHTML = rows.map((r) => {
    const nome = r.nome_hospede || "(sem nome)";
    const w = onlyDigits(r.whatsapp);
    const linkWpp = w ? `https://wa.me/55${w}` : null;

    const periodo = `${fmtBR(r.checkin)} → ${fmtBR(r.checkout)}`;
    const obs = r.observacoes ? `<div class="muted small">${r.observacoes}</div>` : "";

    // status visual mínimo (se existir no futuro)
    const status = r.status ? `<span class="pill">${r.status}</span>` : "";

    return `
      <div class="list-item">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div style="min-width:0;">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <div style="font-weight:900;">${nome}</div>
              ${status}
            </div>
            <div class="muted small">${periodo}</div>
            ${w ? `<div class="muted small mono">+55 ${w}</div>` : `<div class="muted small">sem WhatsApp</div>`}
            ${obs}
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            ${linkWpp ? `<a class="btn outline small" target="_blank" rel="noopener noreferrer" href="${linkWpp}">WhatsApp</a>` : ""}
            <a class="btn outline small" href="/reserva.html?id=${encodeURIComponent(r.id)}">Editar</a>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function fetchReservas() {
  setState("loading");

  try {
    const { data, error } = await supabase
      .from("agenda_reservas")
      .select("id, user_id, nome_hospede, whatsapp, checkin, checkout, observacoes, status, created_at")
      .eq("user_id", CURRENT_USER.id)
      .order("checkin", { ascending: true });

    if (error) throw error;

    ALL = data || [];
    applyFilterAndSearch();
  } catch (e) {
    console.error("[reservas] fetch error:", e);
    ALL = [];
    setState("empty");
  }
}

function bindUI() {
  // busca
  const q = document.getElementById("q");
  q?.addEventListener("input", () => applyFilterAndSearch());

  // filtros
  document.querySelectorAll(".seg-btn").forEach((b) => {
    b.addEventListener("click", () => {
      setActiveFilter(b.dataset.filter || "all");
      applyFilterAndSearch();
    });
  });

  // reload
  document.getElementById("btnReload")?.addEventListener("click", () => fetchReservas());
}

(async function boot() {
  CURRENT_USER = await requireAuth({ redirectTo: "/entrar.html?next=/reservas.html", renderUserInfo: false });
  if (!CURRENT_USER) return;

  bindUI();
  await fetchReservas();
})();
