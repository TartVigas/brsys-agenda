import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const elLoading = $("#stateLoading");
const elEmpty = $("#stateEmpty");
const elGridWrap = $("#stateGrid");
const elGrid = $("#grid");
const elSummary = $("#summary");
const elMsg = $("#msg");
const elQ = $("#q");

let USER = null;
let ROOMS = [];
let RELEVANT = []; // reservas relevantes (ativas/hoje/futuras)
let VIEW = [];     // cards montados
let FILTER = "all"; // all | free | occ | today

function show(which) {
  if (elLoading) elLoading.style.display = which === "loading" ? "" : "none";
  if (elEmpty) elEmpty.style.display = which === "empty" ? "" : "none";
  if (elGridWrap) elGridWrap.style.display = which === "grid" ? "" : "none";
}

function pad2(n){ return String(n).padStart(2,"0"); }
function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function formatBR(iso){
  if (!iso) return "—";
  const [y,m,d] = String(iso).split("-");
  if (!y||!m||!d) return String(iso);
  return `${d}/${m}/${y}`;
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

function waLink(raw, text="") {
  const p = normalizePhoneBR(raw);
  if (!p) return "";
  return `https://wa.me/${p}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

function pill(label, tone="muted") {
  const color =
    tone === "ok"   ? "rgba(102,242,218,.95)" :
    tone === "warn" ? "rgba(255,210,120,.95)" :
    tone === "bad"  ? "rgba(255,120,120,.95)" :
    "rgba(255,255,255,.70)";
  return `<span class="pill" style="border-color:rgba(255,255,255,.12);color:${color};">${escapeHtml(label)}</span>`;
}

function roomLabel(r) {
  const codigo = (r.codigo || "").trim();
  const nome = (r.nome || "").trim();
  if (codigo && nome) return `${codigo} • ${nome}`;
  return codigo || nome || "Quarto";
}

/**
 * Para cada quarto, a gente calcula:
 * - active: reserva ativa (ocupado agora)
 * - outToday: checkout hoje
 * - inToday: checkin hoje
 * - next: próxima reserva futura (menor checkin > hoje)
 */
function buildRoomState(room, today, byRoom) {
  const list = byRoom.get(room.id) || [];

  // ativa: checkin <= hoje && checkout > hoje
  const active = list.find(r => r.checkin <= today && r.checkout > today) || null;

  // sai hoje: checkout == hoje
  const outToday = list.find(r => r.checkout === today) || null;

  // entra hoje: checkin == hoje
  const inToday = list.find(r => r.checkin === today) || null;

  // próxima futura: menor checkin > hoje
  const futures = list.filter(r => r.checkin > today).sort((a,b) => String(a.checkin).localeCompare(String(b.checkin)));
  const next = futures[0] || null;

  // status principal (ordem de prioridade)
  if (active) {
    return {
      key: "occ",
      label: "Ocupado",
      tone: "warn",
      hint: `até ${formatBR(active.checkout)}`,
      ref: active
    };
  }
  if (outToday) {
    return {
      key: "today",
      label: "Sai hoje",
      tone: "warn",
      hint: `checkout ${formatBR(outToday.checkout)}`,
      ref: outToday
    };
  }
  if (inToday) {
    return {
      key: "today",
      label: "Entra hoje",
      tone: "ok",
      hint: `check-in ${formatBR(inToday.checkin)}`,
      ref: inToday
    };
  }
  if (next) {
    return {
      key: "free",
      label: "Reservado",
      tone: "muted",
      hint: `próximo ${formatBR(next.checkin)}`,
      ref: next
    };
  }

  return {
    key: "free",
    label: "Livre",
    tone: "ok",
    hint: "sem previsão",
    ref: null
  };
}

function applyUIActiveFilterButtons() {
  $$("button[data-filter]").forEach((b) => {
    const v = b.getAttribute("data-filter");
    if (v === FILTER) {
      b.classList.remove("outline");
      if (!b.classList.contains("primary")) b.classList.add("primary");
    } else {
      b.classList.remove("primary");
      if (!b.classList.contains("outline")) b.classList.add("outline");
    }
  });
}

function buildCard(room, st) {
  const title = roomLabel(room);
  const metaParts = [];
  if (room.tipo) metaParts.push(room.tipo);
  if (room.capacidade != null) metaParts.push(`Cap: ${room.capacidade}`);
  const meta = metaParts.join(" • ") || "—";

  const ref = st.ref;
  const guest = ref?.nome_hospede ? String(ref.nome_hospede).trim() : "";
  const phone = ref?.whatsapp || "";
  const wpp = phone ? waLink(phone, `Olá ${guest || "tudo bem"}! Aqui é da recepção 🙂`) : "";

  // ações:
  const aOpen = ref?.id ? `/reserva.html?id=${encodeURIComponent(ref.id)}` : "";
  const aNew = `/reserva-nova.html?quarto_id=${encodeURIComponent(room.id)}`;
  const aWalk = `/reserva-nova.html?quarto_id=${encodeURIComponent(room.id)}&walkin=1`;

  const canWalkIn = (st.label === "Livre" || st.label === "Reservado"); // V1: walk-in permitido até em "reservado" (se quiser bloquear, eu mudo)
  const walkText = st.label === "Reservado" ? "Walk-in (forçar)" : "Walk-in";

  const html = `
    <div class="mini-card" style="display:flex;flex-direction:column;gap:8px;">
      <div class="row" style="align-items:flex-start;justify-content:space-between;gap:10px;">
        <div style="min-width:0;">
          <div style="font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(title)}
          </div>
          <div class="muted small" style="margin-top:6px;">${escapeHtml(meta)}</div>
        </div>
        ${pill(st.label, st.tone)}
      </div>

      <div class="muted small">
        <span class="mono">${escapeHtml(st.hint)}</span>
        ${guest ? ` • <strong>${escapeHtml(guest)}</strong>` : ""}
      </div>

      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px;">
        ${aOpen ? `<a class="btn outline small" href="${aOpen}">Abrir</a>` : ""}
        <a class="btn outline small" href="${aNew}">Nova</a>
        ${canWalkIn ? `<a class="btn primary small" href="${aWalk}">${escapeHtml(walkText)}</a>` : ""}
        ${wpp ? `<a class="btn outline small" href="${wpp}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
      </div>
    </div>
  `;

  return { room, st, html };
}

function filterView(list) {
  const q = (elQ?.value || "").trim().toLowerCase();

  let out = list;

  if (FILTER !== "all") {
    if (FILTER === "occ") out = out.filter(x => x.st.key === "occ");
    if (FILTER === "free") out = out.filter(x => x.st.key === "free");
    if (FILTER === "today") out = out.filter(x => x.st.key === "today" || x.st.label === "Sai hoje" || x.st.label === "Entra hoje");
  }

  if (q) {
    out = out.filter(x => {
      const t = `${x.room.codigo || ""} ${x.room.nome || ""} ${x.room.tipo || ""}`.toLowerCase();
      return t.includes(q);
    });
  }

  // ordenação: ocupados -> hoje -> livres
  const weight = (x) => {
    if (x.st.key === "occ") return 0;
    if (x.st.key === "today") return 1;
    if (x.st.label === "Reservado") return 2;
    return 3;
  };
  out = out.slice().sort((a,b) => weight(a) - weight(b));

  return out;
}

function render() {
  applyUIActiveFilterButtons();

  const out = filterView(VIEW);

  if (elSummary) {
    const t = todayISO();
    const free = VIEW.filter(x => x.st.key === "free").length;
    const occ = VIEW.filter(x => x.st.key === "occ").length;
    const today = VIEW.filter(x => x.st.key === "today").length;
    elSummary.textContent = `${VIEW.length} quartos • ${occ} ocupados • ${today} hoje • ${free} livres • ${formatBR(t)}`;
  }

  if (!VIEW.length) {
    show("empty");
    return;
  }

  show("grid");
  if (elGrid) elGrid.innerHTML = "";

  if (!out.length) {
    if (elMsg) elMsg.textContent = "Nada encontrado com esse filtro/busca.";
    return;
  } else {
    if (elMsg) elMsg.textContent = "";
  }

  out.forEach(x => {
    const wrap = document.createElement("div");
    wrap.innerHTML = x.html;
    elGrid.appendChild(wrap.firstElementChild);
  });
}

async function load() {
  show("loading");
  if (elMsg) elMsg.textContent = "";
  if (elSummary) elSummary.textContent = "Carregando…";

  USER = await requireAuth({ redirectTo: "/entrar.html?next=/mapa.html", renderUserInfo: false });
  const today = todayISO();

  // 1) quartos ativos
  const { data: rooms, error: rErr } = await supabase
    .from("agenda_quartos")
    .select("id, user_id, codigo, nome, tipo, capacidade, ordem, ativo")
    .eq("user_id", USER.id)
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .order("codigo", { ascending: true });

  if (rErr) {
    console.error(rErr);
    show("empty");
    if (elSummary) elSummary.textContent = "Erro ao carregar quartos";
    return;
  }

  ROOMS = Array.isArray(rooms) ? rooms : [];
  if (!ROOMS.length) {
    show("empty");
    if (elSummary) elSummary.textContent = "0 quartos";
    return;
  }

  // 2) reservas relevantes (ativas/hoje + próximas)
  // V1: puxa uma janela de futuro (ex.: 60 dias) para dar “previsão” sem pesar
  const futureEnd = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  })();

  const { data: resv, error: eResv } = await supabase
    .from("agenda_reservas")
    .select("id, user_id, quarto_id, nome_hospede, whatsapp, checkin, checkout, status")
    .eq("user_id", USER.id)
    .not("quarto_id", "is", null)
    .gte("checkout", today)          // pega ativas e sai hoje
    .lte("checkin", futureEnd)       // janela futura
    .order("checkin", { ascending: true })
    .limit(2000);

  if (eResv) {
    console.warn("[mapa] reservas warning:", eResv);
  }

  RELEVANT = Array.isArray(resv) ? resv : [];

  // index por quarto
  const byRoom = new Map();
  RELEVANT.forEach(r => {
    if (!r.quarto_id) return;
    if (!byRoom.has(r.quarto_id)) byRoom.set(r.quarto_id, []);
    byRoom.get(r.quarto_id).push(r);
  });

  // 3) monta cards
  VIEW = ROOMS.map(room => {
    const st = buildRoomState(room, today, byRoom);
    return buildCard(room, st);
  });

  render();
}

function bind() {
  $$("button[data-filter]").forEach((b) => {
    b.addEventListener("click", () => {
      FILTER = b.getAttribute("data-filter") || "all";
      render();
    });
  });

  elQ?.addEventListener("input", () => render());
}

bind();
load();
