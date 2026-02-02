// /js/hoje.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

/* =========================
   Helpers
========================= */
function ymdTodayLocal() {
  // hoje no timezone do navegador, em YYYY-MM-DD
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function onlyDigits(s = "") {
  return String(s).replace(/\D/g, "");
}

function toWaLink(phoneRaw, fallbackText = "") {
  const digits = onlyDigits(phoneRaw);
  if (!digits) return null;

  // se não tiver DDI, assume BR
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  const msg = fallbackText ? `?text=${encodeURIComponent(fallbackText)}` : "";
  return `https://wa.me/${full}${msg}`;
}

function fmtDateBR(ymd) {
  // recebe YYYY-MM-DD e devolve DD/MM/YYYY
  if (!ymd || typeof ymd !== "string" || ymd.length < 10) return ymd || "";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function renderEmpty(targetEl, title, desc = "") {
  targetEl.innerHTML = `
    <div class="muted small" style="padding:10px 0;">
      <strong>${escapeHtml(title)}</strong>
      ${desc ? `<div class="muted small" style="margin-top:6px;">${escapeHtml(desc)}</div>` : ""}
    </div>
  `;
}

function renderList(targetEl, rows, { kind = "default" } = {}) {
  // tenta descobrir nomes de colunas mais prováveis
  // (você pode padronizar depois)
  const getName = (r) =>
    r.nome_hospede || r.guest_name || r.nome || r.hospede || "Hóspede";

  const getPhone = (r) =>
    r.whatsapp || r.guest_phone || r.telefone || r.phone || "";

  const getObs = (r) =>
    r.observacoes || r.obs || r.notes || r.observacao || "";

  const getCheckin = (r) => r.checkin || r.check_in || "";
  const getCheckout = (r) => r.checkout || r.check_out || "";

  targetEl.innerHTML = rows
    .map((r) => {
      const name = getName(r);
      const phone = getPhone(r);
      const obs = getObs(r);
      const ci = fmtDateBR(getCheckin(r));
      const co = fmtDateBR(getCheckout(r));
      const wa = toWaLink(phone, `Olá ${name}! Aqui é da recepção.`);

      return `
        <div class="card" style="padding:12px;margin:10px 0;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
            <div>
              <div style="font-weight:700;">${escapeHtml(name)}</div>
              <div class="muted small" style="margin-top:4px;">
                ${kind === "arrival" ? `Check-in: <strong>${escapeHtml(ci)}</strong>` : ""}
                ${kind === "departure" ? `Check-out: <strong>${escapeHtml(co)}</strong>` : ""}
                ${kind === "inhouse" ? `Período: <strong>${escapeHtml(ci)}</strong> → <strong>${escapeHtml(co)}</strong>` : ""}
              </div>
              ${
                phone
                  ? `<div class="muted small" style="margin-top:4px;">WhatsApp: <span class="mono">${escapeHtml(phone)}</span></div>`
                  : `<div class="muted small" style="margin-top:4px;">WhatsApp: —</div>`
              }
              ${
                obs
                  ? `<div class="muted small" style="margin-top:8px;">Obs: ${escapeHtml(obs)}</div>`
                  : ""
              }
            </div>

            <div style="display:flex;flex-direction:column;gap:8px;min-width:140px;">
              ${
                wa
                  ? `<a class="btn outline small" href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`
                  : `<button class="btn outline small" disabled style="opacity:.55;">WhatsApp</button>`
              }
              <a class="btn ghost small" href="/reserva.html?id=${encodeURIComponent(
                r.id
              )}">Abrir</a>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

/* =========================
   Boot
========================= */
(async function boot() {
  // guard
  const USER = await requireAuth({ redirectTo: "/entrar.html?next=/hoje.html" });
  if (!USER) return;

  // header UI
  const userInfo = document.getElementById("userInfo");
  if (userInfo) {
    userInfo.innerHTML = `<p class="muted small">Logado como: <strong>${escapeHtml(
      USER.email || "(sem e-mail)"
    )}</strong></p>`;
  }

  // badge simples (sem multi-hotel por enquanto)
  const hotelBadge = document.getElementById("hotelBadge");
  if (hotelBadge) {
    hotelBadge.innerHTML = `<span class="pill">V1</span>`;
  }

  // logout (auth.js já configura se tiver #logout, mas garantimos aqui também)
  const btnLogout = document.getElementById("logout");
  if (btnLogout) {
    btnLogout.onclick = async () => {
      await supabase.auth.signOut();
      window.location.replace("/entrar.html");
    };
  }

  // targets
  const elSummary = document.getElementById("todaySummary");
  const elArrivals = document.getElementById("arrivals");
  const elDepartures = document.getElementById("departures");
  const elInhouse = document.getElementById("inhouse");

  if (elSummary) elSummary.textContent = "Carregando…";

  const today = ymdTodayLocal();

  // === Queries (exatamente seu modelo) ===
  const arrivalsReq = supabase
    .from("agenda_reservas")
    .select("*")
    .eq("user_id", USER.id)
    .eq("checkin", today)
    .order("created_at", { ascending: false });

  const departuresReq = supabase
    .from("agenda_reservas")
    .select("*")
    .eq("user_id", USER.id)
    .eq("checkout", today)
    .order("created_at", { ascending: false });

  // inhouse = checkin <= hoje AND checkout > hoje
  const inhouseReq = supabase
    .from("agenda_reservas")
    .select("*")
    .eq("user_id", USER.id)
    .lte("checkin", today)
    .gt("checkout", today)
    .order("checkin", { ascending: true });

  // futuras (contagem)
  const futureCountReq = supabase
    .from("agenda_reservas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", USER.id)
    .gt("checkin", today);

  const [arrivalsRes, departuresRes, inhouseRes, futureRes] = await Promise.all([
    arrivalsReq,
    departuresReq,
    inhouseReq,
    futureCountReq,
  ]);

  // erros
  if (arrivalsRes.error) console.error("[hoje] arrivals error:", arrivalsRes.error);
  if (departuresRes.error) console.error("[hoje] departures error:", departuresRes.error);
  if (inhouseRes.error) console.error("[hoje] inhouse error:", inhouseRes.error);
  if (futureRes.error) console.error("[hoje] future count error:", futureRes.error);

  const arrivals = arrivalsRes.data || [];
  const departures = departuresRes.data || [];
  const inhouse = inhouseRes.data || [];
  const futureCount = futureRes.count || 0;

  // summary
  if (elSummary) {
    elSummary.innerHTML = `
      <div class="muted">
        <strong>Hoje (${fmtDateBR(today)})</strong> •
        Chegadas: <strong>${arrivals.length}</strong> •
        Saídas: <strong>${departures.length}</strong> •
        Hospedados: <strong>${inhouse.length}</strong> •
        Futuras: <strong>${futureCount}</strong>
      </div>

      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
        <a class="btn primary" href="/reserva-nova.html">+ Nova reserva</a>
        <a class="btn outline" href="/reservas.html">Ver reservas</a>
        <a class="btn ghost" href="/app.html">Home</a>
      </div>
    `;
  }

  // lists
  if (elArrivals) {
    if (!arrivals.length) renderEmpty(elArrivals, "Nenhuma chegada hoje");
    else renderList(elArrivals, arrivals, { kind: "arrival" });
  }

  if (elDepartures) {
    if (!departures.length) renderEmpty(elDepartures, "Nenhuma saída hoje");
    else renderList(elDepartures, departures, { kind: "departure" });
  }

  if (elInhouse) {
    if (!inhouse.length) renderEmpty(elInhouse, "Nenhum hóspede hospedado agora");
    else renderList(elInhouse, inhouse, { kind: "inhouse" });
  }
})();
