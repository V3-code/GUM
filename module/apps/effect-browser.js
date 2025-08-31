// GUM/module/apps/effect-browser.js

// ✅ PASSO 1: Mudar o nome da classe de ModifierBrowser para EffectBrowser
export class EffectBrowser extends FormApplication {
  constructor(targetItem, options) {
    super(options);
    this.targetItem = targetItem;
    // ✅ Renomear a variável para clareza
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
    
    // ✅ PASSO 2: Buscar os dados do compêndio de EFEITOS
    const pack = game.packs.get("world.gum-efeitos"); // Nome do compêndio que você criou
    if (pack) {
        this.allEffects = await pack.getDocuments();
        this.allEffects = this.allEffects.map(item => ({
            id: item.id,
            name: item.name, system: item.system, img: item.img,
            displayImg: item.img !== "icons/svg/mystery-man.svg" ? item.img : null
        }));
        this.allEffects.sort((a, b) => a.name.localeCompare(b.name));
    }
    // ✅ Renomear a variável de contexto para clareza
    context.effects = this.allEffects; 
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    // A lógica de filtros pode ser adaptada no futuro, por enquanto vamos mantê-la simples
    html.find('input[name="search"]').on('keyup change', this._onFilterResults.bind(this));
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
        
        // Usamos o nome da variável que definimos no getData()
        const effectId = li.querySelector('input[type="checkbox"]').name;
        const effect = this.allEffects.find(e => e.id === effectId);
        if (!effect) continue;

        let isVisible = true;

        // A única lógica de filtro que mantemos é a busca por nome
        if (searchQuery && !effect.name.toLowerCase().includes(searchQuery)) {
            isVisible = false;
        }

        li.style.display = isVisible ? "grid" : "none";
    }
}

  // ✅ PASSO 3: Reescrever a lógica de salvamento
  async _updateObject(event, formData) {
    const selectedIds = Object.keys(formData).filter(key => formData[key] === true && key.length === 16);
    if (selectedIds.length === 0) return ui.notifications.warn("Nenhum efeito foi selecionado.");
    
    // Pega a lista de efeitos já existentes no item Condição
    const existingEffects = this.targetItem.system.effects || [];

    // Adiciona os novos efeitos selecionados
for (const id of selectedIds) {
  const sourceEffect = this.allEffects.find(e => e.id === id);
  if (sourceEffect) {
    // ✅ AQUI ESTÁ A CORREÇÃO ✅
    // Criamos um novo objeto que junta todos os dados de .system com a propriedade .name
    const newEffectData = {
        ...sourceEffect.system,
        name: sourceEffect.name 
    };
    existingEffects.push(newEffectData);
  }
}
    
    // Atualiza o item Condição com a nova lista completa de efeitos
    await this.targetItem.update({ "system.effects": existingEffects });
    ui.notifications.info(`${selectedIds.length} efeito(s) adicionado(s).`);
  }
}