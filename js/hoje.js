// js/hoje.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

const elSummary = document.getElementById("todaySummary");
const elArrivals = document.getElementById("arrivals");
const elDepartures = document.getElementById("departures");
const elInhouse = document.getElementById("inhouse");

function setHTML(el, html) {
  if (!el) return;
  el.innerHTML = html;
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function onlyDigits(v) {
  return (v || "").toString().replace(/\D/g, "");
}

function waLink(raw) {
  const digits = onlyDigits(raw);
  if (!digits || digits.length < 10) return null;

  // BR 55
  const ddi = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${ddi}`;
}

function todayISO() {
  // gera YYYY-MM-DD no timezone do navegador (BR ok)
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatBRDate(iso) {
  if (!iso) return "";
  const p = iso.toString().slice(0, 10);
  const [y,m,d] = p.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function renderItem(r, label = "") {
  const nome = escapeHtml(r.nome_hospede || "(sem nome)");
  const obs = escapeHtml(r.observacoes || "");
  const checkin = formatBRDate(r.checkin);
  const checkout = formatBRDate(r.checkout);

  const whatsUrl = waLink(r.whatsapp);
  const whatsTxt = r.whatsapp ? escapeHtml(r.whatsapp) : "";

  return `
    <div class="item" style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08);">
      <div style="min-width:220px;">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <strong>${nome}</strong>
          ${label ? `<span class="pill">${escapeHtml(label)}</span>` : ""}
        </div>
        <div class="muted small" style="margin-top:6px;">${checkin || "—"} → ${checkout || "—"}</div>
        ${whatsTxt ? `<div class="muted small" style="margin-top:4px;">Whats: <span class="mono">${whatsTxt}</span></div>` : ""}
        ${obs ? `<div class="muted small" style="margin-top:6px;">Obs: ${obs}</div>` : ""}
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <a class="btn outline small" href="/reserva.html?id=${encodeURIComponent(r.id)}">Abrir</a>
        ${whatsUrl ? `<a class="btn outline small" href="${whatsUrl}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
      </div>
    </div>
  `;
}

function renderEmpty(text) {
  return `<div class="muted small" style="padding:10px 0;">${escapeHtml(text)}</div>`;
}

async function fetchByDay(userId, isoDay) {
  // pega um conjunto mínimo de colunas
  const { data, error } = await supabase
    .from("agenda_reservas")
    .select("id, nome_hospede, whatsapp, checkin, checkout, observacoes, status")
    .eq("user_id", userId)
    // pega tudo que “encosta” em hoje: checkin <= hoje e checkout >= hoje
    .lte("checkin", isoDay)
    .gte("checkout", isoDay)
    .order("checkin", { ascending: true });

  if (error) throw error;
  return data || [];
}

function splitToday(rows, isoDay) {
  const arrivals = rows.filter(r => (r.checkin || "").toString().slice(0,10) === isoDay);
  const departures = rows.filter(r => (r.checkout || "").toString().slice(0,10) === isoDay);
  const inhouse = rows.filter(r => {
    const ci = (r.checkin || "").toString().slice(0,10);
    const co = (r.checkout || "").toString().slice(0,10);
    // ci <= hoje && co > hoje
    return (ci <= isoDay) && (co > isoDay);
  });

  return { arrivals, departures, inhouse };
}

async function boot() {
  // garante auth (usa teu auth.js exportado)
  const user = await requireAuth({ redirectTo: "/entrar.html?next=/hoje.html", renderUserInfo: true });
  if (!user) return;

  // hook do logout já é feito pelo requireAuth (no teu auth.js)
  const isoDay = todayISO();

  setHTML(elSummary, `<span class="muted">Carregando…</span>`);
  setHTML(elArrivals, "");
  setHTML(elDepartures, "");
  setHTML(elInhouse, "");

  try {
    const rows = await fetchByDay(user.id, isoDay);
    const { arrivals, departures, inhouse } = splitToday(rows, isoDay);

    // summary
    setHTML(elSummary, `
      <div class="row" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
        <span class="pill">Hoje: ${escapeHtml(formatBRDate(isoDay))}</span>
        <span class="muted small">Chegadas: <strong>${arrivals.length}</strong></span>
        <span class="muted small">Saídas: <strong>${departures.length}</strong></span>
        <span class="muted small">Hospedados: <strong>${inhouse.length}</strong></span>
      </div>
    `);

    // sections
    setHTML(elArrivals, arrivals.length
      ? arrivals.map(r => renderItem(r, "Chegada")).join("")
      : renderEmpty("Nenhuma chegada hoje.")
    );

    setHTML(elDepartures, departures.length
      ? departures.map(r => renderItem(r, "Saída")).join("")
      : renderEmpty("Nenhuma saída hoje.")
    );

    setHTML(elInhouse, inhouse.length
      ? inhouse.map(r => renderItem(r, "Hospedado")).join("")
      : renderEmpty("Nenhum hóspede hospedado agora.")
    );

  } catch (err) {
    console.error("[hoje] error:", err);
    setHTML(elSummary, `<span style="color:rgba(255,120,120,.95)">Erro ao carregar (RLS ou conexão).</span>`);
    setHTML(elArrivals, renderEmpty("—"));
    setHTML(elDepartures, renderEmpty("—"));
    setHTML(elInhouse, renderEmpty("—"));
  }
}

boot();
