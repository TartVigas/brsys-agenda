import { supabase } from "./supabase.js";

const elEmail = document.getElementById("userEmail");
const btnLogout = document.getElementById("logout");

const stateLoading = document.getElementById("stateLoading");
const stateEmpty   = document.getElementById("stateEmpty");
const stateList    = document.getElementById("stateList");

const btnNew  = document.getElementById("btnNew");
const btnNew2 = document.getElementById("btnNew2");
const listEl  = document.getElementById("list");

function show(which){
  if (!stateLoading || !stateEmpty || !stateList) return;

  stateLoading.style.display = (which === "loading") ? "" : "none";
  stateEmpty.style.display   = (which === "empty")   ? "" : "none";
  stateList.style.display    = (which === "list")    ? "" : "none";
}

function escapeHtml(s=""){
  return s.replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

async function loadUser(){
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.error("[app] getUser error:", error);
    return null;
  }
  return user ?? null;
}

// V1: ainda sem banco de reservas
// Deixa mock só pra não parecer vazio quando você quiser testar
async function loadReservasMock(){
  return []; // quando tiver supabase table, troca aqui pela query real
}

function renderList(items){
  if (!listEl) return;

  if (!items.length){
    show("empty");
    return;
  }

  show("list");
  listEl.innerHTML = items.map(r => `
    <article class="item">
      <div class="item-top">
        <strong>${escapeHtml(r.nome)}</strong>
        <span class="pill">${escapeHtml(r.status ?? "ativa")}</span>
      </div>
      <div class="muted small">
        WhatsApp: ${escapeHtml(r.whatsapp ?? "-")} •
        ${escapeHtml(r.checkin ?? "-")} → ${escapeHtml(r.checkout ?? "-")}
      </div>
    </article>
  `).join("");
}

function bindUI(){
  const openNew = () => {
    // V1: placeholder
    alert("V1: em breve o modal de nova reserva 👀");
  };

  btnNew?.addEventListener("click", openNew);
  btnNew2?.addEventListener("click", openNew);

  btnLogout?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "/entrar.html";
  });
}

async function boot(){
  show("loading");
  bindUI();

  const user = await loadUser();

  // fallback: se por algum motivo o auth.js não redirecionou
  if (!user){
    window.location.href = "/entrar.html";
    return;
  }

  if (elEmail) elEmail.textContent = user.email ?? "(sem e-mail)";

  const reservas = await loadReservasMock();
  renderList(reservas);
}

boot();
