/* /js/reserva-nova.js
   V1 — Insert em agenda_reservas com validação + conversão (datas/WhatsApp)
   Contrato:
   - Inputs: #nome_hospede, #whatsapp, #checkin, #checkout, #observacoes
   - Form:   #reservaNovaForm  (ou primeiro <form> da página)
   - Feedback: #formMsg (opcional)
   - Botão submit: button[type="submit"] (opcional)
   - Redirect: /reserva.html?id=UUID (preferido) ou /reservas.html
*/

import { supabase } from "./supabase.js";

(function () {
  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);

  function setMsg(el, text, type = "info") {
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.dataset.type = type; // opcional p/ CSS: [data-type="error"]
  }

  function lockSubmit(form, locked) {
    if (!form) return;
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = !!locked;
    btn.dataset.loading = locked ? "1" : "0";
  }

  // YYYY-MM-DD (input type="date" já entrega nesse formato)
  function isISODate(v) {
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  }

  function compareISO(a, b) {
    // retorna: -1, 0, 1 (lexicográfico funciona pra YYYY-MM-DD)
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  function normalizeText(v) {
    return String(v || "").trim().replace(/\s+/g, " ");
  }

  // WhatsApp -> guarda como dígitos internacionais sem "+"
  // Ex:
  //  (13) 99740-8157 -> 5513997408157
  //  13997408157      -> 5513997408157
  //  +55 13 99740...  -> 5513997408157
  function normalizeWhatsapp(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return "";

    // Se já veio com 55 (Brasil), mantém
    if (digits.startsWith("55")) {
      return digits;
    }

    // Se veio só com DDD+numero (10 ou 11 dígitos), adiciona 55
    // Ex: 13997408157 (11) ou 1333334444 (10)
    if (digits.length === 10 || digits.length === 11) {
      return "55" + digits;
    }

    // Se veio só número sem DDD (8-9 dígitos) — inválido pra nosso contrato
    return digits; // devolve mesmo assim; validação abaixo pega
  }

  function validateWhatsappIntlDigits(w) {
    // Esperado: 55 + DDD(2) + número(8 ou 9) => 12 ou 13 dígitos total
    // 55 + 2 + 8 = 12
    // 55 + 2 + 9 = 13
    if (!/^\d+$/.test(w)) return false;
    if (!w.startsWith("55")) return false;
    if (!(w.length === 12 || w.length === 13)) return false;

    // DDD simples (01..99) — sem travar demais
    const ddd = w.slice(2, 4);
    if (ddd === "00") return false;

    return true;
  }

  // ---------- Main ----------
  const form =
    $("#reservaNovaForm") ||
    document.querySelector("form");

  if (!form) return;

  const elNome = $("#nome_hospede", form);
  const elWhats = $("#whatsapp", form);
  const elCheckin = $("#checkin", form);
  const elCheckout = $("#checkout", form);
  const elObs = $("#observacoes", form);
  const elMsg = $("#formMsg") || $(".form-msg") || $("#msg");

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    setMsg(elMsg, "");

    // Coleta
    const nome_hospede = normalizeText(elNome?.value);
    const checkin = normalizeText(elCheckin?.value);
    const checkout = normalizeText(elCheckout?.value);
    const observacoes = normalizeText(elObs?.value);

    const whatsapp_norm = normalizeWhatsapp(elWhats?.value);

    // Validação
    const errors = [];

    if (!nome_hospede || nome_hospede.length < 2) {
      errors.push("Informe o nome do hóspede.");
    }

    if (!isISODate(checkin)) {
      errors.push("Informe a data de chegada (check-in).");
    }

    if (!isISODate(checkout)) {
      errors.push("Informe a data de saída (check-out).");
    }

    if (isISODate(checkin) && isISODate(checkout)) {
      if (compareISO(checkout, checkin) < 0) {
        errors.push("A data de saída não pode ser antes da chegada.");
      }
    }

    // WhatsApp é altamente recomendado — mas você pode decidir se é obrigatório.
    // Aqui: obrigatório (pra virar produto de uso diário).
    if (!whatsapp_norm) {
      errors.push("Informe o WhatsApp do hóspede.");
    } else if (!validateWhatsappIntlDigits(whatsapp_norm)) {
      errors.push("WhatsApp inválido. Use DDD + número (ex.: (13) 99740-8157).");
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
        whatsapp: whatsapp_norm, // digits intl sem "+"
        checkin,                // YYYY-MM-DD
        checkout,               // YYYY-MM-DD
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
      // Preferido: abre a reserva criada
      if (newId) {
        window.location.href = `/reserva.html?id=${encodeURIComponent(newId)}`;
      } else {
        window.location.href = `/reservas.html`;
      }
    } catch (err) {
      console.error("reserva-nova insert error:", err);

      // Mensagem “humana”
      const msg =
        err?.message ||
        err?.error_description ||
        "Não foi possível salvar. Tente novamente.";

      setMsg(elMsg, msg, "error");
      lockSubmit(form, false);
    }
  });
})();
