// /js/home.js — PMS V1.5 (Home operacional)
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
  if (num.length === 8) {
    return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  }
  if (num.length === 9) {
    return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  }

  return `+${w}`;
}

/* =========================
   Render cards (mini)
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
          <div style="font-weight:800;">${nome}</div>
          <div class="muted small">${periodo}${obs ? ` • ${obs}` : ""}</div>
          <div class="muted small mono">${wppLabel}</div>
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
  // reutiliza o mesmo visual
  return renderOpItem(r).replace("/reserva.html?id=", "/reserva.html?id=");
}

/* =========================
   UI helpers
========================= */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

function show(id, on = true) {
  const el = document.getElementById(id);
  if (el) el.style.display = on ? "" : "none";
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setMsg(text) {
  const el = document.getElementById("opsMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.display = text ? "block" : "none";
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
  const baseCount = supabase
    .from("agenda_reservas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const [
    inRes,
    outRes,
    futRes,
    hospRes,
  ] = await Promise.all([
    baseCount.eq("checkin", today),                    // chegadas
    baseCount.eq("checkout", today),                  // saídas
    baseCount.gt("checkin", today),                   // futuras
    supabase
      .from("agenda_reservas")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .lte("checkin", today)
      .gt("checkout", today),                         // hospedados agora
  ]);

  const cIn = inRes.count ?? 0;
  const cOut = outRes.count ?? 0;
  const cFut = futRes.count ?? 0;
  const cHosp = hospRes.count ?? 0;

  setText("kpiCheckin", cIn);
  setText("kpiCheckout", cOut);
  setText("kpiFuturas", cFut);
  setText("kpiHospedados", cHosp);

  // Operação label
  const totalOps = cIn + cOut;
  setText("kpiOperacao", totalOps ? `${totalOps} ações` : "tranquilo");

  // -------------------------
  // Operação de Hoje (listas)
  // -------------------------
  show("opsLoading", true);
  setMsg("");

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

    // counts nos cards (já vem do KPI, mas aqui é o "top 5")
    setText("countChegadas", cIn);
    setText("countSaidas", cOut);
    setText("countHospedados", cHosp);

    // render chegadas
    if (!chegadas.data || chegadas.data.length === 0) {
      show("emptyChegadas", true);
      setHTML("listChegadas", "");
    } else {
      show("emptyChegadas", false);
      setHTML("listChegadas", chegadas.data.map(renderOpItem).join(""));
    }

    // render saídas
    if (!saidas.data || saidas.data.length === 0) {
      show("emptySaidas", true);
      setHTML("listSaidas", "");
    } else {
      show("emptySaidas", false);
      setHTML("listSaidas", saidas.data.map(renderOpItem).join(""));
    }

    // render hospedados
    if (!hospedados.data || hospedados.data.length === 0) {
      show("emptyHospedados", true);
      setHTML("listHospedados", "");
    } else {
      show("emptyHospedados", false);
      setHTML("listHospedados", hospedados.data.map(renderOpItem).join(""));
    }

    show("opsLoading", false);
  } catch (e) {
    console.error("[home] ops error:", e);
    show("opsLoading", false);
    setMsg("Erro ao carregar a operação. Recarregue a página.");
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
