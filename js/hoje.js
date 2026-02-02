import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";
import { loadHotelContext, renderHotelBadge } from "./state.js";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function pick(row, ...keys) {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

function normalizePhone(raw) {
  if (!raw) return "";
  return String(raw).replace(/\D/g, "");
}

function waLink(phoneDigits, text) {
  if (!phoneDigits) return "#";
  const msg = encodeURIComponent(text || "");
  return `https://wa.me/55${phoneDigits}?text=${msg}`;
}

function statusLabel(s) {
  const v = (s || "").toLowerCase();
  if (v === "confirmed" || v === "confirmada") return "Confirmada";
  if (v === "checked_in" || v === "checkin" || v === "check-in") return "Hospedado";
  if (v === "checked_out" || v === "checkout" || v === "check-out") return "Finalizada";
  if (v === "cancelled" || v === "cancelada") return "Cancelada";
  if (v === "no_show" || v === "no-show") return "No-show";
  return s || "—";
}

function isSameDate(a, b) {
  return String(a) === String(b);
}

function renderList(elId, rows, ctx, kind) {
  const el = document.getElementById(elId);
  if (!el) return;

  if (!rows.length) {
    el.innerHTML = `<p class="muted small">Nada por aqui.</p>`;
    return;
  }

  el.innerHTML = rows.map(r => {
    const nome = pick(r, "guest_name", "nome_hospede") || "Hóspede";
    const phone = normalizePhone(pick(r, "guest_phone", "whatsapp"));
    const room = pick(r, "room_label") || "—";
    const status = statusLabel(pick(r, "status"));
    const obs = pick(r, "observacoes", "notes") || "";

    const checkin = pick(r, "check_in", "checkin");
    const checkout = pick(r, "check_out", "checkout");

    const msg =
      kind === "arrival"
        ? `Olá ${nome}! Confirmando sua chegada hoje (${checkin}). Qual horário aproximado?`
        : kind === "departure"
          ? `Olá ${nome}! Só confirmando seu check-out hoje (${checkout}). Precisa de algo?`
          : `Olá ${nome}! Tudo certo por aí?`;

    const href = waLink(phone, msg);

    return `
      <div class="item">
        <div class="item-main">
          <div class="item-title">${nome} <span class="pill">${status}</span></div>
          <div class="item-meta">UH: <strong>${room}</strong> • CI: ${checkin || "—"} • CO: ${checkout || "—"}</div>
          ${obs ? `<div class="item-note">${obs}</div>` : ""}
        </div>
        <div class="item-actions">
          <a class="btn" href="${href}" target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
      </div>
    `;
  }).join("");
}

async function main() {
  const user = await requireAuth({ redirectTo: "/entrar.html" });
  if (!user) return;

  const ctx = await loadHotelContext();
  if (!ctx) {
    window.location.replace("/cadastro.html");
    return;
  }
  renderHotelBadge(ctx);

  const today = todayISO();

  // Puxa o “máximo” de colunas possíveis (pra funcionar com os dois padrões)
  const { data, error } = await supabase
    .from("agenda_reservas")
    .select("id, hotel_id, room_label, status, check_in, check_out, checkin, checkout, guest_name, nome_hospede, guest_phone, whatsapp, observacoes, notes, created_at")
    .eq("hotel_id", ctx.hotel_id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[hoje] load reservas error:", error);
    const el = document.getElementById("todaySummary");
    if (el) el.textContent = "Erro ao carregar reservas.";
    return;
  }

  const rows = data || [];

  const arrivals = rows.filter(r => isSameDate(pick(r, "check_in", "checkin"), today));
  const departures = rows.filter(r => isSameDate(pick(r, "check_out", "checkout"), today));

  // Hospedados: check-in <= hoje e check-out > hoje, e status não cancelado
  const inhouse = rows.filter(r => {
    const ci = pick(r, "check_in", "checkin");
    const co = pick(r, "check_out", "checkout");
    const st = (pick(r, "status") || "").toLowerCase();
    if (!ci || !co) return false;
    if (st === "cancelled" || st === "cancelada" || st === "no_show") return false;
    return (ci <= today) && (co > today);
  });

  const sumEl = document.getElementById("todaySummary");
  if (sumEl) {
    sumEl.innerHTML = `
      <div class="row">
        <span class="pill ok">Chegadas: <strong>${arrivals.length}</strong></span>
        <span class="pill warn">Saídas: <strong>${departures.length}</strong></span>
        <span class="pill">Hospedados: <strong>${inhouse.length}</strong></span>
      </div>
    `;
  }

  renderList("arrivals", arrivals, ctx, "arrival");
  renderList("departures", departures, ctx, "departure");
  renderList("inhouse", inhouse, ctx, "inhouse");
}

main();
