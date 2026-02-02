// js/reservas.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

const stateLoading = document.getElementById("stateLoading");
const stateEmpty = document.getElementById("stateEmpty");
const stateList = document.getElementById("stateList");
const stateError = document.getElementById("stateError");

const listEl = document.getElementById("list");
const countEl = document.getElementById("count");
const msgEl = document.getElementById("msg");

const qEl = document.getElementById("q");
const fStatusEl = document.getElementById("fStatus");
const btnLimpar = document.getElementById("btnLimpar");
const btnRetry = document.getElementById("btnRetry");

let USER = null;
let allRows = [];

function show(el){ if (el) el.style.display = ""; }
function hide(el){ if (el) el.style.display = "none"; }

function setMsg(text, type="info"){
  if (!msgEl) return;
  msgEl.textContent = text || "";
  msgEl.style.color =
    type === "error" ? "rgba(255,120,120,.95)" :
    type === "ok"    ? "rgba(102,242,218,.95)" :
                       "rgba(255,255,255,.70)";
}

function onlyDigits(v){ return (v||"").toString().replace(/\D/g,""); }

function isoToBR(iso){
  if (!iso) return "";
  const p = iso.toString().slice(0,10);
  const [y,m,d] = p.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function statusLabel(s){
  const v = (s||"").toString().trim().toLowerCase();
  if (!v) return "Pendente";
  if (v === "confirmada" || v === "confirmado") return "Confirmada";
  if (v === "cancelada" || v === "cancelado") return "Cancelada";
  if (v === "pendente") return "Pendente";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function statusClass(s){
  const v = (s||"").toString().trim().toLowerCase();
  // usa classes já existentes? vamos manter no inline com “pill” do teu CSS
  // mas dá pra diferenciar com data-attr e deixar o CSS evoluir depois
  if (v === "confirmada" || v === "confirmado") return "ok";
  if (v === "cancelada" || v === "cancelado") return "bad";
  return "warn";
}

function buildWhatsLink(raw){
  const digits = onlyDigits(raw);
  if (!digits || digits.length < 10) return null;
  const ddi = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${ddi}`;
}

function escapeHtml(s){
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function renderRow(r){
  const id = r.id;
  const nome = escapeHtml(r.nome_hospede || "(sem nome)");
  const whats = r.whatsapp ? escapeHtml(r.whatsapp) : "";
  const checkin = isoToBR(r.checkin);
  const checkout = isoToBR(r.checkout);
  const obs = escapeHtml(r.observacoes || "");
  const st = statusLabel(r.status);
  const stClass = statusClass(r.status);

  const whatsUrl = buildWhatsLink(r.whatsapp);
  const sub = `${checkin || "—"} → ${checkout || "—"}`;

  return `
    <article class="card" style="margin:10px 0;">
      <div class="row" style="align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="min-width:220px;">
          <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap;">
            <h3 class="h3" style="margin:0;">${nome}</h3>
            <span class="pill" data-status="${escapeHtml(stClass)}">${escapeHtml(st)}</span>
          </div>
          <div class="muted small" style="margin-top:6px;">${escapeHtml(sub)}</div>
          ${whats ? `<div class="muted small" style="margin-top:4px;">Whats: <span class="mono">${whats}</span></div>` : ""}
          ${obs ? `<div class="muted small" style="margin-top:6px;">Obs: ${obs}</div>` : ""}
        </div>

        <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center;">
          <a class="btn outline small" href="/reserva.html?id=${encodeURIComponent(id)}">Abrir</a>
          ${whatsUrl ? `<a class="btn outline small" href="${whatsUrl}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
        </div>
      </div>
    </article>
  `;
}

function applyFilters(){
  const q = (qEl?.value || "").trim().toLowerCase();
  const st = (fStatusEl?.value || "").trim().toLowerCase();

  let rows = [...allRows];

  if (st) {
    rows = rows.filter(r => ((r.status || "").toString().trim().toLowerCase()) === st);
  }

  if (q) {
    rows = rows.filter(r => {
      const nome = (r.nome_hospede || "").toString().toLowerCase();
      const whats = (r.whatsapp || "").toString().toLowerCase();
      return nome.includes(q) || whats.includes(q) || onlyDigits(whats).includes(onlyDigits(q));
    });
  }

  renderList(rows);
}

function renderList(rows){
  if (countEl) countEl.textContent = String(rows.length);

  if (!rows.length) {
    // se tem reservas mas filtro zerou, fica list mas com msg
    show(stateList);
    hide(stateLoading);
    hide(stateEmpty);
    hide(stateError);

    if (listEl) listEl.innerHTML = `
      <div class="muted">Nenhum resultado para o filtro atual.</div>
    `;
    setMsg("Ajuste o filtro ou limpe para ver tudo.", "info");
    return;
  }

  if (listEl) {
    listEl.innerHTML = rows.map(renderRow).join("");
  }

  show(stateList);
  hide(stateLoading);
  hide(stateEmpty);
  hide(stateError);
  setMsg("", "info");
}

async function fetchReservas(){
  // tenta pegar o máximo “safe” de colunas.
  // Se "status" não existir, o Supabase vai dar erro de coluna.
  // Então fazemos fallback com um select mínimo.
  try {
    const { data, error } = await supabase
      .from("agenda_reservas")
      .select("id, nome_hospede, whatsapp, checkin, checkout, observacoes, status, created_at")
      .order("checkin", { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn("[reservas] select full failed, trying fallback:", e?.message || e);

    const { data, error } = await supabase
      .from("agenda_reservas")
      .select("id, nome_hospede, whatsapp, checkin, checkout, observacoes, created_at")
      .order("checkin", { ascending: true });

    if (error) throw error;

    // injeta status vazio para UI
    return (data || []).map(r => ({ ...r, status: "" }));
  }
}

async function boot(){
  USER = await requireAuth({
    redirectTo: "/entrar.html?next=" + encodeURIComponent(window.location.pathname + window.location.search),
    renderUserInfo: false
  });
  if (!USER) return;

  try {
    show(stateLoading);
    hide(stateEmpty);
    hide(stateList);
    hide(stateError);
    setMsg("Carregando reservas…", "info");

    allRows = await fetchReservas();

    if (!allRows.length) {
      hide(stateLoading);
      hide(stateList);
      hide(stateError);
      show(stateEmpty);
      setMsg("", "info");
      return;
    }

    // render inicial
    applyFilters();

  } catch (err) {
    console.error("[reservas] fetch error:", err);
    hide(stateLoading);
    hide(stateEmpty);
    hide(stateList);
    show(stateError);
    setMsg("Erro ao carregar. Se persistir, é RLS ou coluna/perm.", "error");
  }
}

/* Events */
qEl?.addEventListener("input", () => applyFilters());
fStatusEl?.addEventListener("change", () => applyFilters());

btnLimpar?.addEventListener("click", (e) => {
  e.preventDefault();
  if (qEl) qEl.value = "";
  if (fStatusEl) fStatusEl.value = "";
  applyFilters();
});

btnRetry?.addEventListener("click", (e) => {
  e.preventDefault();
  boot();
});

boot();
