/* /js/reserva-nova.js
   V1 — Insert em agenda_reservas com validação + conversão (datas/WhatsApp)

   ESTE ARQUIVO ESTÁ ALINHADO COM O SEU reserva-nova.html:
   - Form:        #formReserva
   - Inputs:      #nome, #whatsapp, #checkin, #checkout, #obs
   - Feedback:    #msg
   - Botões:      #btnSalvar (submit), #btnLimpar (type=button)

   Contrato Supabase (agenda_reservas):
   - id, user_id, nome_hospede, whatsapp, checkin, checkout, observacoes, created_at
   - checkin/checkout salvos como YYYY-MM-DD
   - whatsapp salvo como dígitos (ex: 5511999998888)
*/

import { supabase } from "./supabase.js";

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  // ---------- UI helpers ----------
  function setMsg(el, text, type = "info") {
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.dataset.type = type; // opcional p/ CSS
  }

  function lockSubmit(form, locked) {
    if (!form) return;
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = !!locked;
    btn.dataset.loading = locked ? "1" : "0";
  }

  function normalizeText(v) {
    return String(v || "").trim().replace(/\s+/g, " ");
  }

  // ---------- Data (BR) -> ISO ----------
  function maskDateInput(el) {
    if (!el) return;
    el.addEventListener("input", () => {
      // aceita só números, aplica DD/MM/AAAA
      let v = el.value.replace(/\D/g, "").slice(0, 8);

      if (v.length >= 5) el.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
      else if (v.length >= 3) el.value = `${v.slice(0, 2)}/${v.slice(2)}`;
      else el.value = v;
    });

    // melhora UX: se colar "01/02/2026" ou "01022026", mantém ok
    el.addEventListener("paste", () => {
      setTimeout(() => {
        let v = el.value.replace(/\D/g, "").slice(0, 8);
        if (v.length >= 5) el.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
        else if (v.length >= 3) el.value = `${v.slice(0, 2)}/${v.slice(2)}`;
        else el.value = v;
      }, 0);
    });
  }

  function brDateToISO(v) {
    const s = normalizeText(v);
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return "";
    const dd = m[1], mm = m[2], yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  function isISODate(v) {
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  }

  function compareISO(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  // valida datas reais (ex: 31/02 deve falhar)
  function isValidISOCalendarDate(iso) {
    if (!isISODate(iso)) return false;
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return (
      dt.getFullYear() === y &&
      dt.getMonth() === m - 1 &&
      dt.getDate() === d
    );
  }

  // ---------- WhatsApp ----------
  function maskWhatsappInput(el) {
    if (!el) return;
    el.addEventListener("input", () => {
      // aceita até 11 dígitos (DDD + número BR)
      let v = el.value.replace(/\D/g, "").slice(0, 11);

      if (v.length >= 7) el.value = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
      else if (v.length >= 3) el.value = `(${v.slice(0, 2)}) ${v.slice(2)}`;
      else el.value = v;
    });

    el.addEventListener("paste", () => {
      setTimeout(() => {
        let v = el.value.replace(/\D/g, "").slice(0, 11);
        if (v.length >= 7) el.value = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
        else if (v.length >= 3) el.value = `(${v.slice(0, 2)}) ${v.slice(2)}`;
        else el.value = v;
      }, 0);
    });
  }

  // retorna 5511.... (sem +)
  function normalizeWhatsappTo55(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return "";

    // se já vier com 55
    if (digits.startsWith("55")) return digits;

    // se vier com DDD + número (10 ou 11 dígitos)
    if (digits.length === 10 || digits.length === 11) return "55" + digits;

    return digits; // cai na validação
  }

  function validateWhatsapp55(w) {
    // Esperado: 55 + DDD(2) + número(8 ou 9) => 12 ou 13 dígitos
    if (!/^\d+$/.test(w)) return false;
    if (!w.startsWith("55")) return false;
    if (!(w.length === 12 || w.length === 13)) return false;

    const ddd = w.slice(2, 4);
    if (ddd === "00") return false;

    return true;
  }

  // ---------- Main ----------
  const form = $("#formReserva") || document.querySelector("form");
  if (!form) return;

  // IDs reais do seu HTML
  const elNome = $("#nome", form);
  const elWhats = $("#whatsapp", form);
  const elCheckin = $("#checkin", form);
  const elCheckout = $("#checkout", form);
  const elObs = $("#obs", form);
  const elMsg = $("#msg") || $(".form-msg");
  const btnLimpar = $("#btnLimpar");

  // ativa máscaras
  maskDateInput(elCheckin);
  maskDateInput(elCheckout);
  maskWhatsappInput(elWhats);

  // limpar
  if (btnLimpar) {
    btnLimpar.addEventListener("click", () => {
      if (elNome) elNome.value = "";
      if (elWhats) elWhats.value = "";
      if (elCheckin) elCheckin.value = "";
      if (elCheckout) elCheckout.value = "";
      if (elObs) elObs.value = "";
      setMsg(elMsg, "");
      elNome?.focus?.();
    });
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    setMsg(elMsg, "");

    // Coleta (BR)
    const nome_hospede = normalizeText(elNome?.value);
    const checkinISO = brDateToISO(elCheckin?.value);
    const checkoutISO = brDateToISO(elCheckout?.value);
    const observacoes = normalizeText(elObs?.value);

    const whatsapp55 = normalizeWhatsappTo55(elWhats?.value);

    // Validação
    const errors = [];

    if (!nome_hospede || nome_hospede.length < 2) {
      errors.push("Informe o nome do hóspede.");
    }

    if (!checkinISO || !isValidISOCalendarDate(checkinISO)) {
      errors.push("Informe a data de chegada (check-in) no formato DD/MM/AAAA.");
    }

    if (!checkoutISO || !isValidISOCalendarDate(checkoutISO)) {
      errors.push("Informe a data de saída (check-out) no formato DD/MM/AAAA.");
    }

    if (isISODate(checkinISO) && isISODate(checkoutISO)) {
      if (compareISO(checkoutISO, checkinISO) < 0) {
        errors.push("A data de saída não pode ser antes da chegada.");
      }
    }

    if (!whatsapp55) {
      errors.push("Informe o WhatsApp do hóspede.");
    } else if (!validateWhatsapp55(whatsapp55)) {
      errors.push("WhatsApp inválido. Digite DDD + número (ex.: 11999998888).");
    }

    if (errors.length) {
      setMsg(elMsg, errors.join(" "), "error");
      return;
    }

    lockSubmit(form, true);
    setMsg(elMsg, "Salvando reserva…", "info");

    try {
      // user_id (contrato + segurança)
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      const user_id = authData?.user?.id;
      if (!user_id) throw new Error("Sessão expirada. Faça login novamente.");

      const payload = {
        user_id,
        nome_hospede,
        whatsapp: whatsapp55,  // 5511...
        checkin: checkinISO,   // YYYY-MM-DD
        checkout: checkoutISO, // YYYY-MM-DD
        observacoes: observacoes || null,
      };

      // Insert e retorna id
      const { data, error } = await supabase
        .from("agenda_reservas")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      setMsg(elMsg, "Reserva criada com sucesso ✅", "success");

      const newId = data?.id;
      if (newId) {
        window.location.href = `/reserva.html?id=${encodeURIComponent(newId)}`;
      } else {
        window.location.href = `/reservas.html`;
      }
    } catch (err) {
      console.error("reserva-nova insert error:", err);

      const msg =
        err?.message ||
        err?.error_description ||
        "Não foi possível salvar. Tente novamente.";

      setMsg(elMsg, msg, "error");
      lockSubmit(form, false);
    }
  });
})();
