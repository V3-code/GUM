// GUM/module/apps/modifier-browser.js

export class ModifierBrowser extends FormApplication {
  constructor(targetItem, options) {
    super(options);
    this.targetItem = targetItem;
    this.allModifiers = [];
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Navegador de Modificadores",
      classes: ["gum", "modifier-browser", "theme-dark"],
      template: "systems/gum/templates/apps/modifier-browser.hbs",
      width: 700, height: 500, resizable: true
    });
  }

  async getData() {
    const context = await super.getData();
    context.targetItem = this.targetItem;
    const pack = game.packs.get("gum.modifiers");
    if (pack) {
        this.allModifiers = await pack.getDocuments();
        this.allModifiers = this.allModifiers.map(item => ({
            id: item.id,
            uuid: item.uuid,
            name: item.name, system: item.system, img: item.img,
            displayImg: item.img !== "icons/svg/mystery-man.svg" ? item.img : null
        }));
        this.allModifiers.sort((a, b) => a.name.localeCompare(b.name));
    }
    context.modifiers = this.allModifiers; 
    return context;
  }

activateListeners(html) {
    super.activateListeners(html);
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
        const modifierId = li.data('itemId');
        const modifier = this.allModifiers.find(m => m.id === modifierId);
        if (modifier) await this._showQuickView(modifier);
    });
  }

  _onFilterResults(event) {
    const form = this.form;
    const resultsList = form.querySelector(".results-list");
    const searchQuery = form.querySelector('[name="search"]').value.toLowerCase();
    const showEnhancements = form.querySelector('[name="filter-enhancements"]').checked;
    const showLimitations = form.querySelector('[name="filter-limitations"]').checked;

    for (const li of resultsList.children) {
      if (li.classList.contains("placeholder-text")) continue;
      const modId = li.querySelector('input[type="checkbox"]').name;
      const mod = this.allModifiers.find(m => m.id === modId);
      if (!mod) continue;

      let isVisible = true;
      if (searchQuery && !mod.name.toLowerCase().includes(searchQuery)) isVisible = false;
      const costString = mod.system.cost || "";
      const isLimitation = costString.includes('-');
      const isEnhancement = costString && !isLimitation;
      if (showEnhancements && !showLimitations && !isEnhancement) isVisible = false;
      if (showLimitations && !showEnhancements && !isLimitation) isVisible = false;
if (showEnhancements && showLimitations && !isEnhancement && !isLimitation) isVisible = false;
      li.style.display = isVisible ? "grid" : "none";
    }
  }

  async _showQuickView(modifierData) {
      const modifier = modifierData?.uuid ? (await fromUuid(modifierData.uuid).catch(() => null)) || modifierData : modifierData;
      const system = modifier?.system || {};
      const createTag = (label, value) => value ? `<div class="property-tag"><label>${label}</label><span>${value}</span></div>` : "";
      const tags = [
        createTag("Custo", system.cost),
        createTag("Referência", system.ref),
        createTag("Efeito", system.applied_effect)
      ].join("");

      const description = await TextEditor.enrichHTML(system.description || "<i>Sem descrição.</i>", { async: true });

      const content = `
        <div class="gurps-dialog-canvas">
            <div class="gurps-item-preview-card">
                <header class="preview-header">
                    <h3>${modifier?.name || "Modificador"}</h3>
                    <div class="header-controls"><span class="preview-item-type">Modificador</span></div>
                </header>
                <div class="preview-content">
                    <div class="preview-properties">${tags}</div>
                    <hr class="preview-divider">
                    <div class="preview-description">${description}</div>
                </div>
            </div>
        </div>
      `;

      new Dialog({
        title: `Detalhes: ${modifier?.name || "Modificador"}`,
        content,
        buttons: { close: { label: "Fechar" } },
        default: "close",
        options: { classes: ["dialog", "gurps-item-preview-dialog"], width: 420 }
      }).render(true);
  }

  async _updateObject(event, formData) {
    const selectedIds = Object.keys(formData).filter(key => formData[key] === true && key.length === 16);
    if (selectedIds.length === 0) return ui.notifications.warn("Nenhum modificador foi selecionado.");
    
    const newModifiersData = {};
    for (const id of selectedIds) {
      const sourceModifier = this.allModifiers.find(m => m.id === id);
      if (sourceModifier) {
        const newKey = foundry.utils.randomID();
        newModifiersData[`system.modifiers.${newKey}`] = {
          name: sourceModifier.name,
          cost: sourceModifier.system.cost,
          ref: sourceModifier.system.ref,
          applied_effect: sourceModifier.system.applied_effect,
          source_id: sourceModifier.uuid,
          description: sourceModifier.system.description
        };
      }
    }
    await this.targetItem.update(newModifiersData);
    ui.notifications.info(`${selectedIds.length} modificador(es) adicionado(s).`);
  }
}