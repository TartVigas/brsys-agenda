// /js/reserva-conta.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

const $ = (id) => document.getElementById(id);

function onlyDigits(s=""){ return String(s||"").replace(/\D/g,""); }
function esc(s=""){
  return String(s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function moneyBR(n){
  const v = Number(n||0);
  return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}
function parseBRMoney(input){
  // aceita "180,00" / "180.00" / "1.234,56"
  let s = String(input||"").trim();
  if (!s) return null;
  s = s.replace(/\s/g,"");
  // remove milhar
  s = s.replaceAll(".","");
  // troca vírgula por ponto
  s = s.replaceAll(",",".");
  const n = Number(s);
  if (!isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function setMsg(text="", type="info"){
  const el = $("contaMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.display = text ? "block" : "none";
  el.style.color =
    type === "error" ? "rgba(255,120,120,.95)" :
    type === "ok"    ? "rgba(102,242,218,.95)" :
                       "rgba(255,255,255,.70)";
}

function getReservaId(){
  const u = new URL(location.href);
  return u.searchParams.get("id");
}

let USER = null;
let reservaId = null;
let contaId = null;

async function ensureConta(user_id, reserva_id){
  const { data: existing, error: e1 } = await supabase
    .from("agenda_contas")
    .select("id,status,total_lancamentos,total_pago")
    .eq("user_id", user_id)
    .eq("reserva_id", reserva_id)
    .maybeSingle();

  if (e1) throw e1;
  if (existing?.id) return existing;

  const { data: created, error: e2 } = await supabase
    .from("agenda_contas")
    .insert([{ user_id, reserva_id }])
    .select("id,status,total_lancamentos,total_pago")
    .single();

  if (e2) throw e2;
  return created;
}

async function fetchReservaEQuarto(user_id, id){
  // carrega reserva com quarto (se tiver FK quarto_id -> agenda_quartos.id)
  const { data, error } = await supabase
    .from("agenda_reservas")
    .select(`
      id, user_id, nome_hospede, whatsapp, checkin, checkout, observacoes,
      quarto_id,
      agenda_quartos:quarto_id ( id, codigo, nome, tipo )
    `)
    .eq("user_id", user_id)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

async function listLancamentos(user_id, conta_id){
  const { data, error } = await supabase
    .from("agenda_lancamentos")
    .select("id,descricao,valor,tipo,created_at")
    .eq("user_id", user_id)
    .eq("conta_id", conta_id)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function listPagamentos(user_id, conta_id){
  const { data, error } = await supabase
    .from("agenda_pagamentos")
    .select("id,forma,valor,observacao,paid_at,created_at")
    .eq("user_id", user_id)
    .eq("conta_id", conta_id)
    .order("paid_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function recomputeAndUpdateTotals(user_id, conta_id){
  // soma no client e grava na conta (por enquanto)
  const [lanc, pags] = await Promise.all([
    listLancamentos(user_id, conta_id),
    listPagamentos(user_id, conta_id),
  ]);

  const totalLanc = lanc.reduce((a,x)=>a + Number(x.valor||0), 0);
  const totalPago = pags.reduce((a,x)=>a + Number(x.valor||0), 0);

  const { error } = await supabase
    .from("agenda_contas")
    .update({
      total_lancamentos: totalLanc,
      total_pago: totalPago,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user_id)
    .eq("id", conta_id);

  if (error) throw error;

  return { totalLanc, totalPago, lanc, pags };
}

function renderContaUI({ status, totalLanc, totalPago, lanc, pags }){
  const saldo = totalLanc - totalPago;

  if ($("contaStatus")) $("contaStatus").textContent = status || "—";
  if ($("totalLanc")) $("totalLanc").textContent = moneyBR(totalLanc);
  if ($("totalPago")) $("totalPago").textContent = moneyBR(totalPago);
  if ($("saldo")) $("saldo").textContent = moneyBR(saldo);

  // listas
  const elL = $("listaLanc");
  const elP = $("listaPag");

  if (elL){
    elL.innerHTML = lanc.length ? lanc.map((x)=>`
      <div class="card" style="padding:10px;margin-top:10px;">
        <div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:600;">${esc(x.descricao)}</div>
            <div class="muted small">${esc(x.tipo || "extra")}</div>
          </div>
          <div style="font-weight:700;">${moneyBR(x.valor)}</div>
        </div>
      </div>
    `).join("") : `<div class="muted small">Nenhum lançamento ainda.</div>`;
  }

  if (elP){
    elP.innerHTML = pags.length ? pags.map((x)=>`
      <div class="card" style="padding:10px;margin-top:10px;">
        <div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:600;">${esc(x.forma || "pix")}</div>
            ${x.observacao ? `<div class="muted small">${esc(x.observacao)}</div>` : `<div class="muted small">—</div>`}
          </div>
          <div style="font-weight:700;">${moneyBR(x.valor)}</div>
        </div>
      </div>
    `).join("") : `<div class="muted small">Nenhum pagamento ainda.</div>`;
  }

  // botão fechar
  const btn = $("btnFecharConta");
  if (btn){
    const ok = saldo <= 0.00001 && totalLanc > 0;
    btn.disabled = !ok;
    btn.style.opacity = ok ? "1" : ".55";
  }
}

async function addLancamento(user_id, conta_id){
  const desc = $("lDesc")?.value?.trim();
  const tipo = $("lTipo")?.value || "extra";
  const valor = parseBRMoney($("lValor")?.value);

  if (!desc) throw new Error("Informe a descrição do lançamento.");
  if (valor === null || valor <= 0) throw new Error("Informe um valor válido (> 0).");

  const { error } = await supabase
    .from("agenda_lancamentos")
    .insert([{ user_id, conta_id, descricao: desc, valor, tipo }]);

  if (error) throw error;

  $("lDesc").value = "";
  $("lValor").value = "";
}

async function addPagamento(user_id, conta_id){
  const forma = $("pForma")?.value || "pix";
  const valor = parseBRMoney($("pValor")?.value);
  const obs = $("pObs")?.value?.trim() || null;

  if (valor === null || valor <= 0) throw new Error("Informe um valor válido (> 0).");

  const { error } = await supabase
    .from("agenda_pagamentos")
    .insert([{ user_id, conta_id, forma, valor, observacao: obs }]);

  if (error) throw error;

  $("pValor").value = "";
  $("pObs").value = "";
}

async function fecharConta(user_id, conta_id){
  // recalc primeiro
  const { totalLanc, totalPago } = await recomputeAndUpdateTotals(user_id, conta_id);
  if (totalLanc <= 0) throw new Error("Não dá pra fechar conta sem lançamentos.");
  if (totalPago + 0.00001 < totalLanc) throw new Error("Existe saldo pendente na conta.");

  // fecha conta
  const now = new Date().toISOString();

  const { error: e1 } = await supabase
    .from("agenda_contas")
    .update({ status: "fechada", closed_at: now, updated_at: now })
    .eq("user_id", user_id)
    .eq("id", conta_id);

  if (e1) throw e1;

  // registra checkout na reserva (se você estiver usando checked_out_at)
  const { error: e2 } = await supabase
    .from("agenda_reservas")
    .update({ checked_out_at: now })
    .eq("user_id", user_id)
    .eq("id", reservaId);

  if (e2) throw e2;
}

async function refresh(){
  setMsg("");
  const reserva = await fetchReservaEQuarto(USER.id, reservaId);

  // (opcional) se você quiser colocar no topo o quarto, você usa:
  // reserva.agenda_quartos?.codigo / nome

  const conta = await ensureConta(USER.id, reservaId);
  contaId = conta.id;

  const totals = await recomputeAndUpdateTotals(USER.id, contaId);
  renderContaUI({
    status: conta.status,
    ...totals
  });
}

function bind(){
  $("formLanc")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    try{
      await addLancamento(USER.id, contaId);
      await refresh();
      setMsg("Lançamento adicionado.", "ok");
    }catch(err){
      console.error(err);
      setMsg(err?.message || "Erro ao adicionar lançamento.", "error");
    }
  });

  $("formPag")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    try{
      await addPagamento(USER.id, contaId);
      await refresh();
      setMsg("Pagamento registrado.", "ok");
    }catch(err){
      console.error(err);
      setMsg(err?.message || "Erro ao registrar pagamento.", "error");
    }
  });

  $("btnFecharConta")?.addEventListener("click", async ()=>{
    try{
      await fecharConta(USER.id, contaId);
      await refresh();
      setMsg("Conta fechada e checkout realizado ✅", "ok");
    }catch(err){
      console.error(err);
      setMsg(err?.message || "Erro ao fechar conta.", "error");
    }
  });
}

(async function boot(){
  USER = await requireAuth({ redirectTo: "/entrar.html?next=/reserva.html", renderUserInfo: false });
  if (!USER) return;

  reservaId = getReservaId();
  if (!reservaId){
    setMsg("Reserva inválida (sem id na URL).", "error");
    return;
  }

  try{
    bind();
    await refresh();
  }catch(err){
    console.error(err);
    setMsg(err?.message || "Erro ao carregar conta.", "error");
  }
})();
