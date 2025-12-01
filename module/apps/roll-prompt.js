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
     * LÓGICA CORRIGIDA: Obedece explicitamente ao botão clicado.
     */
    _determineContext() {
        const type = this.rollData.type; // ex: "attack", "defense"
        const itemId = this.rollData.itemId;
        
        // --- 1. DEFINIÇÕES EXPLÍCITAS (O Botão Manda) ---
        
        // Se for Defesa, não há ambiguidade
        if (type === 'defense') return 'defense';

        // Se for Ataque, verifique as flags do botão PRIMEIRO
        if (type === 'attack') {
            // Se o botão diz "ranged", é Ranged. Ponto final.
            if (this.rollData.attackType === 'ranged') return 'attack_ranged';
            if (this.rollData.isRanged === true) return 'attack_ranged'; // Suporte legado
            
            // Se o botão diz "melee", é Melee.
            if (this.rollData.attackType === 'melee') return 'attack_melee';
        }

        // --- 2. INSPEÇÃO DO ITEM (Fallback / Detetive) ---
        // Só entra aqui se o botão não foi específico (ex: macro antiga, item arrastado)
        if (itemId) {
            const item = this.actor.items.get(itemId);
            if (item) {
                if (item.type === 'spell') return 'spell';
                if (item.type === 'power') return 'power';
                
                // Se o item é nativamente de distância (ex: Arco), sugere ranged
                if (item.type === 'ranged_weapon') return 'attack_ranged';
            }
        }

        // --- 3. PADRÕES FINAIS ---
        if (type === 'attack') return 'attack_melee'; // Se for ataque e ninguém disse nada, assume espada.
        
        // Atributos e Perícias usam o layout de Perícia
        if (type === 'skill' || type === 'attribute') return 'skill';
        
        if (type === 'spell') return 'spell';
        if (type === 'power') return 'power';

        return 'default';
    }

/**
     * 2. Busca e Prepara modificadores (Compêndio [Opcional] + Ator)
     */
    async _fetchAndOrganizeModifiers() {
        const contextKey = this.context;
        const layoutConfig = GUM_DEFAULTS.layouts[contextKey] || GUM_DEFAULTS.layouts['default'];
        
        // Mapa para guardar os itens
        const blocksMap = {};
        layoutConfig.forEach(block => {
            blocksMap[block.id] = { ...block, items: [] };
        });

        // LISTA MESTRA DE ITENS
        const allModifierItems = [];

        // -------------------------------------------------------
        // 1. COMPÊNDIO (CONDICIONAL - Só se a flag estiver ativa)
        // -------------------------------------------------------
        const useDefaults = this.actor.getFlag("gum", "useDefaultModifiers");

        if (useDefaults) {
            let pack = game.packs.get("gum.gm_modifiers") || game.packs.find(p => p.metadata.label === "[GUM] Modificadores Básicos");
            
            if (pack) {
                const packIndex = await pack.getDocuments(); 
                allModifierItems.push(...packIndex);
                console.log(`GUM | Lendo Compêndio (Flag Ativa): ${pack.metadata.label}`);
            }
        } else {
            // Debug opcional para saber que ignorou
            // console.log("GUM | Ignorando Compêndio (Flag Inativa).");
        }

        // -------------------------------------------------------
        // 2. ITENS DO ATOR (Sempre carrega)
        // -------------------------------------------------------
        const actorModifiers = this.actor.items.filter(i => i.type === "gm_modifier");
        allModifierItems.push(...actorModifiers);

        // -------------------------------------------------------
        // 3. DEDUPLICAÇÃO (Prioridade para o Ator)
        // -------------------------------------------------------
        // Se o compêndio foi carregado e o ator tem um item com mesmo nome,
        // o item do ator deve sobrescrever o do compêndio.
        const uniqueItemsMap = new Map();

        for (const item of allModifierItems) {
            // A chave é o nome. Como adicionamos o Ator POR ÚLTIMO na lista,
            // ele sobrescreve qualquer item anterior com o mesmo nome.
            uniqueItemsMap.set(item.name, item);
        }

        // 4. DISTRIBUIÇÃO NOS BLOCOS
        for (const item of uniqueItemsMap.values()) {
            // Verifica contexto (Target Type)
            if (!this._isValidForContext(item, contextKey)) continue;

            let uiCat = item.system.ui_category || "other";
            if (!blocksMap[uiCat]) uiCat = "other";
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

        // Ordena alfabeticamente dentro de cada bloco
        for (const blockKey in blocksMap) {
            blocksMap[blockKey].items.sort((a, b) => a.label.localeCompare(b.label));
        }

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