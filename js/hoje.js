// /js/hoje.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

const elSummary = document.getElementById("todaySummary");
const elArrivals = document.getElementById("arrivals");
const elDepartures = document.getElementById("departures");
const elInhouse = document.getElementById("inhouse");

function setHTML(el, html) {
  if (el) el.innerHTML = html;
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ymdLocal(d = new Date()) {
  // YYYY-MM-DD no fuso local do navegador
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function fmtYMD(ymd) {
  if (!ymd || typeof ymd !== "string" || ymd.length < 10) return "";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function waLink(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${full}`;
}

function emptyBlock(text) {
  return `<div class="muted small" style="padding:6px 0;">${esc(text)}</div>`;
}

function reservaCard(r, badge) {
  const nome = esc(r.nome_hospede || "Sem nome");
  const wpp = esc(r.whatsapp || "");
  const inStr = fmtYMD(r.checkin);
  const outStr = fmtYMD(r.checkout);

  const href = `/reserva.html?id=${encodeURIComponent(r.id)}`;
  const wa = waLink(r.whatsapp);

  return `
    <div class="card" style="padding:12px;margin:10px 0;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
        <div>
          <div style="font-weight:700;">${nome}</div>
          <div class="muted small">${esc(badge)} • ${inStr}${outStr ? ` → ${outStr}` : ""}</div>
          ${wpp ? `<div class="muted small mono" style="margin-top:4px;">${wpp}</div>` : ""}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
          <a class="btn outline small" href="${href}">Abrir</a>
          ${wa ? `<a class="btn small" href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
        </div>
      </div>
    </div>
  `;
}

async function qChegadasHoje(userId, today) {
  return supabase
    .from("agenda_reservas")
    .select("id, nome_hospede, whatsapp, checkin, checkout, observacoes, created_at")
    .eq("user_id", userId)
    .eq("checkin", today)
    .order("created_at", { ascending: false });
}

async function qSaidasHoje(userId, today) {
  return supabase
    .from("agenda_reservas")
    .select("id, nome_hospede, whatsapp, checkin, checkout, observacoes, created_at")
    .eq("user_id", userId)
    .eq("checkout", today)
    .order("created_at", { ascending: false });
}

async function qHospedadosAgora(userId, today) {
  return supabase
    .from("agenda_reservas")
    .select("id, nome_hospede, whatsapp, checkin, checkout, observacoes, created_at")
    .eq("user_id", userId)
    .lte("checkin", today)
    .gt("checkout", today)
    .order("checkin", { ascending: true })
    .order("checkout", { ascending: true });
}

async function loadHoje(user) {
  const today = ymdLocal(new Date());

  setHTML(elSummary, `<span class="muted">Carregando…</span>`);
  setHTML(elArrivals, emptyBlock("Carregando…"));
  setHTML(elDepartures, emptyBlock("Carregando…"));
  setHTML(elInhouse, emptyBlock("Carregando…"));

  const [arrRes, depRes, inhRes] = await Promise.all([
    qChegadasHoje(user.id, today),
    qSaidasHoje(user.id, today),
    qHospedadosAgora(user.id, today),
  ]);

  if (arrRes.error || depRes.error || inhRes.error) {
    console.error("[hoje] errors:", arrRes.error, depRes.error, inhRes.error);
    setHTML(elSummary, `<span style="color:rgba(255,120,120,.95)">Erro ao carregar o dia. Veja o console.</span>`);
    setHTML(elArrivals, emptyBlock("Erro ao carregar chegadas."));
    setHTML(elDepartures, emptyBlock("Erro ao carregar saídas."));
    setHTML(elInhouse, emptyBlock("Erro ao carregar hospedados."));
    return;
  }

  const arrivals = arrRes.data || [];
  const departures = depRes.data || [];
  const inhouse = inhRes.data || [];

  const brToday = fmtYMD(today);

  setHTML(
    elSummary,
    `
      <div class="muted small">
        <strong>Hoje (${brToday})</strong> •
        Chegadas: <strong>${arrivals.length}</strong> •
        Saídas: <strong>${departures.length}</strong> •
        Hospedados: <strong>${inhouse.length}</strong>
      </div>
    `
  );

  setHTML(
    elArrivals,
    arrivals.length
      ? arrivals.map((r) => reservaCard(r, "Chegada")).join("")
      : emptyBlock("Nenhuma chegada hoje.")
  );

  setHTML(
    elDepartures,
    departures.length
      ? departures.map((r) => reservaCard(r, "Saída")).join("")
      : emptyBlock("Nenhuma saída hoje.")
  );

  setHTML(
    elInhouse,
    inhouse.length
      ? inhouse.map((r) => reservaCard(r, "Hospedado")).join("")
      : emptyBlock("Nenhum hospedado no momento.")
  );
}

/* ========= Boot ========= */
(async () => {
  const user = await requireAuth({
    redirectTo: "/entrar.html?next=/hoje.html",
    renderUserInfo: true,
  });

  if (!user) return;

  await loadHoje(user);
})();
