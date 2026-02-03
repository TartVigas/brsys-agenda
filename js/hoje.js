/* /js/hoje.js
   V1 — Tela "Hoje"
   Queries:
   - Chegadas hoje:  checkin = today
   - Saídas hoje:    checkout = today
   - Futuras (count): checkin > today
   Contrato (HTML):
   - Container de chegadas:   #hojeChegadas (opcional)
   - Lista chegadas:          #chegadasList (ou [data-list="chegadas"])
   - Container de saídas:     #hojeSaidas (opcional)
   - Lista saídas:            #saidasList (ou [data-list="saidas"])
   - Count futuras:           #futurasCount (ou [data-kpi="futuras"])
   - Data hoje (label):       #hojeLabel (ou [data-kpi="hoje"])
   - Msg geral (opcional):    #hojeMsg
*/

import { supabase } from "./supabase.js";

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  function isoTodayLocal() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function setText(el, t) {
    if (!el) return;
    el.textContent = t;
  }

  function setMsg(el, text, type = "info") {
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.dataset.type = type;
  }

  function sanitize(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtBR(iso) {
    // YYYY-MM-DD -> DD/MM
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  }

  function waLinkFromDigits(digitsIntl) {
    const dig = String(digitsIntl || "").replace(/\D/g, "");
    if (!dig) return "";
    // wa.me aceita sem "+"
    return `https://wa.me/${dig}`;
  }

  function renderEmpty(targetEl, text) {
    if (!targetEl) return;
    targetEl.innerHTML = `<div class="empty">${sanitize(text || "Nada por aqui.")}</div>`;
  }

  function renderList(targetEl, rows, mode /* 'chegadas' | 'saidas' */) {
    if (!targetEl) return;

    if (!rows || !rows.length) {
      renderEmpty(
        targetEl,
        mode === "chegadas" ? "Nenhuma chegada hoje." : "Nenhuma saída hoje."
      );
      return;
    }

    const html = rows
      .map((r) => {
        const id = r.id;
        const nome = sanitize(r.nome_hospede || "—");
        const w = sanitize(r.whatsapp || "");
        const checkin = sanitize(fmtBR(r.checkin));
        const checkout = sanitize(fmtBR(r.checkout));
        const obs = sanitize(r.observacoes || "");
        const wa = waLinkFromDigits(r.whatsapp);

        return `
          <article class="card mini">
            <div class="mini-head">
              <div class="mini-title">${nome}</div>
              <div class="mini-dates">${checkin} → ${checkout}</div>
            </div>

            ${obs ? `<div class="mini-obs">${obs}</div>` : ""}

            <div class="mini-actions">
              <a class="btn sm" href="/reserva.html?id=${encodeURIComponent(id)}">Abrir</a>
              ${wa ? `<a class="btn sm ghost" href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
              ${w ? `<span class="pill">${w}</span>` : ""}
            </div>
          </article>
        `;
      })
      .join("");

    targetEl.innerHTML = html;
  }

  // ---------- Targets ----------
  const elChegadasList = $("#chegadasList") || document.querySelector('[data-list="chegadas"]');
  const elSaidasList = $("#saidasList") || document.querySelector('[data-list="saidas"]');
  const elFuturas = $("#futurasCount") || document.querySelector('[data-kpi="futuras"]');
  const elHojeLabel = $("#hojeLabel") || document.querySelector('[data-kpi="hoje"]');
  const elMsg = $("#hojeMsg") || $("#msg");

  // ---------- Load ----------
  async function loadHoje() {
    const today = isoTodayLocal();
    setText(elHojeLabel, today); // você pode formatar no HTML se quiser

    setMsg(elMsg, "Carregando…", "info");

    // estados iniciais
    renderEmpty(elChegadasList, "Carregando chegadas…");
    renderEmpty(elSaidasList, "Carregando saídas…");
    if (elFuturas) elFuturas.textContent = "—";

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      const user_id = authData?.user?.id;
      if (!user_id) throw new Error("Sessão expirada. Faça login novamente.");

      // 1) Chegadas hoje
      const chegadasQ = supabase
        .from("agenda_reservas")
        .select("id, nome_hospede, whatsapp, checkin, checkout, observacoes")
        .eq("user_id", user_id)
        .eq("checkin", today)
        .order("checkin", { ascending: true })
        .limit(50);

      // 2) Saídas hoje
      const saidasQ = supabase
        .from("agenda_reservas")
        .select("id, nome_hospede, whatsapp, checkin, checkout, observacoes")
        .eq("user_id", user_id)
        .eq("checkout", today)
        .order("checkout", { ascending: true })
        .limit(50);

      // 3) Futuras (count)
      // head:true não traz linhas, só count
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

      renderList(elChegadasList, chegadas, "chegadas");
      renderList(elSaidasList, saidas, "saidas");

      if (elFuturas) elFuturas.textContent = String(futurasCount);

      // msg final
      setMsg(elMsg, "", "info");
    } catch (err) {
      console.error("hoje.js load error:", err);

      const msg =
        err?.message ||
        err?.error_description ||
        "Erro ao carregar o Hoje.";

      setMsg(elMsg, msg, "error");
      renderEmpty(elChegadasList, "Não foi possível carregar as chegadas.");
      renderEmpty(elSaidasList, "Não foi possível carregar as saídas.");
      if (elFuturas) elFuturas.textContent = "—";
    }
  }

  // inicia
  loadHoje();
})();
