// systems/gum/module/apps/eqp-modifier-browser.js

export class EqpModifierBrowser extends FormApplication {
  constructor(targetItem, options) {
    super(options);
    this.targetItem = targetItem;
    this.allModifiers = [];
    
    // Define os filtros iniciais com base no item
    // Se for uma armadura, já começa com 'armor' marcado, etc.
    const initialFilters = this._detectInitialFilters(targetItem);

    this.filters = {
        search: "",
        categories: initialFilters, // Objeto { melee: true, armor: false, ... }
        cfMin: null,
        cfMax: null
    };
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Modificadores de Equipamento",
      classes: ["gum", "eqp-modifier-browser", "theme-dark"], 
      template: "systems/gum/templates/apps/eqp-modifier-browser.hbs",
      width: 750, 
      height: 600, 
      resizable: true,
      scrollY: [".browser-results"]
    });
  }

  /**
   * Detecta quais filtros ativar inicialmente.
   */
  _detectInitialFilters(item) {
      const filters = {
          all: false, // "Todos" começa desligado se houver filtro específico
          general: false,
          melee: false,
          ranged: false,
          armor: false,
          shield: false,
          ammo: false,
          enchantment: false
      };

      let specificFilterFound = false;

      if (item.type === 'armor') {
          filters.armor = true;
          specificFilterFound = true;
      } 
      else if (item.type === 'equipment') {
          if (item.system.defense_bonus > 0) { filters.shield = true; specificFilterFound = true; }
          if (Object.keys(item.system.melee_attacks || {}).length > 0) { filters.melee = true; specificFilterFound = true; }
          if (Object.keys(item.system.ranged_attacks || {}).length > 0) { filters.ranged = true; specificFilterFound = true; }
          // Você pode adicionar lógica para 'ammo' aqui se tiver uma flag no item
      }

      // Se não detectou nada específico, marca "Todos"
      if (!specificFilterFound) {
          filters.all = true;
      } else {
          // Se detectou algo, também marca "Geral" porque materiais servem pra tudo
          filters.general = true;
      }

      return filters;
  }

  async getData() {
    const context = await super.getData();
    
    const pack = game.packs.get("gum.eqp_modifiers");
    let packItems = await (pack ? pack.getDocuments() : []);
    const worldItems = game.items.filter(i => i.type === "eqp_modifier");

    this.allModifiers = [...packItems, ...worldItems].map(item => ({
        id: item.id,
        uuid: item.uuid,
        name: item.name, 
        system: item.system, 
        img: item.img,
        displayImg: item.img !== "icons/svg/mystery-man.svg" ? item.img : null,
        formattedCF: (item.system.cost_factor > 0 ? '+' : '') + Number(item.system.cost_factor || 0),
        formattedWeight: item.system.weight_mod || "x1"
    }));

    this.allModifiers.sort((a, b) => a.name.localeCompare(b.name));
    
    context.modifiers = this.allModifiers;
    context.filters = this.filters; 
    
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // 1. Filtro de Texto
    html.find('input[name="search"]').on('input', event => {
      this.filters.search = event.target.value.toLowerCase();
      this._applyFilters(html);
    });

    // 2. Filtro de Categoria (Checkboxes)
    html.find('input.category-filter').on('change', event => {
        const category = event.target.value;
        const isChecked = event.target.checked;

        if (category === 'all') {
            // Se clicou em "Todos", desmarca/marca o resto visualmente?
            // Não, vamos manter simples: "Todos" sobrepõe tudo.
            this.filters.categories.all = isChecked;
            // Opcional: Se marcou "Todos", desmarca os outros para limpar a UI
            if (isChecked) {
                for(let key in this.filters.categories) {
                    if(key !== 'all') {
                        this.filters.categories[key] = false;
                        html.find(`input.category-filter[value="${key}"]`).prop('checked', false);
                    }
                }
            }
        } else {
            // Se clicou em específico, desmarca "Todos"
            this.filters.categories[category] = isChecked;
            if (isChecked) {
                this.filters.categories.all = false;
                html.find('input.category-filter[value="all"]').prop('checked', false);
            }
        }
        this._applyFilters(html);
    });

    // 3. Filtro de CF
html.find('input[name="cfMin"], input[name="cfMax"]').on('input', event => {
        const val = parseFloat(event.target.value);
        if (event.target.name === "cfMin") this.filters.cfMin = isNaN(val) ? null : val;
        if (event.target.name === "cfMax") this.filters.cfMax = isNaN(val) ? null : val;
        this._applyFilters(html);
    });

    // Seleção de Linha
    html.find('.result-item').on('click', event => {
      if ($(event.target).is('input[type="checkbox"]') || $(event.target).closest('button').length) return;
      const checkbox = $(event.currentTarget).find('input[type="checkbox"]');
      checkbox.prop('checked', !checkbox.prop('checked'));
      $(event.currentTarget).toggleClass('selected', checkbox.prop('checked'));
    });
    
    html.find('.results-list input[type="checkbox"]').on('change', event => {
        const li = $(event.currentTarget).closest('.result-item');
        li.toggleClass('selected', event.currentTarget.checked);
    });
    
    html.find('.browser-quick-view').on('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const li = $(event.currentTarget).closest('.result-item');
        const modifierId = li.data('id');
        const modifier = this.allModifiers.find(m => m.id === modifierId);
        if (modifier) await this._showQuickView(modifier);
    });
    
    this._applyFilters(html);
  }

  /**
   * Lógica "OU" para filtros múltiplos.
   */
  _applyFilters(html) {
    const items = html.find('.result-item');
    const { search, categories, cfMin, cfMax } = this.filters;

    // Cria uma lista das categorias ativas (exceto 'all')
    const activeCategories = Object.keys(categories).filter(k => k !== 'all' && categories[k]);
    const showAll = categories.all || activeCategories.length === 0;

    items.each((i, el) => {
        const item = $(el);
        let isVisible = true;

        // A. Texto
        if (search) {
            const name = item.find('.item-name').text().toLowerCase();
            const tags = (item.data('tags') || "").toString().toLowerCase();
            if (!name.includes(search) && !tags.includes(search)) isVisible = false;
        }

        // B. Categorias (Lógica "OU")
        if (isVisible && !showAll) {
            // O item deve pertencer a PELO MENOS UMA das categorias marcadas
            let matchesCategory = false;
            
            // Verifica se o modificador é "Geral" (aplica em tudo) E se "Geral" está marcado
            if (item.data('cat-general') === true && categories.general) matchesCategory = true;

            // Verifica as outras categorias
            if (!matchesCategory) {
                for (const cat of activeCategories) {
                    if (item.data(`cat-${cat}`) === true) {
                        matchesCategory = true;
                        break;
                    }
                }
            }
            
            if (!matchesCategory) isVisible = false;
        }

        // C. CF
        if (isVisible) {
            const cf = parseFloat(item.data('cf')) || 0;
            if (cfMin !== null && cf < cfMin) isVisible = false;
            if (cfMax !== null && cf > cfMax) isVisible = false;
        }

el.style.display = isVisible ? "grid" : "none";
    });
  }

  async _showQuickView(modifierData) {
      const modifier = modifierData?.uuid ? (await fromUuid(modifierData.uuid).catch(() => null)) || modifierData : modifierData;
      const system = modifier?.system || {};
      const createTag = (label, value) => value ? `<div class="property-tag"><label>${label}</label><span>${value}</span></div>` : "";
      const tags = [
        createTag("CF", this._formatValue(system.cost_factor)),
        createTag("Peso", system.weight_mod),
        createTag("TL", system.tech_level_mod),
        createTag("Categorias", Object.keys(system.target_type || {}).filter(k => system.target_type[k]).join(", "))
      ].join("");

      const description = await TextEditor.enrichHTML(system.features || system.description || "<i>Sem descrição.</i>", { async: true });

      const content = `
        <div class="gurps-dialog-canvas">
            <div class="gurps-item-preview-card">
                <header class="preview-header">
                    <h3>${modifier?.name || "Modificador"}</h3>
                    <div class="header-controls"><span class="preview-item-type">Equipamento</span></div>
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

  _formatValue(val) {
      if (val === null || val === undefined) return "";
      const num = Number(val);
      if (isNaN(num)) return val;
      return (num > 0 ? "+" : "") + num;
  }

  async _updateObject(event, formData) {
    const selectedIds = Object.keys(formData).filter(key => formData[key] === true && key.length === 16);
    if (selectedIds.length === 0) return ui.notifications.warn("Nenhum modificador selecionado.");
    
    const newModifiersData = {};
    for (const id of selectedIds) {
      const sourceModifier = this.allModifiers.find(m => m.id === id);
      if (sourceModifier) {
        const newKey = foundry.utils.randomID();
        newModifiersData[`system.eqp_modifiers.${newKey}`] = {
          id: newKey,
          name: sourceModifier.name,
          cost_factor: sourceModifier.system.cost_factor,
          weight_mod: sourceModifier.system.weight_mod,
          tech_level_mod: sourceModifier.system.tech_level_mod,
          features: sourceModifier.system.features,
          ref: sourceModifier.system.ref,
          source_uuid: sourceModifier.uuid
        };
      }
    }

    await this.targetItem.update(newModifiersData);
    ui.notifications.info(`${Object.keys(newModifiersData).length} modificadores adicionados.`);
  }
}