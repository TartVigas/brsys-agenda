// js/home.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

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

function normalizeWhats(whats) {
  if (!whats) return "";
  return String(whats).replace(/\D/g, "");
}

function renderItem(r) {
  const nome = r.nome_hospede || "(sem nome)";
  const w = normalizeWhats(r.whatsapp);
  const linkWpp = w ? `https://wa.me/55${w}` : null;

  return `
    <div class="list-item">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
        <div style="min-width:0;">
          <div style="font-weight:800;">${nome}</div>
          <div class="muted small">
            ${fmtBR(r.checkin)} → ${fmtBR(r.checkout)}
            ${r.observacoes ? ` • ${r.observacoes}` : ""}
          </div>
          ${w ? `<div class="muted small mono">+55 ${w}</div>` : `<div class="muted small">sem WhatsApp</div>`}
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
          ${linkWpp ? `<a class="btn outline small" target="_blank" rel="noopener noreferrer" href="${linkWpp}">WhatsApp</a>` : ""}
          <a class="btn outline small" href="/reservas.html">Abrir</a>
        </div>
      </div>
    </div>
  `;
}

async function loadHome() {
  const user = await requireAuth({ redirectTo: "/entrar.html?next=/app.html", renderUserInfo: false });
  if (!user) return;

  const today = toISODate(new Date());

  // 1) KPIs (contagem simples)
  const base = supabase
    .from("agenda_reservas")
    .select("id, checkin, checkout", { count: "exact", head: true })
    .eq("user_id", user.id);

  const [inRes, outRes, futRes] = await Promise.all([
    base.eq("checkin", today),
    base.eq("checkout", today),
    base.gt("checkin", today),
  ]);

  const kpiIn = document.getElementById("kpiCheckin");
  const kpiOut = document.getElementById("kpiCheckout");
  const kpiFut = document.getElementById("kpiFuturas");

  if (kpiIn) kpiIn.textContent = String(inRes.count ?? 0);
  if (kpiOut) kpiOut.textContent = String(outRes.count ?? 0);
  if (kpiFut) kpiFut.textContent = String(futRes.count ?? 0);

  // 2) Últimas reservas (top 5)
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
      list.innerHTML = data.map(renderItem).join("");
    }
  } catch (e) {
    console.error("[home] load error:", e);
    if (loading) loading.style.display = "none";
    if (empty) {
      empty.style.display = "block";
      empty.innerHTML = `<p class="muted">Erro ao carregar. Recarregue a página.</p>`;
    }
  }
}

loadHome();
