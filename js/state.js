import { supabase } from "./supabase.js";

const LS_KEY = "brsys_agenda_ctx_v1";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getCachedContext() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setCachedContext(ctx) {
  localStorage.setItem(LS_KEY, JSON.stringify(ctx));
}

export async function loadHotelContext({ force = false } = {}) {
  if (!force) {
    const cached = getCachedContext();
    if (cached?.hotel_id) return cached;
  }

  // 1) tenta via agenda_view (melhor: já traz hotel_name e métricas do dia)
  const today = todayISO();
  let { data: vRows, error: vErr } = await supabase
    .from("agenda_view")
    .select("hotel_id, hotel_name")
    .eq("day", today)
    .limit(1);

  if (vErr) console.warn("[state] agenda_view error:", vErr);

  if (vRows && vRows.length) {
    const ctx = { hotel_id: vRows[0].hotel_id, hotel_name: vRows[0].hotel_name };
    setCachedContext(ctx);
    return ctx;
  }

  // 2) fallback: pega hotel direto da tabela hotels (RLS deve filtrar pelo owner)
  const { data: hRows, error: hErr } = await supabase
    .from("hotels")
    .select("id, name")
    .order("created_at", { ascending: false })
    .limit(1);

  if (hErr) console.warn("[state] hotels fallback error:", hErr);

  if (hRows && hRows.length) {
    const ctx = { hotel_id: hRows[0].id, hotel_name: hRows[0].name };
    setCachedContext(ctx);
    return ctx;
  }

  return null; // não existe hotel para esse user ainda
}

export function renderHotelBadge(ctx) {
  const el = document.getElementById("hotelBadge");
  if (!el) return;
  if (!ctx) {
    el.innerHTML = `<span class="pill warn">Sem hotel vinculado</span>`;
    return;
  }
  el.innerHTML = `<span class="pill ok">${ctx.hotel_name || "Hotel"}</span>`;
}
