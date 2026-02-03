// /js/home.js — PMS V1.6 (Home operacional + Quartos)
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

/* =========================
   Date helpers
========================= */
function toISODate(d = new Date()) {
  // YYYY-MM-DD (sem timezone drama)
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
  // Se já vier 55..., mantém. Se vier DDD+numero, prefixa 55.
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

  // Exibe +55 (13) 99740-8157 (quando possível)
  if (!w.startsWith("55") || (w.length !== 12 && w.length !== 13)) {
    return `+${w}`;
  }

  const ddd = w.slice(2, 4);
  const num = w.slice(4);

  // 8 ou 9 dígitos
  if (num.length === 8) return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  if (num.length === 9) return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;

  return `+${w}`;
}

/* =========================
   UI helpers (consistentes)
========================= */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function showEl(id, on = true) {
  const el = document.getElementById(id);
  if (el) el.style.display = on ? "" : "none";
}

function setOpsMsg(text) {
  const el = document.getElementById("opsMsg");
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
   Render: Operação / Reservas
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

function renderRecentItem(r) {
  return renderOpItem(r);
}

/* =========================
   Render: Quartos (Home)
========================= */
function pill(text, type = "muted") {
  // type: ok | warn | muted
  const color =
    type === "ok" ? "rgba(102,242,218,.95)" :
    type === "warn" ? "rgba(255,210,120,.95)" :
    "rgba(255,255,255,.70)";

  return `<span class="pill" style="border-color:rgba(255,255,255,.12);color:${color};">${escapeHtml(text)}</span>`;
}

function renderRoomCard(room, occMap) {
  const occ = occMap.get(room.id); // { id, nome_hospede, whatsapp, quarto_id }

  const title = `${escapeHtml(room.codigo || "")} • ${escapeHtml(room.nome || "Quarto")}`;
  const meta = `${escapeHtml(room.tipo || "—")} • Cap: ${room.capacidade ?? "—"}`;

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
          ${title}
        </div>
        ${st}
      </div>

      <div class="muted small">${meta}</div>
      ${sub}

      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px;">
        <a class="btn outline small" href="/quartos.html">Editar</a>
        <a class="btn outline small" href="/reservas.html">Reservas</a>
      </div>
    </div>
  `;
}

async function loadRoomsHome(user, today) {
  // IDs esperados no HTML:
  // roomsLoading, roomsEmpty, roomsGrid
  const loading = document.getElementById("roomsLoading");
  const empty = document.getElementById("roomsEmpty");
  const grid = document.getElementById("roomsGrid");

  const toggle = (el, on) => { if (el) el.style.display = on ? "" : "none"; };

  toggle(loading, true);
  toggle(empty, false);
  toggle(grid, false);

  // 1) quartos ativos
  const { data: rooms, error: roomsErr } = await supabase
    .from("agenda_quartos")
    .select("id, codigo, nome, tipo, capacidade, ordem, ativo, created_at")
    .eq("user_id", user.id)
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .order("codigo", { ascending: true });

  if (roomsErr) {
    console.error("[home] rooms error:", roomsErr);
    toggle(loading, false);
    toggle(empty, true);
    if (empty) empty.innerHTML = `<p class="muted">Erro ao carregar quartos.</p>`;
    return;
  }

  if (!rooms || rooms.length === 0) {
    toggle(loading, false);
    toggle(empty, true);
    return;
  }

  // 2) ocupação do “agora” (precisa de quarto_id preenchido)
  const { data: occRows, error: occErr } = await supabase
    .from("agenda_reservas")
    .select("id, quarto_id, nome_hospede, whatsapp, checkin, checkout")
    .eq("user_id", user.id)
    .not("quarto_id", "is", null)
    .lte("checkin", today)
    .gt("checkout", today);

  if (occErr) {
    // não quebra a tela: só mostra tudo livre
    console.warn("[home] occupancy warning:", occErr);
  }

  const occMap = new Map();
  (occRows || []).forEach(r => {
    if (r.quarto_id && !occMap.has(r.quarto_id)) occMap.set(r.quarto_id, r);
  });

  // 3) render
  if (grid) {
    grid.innerHTML = rooms.map(r => renderRoomCard(r, occMap)).join("");
  }

  toggle(loading, false);
  toggle(grid, true);
}

/* =========================
   Main load
========================= */
async function loadHome() {
  const user = await requireAuth({ redirectTo: "/entrar.html?next=/app.html", renderUserInfo: false });
  if (!user) return;

  const today = toISODate(new Date());
  setText("kpiHojeLabel", fmtBR(today));

  // -------------------------
  // KPIs (PMS)
  // -------------------------
  // IMPORTANTE: não reutilizar "baseCount" mutável em Promise.all
  const pIn = supabase
    .from("agenda_reservas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("checkin", today);

  const pOut = supabase
    .from("agenda_reservas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("checkout", today);

  const pFut = supabase
    .from("agenda_reservas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gt("checkin", today);

  const pHosp = supabase
    .from("agenda_reservas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .lte("checkin", today)
    .gt("checkout", today);

  const [inRes, outRes, futRes, hospRes] = await Promise.all([pIn, pOut, pFut, pHosp]);

  const cIn = inRes.count ?? 0;
  const cOut = outRes.count ?? 0;
  const cFut = futRes.count ?? 0;
  const cHosp = hospRes.count ?? 0;

  setText("kpiCheckin", cIn);
  setText("kpiCheckout", cOut);
  setText("kpiFuturas", cFut);
  setText("kpiHospedados", cHosp);

  const totalOps = cIn + cOut;
  setText("kpiOperacao", totalOps ? `${totalOps} ações` : "tranquilo");

  // -------------------------
  // Quartos (grid) — Home
  // -------------------------
  // Só roda se existir no HTML (não quebra se você ainda não colou a seção)
  if (document.getElementById("roomsGrid")) {
    await loadRoomsHome(user, today);
  }

  // -------------------------
  // Operação de Hoje (listas)
  // -------------------------
  showEl("opsLoading", true);
  setOpsMsg("");

  try {
    const fields = "id, nome_hospede, whatsapp, checkin, checkout, observacoes, created_at";

    const [chegadas, saidas, hospedados] = await Promise.all([
      supabase
        .from("agenda_reservas")
        .select(fields)
        .eq("user_id", user.id)
        .eq("checkin", today)
        .order("created_at", { ascending: false })
        .limit(5),

      supabase
        .from("agenda_reservas")
        .select(fields)
        .eq("user_id", user.id)
        .eq("checkout", today)
        .order("created_at", { ascending: false })
        .limit(5),

      supabase
        .from("agenda_reservas")
        .select(fields)
        .eq("user_id", user.id)
        .lte("checkin", today)
        .gt("checkout", today)
        .order("checkin", { ascending: false })
        .limit(5),
    ]);

    if (chegadas.error) throw chegadas.error;
    if (saidas.error) throw saidas.error;
    if (hospedados.error) throw hospedados.error;

    // counts nos cards
    setText("countChegadas", cIn);
    setText("countSaidas", cOut);
    setText("countHospedados", cHosp);

    // chegadas
    if (!chegadas.data || chegadas.data.length === 0) {
      showEl("emptyChegadas", true);
      setHTML("listChegadas", "");
    } else {
      showEl("emptyChegadas", false);
      setHTML("listChegadas", chegadas.data.map(renderOpItem).join(""));
    }

    // saídas
    if (!saidas.data || saidas.data.length === 0) {
      showEl("emptySaidas", true);
      setHTML("listSaidas", "");
    } else {
      showEl("emptySaidas", false);
      setHTML("listSaidas", saidas.data.map(renderOpItem).join(""));
    }

    // hospedados
    if (!hospedados.data || hospedados.data.length === 0) {
      showEl("emptyHospedados", true);
      setHTML("listHospedados", "");
    } else {
      showEl("emptyHospedados", false);
      setHTML("listHospedados", hospedados.data.map(renderOpItem).join(""));
    }

    showEl("opsLoading", false);
  } catch (e) {
    console.error("[home] ops error:", e);
    showEl("opsLoading", false);
    setOpsMsg("Erro ao carregar a operação. Recarregue a página.");
  }

  // -------------------------
  // Últimas reservas (top 5)
  // -------------------------
  const loading = document.getElementById("homeLoading");
  const empty = document.getElementById("homeEmpty");
  const list = document.getElementById("homeList");

  try {
    const { data, error } = await supabase
      .from("agenda_reservas")
      .select("id, nome_hospede, whatsapp, checkin, checkout, observacoes, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) throw error;

    if (loading) loading.style.display = "none";

    if (!data || data.length === 0) {
      if (empty) empty.style.display = "block";
      if (list) list.style.display = "none";
      return;
    }

    if (empty) empty.style.display = "none";
    if (list) {
      list.style.display = "block";
      list.innerHTML = data.map(renderRecentItem).join("");
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

loadHome();
