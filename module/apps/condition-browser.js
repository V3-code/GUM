// GUM/module/apps/condition-browser.js

export class ConditionBrowser extends FormApplication {
constructor(targetItem, options = {}) {
    super({}, options);
    this.targetItem = targetItem;
    this.onSelect = options.onSelect;
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
            uuid: item.uuid,
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
    // ✅ AGORA O LISTENER OBSERVA MUDANÇAS EM QUALQUER INPUT DA SIDEBAR ✅
    html.find('.browser-sidebar input').on('keyup change', this._onFilterResults.bind(this));
    html.find('input[name="search"]').on('keydown', (event) => {
        if (event.key === 'Enter') event.preventDefault();
    });
  }

  _onFilterResults(event) {
    const form = this.form;
    const resultsList = form.querySelector(".results-list");
    
    // 1. Lê o valor da busca por nome
    const searchQuery = form.querySelector('[name="search"]').value.toLowerCase();

    // ✅ 2. LÊ O ESTADO DE CADA CHECKBOX DE FILTRO DE TIPO DE EFEITO ✅
    const typesToShow = {
        attribute: form.querySelector('[name="filter-attribute"]').checked,
        status: form.querySelector('[name="filter-status"]').checked,
        chat: form.querySelector('[name="filter-chat"]').checked,
        macro: form.querySelector('[name="filter-macro"]').checked,
        flag: form.querySelector('[name="filter-flag"]').checked
    };

    // Verifica se algum filtro de tipo está ativo.
    const hasActiveTypeFilter = Object.values(typesToShow).some(v => v);

    for (const li of resultsList.children) {
      if (li.classList.contains("placeholder-text")) continue;
      
      const conditionId = li.querySelector('input[type="checkbox"]').name;
      const condition = this.allConditions.find(c => c.id === conditionId);
      if (!condition) continue;

      let isVisible = true;

      // 3. Aplica o filtro de busca por nome
      if (searchQuery && !condition.name.toLowerCase().includes(searchQuery)) {
        isVisible = false;
      }

      // ✅ 4. APLICA O FILTRO DE TIPO DE EFEITO, SE HOUVER ALGUM ATIVO ✅
      if (isVisible && hasActiveTypeFilter) {
          // Pega os efeitos da condição. Garante que seja sempre um array.
          const effectsInCondition = Array.isArray(condition.system.effects) ? condition.system.effects : Object.values(condition.system.effects || {});
          
          // Verifica se a condição tem PELO MENOS UM efeito que corresponda aos tipos marcados.
          const hasMatchingEffect = effectsInCondition.some(effect => typesToShow[effect.type]);
          
          if (!hasMatchingEffect) {
              isVisible = false;
          }
      }

      li.style.display = isVisible ? "grid" : "none";
    }
  }

  async _updateObject(event, formData) {
      const selectedIds = Object.keys(formData).filter(key => formData[key] === true && key.length === 16);
      if (selectedIds.length === 0) return ui.notifications.warn("Nenhuma condição foi selecionada.");

      const selectedConditions = selectedIds.map(id => this.allConditions.find(c => c.id === id)).filter(c => c);

      if (this.onSelect) {
          this.onSelect(selectedConditions);
      } else {
          // Lógica antiga (será removida no futuro, mas mantida por segurança)
          const updates = {};
          for (const condition of selectedConditions) {
            const newKey = foundry.utils.randomID();
            updates[`system.generalConditions.${newKey}`] = { name: condition.name, uuid: condition.uuid };
          }
          await this.targetItem.update(updates);
          ui.notifications.info(`${selectedConditions.length} condição(ões) anexada(s).`);
      }
  }
}