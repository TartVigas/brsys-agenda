import { supabase } from "/js/supabase.js";
import { requireAuth } from "/js/auth.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

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

function show(which) {
  if (elLoading) elLoading.style.display = which === "loading" ? "" : "none";
  if (elEmpty) elEmpty.style.display = which === "empty" ? "" : "none";
  if (elListWrap) elListWrap.style.display = which === "list" ? "" : "none";
}

function pad2(n){ return String(n).padStart(2,"0"); }
function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function formatDateBR(iso) {
  if (!iso || typeof iso !== "string") return "—";
  const [y,m,d] = iso.split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

function normalizePhoneBR(raw) {
  const s = String(raw || "").replace(/\D/g, "");
  if (!s) return "";
  if (s.startsWith("55")) return s;
  if (s.length === 10 || s.length === 11) return `55${s}`; // DDD+numero
  return s;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * status lógico para filtro e pill
 * - today: checkin==hoje OR checkout==hoje OR (checkin<hoje && checkout>hoje)  -> "Hoje/Em andamento" (aqui usamos today pra dar prioridade)
 * - future: checkin>hoje
 * - past: checkout<hoje OR status encerrada
 */
function statusFrom(r) {
  const stDb = (r.status || "").toLowerCase();
  if (stDb.includes("encerr")) return { key: "past", label: "Encerrada" };

  const t = todayISO();
  const ci = r.checkin || r.checkin_date || "";
  const co = r.checkout || r.checkout_date || "";

  // Se estiver rolando (entre datas) ou bate em hoje
  if ((ci && ci === t) || (co && co === t) || (ci && co && ci < t && co > t)) {
    // diferencia label
    if (ci < t && co > t) return { key: "today", label: "Em andamento" };
    return { key: "today", label: "Hoje" };
  }

  if (ci && ci > t) return { key: "future", label: "Futura" };

  // fallback: se checkout já passou
  if (co && co < t) return { key: "past", label: "Passada" };

  return { key: "all", label: "Ativa" };
}

function roomLabel(quarto) {
  if (!quarto) return "Sem quarto";
  const codigo = (quarto.codigo || "").trim();
  const nome = (quarto.nome || "").trim();
  if (codigo && nome) return `${codigo} • ${nome}`;
  if (codigo) return codigo;
  if (nome) return nome;
  return "Quarto";
}

function buildCard(r) {
  const guest = (r.nome_hospede || r.guest_name || "").trim() || "Hóspede";
  const whats = r.whatsapp || r.guest_whatsapp || "";
  const phone = normalizePhoneBR(whats);
  const wa = phone ? `https://wa.me/${phone}` : "";

  const ci = r.checkin || r.checkin_date || "";
  const co = r.checkout || r.checkout_date || "";

  const st = statusFrom(r);
  const room = roomLabel(r.agenda_quartos || r.quarto || r.quartos);

  const notes = (r.observacoes || r.notes || "").trim();

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

      <div class="row" style="gap:10px;flex-wrap:wrap;">
        ${wa ? `<a class="btn outline small" href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
        <a class="btn primary small" href="/reserva.html?id=${encodeURIComponent(r.id)}">Abrir</a>
      </div>
    </div>
  `;

  // Clique no card abre (mas não interfere nos links)
  const open = () => (window.location.href = `/reserva.html?id=${encodeURIComponent(r.id)}`);
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

function applyUIActiveFilterButtons() {
  $$("button[data-filter]").forEach((b) => {
    const v = b.getAttribute("data-filter");
    // mantém teu visual: troca outline -> primary no ativo
    if (v === FILTER) {
      b.classList.remove("outline");
      if (!b.classList.contains("primary")) b.classList.add("primary");
    } else {
      b.classList.remove("primary");
      if (!b.classList.contains("outline")) b.classList.add("outline");
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
      return name.includes(q) || wa.includes(q);
    });
  }

  // Ordenação: hoje/em andamento primeiro, depois futuras, depois passadas
  const weight = { today: 0, future: 1, past: 2, all: 9 };
  out = out.slice().sort((a, b) => {
    const sa = statusFrom(a).key;
    const sb = statusFrom(b).key;
    const wa = weight[sa] ?? 9;
    const wb = weight[sb] ?? 9;
    if (wa !== wb) return wa - wb;

    const cia = (a.checkin || a.checkin_date || "");
    const cib = (b.checkin || b.checkin_date || "");
    return String(cia).localeCompare(String(cib));
  });

  return out;
}

function render() {
  applyUIActiveFilterButtons();

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
    if (elMsg) elMsg.textContent = "Nada encontrado com esse filtro/busca.";
    return;
  } else {
    if (elMsg) elMsg.textContent = "";
  }

  list.forEach((r) => elList.appendChild(buildCard(r)));
}

async function load() {
  show("loading");
  if (elMsg) elMsg.textContent = "";
  if (elSummary) elSummary.textContent = "Carregando…";

  // garante auth (tu já tem guard no HTML, mas aqui fica blindado)
  USER = await requireAuth({ redirectTo: "/entrar.html?next=/reservas.html", renderUserInfo: false });

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
      updated_at,
      agenda_quartos:quarto_id (
        id,
        codigo,
        nome
      )
    `)
    .eq("user_id", USER.id)
    .order("checkin", { ascending: true });

  if (error) {
    console.error(error);
    if (elMsg) elMsg.textContent = "Erro ao carregar reservas.";
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
}

function bind() {
  // filtro
  $$("button[data-filter]").forEach((b) => {
    b.addEventListener("click", () => {
      FILTER = b.getAttribute("data-filter") || "all";
      render();
    });
  });

  // busca
  elQ?.addEventListener("input", () => render());
}

bind();
load();
