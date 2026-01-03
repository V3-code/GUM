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
        const conditionId = li.data('itemId');
        const condition = this.allConditions.find(c => c.id === conditionId);
        if (condition) await this._showQuickView(condition);
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

  async _showQuickView(conditionData) {
      const condition = conditionData?.uuid ? (await fromUuid(conditionData.uuid).catch(() => null)) || conditionData : conditionData;
      const system = condition?.system || {};
      const effectsList = Array.isArray(system.effects) ? system.effects : Object.values(system.effects || {});
      const createTag = (label, value) => value ? `<div class="property-tag"><label>${label}</label><span>${value}</span></div>` : "";
      const tags = [
        createTag("Gatilho", system.when),
        createTag("Efeitos", effectsList.length ? effectsList.length : null)
      ].join("");

      const description = await TextEditor.enrichHTML(system.description || "<i>Sem descrição.</i>", { async: true });

      const content = `
        <div class="gurps-dialog-canvas">
            <div class="gurps-item-preview-card">
                <header class="preview-header">
                    <h3>${condition?.name || "Condição"}</h3>
                    <div class="header-controls"><span class="preview-item-type">Condição</span></div>
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
        title: `Detalhes: ${condition?.name || "Condição"}`,
        content,
        buttons: { close: { label: "Fechar" } },
        default: "close",
        options: { classes: ["dialog", "gurps-item-preview-dialog"], width: 420 }
      }).render(true);
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