// /js/home.js — PMS V1.7 (Home operacional + Quartos)
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

/* =========================
   Date helpers
========================= */
function toISODate(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtBR(isoDate) {
  if (!isoDate) return "—";
  const [y, m, d] = String(isoDate).split("-");
  if (!y || !m || !d) return String(isoDate);
  return `${d}/${m}/${y}`;
}

/* =========================
   WhatsApp helpers (contrato)
   DB armazena digits intl sem "+" (ex: 5513997408157)
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

function waLinkFromIntlDigits(intlDigits, text = "") {
  const w = normalizeWhatsappIntl(intlDigits);
  if (!w) return null;
  const qs = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${w}${qs}`;
}

function fmtWhatsappLabel(intlDigits) {
  const w = normalizeWhatsappIntl(intlDigits);
  if (!w) return "sem WhatsApp";

  if (!w.startsWith("55")) return `+${w}`;

  // +55 (DD) XXXXX-XXXX
  if (w.length === 12 || w.length === 13) {
    const ddd = w.slice(2, 4);
    const num = w.slice(4);
    if (num.length === 8) return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
    if (num.length === 9) return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  }
  return `+${w}`;
}

/* =========================
   DOM helpers
========================= */
const byId = (id) => document.getElementById(id);

function setText(id, value) {
  const el = byId(id);
  if (el) el.textContent = String(value ?? "");
}

function setHTML(id, html) {
  const el = byId(id);
  if (el) el.innerHTML = html ?? "";
}

function showEl(id, on = true) {
  const el = byId(id);
  if (el) el.style.display = on ? "" : "none";
}

function setOpsMsg(text) {
  const el = byId("opsMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.display = text ? "block" : "none";
}

/* =========================
   Safe HTML
========================= */
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   Supabase helpers
========================= */
async function countExact(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function fetchRows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/* =========================
   Render: Itens de operação
========================= */
function renderOpItem(r) {
  const id = r.id;
  const nome = r.nome_hospede || "(sem nome)";
  const periodo = `${fmtBR(r.checkin)} → ${fmtBR(r.checkout)}`;
  const obs = r.observacoes ? String(r.observacoes) : "";
  const wppLabel = fmtWhatsappLabel(r.whatsapp);
  const wppLink = waLinkFromIntlDigits(r.whatsapp, `Olá ${nome}! Aqui é da recepção 🙂`);

  return `
    <div class="list-item">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
        <div style="min-width:0;">
          <div style="font-weight:800;">${escapeHtml(nome)}</div>
          <div class="muted small">${escapeHtml(periodo)}${obs ? ` • ${escapeHtml(obs)}` : ""}</div>
          <div class="muted small mono">${escapeHtml(wppLabel)}</div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
          ${wppLink ? `<a class="btn outline small" target="_blank" rel="noopener noreferrer" href="${wppLink}">WhatsApp</a>` : ""}
          <a class="btn outline small" href="/reserva.html?id=${encodeURIComponent(id)}">Abrir</a>
        </div>
      </div>
    </div>
  `;
}

/* =========================
   Render: Quartos (Home)
========================= */
function pill(text, type = "muted") {
  const color =
    type === "ok" ? "rgba(102,242,218,.95)" :
    type === "warn" ? "rgba(255,210,120,.95)" :
    "rgba(255,255,255,.70)";

  return `<span class="pill" style="border-color:rgba(255,255,255,.12);color:${color};">${escapeHtml(text)}</span>`;
}

function roomTitle(room) {
  const codigo = (room.codigo || "").trim();
  const nome = (room.nome || "").trim();
  if (codigo && nome) return `${codigo} • ${nome}`;
  return codigo || nome || "Quarto";
}

function roomMeta(room) {
  const tipo = (room.tipo || "—").trim();
  const cap = (room.capacidade ?? "—");
  return `${tipo} • Cap: ${cap}`;
}

function renderRoomCard(room, occMap) {
  const occ = occMap.get(room.id);
  const isOcc = !!occ;

  const st = isOcc ? pill("Ocupado", "warn") : pill("Livre", "ok");

  const sub = isOcc
    ? `<div class="muted small" style="margin-top:6px;">
         ${escapeHtml(occ.nome_hospede || "Hóspede")} •
         <a class="muted small" href="/reserva.html?id=${encodeURIComponent(occ.id)}">abrir reserva</a>
       </div>`
    : `<div class="muted small" style="margin-top:6px;">sem hóspede agora</div>`;

  return `
    <div class="mini-card" style="display:flex;flex-direction:column;gap:6px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="font-weight:900;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${escapeHtml(roomTitle(room))}
        </div>
        ${st}
      </div>

      <div class="muted small">${escapeHtml(roomMeta(room))}</div>
      ${sub}

      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px;">
        <a class="btn outline small" href="/quartos.html">Editar</a>
        <a class="btn outline small" href="/reservas.html">Reservas</a>
      </div>
    </div>
  `;
}

async function loadRoomsHome(userId, today) {
  const loading = byId("roomsLoading");
  const empty = byId("roomsEmpty");
  const grid = byId("roomsGrid");

  // Se a Home não tiver a seção, sai sem erro
  if (!loading || !empty || !grid) return;

  loading.style.display = "";
  empty.style.display = "none";
  grid.style.display = "none";
  grid.innerHTML = "";

  // 1) Quartos ativos
  let rooms = [];
  try {
    rooms = await fetchRows(
      supabase
        .from("agenda_quartos")
        .select("id, codigo, nome, tipo, capacidade, ordem, ativo, created_at")
        .eq("user_id", userId)
        .eq("ativo", true)
        .order("ordem", { ascending: true })
        .order("codigo", { ascending: true })
    );
  } catch (e) {
    console.error("[home] rooms error:", e);
    loading.style.display = "none";
    empty.style.display = "";
    empty.innerHTML = `<p class="muted">Erro ao carregar quartos.</p>`;
    return;
  }

  if (!rooms.length) {
    loading.style.display = "none";
    empty.style.display = "";
    return;
  }

  // 2) Ocupação "agora" (reserva com quarto_id, checkin <= hoje e checkout > hoje)
  let occRows = [];
  try {
    occRows = await fetchRows(
      supabase
        .from("agenda_reservas")
        .select("id, quarto_id, nome_hospede")
        .eq("user_id", userId)
        .not("quarto_id", "is", null)
        .lte("checkin", today)
        .gt("checkout", today)
        .limit(300)
    );
  } catch (e) {
    // não quebra: mostra tudo como livre
    console.warn("[home] occupancy warning:", e);
    occRows = [];
  }

  const occMap = new Map();
  occRows.forEach((r) => {
    if (r.quarto_id && !occMap.has(r.quarto_id)) occMap.set(r.quarto_id, r);
  });

  // 3) Render
  grid.innerHTML = rooms.map((r) => renderRoomCard(r, occMap)).join("");
  loading.style.display = "none";
  grid.style.display = "grid";
}

/* =========================
   KPIs + Operação
========================= */
async function loadKPIs(userId, today) {
  const [cIn, cOut, cFut, cHosp] = await Promise.all([
    countExact(
      supabase
        .from("agenda_reservas")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("checkin", today)
    ),
    countExact(
      supabase
        .from("agenda_reservas")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("checkout", today)
    ),
    countExact(
      supabase
        .from("agenda_reservas")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gt("checkin", today)
    ),
    countExact(
      supabase
        .from("agenda_reservas")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .lte("checkin", today)
        .gt("checkout", today)
    ),
  ]);

  setText("kpiCheckin", cIn);
  setText("kpiCheckout", cOut);
  setText("kpiFuturas", cFut);
  setText("kpiHospedados", cHosp);

  const totalOps = cIn + cOut;
  setText("kpiOperacao", totalOps ? `${totalOps} ações` : "tranquilo");

  // cards de operação (reusa counts)
  setText("countChegadas", cIn);
  setText("countSaidas", cOut);
  setText("countHospedados", cHosp);

  return { cIn, cOut, cFut, cHosp };
}

async function loadOperationLists(userId, today) {
  showEl("opsLoading", true);
  setOpsMsg("");

  const fields = "id, nome_hospede, whatsapp, checkin, checkout, observacoes, created_at";

  try {
    const [chegadas, saidas, hospedados] = await Promise.all([
      fetchRows(
        supabase
          .from("agenda_reservas")
          .select(fields)
          .eq("user_id", userId)
          .eq("checkin", today)
          .order("created_at", { ascending: false })
          .limit(5)
      ),
      fetchRows(
        supabase
          .from("agenda_reservas")
          .select(fields)
          .eq("user_id", userId)
          .eq("checkout", today)
          .order("created_at", { ascending: false })
          .limit(5)
      ),
      fetchRows(
        supabase
          .from("agenda_reservas")
          .select(fields)
          .eq("user_id", userId)
          .lte("checkin", today)
          .gt("checkout", today)
          .order("checkin", { ascending: false })
          .limit(5)
      ),
    ]);

    // chegadas
    if (!chegadas.length) {
      showEl("emptyChegadas", true);
      setHTML("listChegadas", "");
    } else {
      showEl("emptyChegadas", false);
      setHTML("listChegadas", chegadas.map(renderOpItem).join(""));
    }

    // saídas
    if (!saidas.length) {
      showEl("emptySaidas", true);
      setHTML("listSaidas", "");
    } else {
      showEl("emptySaidas", false);
      setHTML("listSaidas", saidas.map(renderOpItem).join(""));
    }

    // hospedados
    if (!hospedados.length) {
      showEl("emptyHospedados", true);
      setHTML("listHospedados", "");
    } else {
      showEl("emptyHospedados", false);
      setHTML("listHospedados", hospedados.map(renderOpItem).join(""));
    }

    showEl("opsLoading", false);
  } catch (e) {
    console.error("[home] ops error:", e);
    showEl("opsLoading", false);
    setOpsMsg("Erro ao carregar a operação. Recarregue a página.");
  }
}

/* =========================
   Últimas reservas
========================= */
async function loadRecent(userId) {
  const loading = byId("homeLoading");
  const empty = byId("homeEmpty");
  const list = byId("homeList");

  if (loading) loading.style.display = "";
  if (empty) empty.style.display = "none";
  if (list) list.style.display = "none";

  try {
    const rows = await fetchRows(
      supabase
        .from("agenda_reservas")
        .select("id, nome_hospede, whatsapp, checkin, checkout, observacoes, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5)
    );

    if (loading) loading.style.display = "none";

    if (!rows.length) {
      if (empty) empty.style.display = "block";
      if (list) list.style.display = "none";
      return;
    }

    if (empty) empty.style.display = "none";
    if (list) {
      list.style.display = "block";
      list.innerHTML = rows.map(renderOpItem).join("");
    }
  } catch (e) {
    console.error("[home] recent error:", e);
    if (loading) loading.style.display = "none";
    if (empty) {
      empty.style.display = "block";
      empty.innerHTML = `<p class="muted">Erro ao carregar. Recarregue a página.</p>`;
    }
  }
}

/* =========================
   Main
========================= */
async function loadHome() {
  const user = await requireAuth({ redirectTo: "/entrar.html?next=/app.html", renderUserInfo: false });
  if (!user?.id) return;

  const today = toISODate(new Date());
  setText("kpiHojeLabel", fmtBR(today));

  // 1) KPIs
  await loadKPIs(user.id, today);

  // 2) Quartos (se existir seção)
  await loadRoomsHome(user.id, today);

  // 3) Operação do dia (listas)
  await loadOperationLists(user.id, today);

  // 4) Últimas reservas
  await loadRecent(user.id);
}

loadHome();
