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