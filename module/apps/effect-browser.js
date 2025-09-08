// GUM/module/apps/effect-browser.js

// ✅ PASSO 1: Mudar o nome da classe de ModifierBrowser para EffectBrowser
export class EffectBrowser extends FormApplication {
constructor(targetItem, options = {}) {
    super({}, options); // Usamos um objeto vazio como base
    this.targetItem = targetItem;
    // Armazena o callback se ele for passado nas opções
    this.onSelect = options.onSelect; 
    this.allEffects = [];
}

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      // ✅ PASSO 1: Atualizar título, classes e arquivo de template
      title: "Navegador de Efeitos",
      classes: ["gum", "effect-browser", "theme-dark"], // Classe CSS atualizada
      template: "systems/gum/templates/apps/effect-browser.hbs", // Arquivo .hbs atualizado
      width: 700, height: 500, resizable: true
    });
  }

async getData() {
    const context = await super.getData();
    context.targetItem = this.targetItem;
    
    const pack = game.packs.get("gum.efeitos");
    if (pack) {
        this.allEffects = await pack.getDocuments();
        this.allEffects = this.allEffects.map(item => ({
            id: item.id,
            uuid: item.uuid, // ✅ LINHA CRUCIAL QUE FALTAVA
            name: item.name, 
            system: item.system, 
            img: item.img,
            displayImg: item.img !== "icons/svg/mystery-man.svg" ? item.img : null
        }));
        this.allEffects.sort((a, b) => a.name.localeCompare(b.name));
    }
    context.effects = this.allEffects; 
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
    
    // Lê o valor da busca por nome
    const searchQuery = form.querySelector('[name="search"]').value.toLowerCase();

    // ✅ LÊ O ESTADO DE CADA CHECKBOX DE FILTRO DE TIPO ✅
    const typesToShow = {
        attribute: form.querySelector('[name="filter-attribute"]').checked,
        status: form.querySelector('[name="filter-status"]').checked,
        chat: form.querySelector('[name="filter-chat"]').checked,
        macro: form.querySelector('[name="filter-macro"]').checked,
        flag: form.querySelector('[name="filter-flag"]').checked
    };

    // Verifica se algum filtro de tipo está ativo. Se nenhum estiver, mostra todos.
    const hasActiveTypeFilter = Object.values(typesToShow).some(v => v);

    for (const li of resultsList.children) {
        if (li.classList.contains("placeholder-text")) continue;
        
        const effectId = li.querySelector('input[type="checkbox"]').name;
        const effect = this.allEffects.find(e => e.id === effectId);
        if (!effect) continue;

        let isVisible = true;

        // 1. Aplica o filtro de busca por nome
        if (searchQuery && !effect.name.toLowerCase().includes(searchQuery)) {
            isVisible = false;
        }

        // 2. Aplica o filtro de tipo, se houver algum ativo
        if (hasActiveTypeFilter && !typesToShow[effect.system.type]) {
            isVisible = false;
        }

        li.style.display = isVisible ? "grid" : "none";
    }
}

  // ✅ PASSO 3: Reescrever a lógica de salvamento
  async _updateObject(event, formData) {
      const selectedIds = Object.keys(formData).filter(key => formData[key] === true && key.length === 16);
      if (selectedIds.length === 0) return ui.notifications.warn("Nenhum efeito foi selecionado.");
      
      const selectedEffects = selectedIds.map(id => this.allEffects.find(e => e.id === id)).filter(e => e);

      // ✅ LÓGICA CORRIGIDA: Se um callback onSelect existir, execute-o.
      if (this.onSelect) {
          // Isso executa a lógica que está dentro da ficha do item (GurpsItemSheet)
          this.onSelect(selectedEffects);
      } else {
          // Lógica antiga para a ficha de Condição
          const existingEffects = this.targetItem.system.effects || [];
          for (const sourceEffect of selectedEffects) {
            const newEffectData = { ...sourceEffect.system, name: sourceEffect.name, sourceUuid: sourceEffect.uuid };
            existingEffects.push(newEffectData);
          }
          await this.targetItem.update({ "system.effects": existingEffects });
          ui.notifications.info(`${selectedEffects.length} efeito(s) adicionado(s).`);
      }
  }
}