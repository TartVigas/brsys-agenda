// /js/reservas.js
import { supabase } from "/js/supabase.js";
import { requireAuth } from "/js/auth.js";

/* =========================================================
   Reservas — Agenda BRsys (V2)
   - Carrega reservas SEM join (robusto)
   - Carrega quartos em 2ª query (por IDs)
   - UI: segmented (seg-btn), busca, summary
   - Debug opcional: ?debug=1
   ========================================================= */

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

const elLoading = $("#stateLoading");
const elEmpty = $("#stateEmpty");
const elListWrap = $("#stateList");
const elList = $("#list");
const elSummary = $("#summary");
const elMsg = $("#msg");
const elQ = $("#q");
const elSort = $("#sort"); // opcional (pode estar display:none no HTML)

let USER = null;
let ALL = [];
let FILTER = "all"; // all | today | future | past
let SORT = "checkin_asc"; // checkin_asc | checkin_desc | updated_desc

const qs = new URLSearchParams(location.search);
const DEBUG = qs.get("debug") === "1";

/* =========================
   UI helpers
========================= */
function show(which) {
  if (elLoading) elLoading.style.display = which === "loading" ? "" : "none";
  if (elEmpty) elEmpty.style.display = which === "empty" ? "" : "none";
  if (elListWrap) elListWrap.style.display = which === "list" ? "" : "none";
}

function setMsg(text = "", type = "info") {
  if (!elMsg) return;
  elMsg.textContent = text || "";
  elMsg.style.color =
    type === "error" ? "rgba(255,120,120,.92)" :
    type === "ok" ? "rgba(120,255,200,.92)" :
    "rgba(255,255,255,.75)";
}

/* =========================
   Date / format helpers
========================= */
function pad2(n) { return String(n).padStart(2, "0"); }

/**
 * ISO local (YYYY-MM-DD) — consistente com colunas date do Postgres
 */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDateBR(iso) {
  if (!iso || typeof iso !== "string") return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizePhoneBR(raw) {
  const s = String(raw || "").replace(/\D/g, "");
  if (!s) return "";
  if (s.startsWith("55")) return s;
  if (s.length === 10 || s.length === 11) return `55${s}`;
  return s;
}

/* =========================
   Status logic
========================= */
/**
 * status lógico para filtro e pill:
 * - today: entra hoje OR sai hoje OR (ci < hoje && co > hoje)
 * - future: ci > hoje
 * - past: co < hoje OR status encerrada/cancelada
 */
function statusFrom(r) {
  const stDb = (r.status || "").toLowerCase();
  if (stDb.includes("encerr")) return { key: "past", label: "Encerrada" };
  if (stDb.includes("cancel")) return { key: "past", label: "Cancelada" };

  const t = todayISO();
  const ci = r.checkin || r.checkin_date || "";
  const co = r.checkout || r.checkout_date || "";

  // hospedado agora
  if (ci && co && ci < t && co > t) return { key: "today", label: "Em andamento" };

  // hoje (entra ou sai)
  if ((ci && ci === t) || (co && co === t)) return { key: "today", label: "Hoje" };

  if (ci && ci > t) return { key: "future", label: "Futura" };
  if (co && co < t) return { key: "past", label: "Passada" };

  return { key: "all", label: "Ativa" };
}

/* =========================
   Room label
========================= */
function roomLabel(quarto) {
  if (!quarto) return "Sem quarto";
  const codigo = (quarto.codigo || "").trim();
  const nome = (quarto.nome || "").trim();
  if (codigo && nome) return `${codigo} • ${nome}`;
  if (codigo) return codigo;
  if (nome) return nome;
  return "Quarto";
}

/* =========================
   Card builder
========================= */
function buildCard(r) {
  const guest = (r.nome_hospede || r.guest_name || "").trim() || "Hóspede";
  const whatsRaw = r.whatsapp || r.guest_whatsapp || "";
  const phone = normalizePhoneBR(whatsRaw);
  const wa = phone ? `https://wa.me/${phone}` : "";

  const ci = r.checkin || r.checkin_date || "";
  const co = r.checkout || r.checkout_date || "";

  const st = statusFrom(r);
  const room = roomLabel(r._quartoObj);
  const notes = (r.observacoes || r.notes || "").trim();

  const id = r.id;
  const reservaUrl = `/reserva.html?id=${encodeURIComponent(id)}`;
  const contaUrl = `${reservaUrl}#conta`; // prepara “pagamento antecipado / conta” no futuro

  const card = document.createElement("article");
  card.className = "card";
  card.style.marginTop = "12px";
  card.setAttribute("role", "button");
  card.tabIndex = 0;

  card.innerHTML = `
    <div class="row" style="align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div style="min-width:220px;">
        <div class="row" style="align-items:center;gap:10px;flex-wrap:wrap;">
          <div class="h2" style="margin:0;">${escapeHtml(guest)}</div>
          <span class="pill">${escapeHtml(st.label)}</span>
        </div>

        <div class="muted small" style="margin-top:6px;">
          <span class="mono">${escapeHtml(room)}</span>
          <span style="opacity:.6"> • </span>
          <span>${escapeHtml(formatDateBR(ci))} → ${escapeHtml(formatDateBR(co))}</span>
        </div>

        ${notes ? `<div class="muted small" style="margin-top:10px;">${escapeHtml(notes)}</div>` : ""}
      </div>

      <div class="row" style="gap:10px;flex-wrap:wrap;justify-content:flex-end;">
        ${wa ? `<a class="btn outline small" href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
        <a class="btn outline small" href="${contaUrl}" title="Conta / pré-pagamento">Conta</a>
        <a class="btn primary small" href="${reservaUrl}">Abrir</a>
      </div>
    </div>
  `;

  const open = () => (window.location.href = reservaUrl);

  card.addEventListener("click", (e) => {
    const target = e.target;
    if (target && target.closest && target.closest("a")) return;
    open();
  });

  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });

  return card;
}

/* =========================
   UI segmented active
========================= */
function setSegActive(value) {
  const btns = $$('button[data-filter]');
  btns.forEach((b) => {
    const v = b.getAttribute("data-filter") || "all";
    const on = v === value;

    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
}

/* =========================
   Filter + sort
========================= */
function getSearchText() {
  return (elQ?.value || "").trim().toLowerCase();
}

function matchesQuery(r, q) {
  if (!q) return true;
  const name = String(r.nome_hospede || r.guest_name || "").toLowerCase();
  const wa = String(r.whatsapp || r.guest_whatsapp || "").toLowerCase();
  const room = String(roomLabel(r._quartoObj) || "").toLowerCase();
  const notes = String(r.observacoes || r.notes || "").toLowerCase();
  return (
    name.includes(q) ||
    wa.includes(q) ||
    room.includes(q) ||
    notes.includes(q)
  );
}

function sortKeyDate(v) {
  // mantém string ISO comparável; se vazio, joga pro fim
  return v && typeof v === "string" ? v : "9999-12-31";
}

function filterAndSort(list) {
  const q = getSearchText();
  let out = list;

  if (FILTER !== "all") {
    out = out.filter((r) => statusFrom(r).key === FILTER);
  }

  if (q) {
    out = out.filter((r) => matchesQuery(r, q));
  }

  // ordena por prioridade de status + checkin
  const weight = { today: 0, future: 1, past: 2, all: 9 };

  out = out.slice().sort((a, b) => {
    const sa = statusFrom(a).key;
    const sb = statusFrom(b).key;
    const wa = weight[sa] ?? 9;
    const wb = weight[sb] ?? 9;
    if (wa !== wb) return wa - wb;

    const cia = a.checkin || a.checkin_date || "";
    const cib = b.checkin || b.checkin_date || "";

    if (SORT === "checkin_desc") return sortKeyDate(cib).localeCompare(sortKeyDate(cia));
    if (SORT === "updated_desc") {
      const ua = a.updated_at || "";
      const ub = b.updated_at || "";
      return String(ub).localeCompare(String(ua));
    }

    // default checkin_asc
    return sortKeyDate(cia).localeCompare(sortKeyDate(cib));
  });

  return out;
}

/* =========================
   Render
========================= */
function render() {
  setSegActive(FILTER);

  const list = filterAndSort(ALL);

  if (elSummary) {
    elSummary.textContent = `${list.length} reserva(s) exibidas • ${ALL.length} no total`;
  }

  if (!ALL.length) {
    show("empty");
    return;
  }

  show("list");
  if (elList) elList.innerHTML = "";

  if (!list.length) {
    setMsg("Nada encontrado com esse filtro/busca.", "info");
    return;
  }

  setMsg("", "info");
  list.forEach((r) => elList.appendChild(buildCard(r)));
}

/* =========================
   Errors
========================= */
function logSbError(ctx, error) {
  if (!error) return;

  const payload = {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
  };

  console.error(`[${ctx}]`, payload);

  if (DEBUG) {
    setMsg(
      `Erro (${ctx}): ${payload.message || "—"}${payload.code ? ` • code=${payload.code}` : ""}`,
      "error"
    );
  }
}

/* =========================
   Supabase load
========================= */
async function loadReservasBase(userId) {
  const { data, error } = await supabase
    .from("agenda_reservas")
    .select(`
      id,
      user_id,
      nome_hospede,
      whatsapp,
      checkin,
      checkout,
      observacoes,
      status,
      quarto_id,
      updated_at
    `)
    .eq("user_id", userId)
    .order("checkin", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function loadQuartosMapByIds(userId, quartoIds) {
  if (!quartoIds?.length) return new Map();

  const { data, error } = await supabase
    .from("agenda_quartos")
    .select("id,codigo,nome")
    .eq("user_id", userId)
    .in("id", quartoIds);

  if (error) throw error;

  const map = new Map();
  (data || []).forEach((q) => map.set(q.id, q));
  return map;
}

async function enrichReservasWithQuartos(userId, reservas) {
  const ids = Array.from(new Set(reservas.map((r) => r.quarto_id).filter(Boolean)));

  reservas.forEach((r) => (r._quartoObj = null));
  if (!ids.length) return reservas;

  const quartosMap = await loadQuartosMapByIds(userId, ids);
  reservas.forEach((r) => {
    r._quartoObj = r.quarto_id ? (quartosMap.get(r.quarto_id) || null) : null;
  });

  return reservas;
}

async function load() {
  show("loading");
  setMsg("");
  if (elSummary) elSummary.textContent = "Carregando…";

  try {
    USER = await requireAuth({
      redirectTo: "/entrar.html?next=/reservas.html",
      renderUserInfo: false,
    });

    if (!USER?.id) {
      setMsg("Sessão inválida. Faça login novamente.", "error");
      show("empty");
      return;
    }

    const reservas = await loadReservasBase(USER.id);

    if (!reservas.length) {
      ALL = [];
      show("empty");
      if (elSummary) elSummary.textContent = "0 reservas";
      return;
    }

    // enriquecer com quartos (se falhar, segue sem derrubar)
    try {
      await enrichReservasWithQuartos(USER.id, reservas);
    } catch (e) {
      logSbError("load_quartos", e);
      reservas.forEach((r) => (r._quartoObj = null));
    }

    ALL = reservas;
    render();
  } catch (e) {
    logSbError("load_reservas", e);
    setMsg("Erro ao carregar reservas.", "error");
    show("empty");
    if (elSummary) elSummary.textContent = "—";
  }
}

/* =========================
   Bind events
========================= */
function bind() {
  // filtros
  $$('button[data-filter]').forEach((b) => {
    b.addEventListener("click", () => {
      FILTER = b.getAttribute("data-filter") || "all";
      render();
    });
  });

  // busca
  let t = null;
  elQ?.addEventListener("input", () => {
    // debounce leve pra não renderizar a cada tecla muito rápido
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => render(), 60);
  });

  // sort (opcional)
  if (elSort) {
    // se existir, mostra
    elSort.style.display = "";
    elSort.value = SORT;
    elSort.addEventListener("change", () => {
      SORT = elSort.value || "checkin_asc";
      render();
    });
  }
}

bind();
load();
