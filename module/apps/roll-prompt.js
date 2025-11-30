import { performGURPSRoll } from "../../scripts/main.js";
// import { GUM_DEFAULTS } from "../gum-defaults.js"; // (Se ainda estiver usando defaults)

export class GurpsRollPrompt extends FormApplication {
    
    constructor(actor, rollData, options = {}) {
        super(options);
        this.actor = actor;
        this.rollData = rollData;
        this.selectedModifiers = []; 
        this.isEditMode = false;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "Configurar Rolagem",
            id: "gurps-roll-prompt",
            template: "systems/gum/templates/apps/roll-prompt.hbs",
            width: 600, // ✅ AUMENTADO PARA DAR MAIS ESPAÇO
            height: "auto",
            classes: ["gum", "roll-prompt", "theme-dark"],
            closeOnSubmit: true,
            scrollY: [".roll-body", ".prompt-menu-column"]
        });
    }

    /**
     * Busca todos os modificadores disponíveis (Mundo + Compêndio)
     */
    async _fetchModifiers() {
        const modifiers = [];

        // 1. Itens soltos no mundo 
        const worldItems = game.items.filter(i => i.type === "gm_modifier");
        modifiers.push(...worldItems);

        // 2. Itens do Compêndio
        let pack = game.packs.find(p => p.metadata.label === "[GUM] Modificadores Básicos") || game.packs.get("gum.modifiers_core");
        
        if (pack) {
            const packItems = await pack.getDocuments();
            modifiers.push(...packItems);
        }

        // Filtra duplicatas
        const uniqueModifiers = [];
        const seenNames = new Set();
        for (const mod of modifiers) {
            if (!seenNames.has(mod.name)) {
                seenNames.add(mod.name);
                uniqueModifiers.push(mod);
            }
        }

        return uniqueModifiers;
    }

    async getData() {
        const context = super.getData();
        context.actor = this.actor;
        context.label = this.rollData.label || "Teste";
        context.baseValue = this.rollData.value || 10;
        context.img = this.rollData.img;
        context.isEditMode = this.isEditMode;

        // 1. Busca e Organiza
        const allMods = await this._fetchModifiers();
        
        // 2. Monta os Blocos Visuais
        const categories = {
            "location": { title: "Localização", color: "#a53541", items: [] },
            "maneuver": { title: "Manobras", color: "#c5a05b", items: [] },
            "situation": { title: "Situação", color: "#56819c", items: [] },
            "option": { title: "Opções", color: "#777", items: [] },
            "other": { title: "Outros", color: "#444", items: [] }
        };

        for (const item of allMods) {
            const catKey = item.system.ui_category || "other";
            const targetGroup = categories[catKey] || categories["other"];
            
            targetGroup.items.push({
                id: item.id,
                label: item.name,
                value: item.system.modifier,
                desc: item.system.description,
                nh_cap: item.system.nh_cap,
                active: this.selectedModifiers.some(m => m.id === item.id)
            });
        }

        context.blocks = Object.values(categories).filter(c => c.items.length > 0);

        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);

        const inputManual = html.find('input[name="manualMod"]');

        // --- ✅ CORREÇÃO AQUI: Classe .step-btn ---
        html.find('.step-btn').click(ev => {
            ev.preventDefault();
            const action = $(ev.currentTarget).data('action');
            let val = parseInt(inputManual.val()) || 0;
            
            // Aumenta/Diminui
            if (action === 'increase') val += 1;
            else val -= 1;

            inputManual.val(val);
            this._updateTotals(html);
        });

        html.find('.quick-btn').click(ev => {
            ev.preventDefault();
            const add = parseInt($(ev.currentTarget).data('value'));
            let val = parseInt(inputManual.val()) || 0;
            inputManual.val(val + add);
            this._updateTotals(html);
        });

        inputManual.on('input change', () => this._updateTotals(html));

        // Botões de Modificador
        html.find('.mod-btn').click(ev => {
            ev.preventDefault();
            // Ignora clique no ícone de info ou controles de edição
            if ($(ev.target).closest('.mod-view, .mod-control-icon').length) return;

            const btn = $(ev.currentTarget);
            const modData = {
                id: btn.data('id'),
                value: parseInt(btn.data('value')),
                label: btn.data('label'),
                nh_cap: btn.data('cap')
            };

            const index = this.selectedModifiers.findIndex(m => m.id === modData.id);
            
            if (index >= 0) {
                this.selectedModifiers.splice(index, 1);
                btn.removeClass('active');
            } else {
                this.selectedModifiers.push(modData);
                btn.addClass('active');
            }

            this._updateTotals(html);
        });

        // Info View
        html.find('.mod-view').click(ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const desc = $(ev.currentTarget).data('desc');
            const title = $(ev.currentTarget).data('title');
            new Dialog({ title: title, content: `<div style="padding:10px;line-height:1.4;">${desc}</div>`, buttons: { ok: { label: "Ok" } }, default: "ok" }).render(true);
        });

        // Inicializa
        this._updateTotals(html);
        this.setPosition({ height: "auto" });
    }

    _updateTotals(html) {
        const base = this.rollData.value || 10;
        let manual = parseInt(html.find('input[name="manualMod"]').val()) || 0;
        let selected = 0;
        let activeCaps = [];

        this.selectedModifiers.forEach(m => {
            selected += m.value;
            if (m.nh_cap !== "" && m.nh_cap !== null && m.nh_cap !== undefined) activeCaps.push(parseInt(m.nh_cap));
        });
        
        const totalMod = manual + selected;
        let final = base + totalMod;

        let capText = "";
        if (activeCaps.length > 0) {
            const lowestCap = Math.min(...activeCaps);
            if (final > lowestCap) {
                final = lowestCap;
                capText = `(Teto ${lowestCap})`;
            }
        }

        // Renderiza Tags
        const stackContainer = html.find('.active-mods-list');
        stackContainer.empty();

        if (manual !== 0) {
            stackContainer.append(`<span class="mod-tag locked" title="Manual">Manual <strong>${manual > 0 ? '+' : ''}${manual}</strong></span>`);
        }
        
        if (this.selectedModifiers.length === 0 && manual === 0) {
            stackContainer.append(`<span class="empty-stack-msg">...</span>`);
        }

        this.selectedModifiers.forEach(m => {
            const tag = $(`<span class="mod-tag" title="Remover">${m.label} <strong>${m.value > 0 ? '+' : ''}${m.value}</strong></span>`);
            tag.click(() => {
                const idx = this.selectedModifiers.findIndex(x => x.id === m.id);
                if (idx >= 0) this.selectedModifiers.splice(idx, 1);
                html.find(`.mod-btn[data-id="${m.id}"]`).removeClass('active');
                this._updateTotals(html);
            });
            stackContainer.append(tag);
        });

        // Atualiza Valores
        html.find('.total-mod-val').text((totalMod >= 0 ? '+' : '') + totalMod);
        html.find('.final-val').text(final);
        
        const capEl = html.find('.cap-warning');
        if (capText) {
            capEl.text(capText).show();
            html.find('.final-val').css('color', '#e57373');
        } else {
            capEl.hide();
            html.find('.final-val').css('color', '');
        }
    }

    async _updateObject(event, formData) {
        const manualMod = parseInt(formData.manualMod) || 0;
        let buttonsMod = 0;
        let activeCaps = [];

        this.selectedModifiers.forEach(m => {
            buttonsMod += m.value;
            if (m.nh_cap !== "" && m.nh_cap !== null) activeCaps.push(parseInt(m.nh_cap));
        });

        const totalMod = manualMod + buttonsMod;
        let finalValue = parseInt(this.rollData.value) + totalMod;

        if (activeCaps.length > 0) {
            const lowestCap = Math.min(...activeCaps);
            if (finalValue > lowestCap) finalValue = lowestCap;
        }

        performGURPSRoll(this.actor, {
            ...this.rollData,
            value: finalValue,
            originalValue: this.rollData.value,
            modifier: totalMod
        });
    }
}