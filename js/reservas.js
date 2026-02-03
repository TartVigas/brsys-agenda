// /js/reservas.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

/* =========================
   DOM
========================= */
const elSummary = document.getElementById("summary");
const elQ = document.getElementById("q");
const elMsg = document.getElementById("msg");

const stateLoading = document.getElementById("stateLoading");
const stateEmpty = document.getElementById("stateEmpty");
const stateList = document.getElementById("stateList");
const elList = document.getElementById("list");

const filterBtns = Array.from(document.querySelectorAll("[data-filter]"));

/* =========================
   Helpers
========================= */
const onlyDigits = (s = "") => String(s || "").replace(/\D/g, "");
const esc = (s = "") =>
  String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function setMsg(text = "", type = "info") {
  if (!elMsg) return;
  elMsg.textContent = text || "";
  elMsg.style.display = text ? "block" : "none";
  elMsg.style.color =
    type === "error" ? "rgba(255,120,120,.95)" :
    type === "ok"    ? "rgba(102,242,218,.95)" :
                       "rgba(255,255,255,.70)";
}

function showState(which) {
  if (stateLoading) stateLoading.style.display = which === "loading" ? "" : "none";
  if (stateEmpty) stateEmpty.style.display = which === "empty" ? "" : "none";
  if (stateList) stateList.style.display = which === "list" ? "" : "none";
}

function todayISO() {
  // local (BR) em YYYY-MM-DD (sem timezone bug)
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtBRDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/* WhatsApp: DB = 55..., UI = (DD) 99999-9999 */
function normalizeWhatsappTo55(raw) {
  const d = onlyDigits(raw);
  if (!d) return "";
  if (d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
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
  if (!d) return "—";
  const br = d.startsWith("55") ? d.slice(2) : d; // remove 55 p/ exibir
  if (br.length < 10) return br;

  const ddd = br.slice(0, 2);
  const num = br.slice(2);

  if (num.length === 9) return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  return `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
}

function toWaLinkFrom55(phone55, text = "") {
  const w = normalizeWhatsappTo55(phone55);
  if (!validateWhatsapp55(w)) return null;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${w}${q}`;
}

function periodLabel(checkin, checkout) {
  return `${fmtBRDate(checkin)} — ${fmtBRDate(checkout)}`;
}

/* =========================
   State
========================= */
let USER = null;
let ALL = [];          // tudo do DB
let FILTERED = [];     // depois de filtro+busca
let currentFilter = "all"; // all | today | future | past

/* =========================
   Query DB
========================= */
async function fetchReservas() {
  showState("loading");
  setMsg("");

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;

  const user_id = authData?.user?.id;
  if (!user_id) throw new Error("Sessão expirada. Faça login novamente.");

  // traz o necessário (contrato V1)
  const { data, error } = await supabase
    .from("agenda_reservas")
    .select("id,user_id,nome_hospede,whatsapp,checkin,checkout,observacoes,created_at,updated_at")
    .eq("user_id", user_id)
    .order("checkin", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;

  ALL = Array.isArray(data) ? data : [];
}

/* =========================
   Filtro + Busca
========================= */
function applyFilterAndSearch() {
  const t = todayISO();
  const q = (elQ?.value || "").trim().toLowerCase();
  const qDigits = onlyDigits(q);

  const base = ALL.filter((r) => {
    const ci = r.checkin || "";
    const co = r.checkout || "";

    if (currentFilter === "today") {
      return ci === t || co === t; // “Hoje” = chega ou sai hoje
    }
    if (currentFilter === "future") {
      return ci > t;
    }
    if (currentFilter === "past") {
      return co < t;
    }
    return true;
  });

  const searched = base.filter((r) => {
    if (!q) return true;

    const nome = String(r.nome_hospede || "").toLowerCase();
    const wa55 = normalizeWhatsappTo55(r.whatsapp || "");
    const waDigits = onlyDigits(wa55);

    // se o cara digitou números, busca no whatsapp
    if (qDigits) return waDigits.includes(qDigits);

    // senão busca por nome e também por whatsapp em texto
    return nome.includes(q) || waDigits.includes(onlyDigits(q));
  });

  FILTERED = searched;
}

/* =========================
   Render
========================= */
function renderSummary() {
  if (!elSummary) return;
  const total = ALL.length;
  const shown = FILTERED.length;

  const d = new Date();
  const br = d.toLocaleDateString("pt-BR");

  elSummary.textContent = `Mostrando ${shown} de ${total} • Hoje: ${br}`;
}

function renderList() {
  if (!elList) return;

  if (!FILTERED.length) {
    // Se existe ALL mas filtro/busca zerou, mantemos LIST e mostramos msg
    if (ALL.length) {
      showState("list");
      elList.innerHTML = `
        <div class="muted">
          Nenhuma reserva encontrada com esse filtro/busca.
        </div>
      `;
      renderSummary();
      return;
    }

    showState("empty");
    return;
  }

  showState("list");

  const t = todayISO();

  elList.innerHTML = FILTERED.map((r) => {
    const id = r.id;
    const nome = r.nome_hospede || "—";
    const ci = r.checkin || "";
    const co = r.checkout || "";
    const obs = r.observacoes || "";
    const wa55 = normalizeWhatsappTo55(r.whatsapp || "");
    const waPretty = formatWhatsappBRFrom55(wa55);

    const isToday = (ci === t || co === t);
    const isFuture = (ci > t);
    const tag = isToday ? "Hoje" : isFuture ? "Futura" : "Passada";

    const waLink = toWaLinkFrom55(wa55, `Olá ${nome}! Aqui é da recepção 🙂`) || "#";
    const waDisabled = waLink === "#";

    return `
      <article class="card" style="margin-top:12px;">
        <div class="row" style="align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="min-width:220px;">
            <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap;">
              <h3 class="h2" style="margin:0;font-size:18px;">${esc(nome)}</h3>
              <span class="pill">${esc(tag)}</span>
            </div>

            <div class="muted small" style="margin-top:6px;">
              Período: <strong>${esc(periodLabel(ci, co))}</strong>
            </div>

            <div class="muted small" style="margin-top:6px;">
              WhatsApp: <span class="mono">${esc(waPretty)}</span>
            </div>

            ${obs ? `<div class="muted small" style="margin-top:8px;">Obs: ${esc(obs)}</div>` : ""}
          </div>

          <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center;">
            <a class="btn outline" ${waDisabled ? `style="opacity:.55;pointer-events:none;"` : ""} href="${esc(waLink)}" target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
            <a class="btn primary" href="/reserva.html?id=${encodeURIComponent(id)}">Abrir</a>
          </div>
        </div>
      </article>
    `;
  }).join("");

  renderSummary();
}

function setActiveFilterBtn() {
  filterBtns.forEach((b) => {
    const on = b.dataset.filter === currentFilter;
    b.classList.toggle("primary", on); // se seu CSS usar .btn.primary
    b.classList.toggle("outline", !on);
  });
}

/* =========================
   Events
========================= */
function bindEvents() {
  // busca
  elQ?.addEventListener("input", () => {
    applyFilterAndSearch();
    renderList();
  });

  // filtros
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter || "all";
      setActiveFilterBtn();
      applyFilterAndSearch();
      renderList();
    });
  });
}

/* =========================
   Boot
========================= */
(async function boot() {
  USER = await requireAuth({ redirectTo: "/entrar.html?next=/reservas.html", renderUserInfo: false });
  if (!USER) return;

  try {
    await fetchReservas();
    bindEvents();
    setActiveFilterBtn();
    applyFilterAndSearch();
    renderList();

    if (!ALL.length) showState("empty");
  } catch (err) {
    console.error("[reservas] boot error:", err);
    showState("list");
    setMsg(err?.message || "Erro ao carregar reservas. Verifique conexão/RLS.", "error");
    if (elList) elList.innerHTML = `<div class="muted">Não foi possível carregar.</div>`;
    if (elSummary) elSummary.textContent = "—";
  }
})();
