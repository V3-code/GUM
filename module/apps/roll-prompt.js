import { performGURPSRoll } from "../../scripts/main.js";
import { GUM_DEFAULTS } from "../gum-defaults.js";

export class GurpsRollPrompt extends FormApplication {
    
    constructor(actor, rollData, options = {}) {
        super(options);
        this.actor = actor;
        this.rollData = rollData;
        this.selectedModifiers = [];

        this.context = this._determineContext();

        // 1. Carrega modificadores globais (Escudo)
        this._loadGMModifiers();
        this._loadEffectModifiers();
        
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
     * Lê as flags do ator e adiciona aos modificadores selecionados (CORRIGIDO)
     */
    _loadGMModifiers() {
        const gmMods = this.actor.getFlag("gum", "gm_modifiers") || [];
        
        gmMods.forEach(mod => {
            this.selectedModifiers.push({
                id: mod.id || foundry.utils.randomID(),
                label: mod.name,
                value: parseInt(mod.value) || 0,
                // ✅ CORREÇÃO: Lê o cap da flag, se existir
                nh_cap: (mod.cap !== undefined && mod.cap !== "") ? parseInt(mod.cap) : null,
                isGM: true // Marca para estilizar diferente se quiser (ex: cadeado)
            });
});
    }

    _loadEffectModifiers() {
        const activeEffects = Array.from(this.actor.appliedEffects ?? this.actor.effects ?? []);

        activeEffects.forEach(effect => {
            const data = foundry.utils.getProperty(effect, "flags.gum.rollModifier");
            if (!data) return;
            if (!this._matchesEffectContext(data.context, this.context)) return;

            this.selectedModifiers.push({
                id: effect.id,
                label: effect.name,
                value: parseInt(data.value) || 0,
                nh_cap: (data.cap !== undefined && data.cap !== "") ? parseInt(data.cap) : null,
                isGM: true,
                isEffect: true
            });
        });
    }

    _matchesEffectContext(modContext, rollContext) {
        if (!modContext || modContext === "all") return true;
        if (Array.isArray(modContext)) return modContext.includes(rollContext);
        if (typeof modContext === "string" && modContext.includes(",")) {
            return modContext.split(",").map(c => c.trim()).includes(rollContext);
        }
        if (modContext === "attack") return rollContext.startsWith("attack");
        return modContext === rollContext;
    }
    
    _determineContext() {
        const type = this.rollData.type;
        const itemId = this.rollData.itemId;
        
        if (type === 'defense') return 'defense';

        if (type === 'attack') {
            if (this.rollData.attackType === 'ranged') return 'attack_ranged';
            if (this.rollData.isRanged === true) return 'attack_ranged';
            if (this.rollData.attackType === 'melee') return 'attack_melee';
        }

        if (itemId) {
            const item = this.actor.items.get(itemId);
            if (item) {
                if (item.type === 'spell') return 'spell';
                if (item.type === 'power') return 'power';
                if (item.type === 'ranged_weapon') return 'attack_ranged';
            }
        }

        if (type === 'attack') return 'attack_melee';
        if (type === 'skill' || type === 'attribute') return 'skill';
        if (type === 'spell') return 'spell';
        if (type === 'power') return 'power';

        return 'default';
    }

    async _fetchAndOrganizeModifiers() {
        const contextKey = this.context;
        const layoutConfig = GUM_DEFAULTS.layouts[contextKey] || GUM_DEFAULTS.layouts['default'];
        
        const blocksMap = {};
        layoutConfig.forEach(block => {
            blocksMap[block.id] = { ...block, items: [] };
        });

        const allModifierItems = [];

        const useDefaults = this.actor.getFlag("gum", "useDefaultModifiers");

        if (useDefaults) {
            let pack = game.packs.get("gum.gm_modifiers") || game.packs.find(p => p.metadata.label === "[GUM] Modificadores Básicos");
            if (pack) {
                const packIndex = await pack.getDocuments(); 
                allModifierItems.push(...packIndex);
            }
        }

        const actorModifiers = this.actor.items.filter(i => i.type === "gm_modifier");
        allModifierItems.push(...actorModifiers);

        const uniqueItemsMap = new Map();
        for (const item of allModifierItems) {
            uniqueItemsMap.set(item.name, item);
        }

        for (const item of uniqueItemsMap.values()) {
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

        const validKeys = [];
        if (context.startsWith('attack')) {
            validKeys.push('combat_all', 'combat_attack_all');
            if (context === 'attack_melee') validKeys.push('combat_attack_melee');
            if (context === 'attack_ranged') validKeys.push('combat_attack_ranged');
        }
        else if (context === 'defense') {
            validKeys.push('combat_all', 'combat_defense_all', 'combat_defense_dodge', 'combat_defense_parry', 'combat_defense_block');
        }
        else if (context === 'spell') {
            validKeys.push('combat_attack_spell', 'attr_iq_all', 'spell_iq', 'combat_all');
        }
        else if (context === 'power') {
             validKeys.push('combat_attack_power', 'power_iq', 'power_ht', 'power_will');
        }
        else if (context === 'skill') {
            validKeys.push('attr_all', 'attr_dx_all', 'attr_iq_all', 'attr_ht_all', 'attr_st_all'); 
            validKeys.push('skill_dx', 'skill_iq', 'skill_ht', 'skill_per', 'skill_will');
        }

        return validKeys.some(k => targets[k] === true);
    }

    async getData() {
        const context = await super.getData();
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

        // Quick View (Info)
        html.find('.mod-view').click(async ev => {
            ev.preventDefault();
            ev.stopPropagation(); 

            const icon = $(ev.currentTarget);
            const button = icon.siblings('.mod-btn'); 
            
            let rawValue = icon.data('value');
            if (rawValue === undefined) rawValue = button.data('value');

            const data = {
                name: icon.data('title') || button.data('label') || "Modificador",
                value: parseInt(rawValue) || 0,
                cap: icon.data('cap') || button.data('cap'),
                duration: icon.data('duration') || button.data('duration'),
                desc: icon.data('desc') || "<i>Sem descrição.</i>",
                type: "Modificador" 
            };

            const createTag = (label, value) => {
                if (value) return `<div class="property-tag"><label>${label}</label><span>${value}</span></div>`;
                return '';
            };

            let tagsHtml = createTag('MOD:', `${data.value > 0 ? '+' : ''}${data.value}`);
            if (data.cap) tagsHtml += createTag('Teto (Cap):', data.cap);
            if (data.duration) tagsHtml += createTag('Duração:', data.duration);

            const enrichedDesc = await TextEditor.enrichHTML(data.desc, { async: true });

            const content = `
                <div class="gurps-dialog-canvas">
                    <div class="gurps-item-preview-card" style="border:none; box-shadow:none;">
                        <header class="preview-header">
                            <h3>${data.name}</h3>
                            <div class="header-controls">
                                <span class="preview-item-type">${data.type}</span>
                            </div>
                        </header>
                        <div class="preview-content">
                            <div class="preview-properties">${tagsHtml}</div>
                            <hr class="preview-divider">
                            <div class="preview-description">${enrichedDesc}</div>
                        </div>
                    </div>
                </div>`;

            new Dialog({
                title: `Detalhes: ${data.name}`,
                content: content,
                buttons: { close: { icon: '<i class="fas fa-times"></i>', label: "Fechar" } },
                options: { classes: ["dialog", "gurps-item-preview-dialog"], width: 400 }
            }).render(true);
        });

        // Seleção de Botão
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

        // 1. Soma os modificadores e coleta os tetos
        this.selectedModifiers.forEach(m => {
            selected += m.value;
            if (m.nh_cap !== undefined && m.nh_cap !== null && m.nh_cap !== "") {
                const cap = parseInt(m.nh_cap);
                if (!isNaN(cap)) activeCaps.push(cap);
            }
        });
        
        const totalMod = manual + selected;
        
        // 2. Calcula o valor matemático (sem corte)
        const mathValue = base + totalMod;
        let final = mathValue;
        let capText = "";
        let isCapped = false;

        // 3. Aplica a Regra do Teto
        if (activeCaps.length > 0) {
            const lowestCap = Math.min(...activeCaps);
            if (final > lowestCap) {
                final = lowestCap;
                isCapped = true;
                // Texto explícito para o usuário
                capText = `Teto Aplicado: ${lowestCap}`;
            }
        }

        // --- ATUALIZAÇÃO VISUAL ---

        const stackContainer = html.find('.active-mods-list');
        stackContainer.empty();

        if (manual !== 0) {
            stackContainer.append(`<span class="mod-tag locked">Manual <strong>${manual > 0 ? '+' : ''}${manual}</strong></span>`);
        }
        
        if (this.selectedModifiers.length === 0 && manual === 0) {
             stackContainer.append(`<span class="empty-stack-msg" style="color:#666; font-style:italic; font-size:0.8em;">Nenhum modificador.</span>`);
        }

        this.selectedModifiers.forEach(m => {
            let capBadge = m.nh_cap ? `<span class="stack-cap" style="font-size:0.8em; opacity:0.7; margin-right:3px;">[↓${m.nh_cap}]</span>` : '';
            const tagClass = m.isGM ? 'gm-locked' : (m.isEffect ? 'gm-locked' : '');
            const tag = $(`<span class="mod-tag ${tagClass}">${capBadge}${m.label} <strong>${m.value > 0 ? '+' : ''}${m.value}</strong></span>`);
            tag.click(() => {
                const idx = this.selectedModifiers.findIndex(x => x.id === m.id);
                if (idx >= 0) this.selectedModifiers.splice(idx, 1);
                html.find(`.mod-btn[data-id="${m.id}"]`).removeClass('active');
                this._updateTotals(html);
            });
            stackContainer.append(tag);
        });

        // Cores do Modificador Total
        const color = totalMod > 0 ? 'var(--c-accent-gold)' : (totalMod < 0 ? '#e57373' : '#777');
        html.find('.total-mod-val').text((totalMod >= 0 ? '+' : '') + totalMod).css('color', color);
        
        // Atualiza Valor Final
        const finalEl = html.find('.final-val');
        finalEl.text(final);
        
        // Atualiza Aviso de Teto
        const capEl = html.find('.cap-warning');
        
        if (isCapped) {
            // Visual de "Cortado"
            capEl.html(`<i class="fas fa-exclamation-triangle"></i> ${capText}`).slideDown(150);
            
            finalEl.css('color', '#e57373'); // Vermelho
            finalEl.addClass('is-capped'); // Classe para CSS extra (riscado, etc)
            
            // Dica: Mostra o valor original no title
            finalEl.attr('title', `Valor original: ${mathValue} (Reduzido pelo teto)`);
        } else {
            // Visual Normal
            capEl.slideUp(150);
            finalEl.css('color', 'var(--c-accent-gold)');
            finalEl.removeClass('is-capped');
            finalEl.attr('title', '');
        }
    }

async _updateObject(event, formData) {
        const manualMod = parseInt(formData.manualMod) || 0;
        let buttonsMod = 0;
        let activeCaps = [];

        this.selectedModifiers.forEach(m => {
            buttonsMod += m.value;
            // Verifica o cap de forma segura
            if (m.nh_cap !== undefined && m.nh_cap !== null && m.nh_cap !== "") {
                const cap = parseInt(m.nh_cap);
                if (!isNaN(cap)) activeCaps.push(cap);
            }
        });

        const totalMod = manualMod + buttonsMod;
        
        // Calcula qual é o teto mais baixo (ou Infinity se não tiver nenhum)
        let lowestCap = Infinity;
        if (activeCaps.length > 0) {
            lowestCap = Math.min(...activeCaps);
        }

        // Importante: Não precisamos calcular o 'finalValue' cortado aqui,
        // pois vamos mandar o 'lowestCap' para o main.js fazer a matemática visual correta.
        
        performGURPSRoll(this.actor, {
            ...this.rollData,
            // Enviamos o valor matemático puro, o performGURPSRoll aplica o corte visualmente
            value: parseInt(this.rollData.value) + totalMod, 
            originalValue: this.rollData.value, 
            modifier: totalMod          
        }, { 
            ignoreGlobals: true, // Já processamos os globais aqui no prompt
            effectiveCap: lowestCap // ✅ O SEGREDO: Enviamos o teto calculado aqui!
        }); 
    }
}