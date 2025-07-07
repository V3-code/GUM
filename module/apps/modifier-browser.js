// GUM/module/apps/modifier-browser.js

export class ModifierBrowser extends FormApplication {

  constructor(targetItem, options) {
    super(options);
    this.targetItem = targetItem;
    this.allModifiers = []; // Vamos guardar nossa lista completa de modificadores aqui
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
        // MUDANÇA: Salvamos os modificadores na nossa variável de instância
        this.allModifiers = await pack.getDocuments();
        this.allModifiers.sort((a, b) => a.name.localeCompare(b.name));
    } else {
        console.error(`Compêndio de Modificadores '${packName}' não encontrado!`);
    }
    
    // Passamos a lista para o template como antes
    context.modifiers = this.allModifiers; 
    return context;
  }

  /**
   * @override
   */
  activateListeners(html) {
    super.activateListeners(html);
    
    // Listener para a busca. Usamos 'keyup' para ser em tempo real.
    html.find('input[name="search"]').on('keyup', this._onFilterResults.bind(this));
    // Listener para as checkboxes
    html.find('input[type="checkbox"]').on('change', this._onFilterResults.bind(this));
    
    // MUDANÇA: Impede que a tecla "Enter" na busca feche a janela
    html.find('input[name="search"]').on('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
        }
    });
  }

  /**
   * @override - Função de filtro corrigida
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
      // MUDANÇA: Procuramos na nossa lista salva 'this.allModifiers'
      const mod = this.allModifiers.find(m => m.id === modId);
      if (!mod) continue;

      let isVisible = true;

      if (searchQuery && !mod.name.toLowerCase().includes(searchQuery)) {
        isVisible = false;
      }

      // A lógica de custo agora deve funcionar corretamente
      const costString = mod.system.cost || "";
      const isLimitation = costString.includes('-');
      const isEnhancement = costString && !isLimitation; // É uma ampliação se tiver um custo E não for uma limitação

      if (showEnhancements && !showLimitations && !isEnhancement) {
        isVisible = false;
      }
      if (showLimitations && !showEnhancements && !isLimitation) {
        isVisible = false;
      }
      if (showEnhancements && showLimitations && !isEnhancement && !isLimitation) {
        isVisible = false;
      }
      
      li.style.display = isVisible ? "flex" : "none";
    }
  }

  /**
   * @override - A função de salvar continua a mesma, pois já estava funcionando.
   */
  async _updateObject(event, formData) {
    const selectedIds = Object.keys(formData).filter(key => formData[key] === true);

    if (selectedIds.length === 0) {
      return ui.notifications.warn("Nenhum modificador foi selecionado.");
    }
    
    const newModifiersData = {};
    for (const id of selectedIds) {
      const sourceModifier = this.allModifiers.find(m => m.id === id);
      if (sourceModifier) {
        const newModifier = {
          name: sourceModifier.name,
          cost: sourceModifier.system.cost,
          ref: sourceModifier.system.ref,
          source_id: sourceModifier.uuid
        };
        const newKey = foundry.utils.randomID();
        newModifiersData[`system.modifiers.${newKey}`] = newModifier;
      }
    }
    
    await this.targetItem.update(newModifiersData);
    ui.notifications.info(`${selectedIds.length} modificador(es) adicionado(s) a "${this.targetItem.name}".`);
  }
}