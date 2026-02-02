import { supabase } from "./supabase.js";

/* ========= Helpers ========= */
function onlyDigits(v){ return (v || "").replace(/\D/g, ""); }

function normalizeBRDate(value){
  const digits = onlyDigits(value);
  if (digits.length !== 8) return null;
  const d = digits.slice(0,2);
  const m = digits.slice(2,4);
  const y = digits.slice(4,8);
  return `${d}/${m}/${y}`;
}

function brToISO(value){
  const br = normalizeBRDate(value);
  if (!br) return null;
  const [d,m,y] = br.split("/");
  return `${y}-${m}-${d}`;
}

function isoToBR(iso){
  if (!iso || typeof iso !== "string") return "";
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatPhoneBR(raw){
  const d = onlyDigits(raw);
  if (!d) return "";
  // Se vier com DDI 55, mantém; senão assume BR (55)
  if (d.startsWith("55")) return d;
  return "55" + d;
}

function makeWAUrl(whatsappRaw, nome, checkinISO, checkoutISO){
  const phone = formatPhoneBR(whatsappRaw);
  if (!phone) return null;

  const ci = isoToBR(checkinISO);
  const co = isoToBR(checkoutISO);

  const msg = `Olá, ${nome}! Confirmação da sua reserva:\n✅ Check-in: ${ci}\n✅ Check-out: ${co}\n\nQualquer coisa me chama por aqui.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
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

/* ========= Input masks (datas) ========= */
function maskDateInput(el){
  if (!el) return;
  el.setAttribute("inputmode", "numeric");
  el.setAttribute("maxlength", "10");

  el.addEventListener("input", () => {
    const digits = onlyDigits(el.value).slice(0, 8);
    let out = digits;
    if (digits.length > 2) out = digits.slice(0,2) + "/" + digits.slice(2);
    if (digits.length > 4) out = digits.slice(0,2) + "/" + digits.slice(2,4) + "/" + digits.slice(4);
    el.value = out;
  });

  el.addEventListener("blur", () => {
    const norm = normalizeBRDate(el.value);
    if (norm) el.value = norm;
  });
}

maskDateInput(form?.checkin);
maskDateInput(form?.checkout);

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

  if (!data || !data.length){
    show("empty");
    return;
  }

  listEl.innerHTML = data.map(r => {
    const wa = r.whatsapp ? makeWAUrl(r.whatsapp, r.nome, r.checkin, r.checkout) : null;

    return `
      <article class="item">
        <div class="item-row">
          <div>
            <strong>${r.nome}</strong>
            <div class="muted small">
              ${isoToBR(r.checkin)} → ${isoToBR(r.checkout)}
              ${r.whatsapp ? " • " + r.whatsapp : ""}
            </div>
          </div>

          <div class="item-actions">
            ${wa ? `<a class="btn wa" href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
          </div>
        </div>
      </article>
    `;
  }).join("");

  show("list");
}

/* ========= Submit ========= */
form?.addEventListener("submit", async (e)=>{
  e.preventDefault();

  const nome = form.nome.value.trim();
  const whatsapp = form.whatsapp.value.trim();
  const checkinBR = form.checkin.value;
  const checkoutBR = form.checkout.value;
  const obs = form.obs.value.trim();

  if (!nome){
    alert("Preencha o nome do hóspede.");
    return;
  }

  const checkin = brToISO(checkinBR);
  const checkout = brToISO(checkoutBR);

  if (!checkin || !checkout){
    alert("Preencha as datas no formato DD/MM/AAAA (ou digite 8 números).");
    return;
  }

  if (checkout < checkin){
    alert("Check-out não pode ser antes do check-in.");
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  if (!user){
    alert("Sua sessão expirou. Faça login novamente.");
    window.location.href = "/login.html";
    return;
  }

  const { error } = await supabase.from("reservas").insert({
    user_id: user.id,
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
