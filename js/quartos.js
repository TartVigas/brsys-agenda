// /js/quartos.js
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  const elMsg = $("#msg");
  const elSummary = $("#summary");

  const elQ = $("#q");
  const elFilterAtivo = $("#filterAtivo");

  const form = $("#formQuarto");
  const roomId = $("#roomId");
  const codigo = $("#codigo");
  const nome = $("#nome");
  const tipo = $("#tipo");
  const capacidade = $("#capacidade");
  const ordem = $("#ordem");
  const ativo = $("#ativo");

  const btnNovo = $("#btnNovo");
  const btnSalvar = $("#btnSalvar");
  const btnLimpar = $("#btnLimpar");

  const stateLoading = $("#stateLoading");
  const stateEmpty = $("#stateEmpty");
  const list = $("#list");

  let USER = null;
  let ROWS = [];
  let saving = false;

  function setMsg(text = "", type = "info") {
    if (!elMsg) return;
    elMsg.textContent = text || "";
    elMsg.style.color =
      type === "error" ? "rgba(255,120,120,.95)" :
      type === "ok"    ? "rgba(102,242,218,.95)" :
                         "rgba(255,255,255,.70)";
  }

  function showStates(which) {
    if (stateLoading) stateLoading.style.display = which === "loading" ? "" : "none";
    if (stateEmpty) stateEmpty.style.display = which === "empty" ? "" : "none";
    if (list) list.style.display = which === "list" ? "" : "none";
  }

  function norm(s = "") {
    return String(s || "").toLowerCase().trim();
  }

  function cleanCodigo(s = "") {
    return String(s || "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase()
      .slice(0, 10);
  }

  function validate(model) {
    if (!model.codigo || model.codigo.length < 1) return "Informe o código.";
    if (!model.nome || model.nome.length < 2) return "Informe o nome do quarto.";
    return null;
  }

  function readModel() {
    return {
      id: roomId?.value || null,
      codigo: cleanCodigo(codigo?.value || ""),
      nome: (nome?.value || "").trim(),
      tipo: (tipo?.value || "standard").trim() || "standard",
      capacidade: Number(capacidade?.value || 2),
      ordem: Number(ordem?.value || 0),
      ativo: !!ativo?.checked,
    };
  }

  function fillForm(r) {
    roomId.value = r?.id || "";
    codigo.value = r?.codigo || "";
    nome.value = r?.nome || "";
    tipo.value = r?.tipo || "standard";
    capacidade.value = String(r?.capacidade ?? 2);
    ordem.value = String(r?.ordem ?? 0);
    ativo.checked = r?.ativo !== false;
  }

  function clearForm() {
    roomId.value = "";
    codigo.value = "";
    nome.value = "";
    tipo.value = "standard";
    capacidade.value = "2";
    ordem.value = "0";
    ativo.checked = true;
    codigo.focus();
    setMsg("");
  }

  function renderRow(r) {
    const badge = r.ativo
      ? `<span class="pill" style="border:1px solid rgba(102,242,218,.35);color:rgba(102,242,218,.95);">Ativo</span>`
      : `<span class="pill" style="border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.65);">Inativo</span>`;

    return `
      <div class="list-item" data-id="${r.id}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div style="min-width:0;">
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <div style="font-weight:900;">${r.codigo} • ${r.nome}</div>
              ${badge}
            </div>
            <div class="muted small" style="margin-top:6px;">
              Tipo: <span class="mono">${r.tipo || "standard"}</span>
              • Cap: <strong>${r.capacidade ?? 2}</strong>
              • Ordem: <strong>${r.ordem ?? 0}</strong>
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            <button class="btn outline small" data-act="edit">Editar</button>
            <button class="btn outline small" data-act="toggle">${r.ativo ? "Desativar" : "Ativar"}</button>
          </div>
        </div>
      </div>
    `;
  }

  function applyFilters() {
    const q = norm(elQ?.value || "");
    const f = (elFilterAtivo?.value || "ativos");

    let rows = [...ROWS];

    if (f === "ativos") rows = rows.filter(r => r.ativo);
    if (f === "inativos") rows = rows.filter(r => !r.ativo);

    if (q) {
      rows = rows.filter(r => {
        const hay = `${r.codigo} ${r.nome} ${r.tipo}`.toLowerCase();
        return hay.includes(q);
      });
    }

    // ordena: ordem asc, depois codigo asc
    rows.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.codigo).localeCompare(String(b.codigo)));

    if (!rows.length) {
      showStates("empty");
      if (elSummary) elSummary.textContent = `0 quartos (${f})`;
      return;
    }

    showStates("list");
    if (list) list.innerHTML = rows.map(renderRow).join("");
    if (elSummary) elSummary.textContent = `${rows.length} quartos (${f})`;
  }

  async function loadRooms() {
    showStates("loading");
    setMsg("");

    const { data, error } = await supabase
      .from("agenda_quartos")
      .select("id, codigo, nome, tipo, capacidade, ordem, ativo, created_at, updated_at")
      .eq("user_id", USER.id)
      .order("ordem", { ascending: true })
      .order("codigo", { ascending: true });

    if (error) {
      console.error("[quartos] load error:", error);
      setMsg("Erro ao carregar quartos. Veja o Console (F12).", "error");
      showStates("empty");
      return;
    }

    ROWS = (data || []).map(r => ({
      ...r,
      ativo: r.ativo !== false,
    }));

    applyFilters();
  }

  async function upsertRoom(model) {
    if (saving) return;
    saving = true;

    const err = validate(model);
    if (err) {
      setMsg(err, "error");
      saving = false;
      return;
    }

    btnSalvar.disabled = true;
    setMsg("Salvando…", "info");

    const payload = {
      user_id: USER.id,
      codigo: model.codigo,
      nome: model.nome,
      tipo: model.tipo || "standard",
      capacidade: model.capacidade ?? 2,
      ordem: model.ordem ?? 0,
      ativo: model.ativo !== false,
    };

    let q = supabase.from("agenda_quartos");

    const { data, error } = model.id
      ? await q.update(payload).eq("id", model.id).eq("user_id", USER.id).select("*").single()
      : await q.insert(payload).select("*").single();

    saving = false;
    btnSalvar.disabled = false;

    if (error) {
      console.error("[quartos] save error:", error);

      // conflito de unique (user_id,codigo)
      if (String(error.message || "").toLowerCase().includes("unique")) {
        setMsg("Já existe um quarto com esse código. Troque o código.", "error");
        return;
      }

      setMsg("Erro ao salvar. Verifique RLS/Conexão e tente de novo.", "error");
      return;
    }

    setMsg("Salvo ✅", "ok");

    // atualiza cache local
    const idx = ROWS.findIndex(x => x.id === data.id);
    if (idx >= 0) ROWS[idx] = data;
    else ROWS.unshift(data);

    applyFilters();
    fillForm(data);
  }

  async function toggleActive(id, next) {
    setMsg("Atualizando…", "info");

    const { data, error } = await supabase
      .from("agenda_quartos")
      .update({ ativo: !!next })
      .eq("id", id)
      .eq("user_id", USER.id)
      .select("*")
      .single();

    if (error) {
      console.error("[quartos] toggle error:", error);
      setMsg("Erro ao atualizar status. Veja o Console (F12).", "error");
      return;
    }

    const idx = ROWS.findIndex(x => x.id === data.id);
    if (idx >= 0) ROWS[idx] = data;

    setMsg(next ? "Quarto ativado ✅" : "Quarto desativado ✅", "ok");
    applyFilters();
  }

  function bindListActions() {
    list?.addEventListener("click", async (e) => {
      const btn = e.target?.closest?.("button[data-act]");
      if (!btn) return;

      const item = e.target.closest(".list-item");
      const id = item?.getAttribute("data-id");
      if (!id) return;

      const r = ROWS.find(x => x.id === id);
      if (!r) return;

      const act = btn.getAttribute("data-act");

      if (act === "edit") {
        fillForm(r);
        window.scrollTo({ top: 0, behavior: "smooth" });
        setMsg("Editando quarto. Faça ajustes e clique Salvar.", "info");
        return;
      }

      if (act === "toggle") {
        const next = !(r.ativo !== false);
        await toggleActive(id, next);
        return;
      }
    });
  }

  (async function boot() {
    USER = await requireAuth({ redirectTo: "/entrar.html?next=/quartos.html", renderUserInfo: false });
    if (!USER) return;

    btnNovo?.addEventListener("click", () => {
      clearForm();
      setMsg("Novo quarto.", "info");
    });

    btnLimpar?.addEventListener("click", clearForm);

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await upsertRoom(readModel());
    });

    elQ?.addEventListener("input", applyFilters);
    elFilterAtivo?.addEventListener("change", applyFilters);

    bindListActions();
    clearForm();
    await loadRooms();
  })();
})();
