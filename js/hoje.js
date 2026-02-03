/* /js/hoje.js
   V1 — Tela "Hoje" (alinhada ao hoje.html novo)

   HTML contract:
   - today label:        #todayLabel
   - msg:                #msg
   - states:             #stateLoading, #stateContent, #stateError
   - KPIs:               #kpiFuture, #kpiArrivals, #kpiDepartures
   - lists:              #arrivalsList, #departuresList
   - empties:            #arrivalsEmpty, #departuresEmpty
   - actions:            #btnReload, #btnRetry

   Queries:
   - Chegadas hoje:  checkin = today
   - Saídas hoje:    checkout = today
   - Futuras (count): checkin > today
*/

import { supabase } from "./supabase.js";

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  // ---------- helpers ----------
  function isoTodayLocal() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function fmtDateBR(iso) {
    // YYYY-MM-DD -> DD/MM/YYYY
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  }

  function fmtShortBR(iso) {
    // YYYY-MM-DD -> DD/MM
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  }

  function sanitize(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setText(el, t) {
    if (!el) return;
    el.textContent = t ?? "";
  }

  function setMsg(el, text, type = "info") {
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.dataset.type = type;
  }

  function show(el) {
    if (el) el.style.display = "";
  }

  function hide(el) {
    if (el) el.style.display = "none";
  }

  function waLinkFromAny(phone) {
    // aceita "5513997408157", "(13) 99740-8157", etc.
    const dig = String(phone || "").replace(/\D/g, "");
    if (!dig) return "";
    return `https://wa.me/${dig}`;
  }

  function roomLabelFromRow(r) {
    // tenta formar algo tipo: "Q04 • Quarto 04" / "S05 • Suíte Duplex"
    const q = r?.agenda_quartos;
    if (!q) return "";
    const codigo = q.codigo ? sanitize(q.codigo) : "";
    const nome = q.nome ? sanitize(q.nome) : "";
    if (codigo && nome) return `${codigo} • ${nome}`;
    return codigo || nome || "";
  }

  function renderList(targetEl, rows, kind /* 'arrivals'|'departures' */) {
    if (!targetEl) return;

    if (!rows || !rows.length) {
      targetEl.innerHTML = "";
      return;
    }

    const html = rows
      .map((r) => {
        const id = r.id;
        const nome = sanitize(r.nome_hospede || "—");
        const phone = sanitize(r.whatsapp || "");
        const checkin = sanitize(fmtShortBR(r.checkin));
        const checkout = sanitize(fmtShortBR(r.checkout));
        const obs = sanitize(r.observacoes || r.notes || "");
        const wa = waLinkFromAny(r.whatsapp);
        const room = roomLabelFromRow(r);

        return `
          <article class="card mini" style="margin:0 0 10px 0;">
            <div class="mini-head">
              <div class="mini-title">${nome}</div>
              <div class="mini-dates">${checkin} → ${checkout}</div>
            </div>

            ${room ? `<div class="muted small" style="margin-top:6px;">${room}</div>` : ""}

            ${obs ? `<div class="mini-obs" style="margin-top:8px;">${obs}</div>` : ""}

            <div class="mini-actions" style="margin-top:10px;">
              <a class="btn sm" href="/reserva.html?id=${encodeURIComponent(id)}">Abrir</a>
              ${wa ? `<a class="btn sm ghost" href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
              ${phone ? `<span class="pill">${phone}</span>` : ""}
            </div>
          </article>
        `;
      })
      .join("");

    targetEl.innerHTML = html;
  }

  // ---------- DOM targets (novo hoje.html) ----------
  const elTodayLabel = $("#todayLabel");
  const elMsg = $("#msg");

  const elStateLoading = $("#stateLoading");
  const elStateContent = $("#stateContent");
  const elStateError = $("#stateError");

  const elKpiFuture = $("#kpiFuture");
  const elKpiArrivals = $("#kpiArrivals");
  const elKpiDepartures = $("#kpiDepartures");

  const elArrivalsList = $("#arrivalsList");
  const elDeparturesList = $("#departuresList");

  const elArrivalsEmpty = $("#arrivalsEmpty");
  const elDeparturesEmpty = $("#departuresEmpty");

  const btnReload = $("#btnReload");
  const btnRetry = $("#btnRetry");

  function setState(which) {
    // which: "loading" | "content" | "error"
    if (which === "loading") {
      show(elStateLoading);
      hide(elStateContent);
      hide(elStateError);
      return;
    }
    if (which === "error") {
      hide(elStateLoading);
      hide(elStateContent);
      show(elStateError);
      return;
    }
    // content
    hide(elStateLoading);
    show(elStateContent);
    hide(elStateError);
  }

  function resetUI() {
    setText(elKpiFuture, "—");
    setText(elKpiArrivals, "—");
    setText(elKpiDepartures, "—");

    if (elArrivalsList) elArrivalsList.innerHTML = "";
    if (elDeparturesList) elDeparturesList.innerHTML = "";

    hide(elArrivalsEmpty);
    hide(elDeparturesEmpty);
  }

  // ---------- Load ----------
  async function loadHoje() {
    const today = isoTodayLocal();
    setText(elTodayLabel, `Resumo rápido do dia. ${fmtDateBR(today)}`);

    setMsg(elMsg, "", "info");
    setState("loading");
    resetUI();

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      const user_id = authData?.user?.id;
      if (!user_id) throw new Error("Sessão expirada. Faça login novamente.");

      // Join para pegar o quarto (codigo/nome)
      // Fica: agenda_quartos(codigo,nome)
      const selectFields =
        "id, nome_hospede, whatsapp, checkin, checkout, observacoes, quarto_id, agenda_quartos(codigo,nome)";

      const chegadasQ = supabase
        .from("agenda_reservas")
        .select(selectFields)
        .eq("user_id", user_id)
        .eq("checkin", today)
        .order("checkin", { ascending: true })
        .limit(100);

      const saidasQ = supabase
        .from("agenda_reservas")
        .select(selectFields)
        .eq("user_id", user_id)
        .eq("checkout", today)
        .order("checkout", { ascending: true })
        .limit(100);

      // Futuras (count)
      const futurasQ = supabase
        .from("agenda_reservas")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .gt("checkin", today);

      const [chegadasRes, saidasRes, futurasRes] = await Promise.all([
        chegadasQ,
        saidasQ,
        futurasQ,
      ]);

      if (chegadasRes.error) throw chegadasRes.error;
      if (saidasRes.error) throw saidasRes.error;
      if (futurasRes.error) throw futurasRes.error;

      const chegadas = chegadasRes.data || [];
      const saidas = saidasRes.data || [];
      const futurasCount = futurasRes.count ?? 0;

      // KPIs
      setText(elKpiFuture, String(futurasCount));
      setText(elKpiArrivals, String(chegadas.length));
      setText(elKpiDepartures, String(saidas.length));

      // Lists + empties
      if (!chegadas.length) show(elArrivalsEmpty);
      else hide(elArrivalsEmpty);

      if (!saidas.length) show(elDeparturesEmpty);
      else hide(elDeparturesEmpty);

      renderList(elArrivalsList, chegadas, "arrivals");
      renderList(elDeparturesList, saidas, "departures");

      setState("content");
      setMsg(elMsg, "", "info");
    } catch (err) {
      console.error("hoje.js load error:", err);

      const msg =
        err?.message ||
        err?.error_description ||
        "Erro ao carregar o Hoje.";

      setMsg(elMsg, msg, "error");
      setState("error");
    }
  }

  // ---------- events ----------
  if (btnReload) btnReload.addEventListener("click", loadHoje);
  if (btnRetry) btnRetry.addEventListener("click", loadHoje);

  // init
  loadHoje();
})();
