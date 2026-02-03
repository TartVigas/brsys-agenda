// /js/quartos.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  const elMsg = $("#msg");
  const elSummary = $("#summary");
  const stateLoading = $("#stateLoading");
  const stateEmpty = $("#stateEmpty");
  const stateList = $("#stateList");
  const listEl = $("#list");

  const formNovo = $("#formNovo");
  const inCodigo = $("#codigo");
  const inNome = $("#nome");
  const inTipo = $("#tipo");
  const inCap = $("#capacidade");
  const inOrdem = $("#ordem");
  const inAtivo = $("#ativo");

  const btnSeed = $("#btnSeed");
  const btnReload = $("#btnReload");
  const btnClear = $("#btnClear");

  let USER = null;
  let ROOMS = [];

  function setMsg(text = "", type = "info") {
    if (!elMsg) return;
    elMsg.textContent = text || "";
    elMsg.style.color =
      type === "error" ? "rgba(255,120,120,.95)" :
      type === "ok"    ? "rgba(102,242,218,.95)" :
                         "rgba(255,255,255,.70)";
  }

  function show(which) {
    if (stateLoading) stateLoading.style.display = which === "loading" ? "" : "none";
    if (stateEmpty) stateEmpty.style.display = which === "empty" ? "" : "none";
    if (stateList) stateList.style.display = which === "list" ? "" : "none";
  }

  function normalizeText(v) {
    return String(v || "").trim().replace(/\s+/g, " ");
  }

  function normalizeCode(v) {
    // mantém letras/números, remove espaços, deixa em maiúsculo
    return normalizeText(v).replace(/\s+/g, "").toUpperCase();
  }

  function toInt(v, fallback = 0) {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : fallback;
  }

  function escapeHtml(str = "") {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function roomCard(r) {
    const ativo = !!r.ativo;

    return `
      <div class="list-item" data-id="${escapeHtml(r.id)}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:900;">
              ${escapeHtml(r.codigo)} • ${escapeHtml(r.nome)}
              ${ativo ? "" : `<span class="pill" style="margin-left:8px;">inativo</span>`}
            </div>
            <div class="muted small" style="margin-top:4px;">
              Tipo: <span class="mono">${escapeHtml(r.tipo || "standard")}</span>
              • Cap.: <span class="mono">${escapeHtml(String(r.capacidade ?? 2))}</span>
              • Ordem: <span class="mono">${escapeHtml(String(r.ordem ?? 0))}</span>
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            <button class="btn outline small" data-action="edit">Editar</button>
            <button class="btn outline small" data-action="toggle">${ativo ? "Desativar" : "Ativar"}</button>
            <button class="btn outline small" data-action="delete">Excluir</button>
          </div>
        </div>

        <!-- editor inline -->
        <div class="card" data-editor style="display:none;margin-top:12px;">
          <div class="grid-3" style="gap:12px;">
            <label class="label">
              Código
              <input class="input" data-f="codigo" value="${escapeHtml(r.codigo || "")}" />
            </label>
            <label class="label">
              Nome
              <input class="input" data-f="nome" value="${escapeHtml(r.nome || "")}" />
            </label>
            <label class="label">
              Tipo
              <input class="input" data-f="tipo" value="${escapeHtml(r.tipo || "standard")}" />
            </label>
          </div>

          <div class="grid-3" style="gap:12px;margin-top:12px;">
            <label class="label">
              Capacidade
              <input class="input" data-f="capacidade" type="number" min="1" max="20" value="${escapeHtml(String(r.capacidade ?? 2))}" />
            </label>
            <label class="label">
              Ordem
              <input class="input" data-f="ordem" type="number" value="${escapeHtml(String(r.ordem ?? 0))}" />
            </label>
            <label class="label" style="display:flex;align-items:center;gap:10px;">
              <input data-f="ativo" type="checkbox" ${ativo ? "checked" : ""} />
              <span>Ativo</span>
            </label>
          </div>

          <div class="row" style="margin-top:14px;gap:10px;flex-wrap:wrap;">
            <button class="btn primary" data-action="save">Salvar</button>
            <button class="btn outline" data-action="cancel">Cancelar</button>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    if (elSummary) elSummary.textContent = `Total: ${ROOMS.length}`;

    if (!ROOMS.length) {
      show("empty");
      if (listEl) listEl.innerHTML = "";
      return;
    }

    // ordena por ativo desc, ordem asc, codigo asc
    const ordered = [...ROOMS].sort((a, b) => {
      const av = a.ativo ? 0 : 1;
      const bv = b.ativo ? 0 : 1;
      if (av !== bv) return av - bv;

      const ao = Number(a.ordem ?? 0);
      const bo = Number(b.ordem ?? 0);
      if (ao !== bo) return ao - bo;

      return String(a.codigo || "").localeCompare(String(b.codigo || ""), "pt-BR", { numeric: true });
    });

    if (listEl) listEl.innerHTML = ordered.map(roomCard).join("");
    show("list");
  }

  async function loadRooms() {
    setMsg("");
    show("loading");

    const { data, error } = await supabase
      .from("agenda_quartos")
      .select("id, codigo, nome, tipo, capacidade, ativo, ordem, created_at, updated_at")
      .eq("user_id", USER.id);

    if (error) {
      console.error("[quartos] load error:", error);
      setMsg("Erro ao carregar quartos. Verifique conexão/RLS.", "error");
      show("empty");
      return;
    }

    ROOMS = data || [];
    render();
  }

  function clearForm() {
    if (inCodigo) inCodigo.value = "";
    if (inNome) inNome.value = "";
    if (inTipo) inTipo.value = "standard";
    if (inCap) inCap.value = "2";
    if (inOrdem) inOrdem.value = "0";
    if (inAtivo) inAtivo.checked = true;
  }

  function validateNew(payload) {
    if (!payload.codigo || payload.codigo.length < 1) return "Informe o código.";
    if (!payload.nome || payload.nome.length < 2) return "Informe o nome do quarto.";
    if (payload.capacidade < 1 || payload.capacidade > 20) return "Capacidade inválida (1–20).";
    return null;
  }

  async function addRoom(ev) {
    ev.preventDefault();
    setMsg("");

    const payload = {
      user_id: USER.id,
      codigo: normalizeCode(inCodigo?.value),
      nome: normalizeText(inNome?.value),
      tipo: normalizeText(inTipo?.value) || "standard",
      capacidade: toInt(inCap?.value, 2),
      ordem: toInt(inOrdem?.value, 0),
      ativo: !!inAtivo?.checked,
    };

    const err = validateNew(payload);
    if (err) return setMsg(err, "error");

    // insert
    const { data, error } = await supabase
      .from("agenda_quartos")
      .insert(payload)
      .select("id, codigo, nome, tipo, capacidade, ativo, ordem, created_at, updated_at")
      .single();

    if (error) {
      console.error("[quartos] insert error:", error);
      // erro comum: unique (user_id,codigo)
      const msg = (String(error.message || "").includes("agenda_quartos_user_codigo_uk"))
        ? "Já existe um quarto com esse código."
        : (error.message || "Erro ao salvar. Tente novamente.");
      return setMsg(msg, "error");
    }

    ROOMS.push(data);
    render();
    clearForm();
    setMsg("Quarto adicionado ✅", "ok");
  }

  function getRoom(id) {
    return ROOMS.find(r => r.id === id);
  }

  async function updateRoom(id, patch) {
    const { data, error } = await supabase
      .from("agenda_quartos")
      .update(patch)
      .eq("id", id)
      .eq("user_id", USER.id)
      .select("id, codigo, nome, tipo, capacidade, ativo, ordem, created_at, updated_at")
      .single();

    if (error) {
      console.error("[quartos] update error:", error);
      const msg = (String(error.message || "").includes("agenda_quartos_user_codigo_uk"))
        ? "Esse código já existe em outro quarto."
        : (error.message || "Erro ao atualizar.");
      setMsg(msg, "error");
      return null;
    }

    // atualiza no array
    ROOMS = ROOMS.map(r => (r.id === id ? data : r));
    render();
    setMsg("Atualizado ✅", "ok");
    return data;
  }

  async function deleteRoom(id) {
    const r = getRoom(id);
    const name = r?.nome ? `"${r.nome}"` : "este quarto";
    const ok = window.confirm(`Excluir ${name}? Essa ação não pode ser desfeita.`);
    if (!ok) return;

    setMsg("Excluindo…", "info");

    const { error } = await supabase
      .from("agenda_quartos")
      .delete()
      .eq("id", id)
      .eq("user_id", USER.id);

    if (error) {
      console.error("[quartos] delete error:", error);
      return setMsg(error.message || "Erro ao excluir.", "error");
    }

    ROOMS = ROOMS.filter(x => x.id !== id);
    render();
    setMsg("Excluído ✅", "ok");
  }

  async function toggleRoom(id) {
    const r = getRoom(id);
    if (!r) return;

    setMsg("Atualizando…", "info");
    await updateRoom(id, { ativo: !r.ativo });
  }

  function toggleEditor(cardEl, open) {
    const editor = cardEl.querySelector('[data-editor]');
    if (!editor) return;
    editor.style.display = open ? "" : "none";
  }

  async function saveEditor(cardEl) {
    const id = cardEl.getAttribute("data-id");
    const r = getRoom(id);
    if (!r) return;

    const getVal = (f) => cardEl.querySelector(`[data-f="${f}"]`);
    const vCodigo = normalizeCode(getVal("codigo")?.value);
    const vNome = normalizeText(getVal("nome")?.value);
    const vTipo = normalizeText(getVal("tipo")?.value) || "standard";
    const vCap = toInt(getVal("capacidade")?.value, 2);
    const vOrdem = toInt(getVal("ordem")?.value, 0);
    const vAtivo = !!getVal("ativo")?.checked;

    const patch = {
      codigo: vCodigo,
      nome: vNome,
      tipo: vTipo,
      capacidade: vCap,
      ordem: vOrdem,
      ativo: vAtivo,
    };

    const err = validateNew({ ...patch, user_id: USER.id });
    if (err) return setMsg(err, "error");

    await updateRoom(id, patch);
    toggleEditor(cardEl, false);
  }

  async function seedDefaults() {
    const ok = window.confirm("Criar quartos padrão 01–10? (não duplica códigos existentes)");
    if (!ok) return;

    setMsg("Criando quartos padrão…", "info");

    // cria 01..10
    const items = Array.from({ length: 10 }).map((_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return {
        user_id: USER.id,
        codigo: n,
        nome: `Quarto ${n}`,
        tipo: "standard",
        capacidade: 2,
        ativo: true,
        ordem: i + 1,
      };
    });

    // insert em lote (constraint unique segura duplicados, mas o Supabase retorna erro se bater unique)
    // então fazemos 1 por 1 de forma segura (simples e robusto).
    let created = 0;
    for (const it of items) {
      const { data, error } = await supabase
        .from("agenda_quartos")
        .insert(it)
        .select("id, codigo, nome, tipo, capacidade, ativo, ordem, created_at, updated_at")
        .single();

      if (!error && data) {
        ROOMS.push(data);
        created++;
      }
    }

    render();
    setMsg(`Padrão criado ✅ (${created} novos)`, "ok");
  }

  // Delegação de eventos na lista
  function bindListActions() {
    if (!listEl) return;

    listEl.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button, a");
      if (!btn) return;

      const card = ev.target.closest(".list-item[data-id]");
      if (!card) return;

      const id = card.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      if (!action) return;

      if (action === "edit") {
        toggleEditor(card, true);
        return;
      }

      if (action === "cancel") {
        toggleEditor(card, false);
        setMsg("");
        return;
      }

      if (action === "save") {
        await saveEditor(card);
        return;
      }

      if (action === "toggle") {
        await toggleRoom(id);
        return;
      }

      if (action === "delete") {
        await deleteRoom(id);
        return;
      }
    });
  }

  // Boot
  (async function boot() {
    USER = await requireAuth({ redirectTo: "/entrar.html?next=/quartos.html", renderUserInfo: false });
    if (!USER) return;

    bindListActions();

    formNovo?.addEventListener("submit", addRoom);
    btnClear?.addEventListener("click", clearForm);
    btnReload?.addEventListener("click", loadRooms);
    btnSeed?.addEventListener("click", seedDefaults);

    await loadRooms();
  })();
})();
