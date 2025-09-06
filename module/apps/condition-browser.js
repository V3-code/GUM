// GUM/module/apps/condition-browser.js

export class ConditionBrowser extends FormApplication {
  constructor(targetItem, options) {
    super(options);
    this.targetItem = targetItem;
    this.allConditions = [];
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Navegador de Condições",
      classes: ["gum", "condition-browser", "theme-dark"],
      template: "systems/gum/templates/apps/condition-browser.hbs",
      width: 700, height: 500, resizable: true
    });
  }

  async getData() {
    const context = await super.getData();
    context.targetItem = this.targetItem;
    
    const pack = game.packs.get("gum.conditions");
    if (pack) {
        this.allConditions = await pack.getDocuments();
        this.allConditions = this.allConditions.map(item => ({
            id: item.id,
            uuid: item.uuid, // Precisamos do UUID para criar o link
            name: item.name, 
            system: item.system, 
            img: item.img,
            displayImg: item.img !== "icons/svg/mystery-man.svg" ? item.img : null
        }));
        this.allConditions.sort((a, b) => a.name.localeCompare(b.name));
    }
    context.conditions = this.allConditions; 
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

    for (const li of resultsList.children) {
      if (li.classList.contains("placeholder-text")) continue;
      
      const conditionId = li.querySelector('input[type="checkbox"]').name;
      const condition = this.allConditions.find(c => c.id === conditionId);
      if (!condition) continue;

      let isVisible = true;
      if (searchQuery && !condition.name.toLowerCase().includes(searchQuery)) {
        isVisible = false;
      }
      li.style.display = isVisible ? "grid" : "none";
    }
  }

  async _updateObject(event, formData) {
    const selectedIds = Object.keys(formData).filter(key => formData[key] === true && key.length === 16);
    if (selectedIds.length === 0) return ui.notifications.warn("Nenhuma condição foi selecionada.");
    
    const newConditionsData = {};
    for (const id of selectedIds) {
      const sourceCondition = this.allConditions.find(c => c.id === id);
      if (sourceCondition) {
        const newKey = foundry.utils.randomID();
        // Armazenamos o nome e o UUID para referência futura
        newConditionsData[`system.attachedConditions.${newKey}`] = {
          name: sourceCondition.name,
          uuid: sourceCondition.uuid
        };
      }
    }
    
    await this.targetItem.update(newConditionsData);
    ui.notifications.info(`${selectedIds.length} condição(ões) anexada(s).`);
  }
}