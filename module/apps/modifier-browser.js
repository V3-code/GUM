// GUM/module/apps/modifier-browser.js

export class ModifierBrowser extends FormApplication {

  constructor(targetItem, options) {
    super(options);
    this.targetItem = targetItem; // A Vantagem/Poder que estamos modificando
    this.allModifiers = []; // Um array para guardar a lista completa de modificadores do compêndio
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Navegador de Modificadores",
      classes: ["gum", "modifier-browser"],
      template: "systems/gum/templates/apps/modifier-browser.hbs",
      width: 700,
      height: 500,
      resizable: true
    });
  }

  async getData() {
    const context = await super.getData();
    context.targetItem = this.targetItem;
    
    const packName = "gum.modifiers";
    const pack = game.packs.get(packName);
    
    if (pack) {
        // Carregamos os modificadores e os salvamos na nossa variável de instância
        this.allModifiers = await pack.getDocuments();
        this.allModifiers.sort((a, b) => a.name.localeCompare(b.name));
    } else {
        console.error(`Compêndio de Modificadores '${packName}' não encontrado!`);
    }
    
    // Passamos a lista completa para o template renderizar
    context.modifiers = this.allModifiers; 
    return context;
  }

  /**
   * @override
   * Ativa os listeners para os filtros e busca.
   */
  activateListeners(html) {
    super.activateListeners(html);
    
    // Ouve por qualquer mudança nos filtros (busca ou checkboxes)
    html.find('.browser-sidebar input').on('keyup change', this._onFilterResults.bind(this));
    
    // Impede que a tecla "Enter" na busca feche a janela
    html.find('input[name="search"]').on('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
        }
    });
  }

  /**
   * @override
   * Filtra a lista de resultados com base nos inputs do usuário.
   */
  _onFilterResults(event) {
    const form = this.form;
    const resultsList = form.querySelector(".results-list");
    const searchQuery = form.querySelector('[name="search"]').value.toLowerCase();
    const showEnhancements = form.querySelector('[name="filter-enhancements"]').checked;
    const showLimitations = form.querySelector('[name="filter-limitations"]').checked;

    for (const li of resultsList.children) {
      if (li.classList.contains("placeholder-text")) continue;

      const modId = li.querySelector('input[type="checkbox"]').name;
      // CORREÇÃO: Procuramos na nossa lista salva 'this.allModifiers'
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

  /**
   * @override
   * Executado quando o botão "Adicionar Selecionados" é clicado.
   */
  async _updateObject(event, formData) {
    const selectedIds = Object.keys(formData).filter(key => formData[key] === true && key.length === 16);

    if (selectedIds.length === 0) {
      return ui.notifications.warn("Nenhum modificador foi selecionado.");
    }
    
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
    
    // Atualiza o item alvo (a Vantagem) com todos os novos modificadores
    await this.targetItem.update(newModifiersData);
    ui.notifications.info(`${selectedIds.length} modificador(es) adicionado(s).`);
  }
}