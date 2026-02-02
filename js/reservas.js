// /js/reservas.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

/* =========================
   Helpers
========================= */
function ymdTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function toWaLink(phoneRaw, text = "") {
  const digits = onlyDigits(phoneRaw);
  if (!digits) return null;
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  const qs = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${full}${qs}`;
}

function fmtDateBR(ymd) {
  if (!ymd || typeof ymd !== "string" || ymd.length < 10) return ymd || "";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function getName(r) {
  return r.nome_hospede || r.guest_name || r.nome || r.hospede || "Hóspede";
}
function getPhone(r) {
  return r.whatsapp || r.guest_phone || r.telefone || r.phone || "";
}
function getCheckin(r) {
  return r.checkin || r.check_in || "";
}
function getCheckout(r) {
  return r.checkout || r.check_out || "";
}
function getObs(r) {
  return r.observacoes || r.obs || r.notes || r.observacao || "";
}

function setMsg(text = "", type = "info") {
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = text;

  el.style.color =
    type === "error" ? "rgba(255,120,120,.95)" :
    type === "ok"    ? "rgba(102,242,218,.95)" :
                       "rgba(255,255,255,.70)";
}

function showState(which) {
  const loading = document.getElementById("stateLoading");
  const empty = document.getElementById("stateEmpty");
  const list = document.getElementById("stateList");

  if (loading) loading.style.display = which === "loading" ? "" : "none";
  if (empty) empty.style.display = which === "empty" ? "" : "none";
  if (list) list.style.display = which === "list" ? "" : "none";
}

function isTodayRow(r, today) {
  const ci = getCheckin(r);
  const co = getCheckout(r);
  // Hoje inclui: checkin hoje OR checkout hoje OR hospedado hoje (ci <= hoje < co)
  return (
    ci === today ||
    co === today ||
    (ci && co && ci <= today && co > today)
  );
}

function isFutureRow(r, today) {
  const ci = getCheckin(r);
  return !!ci && ci > today;
}

function isPastRow(r, today) {
  const co = getCheckout(r);
  return !!co && co < today;
}

function applyFilter(rows, filter, today) {
  if (filter === "today") return rows.filter(r => isTodayRow(r, today));
  if (filter === "future") return rows.filter(r => isFutureRow(r, today));
  if (filter === "past") return rows.filter(r => isPastRow(r, today));
  return rows;
}

function applySearch(rows, q) {
  const query = (q || "").trim().toLowerCase();
  if (!query) return rows;

  return rows.filter(r => {
    const name = String(getName(r)).toLowerCase();
    const phone = String(getPhone(r)).toLowerCase();
    const obs = String(getObs(r)).toLowerCase();
    return name.includes(query) || phone.includes(query) || obs.includes(query);
  });
}

function statusBadge(r, today) {
  const ci = getCheckin(r);
  const co = getCheckout(r);

  let label = "Reserva";
  if (ci === today) label = "Check-in hoje";
  else if (co === today) label = "Check-out hoje";
  else if (ci && co && ci <= today && co > today) label = "Hospedado";
  else if (ci && ci > today) label = "Futura";
  else if (co && co < today) label = "Finalizada";

  return `<span class="pill">${escapeHtml(label)}</span>`;
}

function renderList(rows, today) {
  const host = document.getElementById("list");
  if (!host) return;

  if (!rows.length) {
    host.innerHTML = `
      <div class="muted small" style="padding:10px 0;">
        Nenhum resultado com o filtro/busca atual.
      </div>
    `;
    return;
  }

  host.innerHTML = rows.map(r => {
    const id = r.id;
    const name = getName(r);
    const phone = getPhone(r);
    const ci = fmtDateBR(getCheckin(r));
    const co = fmtDateBR(getCheckout(r));
    const obs = getObs(r);
    const wa = toWaLink(phone, `Olá ${name}! Aqui é da recepção.`);
    const badge = statusBadge(r, today);

    return `
      <article class="card" style="padding:12px;margin:10px 0;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div style="min-width:260px;flex:1;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <div style="font-weight:800;font-size:16px;">${escapeHtml(name)}</div>
              ${badge}
            </div>

            <div class="muted small" style="margin-top:6px;">
              Período: <strong>${escapeHtml(ci)}</strong> → <strong>${escapeHtml(co)}</strong>
            </div>

            <div class="muted small" style="margin-top:4px;">
              WhatsApp: ${phone ? `<span class="mono">${escapeHtml(phone)}</span>` : "—"}
            </div>

            ${obs ? `<div class="muted small" style="margin-top:8px;">Obs: ${escapeHtml(obs)}</div>` : ""}
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end;">
            ${
              wa
                ? `<a class="btn outline small" href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`
                : `<button class="btn outline small" disabled style="opacity:.55;">WhatsApp</button>`
            }
            <a class="btn ghost small" href="/reserva.html?id=${encodeURIComponent(id)}">Abrir</a>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

/* =========================
   Boot
========================= */
(async function boot() {
  const USER = await requireAuth({ redirectTo: "/entrar.html?next=/reservas.html" });
  if (!USER) return;

  const today = ymdTodayLocal();

  // UI refs
  const qEl = document.getElementById("q");
  const summaryEl = document.getElementById("summary");

  // filtro atual
  let currentFilter = "all";
  let allRows = [];

  // bind filtros
  const filterBtns = [...document.querySelectorAll("[data-filter]")];
  function paintFilter() {
    filterBtns.forEach(btn => {
      const on = btn.getAttribute("data-filter") === currentFilter;
      btn.style.opacity = on ? "1" : "0.75";
      btn.style.borderColor = on ? "rgba(102,242,218,.55)" : "";
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      currentFilter = btn.getAttribute("data-filter") || "all";
      paintFilter();
      rerender();
    });
  });

  function rerender() {
    const q = qEl?.value || "";
    const filtered = applyFilter(allRows, currentFilter, today);
    const searched = applySearch(filtered, q);

    // summary
    const total = allRows.length;
    const shown = searched.length;
    if (summaryEl) {
      summaryEl.textContent = `Mostrando ${shown} de ${total} • Hoje: ${fmtDateBR(today)}`;
    }

    renderList(searched, today);
    if (!total) showState("empty");
    else showState("list");
  }

  // busca
  qEl?.addEventListener("input", () => rerender());

  // load
  showState("loading");
  setMsg("");

  const { data, error } = await supabase
    .from("agenda_reservas")
    .select("*")
    .eq("user_id", USER.id)
    .order("checkin", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error("[reservas] load error:", error);
    setMsg("Erro ao carregar reservas. Verifique RLS/policies e tente novamente.", "error");
    showState("list");
    const host = document.getElementById("list");
    if (host) host.innerHTML = `<div class="muted small">Falha ao carregar.</div>`;
    return;
  }

  allRows = data || [];
  if (!allRows.length) {
    if (summaryEl) summaryEl.textContent = "0 reservas cadastradas.";
    showState("empty");
    return;
  }

  paintFilter();
  rerender();
})();
