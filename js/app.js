import { supabase } from "./supabase.js";

/* ========= Utils Datas ========= */
function brToISO(br){
  // DD/MM/AAAA → YYYY-MM-DD
  const [d,m,y] = br.split("/");
  return `${y}-${m}-${d}`;
}

function isoToBR(iso){
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/* ========= Elements ========= */
const modal = document.getElementById("modalBackdrop");
const form = document.getElementById("formReserva");
const btnCancel = document.getElementById("cancelar");

const stateLoading = document.getElementById("stateLoading");
const stateEmpty   = document.getElementById("stateEmpty");
const stateList    = document.getElementById("stateList");
const listEl       = document.getElementById("list");

/* ========= State ========= */
function show(which){
  stateLoading.style.display = which === "loading" ? "" : "none";
  stateEmpty.style.display   = which === "empty" ? "" : "none";
  stateList.style.display    = which === "list" ? "" : "none";
}

/* ========= Modal ========= */
function openModal(){ modal.classList.remove("hidden"); }
function closeModal(){ modal.classList.add("hidden"); form.reset(); }

document.getElementById("btnNew")?.addEventListener("click", openModal);
document.getElementById("btnNew2")?.addEventListener("click", openModal);
btnCancel?.addEventListener("click", closeModal);

/* ========= Load Reservas ========= */
async function loadReservas(){
  show("loading");

  const { data, error } = await supabase
    .from("reservas")
    .select("*")
    .order("checkin", { ascending: true });

  if (error){
    console.error(error);
    show("empty");
    return;
  }

  if (!data.length){
    show("empty");
    return;
  }

  listEl.innerHTML = data.map(r => `
    <article class="item">
      <strong>${r.nome}</strong>
      <div class="muted small">
        ${isoToBR(r.checkin)} → ${isoToBR(r.checkout)}
        ${r.whatsapp ? " • " + r.whatsapp : ""}
      </div>
    </article>
  `).join("");

  show("list");
}

/* ========= Submit ========= */
form.addEventListener("submit", async (e)=>{
  e.preventDefault();

  const nome = form.nome.value.trim();
  const whatsapp = form.whatsapp.value.trim();
  const checkinBR = form.checkin.value;
  const checkoutBR = form.checkout.value;
  const obs = form.obs.value.trim();

  if (!nome || !checkinBR || !checkoutBR){
    alert("Preencha nome e datas.");
    return;
  }

  const checkin = brToISO(checkinBR);
  const checkout = brToISO(checkoutBR);

  if (checkout < checkin){
    alert("Check-out não pode ser antes do check-in.");
    return;
  }

  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase.from("reservas").insert({
    user_id: userData.user.id,
    nome,
    whatsapp,
    checkin,
    checkout,
    obs
  });

  if (error){
    alert("Erro ao salvar reserva.");
    console.error(error);
    return;
  }

  closeModal();
  loadReservas();
});

/* ========= Boot ========= */
loadReservas();
