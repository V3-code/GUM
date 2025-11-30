import { performGURPSRoll } from "../../scripts/main.js";
import { GUM_DEFAULTS } from "../gum-defaults.js"; 

export class GurpsRollPrompt extends FormApplication {
    
    constructor(actor, rollData, options = {}) {
        super(options);
        this.actor = actor;
        this.rollData = rollData;
        this.selectedModifiers = []; 
        this.context = this._determineContext();
        
        console.log("GUM | Roll Prompt Iniciado");
        console.log(" -> Dados recebidos:", rollData);
        console.log(" -> Item ID:", rollData.itemId);
        console.log(" -> Contexto Calculado:", this.context);
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "Configurar Rolagem",
            id: "gurps-roll-prompt",
            template: "systems/gum/templates/apps/roll-prompt.hbs",
            width: 780, 
            height: "auto",
            classes: ["gum", "roll-prompt", "theme-dark"],
            closeOnSubmit: true,
            scrollY: [".prompt-menu-column", ".active-mods-container"]
        });
    }

    /**
     * LÓGICA CORRIGIDA: Inspeciona o Item para garantir o contexto correto
     */
    _determineContext() {
        const type = this.rollData.type; // O que a ficha disse que é
        const itemId = this.rollData.itemId; // O ID do item real

        // 1. Prioridade Absoluta: Defesa (geralmente bem definida)
        if (type === 'defense') return 'defense';

        // 2. Inspeção do Item (A Correção Principal)
        // Se temos um ID, buscamos o item para saber o que ele REALMENTE é.
        if (itemId) {
            const item = this.actor.items.get(itemId);
            if (item) {
                // Se é Magia -> Contexto Spell
                if (item.type === 'spell') return 'spell';
                
                // Se é Poder -> Contexto Power
                if (item.type === 'power') return 'power';
                
                // Se é Arma/Ataque -> Contexto Attack
                // (Verifica se é arma ou se o tipo passado foi 'attack')
                if (item.type === 'melee_weapon' || (type === 'attack' && !this.rollData.isRanged)) return 'attack_melee';
                if (item.type === 'ranged_weapon' || (type === 'attack' && this.rollData.isRanged)) return 'attack_ranged';
                
                // Se é Perícia -> Contexto Skill
                if (item.type === 'skill') return 'skill';
            }
        }

        // 3. Fallbacks (se não tiver item ou for genérico)
        
        // Se a ficha gritou "attack" explicitamente
        if (type === 'attack') {
            if (this.rollData.attackType === 'ranged' || this.rollData.isRanged) return 'attack_ranged';
            return 'attack_melee';
        }

        // Atributos Puros (ST, DX, IQ, HT) usam layout de Perícia
        if (type === 'attribute' || type === 'skill') return 'skill';

        return 'default';
    }

/**
     * 2. Busca e Prepara todos os modificadores (Nativos + Compêndio)
     */
    async _fetchAndOrganizeModifiers() {
        const contextKey = this.context;
        // Pega o layout ou usa o Default como fallback seguro
        const layoutConfig = GUM_DEFAULTS.layouts[contextKey] || GUM_DEFAULTS.layouts['default'];
        
        // Mapa para guardar os itens de cada bloco
        const blocksMap = {};
        layoutConfig.forEach(block => {
            blocksMap[block.id] = { ...block, items: [] };
        });

        // 1. MODIFICADORES NATIVOS (GUM-DEFAULTS)
        // Estes são hardcoded e aparecem sempre (ex: Localização, Manobras Padrão)
        for (const [key, mod] of Object.entries(GUM_DEFAULTS.modifiers)) {
            const category = this._getNativeCategory(key);
            
            if (blocksMap[category]) {
                blocksMap[category].items.push({
                    id: mod.id,
                    label: mod.label,
                    value: mod.value,
                    desc: mod.desc,
                    nh_cap: null, 
                    active: this.selectedModifiers.some(m => m.id === mod.id),
                    isNative: true
                });
            }
        }

        // 2. MODIFICADORES CUSTOMIZADOS (APENAS COMPÊNDIO)
        const allModifierItems = [];

        /* --- DESATIVADO: LEITURA DE ITENS SOLTOS NO MUNDO ---
           Isso evita poluição. Se quiser reativar para testes rápidos, descomente as linhas abaixo.
        
        const worldItems = game.items.filter(i => i.type === "gm_modifier");
        allModifierItems.push(...worldItems);
        ---------------------------------------------------- */

        // B) Itens do Compêndio (FONTE PRINCIPAL)
        // Busca pelo ID do sistema "gum.gm_modifiers" OU pelo nome visual
        let pack = game.packs.get("gum.gm_modifiers") || game.packs.find(p => p.metadata.label === "[GUM] Modificadores Básicos");
        
        if (pack) {
            // Carrega o índice do compêndio
            const packIndex = await pack.getDocuments(); 
            allModifierItems.push(...packIndex);
            // console.log(`GUM | Carregados ${packIndex.length} modificadores do compêndio.`);
        }

        // Filtra duplicatas pelo nome, caso existam
        const uniqueItems = [];
        const seenNames = new Set();
        for (const item of allModifierItems) {
            if (!seenNames.has(item.name)) {
                seenNames.add(item.name);
                uniqueItems.push(item);
            }
        }

        // 3. DISTRIBUIÇÃO NOS BLOCOS
        for (const item of uniqueItems) {
            // Verifica se o item serve para este contexto (Checkboxes)
            if (!this._isValidForContext(item, contextKey)) continue;

            // Descobre em qual bloco visual ele vai (Dropdown ui_category)
            let uiCat = item.system.ui_category || "other";
            
            // Se o layout atual não tem esse bloco, joga para "Customizado" (other)
            if (!blocksMap[uiCat]) uiCat = "other";
            
            // Se mesmo "other" não existir (layouts muito restritos), ignora
            if (!blocksMap[uiCat]) continue;

            blocksMap[uiCat].items.push({
                id: item.id,
                label: item.name,
                value: item.system.modifier,
                desc: item.system.description || "",
                nh_cap: item.system.nh_cap,
                duration: item.system.duration,
                active: this.selectedModifiers.some(m => m.id === item.id),
                isNative: false
            });
        }

        // Retorna apenas os blocos que têm itens
        return layoutConfig.map(block => blocksMap[block.id]).filter(b => b.items.length > 0);
    }

    _getNativeCategory(modId) {
        if (modId.startsWith("loc_")) return "location";
        if (modId.startsWith("man_")) return "maneuver";
        if (modId.startsWith("opt_")) return "attack_opt";
        if (modId.startsWith("def_")) return "defense_opt";
        if (modId.startsWith("pos_")) return "posture";
        if (modId.startsWith("range_")) return "range";
        if (modId.startsWith("time_")) return "time";
        if (modId.startsWith("eff_")) return "effort";
        if (modId.startsWith("sit_")) return "situation";
        return "other";
    }

    _isValidForContext(item, context) {
        const targets = item.system.target_type || {};
        if (targets.global) return true;

        // Lista de chaves aceitas para cada contexto
        const validKeys = [];

        if (context.startsWith('attack')) {
            validKeys.push('combat_all', 'combat_attack_all');
            if (context === 'attack_melee') validKeys.push('combat_attack_melee');
            if (context === 'attack_ranged') validKeys.push('combat_attack_ranged');
        }
        else if (context === 'defense') {
            validKeys.push('combat_all', 'combat_defense_all');
            validKeys.push('combat_defense_dodge', 'combat_defense_parry', 'combat_defense_block');
        }
        else if (context === 'spell') {
            // Magias aceitam mods de IQ e de Magia
            validKeys.push('combat_attack_spell', 'attr_iq_all', 'spell_iq', 'combat_all');
        }
        else if (context === 'power') {
             validKeys.push('combat_attack_power', 'power_iq', 'power_ht', 'power_will');
        }
        else if (context === 'skill') {
            // Perícias aceitam modificadores gerais de atributo
            validKeys.push('attr_all', 'attr_dx_all', 'attr_iq_all', 'attr_ht_all', 'attr_st_all'); 
            validKeys.push('skill_dx', 'skill_iq', 'skill_ht', 'skill_per', 'skill_will');
        }

        return validKeys.some(k => targets[k] === true);
    }

    async getData() {
        const context = super.getData();
        context.actor = this.actor;
        context.label = this.rollData.label || "Teste";
        context.img = this.rollData.img || this.actor.img || "icons/svg/d20.svg";
        context.baseValue = parseInt(this.rollData.value) || 10;
        
        context.blocks = await this._fetchAndOrganizeModifiers();
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);
        const inputManual = html.find('input[name="manualMod"]');

        html.find('.step-btn').click(ev => {
            ev.preventDefault();
            const action = $(ev.currentTarget).data('action');
            let val = parseInt(inputManual.val()) || 0;
            inputManual.val(action === 'increase' ? val + 1 : val - 1);
            this._updateTotals(html);
        });

        html.find('.quick-btn').click(ev => {
            ev.preventDefault();
            const add = parseInt($(ev.currentTarget).data('value'));
            inputManual.val((parseInt(inputManual.val()) || 0) + add);
            this._updateTotals(html);
        });

        inputManual.on('input change', () => this._updateTotals(html));

        html.find('.mod-btn').click(ev => {
            ev.preventDefault();
            if ($(ev.target).closest('.mod-view').length) return;
            
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
        
        // Inicializa
        this._updateTotals(html);
    }

    _updateTotals(html) {
        const base = parseInt(this.rollData.value) || 10;
        let manual = parseInt(html.find('input[name="manualMod"]').val()) || 0;
        let selected = 0;
        let activeCaps = [];

        this.selectedModifiers.forEach(m => {
            selected += m.value;
            if (m.nh_cap) {
                const cap = parseInt(m.nh_cap);
                if (!isNaN(cap)) activeCaps.push(cap);
            }
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

        const stackContainer = html.find('.active-mods-list');
        stackContainer.empty();

        if (manual !== 0) {
            stackContainer.append(`<span class="mod-tag locked">Manual <strong>${manual > 0 ? '+' : ''}${manual}</strong></span>`);
        }
        
        if (this.selectedModifiers.length === 0 && manual === 0) {
             stackContainer.append(`<span class="empty-stack-msg" style="color:#666; font-style:italic; font-size:0.8em;">Nenhum modificador.</span>`);
        }

        this.selectedModifiers.forEach(m => {
            const tag = $(`<span class="mod-tag">${m.label} <strong>${m.value > 0 ? '+' : ''}${m.value}</strong></span>`);
            tag.click(() => {
                const idx = this.selectedModifiers.findIndex(x => x.id === m.id);
                if (idx >= 0) this.selectedModifiers.splice(idx, 1);
                html.find(`.mod-btn[data-id="${m.id}"]`).removeClass('active');
                this._updateTotals(html);
            });
            stackContainer.append(tag);
        });

        const color = totalMod > 0 ? 'var(--c-accent-gold)' : (totalMod < 0 ? '#e57373' : '#777');
        html.find('.total-mod-val').text((totalMod >= 0 ? '+' : '') + totalMod).css('color', color);
        html.find('.final-val').text(final);
        
        const capEl = html.find('.cap-warning');
        if (capText) {
            capEl.html(`<i class="fas fa-arrow-down"></i> ${capText}`).show();
            html.find('.final-val').css('color', '#e57373');
        } else {
            capEl.hide();
            html.find('.final-val').css('color', 'var(--c-accent-gold)');
        }
    }

    async _updateObject(event, formData) {
        const manualMod = parseInt(formData.manualMod) || 0;
        let buttonsMod = 0;
        let activeCaps = [];

        this.selectedModifiers.forEach(m => {
            buttonsMod += m.value;
            if (m.nh_cap) {
                const cap = parseInt(m.nh_cap);
                if (!isNaN(cap)) activeCaps.push(cap);
            }
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