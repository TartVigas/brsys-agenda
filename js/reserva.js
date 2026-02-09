// /js/reserva.js — Lista de reservas (V1.4 - DAY USE + JOIN SAFE + UI SEGMENTED)
// - DAY USE: permite checkin == checkout e conta como "Hoje" quando checkin==hoje
// - JOIN SAFE: evita PGRST201 (sem embed de relacionamento). Faz 2 queries e junta no JS.
// - UI: suporta botões segmentados (.seg-btn / .seg-btn.active) OU fallback (.btn.primary)

import { supabase } from "/js/supabase.js";
import { requireAuth } from "/js/auth.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

const elLoading = $("#stateLoading");
const elEmpty = $("#stateEmpty");
const elListWrap = $("#stateList");
const elList = $("#list");
const elSummary = $("#summary");
const elMsg = $("#msg");
const elQ = $("#q");

let USER = null;
let ALL = [];
let FILTER = "all"; // all | today | future | past
let ROOMS_MAP = new Map(); // quarto_id -> {id,codigo,nome}

const qs = new URLSearchParams(location.search);
const DEBUG = qs.get("debug") === "1";

/* =========================
   UI state
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

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   Date helpers
========================= */
function pad2(n) { return String(n).padStart(2, "0"); }

function todayISO() {
  // ISO local (YYYY-MM-DD) — consistente com coluna date do Postgres
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDateBR(iso) {
  if (!iso || typeof iso !== "string") return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/* =========================
   Phone helpers
========================= */
function onlyDigits(s = "") { return String(s || "").replace(/\D/g, ""); }

function normalizePhoneTo55(raw) {
  const d = onlyDigits(raw);
  if (!d) return "";
  if (d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`; // DDD+numero
  return d; // deixa como está (se vier internacional diferente)
}

/* =========================
   Room helpers
========================= */
function getRoomById(quartoId) {
  if (!quartoId) return null;
  return ROOMS_MAP.get(quartoId) || null;
}

function roomLabel(room) {
  if (!room) return "Sem quarto";
  const codigo = (room.codigo || "").trim();
  const nome = (room.nome || "").trim();
  if (codigo && nome) return `${codigo} • ${nome}`;
  if (codigo) return codigo;
  if (nome) return nome;
  return "Quarto";
}

/* =========================
   Status lógico (DAY USE)
========================= */
/**
 * Regras:
 * - past:
 *   - status DB finalizado/cancelado/encerrado OR checkout < hoje
 * - today:
 *   - checkin == hoje (inclui day-use ci==co==hoje)
 *   - OR (checkin < hoje AND checkout >= hoje) -> em andamento (inclui checkout==hoje)
 * - future:
 *   - checkin > hoje
 */
function statusFrom(r) {
  const stDb = String(r.status || "").toLowerCase();
  if (stDb.includes("cancel")) return { key: "past", label: "Cancelada" };
  if (stDb.includes("final")) return { key: "past", label: "Finalizada" };
  if (stDb.includes("encerr")) return { key: "past", label: "Encerrada" };

  const t = todayISO();
  const ci = String(r.checkin || r.checkin_date || "");
  const co = String(r.checkout || r.checkout_date || "");

  // futura
  if (ci && ci > t) return { key: "future", label: "Futura" };

  // hoje: chegada hoje (inclui day-use)
  if (ci && ci === t) return { key: "today", label: "Hoje" };

  // em andamento: começou antes e termina hoje ou depois (inclui co==hoje)
  if (ci && co && ci < t && co >= t) return { key: "today", label: "Em andamento" };

  // passada: checkout antes de hoje
  if (co && co < t) return { key: "past", label: "Passada" };

  return { key: "all", label: "Ativa" };
}

/* =========================
   Cards
========================= */
function buildCard(r) {
  const guest = (r.nome_hospede || r.guest_name || "").trim() || "Hóspede";

  const phone55 = normalizePhoneTo55(r.whatsapp || r.guest_whatsapp || "");
  const wa = phone55 ? `https://wa.me/${phone55}` : "";

  const ci = r.checkin || r.checkin_date || "";
  const co = r.checkout || r.checkout_date || "";

  const st = statusFrom(r);
  const room = roomLabel(getRoomById(r.quarto_id));
  const notes = (r.observacoes || r.notes || "").trim();

  const reservaUrl = `/reserva.html?id=${encodeURIComponent(r.id)}`;
  const contaUrl = `${reservaUrl}#conta`; // prepara "pagamento antecipado" via conta

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
    if (e.target && e.target.closest && e.target.closest("a")) return;
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
   Filters + render
========================= */
function setActiveFilterUI() {
  const btns = $$("button[data-filter]");

  // se você estiver usando UI segmentada (.seg-btn), marcamos via .active
  const isSegmented = btns.some((b) => b.classList.contains("seg-btn"));

  btns.forEach((b) => {
    const v = b.getAttribute("data-filter") || "all";
    const on = v === FILTER;

    if (isSegmented) {
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    } else {
      // fallback: seu estilo antigo (primary/outline)
      if (on) {
        b.classList.remove("outline");
        if (!b.classList.contains("primary")) b.classList.add("primary");
      } else {
        b.classList.remove("primary");
        if (!b.classList.contains("outline")) b.classList.add("outline");
      }
    }
  });
}

function filterData(list) {
  const q = (elQ?.value || "").trim().toLowerCase();
  let out = list;

  if (FILTER !== "all") {
    out = out.filter((r) => statusFrom(r).key === FILTER);
  }

  if (q) {
    out = out.filter((r) => {
      const name = String(r.nome_hospede || r.guest_name || "").toLowerCase();
      const wa = String(r.whatsapp || r.guest_whatsapp || "").toLowerCase();
      const room = String(roomLabel(getRoomById(r.quarto_id)) || "").toLowerCase();
      const notes = String(r.observacoes || r.notes || "").toLowerCase();
      return name.includes(q) || wa.includes(q) || room.includes(q) || notes.includes(q);
    });
  }

  // Ordenação: today/em andamento primeiro, depois futuras, depois passadas; desempate por checkin
  const weight = { today: 0, future: 1, past: 2, all: 9 };
  out = out.slice().sort((a, b) => {
    const sa = statusFrom(a).key;
    const sb = statusFrom(b).key;
    const wa = weight[sa] ?? 9;
    const wb = weight[sb] ?? 9;
    if (wa !== wb) return wa - wb;

    const cia = String(a.checkin || a.checkin_date || "");
    const cib = String(b.checkin || b.checkin_date || "");
    return cia.localeCompare(cib);
  });

  return out;
}

function render() {
  setActiveFilterUI();

  const list = filterData(ALL);

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
   Load (JOIN SAFE)
========================= */
function logSbError(ctx, error) {
  if (!error) return;
  console.error(`[reservas] ${ctx}`, {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
  });

  if (DEBUG) {
    setMsg(
      `Erro (${ctx}): ${error.message || "—"}${error.code ? ` • code=${error.code}` : ""}`,
      "error"
    );
  }
}

async function loadRooms(userId) {
  const { data, error } = await supabase
    .from("agenda_quartos")
    .select("id,codigo,nome,ativo")
    .eq("user_id", userId)
    .eq("ativo", true);

  if (error) {
    logSbError("loadRooms", error);
    ROOMS_MAP = new Map();
    return;
  }

  ROOMS_MAP = new Map((data || []).map((q) => [q.id, q]));
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
    if (!USER?.id) return;

    // rooms primeiro (pra label)
    await loadRooms(USER.id);

    // reservas sem embed (evita PGRST201)
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
      .eq("user_id", USER.id)
      .order("checkin", { ascending: true });

    if (error) {
      logSbError("loadReservas", error);
      setMsg("Erro ao carregar reservas.", "error");
      show("empty");
      return;
    }

    ALL = Array.isArray(data) ? data : [];

    if (!ALL.length) {
      show("empty");
      if (elSummary) elSummary.textContent = "0 reservas";
      return;
    }

    render();
  } catch (e) {
    console.error("[reservas] load crash:", e);
    setMsg("Erro ao carregar reservas.", "error");
    show("empty");
  }
}

/* =========================
   Bind UI
========================= */
function bind() {
  $$("button[data-filter]").forEach((b) => {
    b.addEventListener("click", () => {
      FILTER = b.getAttribute("data-filter") || "all";
      render();
    });
  });

  // debounce leve na busca
  let t = null;
  elQ?.addEventListener("input", () => {
    if (t) clearTimeout(t);
    t = setTimeout(render, 60);
  });
}

bind();
load();
