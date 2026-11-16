import { EFFECT_EXCLUSION_SETTING, normalizeEffectExclusionGroups } from "../utils/effect-exclusion.mjs";

const escapeHtml = value => String(value ?? "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
const emptyItemsMarkup = () => `<p class="effect-exclusion-items-empty"><i class="fas fa-layer-group" aria-hidden="true"></i><span>Nenhum Item Efeito adicionado.</span></p>`;

export class EffectExclusionConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "gum-effect-exclusion-config",
      title: "Grupos de exclusão de efeitos",
      template: "systems/gum/templates/apps/effect-exclusion-config.hbs",
      classes: ["gum", "effect-exclusion-config", "theme-dark"],
      width: 780,
      height: 620,
      resizable: true,
      scrollY: [".effect-exclusion-list"],
      closeOnSubmit: false
    });
  }

  async getData() {
    this._collapsedGroupIds ??= new Set();
    const groups = normalizeEffectExclusionGroups(game.settings.get("gum", EFFECT_EXCLUSION_SETTING));
    const resolvedGroups = await Promise.all(groups.map(async group => ({
      ...group,
      collapsed: this._collapsedGroupIds.has(group.id),
      effects: await Promise.all(group.effectUuids.map(async uuid => {
        const item = await fromUuid(uuid).catch(() => null);
        return {
          uuid,
          name: item?.name || "Item não encontrado",
          img: item?.img || "icons/svg/hazard.svg",
          valid: item?.type === "effect"
        };
      }))
    })));
    return { groups: resolvedGroups };
  }

  _effectMarkup(item) {
    const valid = item?.type === "effect";
    const uuid = item?.uuid || "";
    return `<article class="effect-exclusion-item ${valid ? "" : "is-invalid"}" data-effect-uuid="${escapeHtml(uuid)}">
      <img src="${escapeHtml(item?.img || "icons/svg/hazard.svg")}" alt="">
      <span><strong>${escapeHtml(item?.name || "Item não encontrado")}</strong><small>${escapeHtml(uuid)}</small></span>
      <button type="button" data-remove-effect title="Remover Item Efeito"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    </article>`;
  }

  _groupMarkup() {
    const groupId = foundry.utils.randomID();
    return `<section class="effect-exclusion-row" data-exclusion-group data-group-id="${escapeHtml(groupId)}">
      <div class="effect-exclusion-row-header">
        <label><span>Nome do grupo</span><input type="text" data-group-name placeholder="Ex.: Posturas defensivas"></label>
        <span class="effect-exclusion-count" data-effect-count>0 itens</span>
        <button type="button" data-toggle-group aria-expanded="true" title="Recolher grupo"><i class="fas fa-chevron-up" aria-hidden="true"></i></button>
        <button type="button" data-remove-group title="Remover grupo"><i class="fas fa-trash" aria-hidden="true"></i><span>Remover</span></button>
      </div>
      <div class="effect-exclusion-source">
        <label><span>Adicionar Item Efeito</span><small>Cole um UUID ou arraste um item para a área abaixo.</small></label>
        <div><input type="text" data-effect-uuid-input placeholder="Item.… ou Compendium.…"><button type="button" data-add-effect><i class="fas fa-plus" aria-hidden="true"></i><span>Adicionar</span></button></div>
      </div>
      <div class="effect-exclusion-dropzone" data-effect-dropzone><i class="fas fa-arrow-down-to-bracket" aria-hidden="true"></i><span><strong>Solte o Item Efeito aqui</strong><small>Itens de atores, diretório ou compêndios</small></span></div>
      <div class="effect-exclusion-items" data-effect-items>${emptyItemsMarkup()}</div>
    </section>`;
  }

  _setGroupCollapsed(group, collapsed) {
    this._collapsedGroupIds ??= new Set();
    const groupId = group?.dataset.groupId;
    if (groupId) this._collapsedGroupIds[collapsed ? "add" : "delete"](groupId);
    group?.classList.toggle("is-collapsed", collapsed);
    const toggle = group?.querySelector("[data-toggle-group]");
    if (!toggle) return;
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.title = collapsed ? "Expandir grupo" : "Recolher grupo";
    toggle.querySelector("i")?.classList.toggle("fa-chevron-down", collapsed);
    toggle.querySelector("i")?.classList.toggle("fa-chevron-up", !collapsed);
  }

  _refreshGroupState(group) {
    const container = group.querySelector("[data-effect-items]");
    const count = container.querySelectorAll("[data-effect-uuid]").length;
    container.querySelector(".effect-exclusion-items-empty")?.remove();
    if (!count) container.insertAdjacentHTML("beforeend", emptyItemsMarkup());
    const countLabel = group.querySelector("[data-effect-count]");
    if (countLabel) countLabel.textContent = `${count} ${count === 1 ? "item" : "itens"}`;
  }

  async _addEffect(group, rawUuid, root) {
    const uuid = String(rawUuid || "").trim();
    if (!uuid) return ui.notifications.warn("Informe o UUID de um Item Efeito.");
    const item = await fromUuid(uuid).catch(() => null);
    if (item?.type !== "effect") return ui.notifications.error(`Item Efeito não encontrado: ${uuid}`);
    const duplicate = Array.from(root.querySelectorAll("[data-effect-uuid]")).find(element => element.dataset.effectUuid === item.uuid);
    if (duplicate) {
      const sameGroup = duplicate.closest("[data-exclusion-group]") === group;
      return ui.notifications.warn(sameGroup ? "Este Item Efeito já está no grupo." : "Este Item Efeito já pertence a outro grupo.");
    }
    group.querySelector("[data-effect-items]").insertAdjacentHTML("beforeend", this._effectMarkup(item));
    const input = group.querySelector("[data-effect-uuid-input]");
    if (input) input.value = "";
    this._refreshGroupState(group);
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0];

    html.find("[data-add-group]").on("click", () => {
      html.find(".effect-exclusion-empty").remove();
      html.find("[data-groups]").append(this._groupMarkup());
      html.find("[data-exclusion-group]").last().find("[data-group-name]").trigger("focus");
    });
    html.on("click", "[data-toggle-group]", event => {
      const group = event.currentTarget.closest("[data-exclusion-group]");
      this._setGroupCollapsed(group, !group.classList.contains("is-collapsed"));
    });
    html.on("click", "[data-remove-group]", event => event.currentTarget.closest("[data-exclusion-group]")?.remove());
    html.on("click", "[data-remove-effect]", event => {
      const group = event.currentTarget.closest("[data-exclusion-group]");
      event.currentTarget.closest("[data-effect-uuid]")?.remove();
      if (group) this._refreshGroupState(group);
    });
    html.on("click", "[data-add-effect]", event => {
      const group = event.currentTarget.closest("[data-exclusion-group]");
      this._addEffect(group, group.querySelector("[data-effect-uuid-input]")?.value, root);
    });
    html.on("keydown", "[data-effect-uuid-input]", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const group = event.currentTarget.closest("[data-exclusion-group]");
      this._addEffect(group, event.currentTarget.value, root);
    });
    html.on("dragover", "[data-effect-dropzone]", event => {
      event.preventDefault();
      event.currentTarget.classList.add("is-dragover");
    });
    html.on("dragleave", "[data-effect-dropzone]", event => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove("is-dragover");
    });
    html.on("drop", "[data-effect-dropzone]", async event => {
      event.preventDefault();
      event.currentTarget.classList.remove("is-dragover");
      const data = TextEditor.getDragEventData(event.originalEvent || event);
      const uuid = data.uuid || (data.type === "Item" && data.id ? `Item.${data.id}` : "");
      await this._addEffect(event.currentTarget.closest("[data-exclusion-group]"), uuid, root);
    });

    html.find("[data-save-groups]").on("click", async () => {
      try {
        const groups = Array.from(root.querySelectorAll("[data-exclusion-group]"), element => ({
          id: element.dataset.groupId || foundry.utils.randomID(),
          name: element.querySelector("[data-group-name]").value.trim(),
          effectUuids: Array.from(element.querySelectorAll("[data-effect-uuid]"), item => item.dataset.effectUuid).filter(Boolean)
        }));
        if (groups.some(group => !group.name || group.effectUuids.length < 2)) throw new Error("Cada grupo precisa de nome e pelo menos dois Itens Efeito.");
        const normalized = normalizeEffectExclusionGroups(groups);
        for (const group of normalized) for (const uuid of group.effectUuids) {
          const item = await fromUuid(uuid).catch(() => null);
          if (item?.type !== "effect") throw new Error(`Item Efeito não encontrado: ${uuid}`);
        }
        await game.settings.set("gum", EFFECT_EXCLUSION_SETTING, normalized);
        ui.notifications.info("Grupos de exclusão salvos.");
        this.render(false);
      } catch (error) {
        ui.notifications.error(error.message);
      }
    });
  }

  async _updateObject() {}
}
