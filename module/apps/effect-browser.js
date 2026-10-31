import { recordMatchesFolderFilter } from "./compendium-folder-filter.js";
import { effectMatchesTypeFilter, getEffectActionTypes } from "../utils/effect-browser-filter.mjs";
// GUM/module/apps/effect-browser.js
import { GumPreviewDialog } from "./preview-dialog.js";
import { contentSourceService } from "../services/content-source-service.mjs";
import { loadContentSourceBrowserData } from "../utils/content-source-browser.mjs";

// ✅ PASSO 1: Mudar o nome da classe de ModifierBrowser para EffectBrowser

const EFFECT_TYPE_LABELS = {
    attribute: "Attribute", flag: "Flag", roll_modifier: "RollModifier",
    skill_modifier: "SkillModifier", combat_modifier: "CombatModifier",
    resource_change: "ResourceChange", resource_create: "ResourceCreate",
    damage_roll: "DamageRoll", chat: "Chat", macro: "Macro", status: "Status"
};

const getEffectTypeLabel = (type) => EFFECT_TYPE_LABELS[type] ? game.i18n.localize(`GUM.EffectSheet.ActionType.${EFFECT_TYPE_LABELS[type]}`) : type || "-";

const getPrimaryRollModifierValue = (system = {}) => {
    const first = Array.isArray(system.roll_modifier_entries) && system.roll_modifier_entries.length ? system.roll_modifier_entries[0] : null;
    const value = first?.value ?? system.roll_modifier_value ?? system.roll_modifier ?? null;
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return value > 0 ? `+${value}` : `${value}`;
    const raw = `${value}`.trim();
    if (!raw) return null;
    if (/^[+-]?\d+(\.\d+)?$/.test(raw)) {
        const asNumber = Number(raw);
        return asNumber > 0 ? `+${asNumber}` : `${asNumber}`;
    }
    return raw;
};

const parseReferenceCodes = (rawRef) => {
    const text = (rawRef ?? "").toString().trim().toUpperCase();
    if (!text) return [];
    return text
        .split(/[,;]+|\s+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map((part) => {
            const match = part.replace(/\s+/g, "").match(/^([A-Z]+)(\d+)$/);
            if (!match) return null;
            return { code: match[1], page: Number(match[2]) };
        })
        .filter(Boolean);
};

export class EffectBrowser extends FormApplication {
constructor(targetItem, options = {}) {
    super({}, options); // Usamos um objeto vazio como base
    this.targetItem = targetItem;
    // Armazena o callback se ele for passado nas opções
    this.onSelect = options.onSelect;
    this.allEffects = [];
    this.availableFolders = [];
}

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      // ✅ PASSO 1: Atualizar título, classes e arquivo de template
      title: game.i18n.localize("GUM.EffectBrowser.Title"),
      classes: ["gum", "effect-browser", "theme-dark"], // Classe CSS atualizada
      template: "systems/gum/templates/apps/effect-browser.hbs", // Arquivo .hbs atualizado
      width: 900, height: 700, resizable: true
    });
  }

async getData() {
    const context = await super.getData();
    context.targetItem = this.targetItem;

    const { records, folders, invalidSources } = await loadContentSourceBrowserData({
        purpose: "effects",
        selectionPrefix: "effectSelection",
        service: contentSourceService
    });
    this.allEffects = records;
    this.availableFolders = folders;
    context.invalidSources = invalidSources;
    context.effects = this.allEffects;
    context.folders = this.availableFolders;
    return context;
}

activateListeners(html) {
    super.activateListeners(html);

    // ✅ AGORA O LISTENER OBSERVA MUDANÇAS EM QUALQUER INPUT DA SIDEBAR ✅
    html.find('.browser-sidebar input').on('keyup change', this._onFilterResults.bind(this));


    html.find('input[name="search"]').on('keydown', (event) => {
        if (event.key === 'Enter') event.preventDefault();
    });

    html.find('.result-item').on('click', ev => {
        if ($(ev.target).closest('input, button').length) return;
        const checkbox = $(ev.currentTarget).find('input[type="checkbox"]');
        const isChecked = !checkbox.prop('checked');
        checkbox.prop('checked', isChecked);
        $(ev.currentTarget).toggleClass('selected', isChecked);
    });

    html.find('.results-list input[type="checkbox"]').on('change', ev => {
        const li = $(ev.currentTarget).closest('.result-item');
        li.toggleClass('selected', ev.currentTarget.checked);
    });

    html.find('.browser-quick-view').on('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const li = $(ev.currentTarget).closest('.result-item');
        const selectionKey = li.attr('data-selection-key');
        const effect = this.allEffects.find(e => e.selectionKey === selectionKey);
        if (effect) await this._showQuickView(effect);
    });
  }

_onFilterResults(event) {
    const form = this.form;
    const resultsList = form.querySelector(".results-list");

    // Lê o valor da busca por nome
    const searchQuery = form.querySelector('[name="search"]').value.toLowerCase();
    const selectedFolders = new Set(
        Array.from(form.querySelectorAll('[name="filter-folder"]:checked')).map(input => input.value)
    );
    const hasFolderFilter = selectedFolders.size > 0;

    // ✅ LÊ O ESTADO DE CADA CHECKBOX DE FILTRO DE TIPO ✅
    const typesToShow = {
        attribute: form.querySelector('[name="filter-attribute"]').checked,
        status: form.querySelector('[name="filter-status"]').checked,
        roll_modifier: form.querySelector('[name="filter-roll_modifier"]').checked,
        skill_modifier: form.querySelector('[name="filter-skill_modifier"]').checked,
        combat_modifier: form.querySelector('[name="filter-combat_modifier"]').checked,
        resource_change: form.querySelector('[name="filter-resource_change"]').checked,
        resource_create: form.querySelector('[name="filter-resource_create"]').checked,
        chat: form.querySelector('[name="filter-chat"]').checked,
        macro: form.querySelector('[name="filter-macro"]').checked,
        flag: form.querySelector('[name="filter-flag"]').checked
    };

    // Verifica se algum filtro de tipo está ativo. Se nenhum estiver, mostra todos.
    const hasActiveTypeFilter = Object.values(typesToShow).some(v => v);

    for (const li of resultsList.children) {
        if (li.classList.contains("placeholder-text")) continue;

        const selectionKey = li.querySelector('input[type="checkbox"]').name;
        const effect = this.allEffects.find(e => e.selectionKey === selectionKey);
        if (!effect) continue;

        let isVisible = true;

        // 1. Aplica o filtro de busca por nome
        if (searchQuery && !effect.name.toLowerCase().includes(searchQuery)) {
            isVisible = false;
        }

        // 2. Aplica o filtro de tipo, se houver algum ativo
        if (hasActiveTypeFilter && !effectMatchesTypeFilter(effect.system, typesToShow)) {
            isVisible = false;
        }

        // 3. Aplica o filtro de pasta
        if (isVisible && hasFolderFilter && !recordMatchesFolderFilter(effect, selectedFolders)) {
            isVisible = false;
        }

      li.style.display = isVisible ? "grid" : "none";
    }
}

    async _showQuickView(effectData) {
      const effect = effectData?.uuid ? (await fromUuid(effectData.uuid).catch(() => null)) || effectData : effectData;
      const system = effect?.system || {};
      const effectRef = system.ref ?? system.reference;
      const quickDescriptionSource = (system.chat_description ?? "").toString().trim()
        ? system.chat_description
        : (system.description || system.notes || `<i>${game.i18n.localize("GUM.EffectBrowser.NoDescription")}</i>`);

      return GumPreviewDialog.show({
        title: effect?.name || game.i18n.localize("GUM.EffectSheet.Effect"),
        type: game.i18n.localize("GUM.EffectSheet.Effect"),
        img: effect?.img || "icons/svg/mystery-man.svg",
        description: await GumPreviewDialog.enrichDescription(quickDescriptionSource),
        tags: [
          { label: game.i18n.localize("GUM.EffectSheet.Type"), value: getEffectActionTypes(system).map(getEffectTypeLabel).join(", ") || "-" },
          { label: game.i18n.localize("GUM.EffectSheet.Modifier"), value: getPrimaryRollModifierValue(system) },
          { label: "REF", value: effectRef }
        ],
        sendToChat: true,
        sourceUuid: effect?.uuid || "",
        width: 500
      });
  }

  // ✅ PASSO 3: Reescrever a lógica de salvamento
  async _updateObject(event, formData) {
      const selectedIds = Object.keys(formData).filter(key => formData[key] === true && key.startsWith("effectSelection-"));
      if (selectedIds.length === 0) return ui.notifications.warn(game.i18n.localize("GUM.EffectBrowser.NoneSelected"));

      const selectedEffects = selectedIds.map(id => this.allEffects.find(e => e.selectionKey === id)).filter(e => e);

      // ✅ LÓGICA CORRIGIDA: Se um callback onSelect existir, execute-o.
      if (this.onSelect) {
          // Isso executa a lógica que está dentro da ficha do item (GurpsItemSheet)
          await this.onSelect(selectedEffects);
      } else {
          // Lógica antiga para a ficha de Condição
          const existingEffects = this.targetItem.system.effects || [];
          for (const sourceEffect of selectedEffects) {
            const newEffectData = { ...sourceEffect.system, name: sourceEffect.name, sourceUuid: sourceEffect.uuid };
            existingEffects.push(newEffectData);
          }
          await this.targetItem.update({ "system.effects": existingEffects });
          ui.notifications.info(game.i18n.format("GUM.EffectBrowser.AddedCount", { count: selectedEffects.length }));
      }
  }
}
