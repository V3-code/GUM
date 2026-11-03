import {
  CONTENT_SOURCE_PURPOSES,
  contentSourceService
} from "../services/content-source-service.mjs";
import { WORLD_STATUS_SETTING, normalizeWorldStatusConfiguration } from "../utils/world-status-config.mjs";
import { HYBRID_IMPORT_SCOPE_SETTING, HYBRID_IMPORT_SCOPES, normalizeHybridImportScope } from "../utils/hybrid-import-policy.mjs";

export class ContentSourceConfig extends FormApplication {
  constructor(...args) {
    super(...args);
    this.selectedByPurpose = new Map();
    this.hybridScope = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "gum-content-source-config",
      title: "GUM.ContentSources.Title",
      template: "systems/gum/templates/apps/content-source-config.hbs",
      classes: ["gum", "gum-dialog", "gum-sheet-edit-dialog", "content-source-config"],
      width: 720,
      height: 740,
      resizable: true,
      scrollY: [".content-source-scroll"],
      closeOnSubmit: true
    });
  }

  async getData() {
    const context = await super.getData();
    const itemPacks = game.packs
      .filter(pack => (pack.documentName || pack.metadata?.type) === "Item")
      .map(pack => ({ id: pack.collection, label: pack.title || pack.metadata?.label || pack.collection }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));

    const worldStatuses = normalizeWorldStatusConfiguration(game.settings.get("gum", WORLD_STATUS_SETTING));
    const definitions = Object.values(CONTENT_SOURCE_PURPOSES)
      .filter(definition => definition.id !== "statusBindings" || !worldStatuses.bindingsMigrated);
    context.purposes = definitions.map(definition => {
      if (!this.selectedByPurpose.has(definition.id)) {
        this.selectedByPurpose.set(definition.id, contentSourceService.getSourceIds(definition.id));
      }
      return this.#preparePurpose(definition, itemPacks);
    }).sort((left, right) => left.label.localeCompare(right.label, game.i18n.lang, { sensitivity: "base" }));
    this.visiblePurposeIds = context.purposes.map(purpose => purpose.id);
    context.itemPacks = itemPacks;
    return context;
  }

  #preparePurpose(definition, itemPacks) {
    const labels = new Map(itemPacks.map(pack => [pack.id, pack.label]));
    const selectedIds = this.selectedByPurpose.get(definition.id) || [];
    const purpose = {
      ...definition,
      label: game.i18n.localize(definition.label),
      description: game.i18n.localize(definition.description),
      sourceIdsJson: JSON.stringify(selectedIds),
      sources: selectedIds.map((id, index) => ({
        id,
        order: index + 1,
        label: labels.get(id) || id,
        missing: !labels.has(id),
        canMoveUp: index > 0,
        canMoveDown: index < selectedIds.length - 1
      }))
    };
    if (definition.id === "characterImport") {
      this.hybridScope ??= normalizeHybridImportScope(game.settings.get("gum", HYBRID_IMPORT_SCOPE_SETTING), {
          legacySearchAll: game.settings.get("gum", "hybridImportSearchAllCompendia") === true
        });
      const scope = this.hybridScope;
      purpose.hybridScope = scope;
      purpose.hybridScopeOptions = HYBRID_IMPORT_SCOPES.map(value => ({
        value,
        label: game.i18n.localize(`GUM.ContentSources.HybridScope.${value}.Name`),
        hint: game.i18n.localize(`GUM.ContentSources.HybridScope.${value}.Hint`),
        selected: value === scope
      }));
    }
    return purpose;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='add-source']").on("click", event => this.#addSource(event));
    html.find("[data-action='remove-source']").on("click", event => this.#changeSource(event, "remove"));
    html.find("[data-action='move-source-up']").on("click", event => this.#changeSource(event, "up"));
    html.find("[data-action='move-source-down']").on("click", event => this.#changeSource(event, "down"));
    html.find("[data-action='restore-defaults']").on("click", event => this.#restoreDefaults(event));
    html.find("select[name='hybridItemMatchScope']").on("change", event => {
      this.hybridScope = normalizeHybridImportScope(event.currentTarget.value);
      const hint = event.currentTarget.selectedOptions?.[0]?.dataset?.hint || "";
      event.currentTarget.closest(".content-source-hybrid-scope")
        ?.querySelector("[data-hybrid-scope-hint]")?.replaceChildren(document.createTextNode(hint));
    });
  }

  #addSource(event) {
    event.preventDefault();
    const section = event.currentTarget.closest("[data-purpose]");
    const purpose = section.dataset.purpose;
    const id = section.querySelector("select[name='available-source']")?.value;
    if (!id) return;
    const selected = this.selectedByPurpose.get(purpose) || [];
    if (!selected.includes(id)) selected.push(id);
    this.selectedByPurpose.set(purpose, selected);
    this.render(false);
  }

  #changeSource(event, action) {
    event.preventDefault();
    const section = event.currentTarget.closest("[data-purpose]");
    const purpose = section.dataset.purpose;
    const id = event.currentTarget.closest("[data-source-id]").dataset.sourceId;
    const selected = [...(this.selectedByPurpose.get(purpose) || [])];
    const index = selected.indexOf(id);
    if (index < 0) return;
    if (action === "remove") selected.splice(index, 1);
    if (action === "up" && index > 0) [selected[index - 1], selected[index]] = [selected[index], selected[index - 1]];
    if (action === "down" && index < selected.length - 1) [selected[index + 1], selected[index]] = [selected[index], selected[index + 1]];
    this.selectedByPurpose.set(purpose, selected);
    this.render(false);
  }

  #restoreDefaults(event) {
    event.preventDefault();
    const purpose = event.currentTarget.closest("[data-purpose]").dataset.purpose;
    this.selectedByPurpose.set(purpose, [...CONTENT_SOURCE_PURPOSES[purpose].defaults]);
    this.render(false);
  }

  async _updateObject(_event, formData) {
    const hybridScope = normalizeHybridImportScope(formData.hybridItemMatchScope || this.hybridScope);
    await game.settings.set("gum", HYBRID_IMPORT_SCOPE_SETTING, hybridScope);
    for (const purpose of this.visiblePurposeIds || Object.keys(CONTENT_SOURCE_PURPOSES)) {
      const raw = formData[`${purpose}Sources`] || "[]";
      let ids = [];
      try {
        ids = JSON.parse(raw);
      } catch (_error) {
        return ui.notifications.error(game.i18n.format("GUM.ContentSources.Errors.SavePurpose", {
          purpose: game.i18n.localize(CONTENT_SOURCE_PURPOSES[purpose].label)
        }));
      }
      await contentSourceService.setSourceIds(purpose, ids);
    }
    ui.notifications.info(game.i18n.localize("GUM.ContentSources.Notifications.Saved"));
  }
}
