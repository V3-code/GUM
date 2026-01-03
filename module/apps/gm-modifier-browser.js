// GUM/module/apps/gm-modifier-browser.js

export class GMModifierBrowser extends FormApplication {
  
  constructor(options = {}) {
    super({}, options);
    this.onSelect = options.onSelect; 
    this.allModifiers = [];
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Navegador de Modificadores Globais",
      // Reutilizamos a classe CSS existente para manter o estilo
      classes: ["gum", "gm-modifier-browser", "theme-dark"], 
      template: "systems/gum/templates/apps/gm-modifier-browser.hbs",
      width: 720, 
      height: 600, 
      resizable: true
    });
  }

  async getData() {
    const context = await super.getData();
    
    // Busca no compêndio correto
    let pack = game.packs.get("gum.gm_modifiers") || 
               game.packs.get("world.modificadores-basicos") ||
               game.packs.find(p => p.metadata.label === "[GUM] Modificadores Básicos");
    
    if (pack) {
        const content = await pack.getDocuments();
                this.allModifiers = content.map(item => ({
            id: item.id,
            uuid: item.uuid,
            name: item.name, 
            system: item.system, 
            img: item.img,
            displayImg: item.img !== "icons/svg/mystery-man.svg" ? item.img : null,
            // Prepara dados para filtros
            category: item.system.ui_category || "other",
            isBonus: item.system.modifier >= 0,
            formattedVal: (item.system.modifier > 0 ? '+' : '') + item.system.modifier
        }));
        this.allModifiers.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    context.modifiers = this.allModifiers;
    
    // Envia lista de categorias para gerar os checkboxes no HTML (Opcional, ou hardcoded no HBS)
    // Aqui faremos hardcoded no HBS para ter controle dos rótulos bonitos.
    
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    // Filtro de Texto e Checkboxes
    html.find('.browser-sidebar input').on('keyup change', this._onFilterResults.bind(this));
    
    // Previne envio com Enter na busca
    html.find('input[name="search"]').on('keydown', (event) => {
        if (event.key === 'Enter') event.preventDefault();
    });
    
 // Seleção de linha ao clicar (UX)
    html.find('.result-item').click(ev => {
        if ($(ev.target).is('input[type="checkbox"]') || $(ev.target).is('button') || $(ev.target).closest('button').length) return;
        const checkbox = $(ev.currentTarget).find('input[type="checkbox"]');
        checkbox.prop('checked', !checkbox.prop('checked'));
        $(ev.currentTarget).toggleClass('selected', checkbox.prop('checked'));
    });

    html.find('.results-list input[type="checkbox"]').on('change', ev => {
        const li = $(ev.currentTarget).closest('.result-item');
        li.toggleClass('selected', ev.currentTarget.checked);
    });

    html.find('.browser-quick-view').click(ev => {
            ev.preventDefault();
            ev.stopPropagation(); // Impede selecionar a linha

            const li = $(ev.currentTarget).closest('.result-item');
            const itemId = li.data('id');
            const itemData = this.allModifiers.find(m => m.id === itemId);

            if (itemData) {
                this._showQuickView(itemData);
            }
        });
  }

  /**
     * Método auxiliar para abrir o Dialog (cópia da lógica Universal)
     */
    async _showQuickView(itemData) {
        // Precisamos recuperar o objeto 'item' completo para ter acesso ao 'system'
        // Como allModifiers tem 'system', podemos usar direto.
        
        const s = itemData.system;
        const createTag = (label, value) => {
             if (value) return `<div class="property-tag"><label>${label}</label><span>${value}</span></div>`;
             return '';
        };
        
        let tagsHtml = createTag('Valor', itemData.formattedVal);
        if (s.nh_cap) tagsHtml += createTag('Teto', s.nh_cap);
        if (s.duration) tagsHtml += createTag('Duração', s.duration);

        const description = await TextEditor.enrichHTML(s.description || "<i>Sem descrição.</i>", { async: true });

        const content = `
            <div class="gurps-dialog-canvas">
                <div class="gurps-item-preview-card">
                    <header class="preview-header">
                        <h3>${itemData.name}</h3>
                        <div class="header-controls"><span class="preview-item-type">Modificador</span></div>
                    </header>
                    <div class="preview-content">
                        <div class="preview-properties">${tagsHtml}</div>
                        <hr class="preview-divider">
                        <div class="preview-description">${description}</div>
                    </div>
                </div>
            </div>
        `;

        new Dialog({
            title: itemData.name,
            content: content,
            buttons: { close: { label: "Fechar" } },
            options: { classes: ["dialog", "gurps-item-preview-dialog"], width: 400 }
        }).render(true);
    }

  _onFilterResults(event) {
    const form = this.form;
    const resultsList = form.querySelector(".results-list");
    
    const searchQuery = form.querySelector('[name="search"]').value.toLowerCase();
    
    // Lê filtros de Valor
    const showBonus = form.querySelector('[name="filter-bonus"]').checked;
    const showPenalty = form.querySelector('[name="filter-penalty"]').checked;

    // Lê filtros de Categoria (Cria um Set para busca rápida)
    const catCheckboxes = form.querySelectorAll('.category-filter input:checked');
    const activeCategories = Array.from(catCheckboxes).map(cb => cb.value);
    const filterCategories = activeCategories.length > 0; // Se 0, mostra tudo

    for (const li of resultsList.children) {
        if (li.classList.contains("placeholder-text")) continue;
        
        const modId = li.dataset.id; // Vamos colocar data-id no LI
        const modCategory = li.dataset.category;
        const modVal = parseFloat(li.dataset.val);
        const modName = li.querySelector('.item-name').innerText.toLowerCase();

        let isVisible = true;

        // 1. Texto
        if (searchQuery && !modName.includes(searchQuery)) isVisible = false;

        // 2. Valor (Bônus/Penalidade)
        if (isVisible) {
            if (modVal >= 0 && !showBonus) isVisible = false;
            if (modVal < 0 && !showPenalty) isVisible = false;
        }

        // 3. Categoria
        if (isVisible && filterCategories) {
            if (!activeCategories.includes(modCategory)) isVisible = false;
        }

        li.style.display = isVisible ? "grid" : "none";
    }
  }

  async _updateObject(event, formData) {
    // Filtra apenas as chaves que são IDs (tamanho 16) e estão true
    const selectedIds = Object.keys(formData).filter(key => formData[key] === true && key.length === 16);
    
    if (selectedIds.length === 0) return ui.notifications.warn("Nenhum modificador foi selecionado.");
    
    const selectedItems = selectedIds.map(id => this.allModifiers.find(m => m.id === id)).filter(m => m);

    if (this.onSelect) {
        this.onSelect(selectedItems);
    }
  }
}