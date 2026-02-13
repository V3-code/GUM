import { performGURPSRoll } from "../../scripts/main.js";
import { GUM_DEFAULTS } from "../gum-defaults.js";

export class GurpsRollPrompt extends FormApplication {
    
 constructor(actor, rollData, options = {}) {
        super(options);
        this.actor = actor;
        this.rollData = rollData;
        this.selectedModifiers = [];
        this.onRoll = options.onRoll;
        this.baseAttributeOptions = [];
        this.baseAttributeOptionsMap = new Map();
        this.baseDefaultKey = "skill";
        this.baseDefaultLabel = "Perícia";
        this.currentBaseKey = "skill";
        this.currentBaseLabel = "Perícia";
        this.originalBaseValue = parseInt(this.rollData.value) || 10;
        this.currentBaseValue = this.originalBaseValue;
        this.baseDelta = 0;
        this.baseModifierParts = [];
        this.baseAttributeSourceLabel = "Perícia";

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
        if (modContext === "defense") return rollContext.startsWith("defense");
        if (modContext === "skill") return rollContext.startsWith("skill_") || rollContext === "skill";
        return modContext === rollContext;
    }
    
    _determineContext() {
        const type = this.rollData.type;
        const itemId = this.rollData.itemId;
        const attributeKey = this.rollData.attributeKey?.toLowerCase?.() || this.rollData.attribute?.toLowerCase?.();
        const senseKeys = ["vision", "hearing", "tastesmell", "touch"];
        const attributeKeys = ["st", "dx", "iq", "ht", "per", "vont"];
        
        if (type === 'defense') {
            const defenseType = this.rollData.defenseType?.toLowerCase?.();
            if (defenseType === 'dodge') return 'defense_dodge';
            if (defenseType === 'parry') return 'defense_parry';
            if (defenseType === 'block') return 'defense_block';
            return 'defense';
        }

        if (type === 'attack') {
            if (this.rollData.attackType === 'ranged') return 'attack_ranged';
            if (this.rollData.isRanged === true) return 'attack_ranged';
 if (this.rollData.attackType === 'melee') return 'attack_melee';
        }

        if (type === 'spell') return 'spell';
        if (type === 'power') return 'power';

        if (type === 'attribute' && attributeKey) {
            if (attributeKeys.includes(attributeKey)) return `check_${attributeKey}`;
        }

        if (type === 'skill') {
            if (attributeKey && senseKeys.includes(attributeKey)) return `sense_${attributeKey}`;
            let baseAttribute = attributeKey;
            if (!baseAttribute && itemId) {
                const item = this.actor.items.get(itemId);
                if (item?.system?.base_attribute) baseAttribute = item.system.base_attribute.toLowerCase();
            }
            if (baseAttribute && attributeKeys.includes(baseAttribute)) return `skill_${baseAttribute}`;
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

return 'default';
    }

    _normalizeAttributeKey(key) {
        if (!key) return null;
        const normalized = key.toString().trim().toLowerCase();
        if (normalized === "will") return "vont";
        return normalized;
    }

    _formatBaseLabelValue(key) {
        if (!key) return "Perícia";
        const normalizedKey = this._normalizeAttributeKey(key);
        const labelMap = {
            st: "ST",
            dx: "DX",
            iq: "IQ",
            ht: "HT",
            per: "Per",
            vont: "Vont"
        };
        if (labelMap[normalizedKey]) return labelMap[normalizedKey];
        const fixedNumber = Number(normalizedKey);
        if (!Number.isNaN(fixedNumber)) return `${fixedNumber}`;
        return key.toString().trim();
    }

    _collectBaseModifiers(sourceItem) {
        if (!sourceItem || !["skill", "spell", "power"].includes(sourceItem.type)) {
            return [];
        }
        const relativeLevel = Number(sourceItem.system?.skill_level) || 0;
        const otherMods = Number(sourceItem.system?.other_mods) || 0;
        const parts = [];
        if (relativeLevel !== 0) parts.push(relativeLevel);
        if (otherMods !== 0) parts.push(otherMods);
        return parts;
    }

    _getBaseAttributeKey() {
        const attributeKey = this.rollData.attributeKey?.toLowerCase?.() || this.rollData.attribute?.toLowerCase?.();
        if (attributeKey) return attributeKey;
        if (this.rollData.itemId) {
            const item = this.actor.items.get(this.rollData.itemId);
            return item?.system?.base_attribute?.toString?.().trim() || null;
        }
        return null;
    }

    _resolveBaseValue(key, { fallbackValue = null } = {}) {
        if (!key) return fallbackValue;
        const normalizedKey = this._normalizeAttributeKey(key);
        const attributeKeys = ["st", "dx", "iq", "ht", "per", "vont"];

        if (attributeKeys.includes(normalizedKey)) {
            const value = foundry.utils.getProperty(this.actor.system, `attributes.${normalizedKey}.final`);
            return value !== undefined && value !== null ? value : fallbackValue;
        }

        const fixedNumber = Number(normalizedKey);
        if (!Number.isNaN(fixedNumber)) return fixedNumber;

        const normalizedTarget = normalizedKey.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
        const skills = this.actor.items?.filter(item => item.type === "skill") || [];
        const matchedSkill = skills.find(skill => {
            const skillName = skill.name?.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
            return skillName === normalizedTarget;
        });

        if (matchedSkill) {
            const nhValue = matchedSkill.system?.final_nh ?? matchedSkill.system?.nh;
            if (nhValue !== undefined && nhValue !== null) return nhValue;
        }

        return fallbackValue;
    }

    _shouldApplyBaseDelta(sourceItem) {
        const rollType = this.rollData.type;
        if (["skill", "spell", "power"].includes(rollType)) return true;
        if (sourceItem && ["skill", "spell", "power"].includes(sourceItem.type)) return true;
        return false;
    }

    _prepareBaseAttributeOptions() {
        this.baseAttributeOptionsMap.clear();
        const baseAttributeKey = this._getBaseAttributeKey();
        const normalizedBaseAttributeKey = this._normalizeAttributeKey(baseAttributeKey);
        const sourceItem = this.rollData.itemId ? this.actor.items.get(this.rollData.itemId) : null;
        const baseAttributeValue = this._resolveBaseValue(baseAttributeKey);
        const canApplyDelta = this._shouldApplyBaseDelta(sourceItem);

        this.baseDelta = canApplyDelta && baseAttributeValue !== null
            ? this.originalBaseValue - baseAttributeValue
            : 0;

        this.baseModifierParts = this._collectBaseModifiers(sourceItem);
        this.baseAttributeSourceLabel = this._formatBaseLabelValue(baseAttributeKey);

        const options = [
            { key: "st", label: "ST", type: "attribute" },
            { key: "dx", label: "DX", type: "attribute" },
            { key: "iq", label: "IQ", type: "attribute" },
            { key: "ht", label: "HT", type: "attribute" },
            { key: "per", label: "Per", type: "attribute" },
            { key: "vont", label: "Vont", type: "attribute" },
            { key: "skill", label: "Perícia", type: "skill" },
            { key: "fixed_8", label: "8", type: "fixed", value: 8 },
            { key: "fixed_12", label: "12", type: "fixed", value: 12 },
            { key: "fixed_16", label: "16", type: "fixed", value: 16 }
        ];

        const fixedMatch = Number.isNaN(Number(normalizedBaseAttributeKey))
            ? null
            : options.find(option => option.type === "fixed" && option.value === Number(normalizedBaseAttributeKey));

        if (normalizedBaseAttributeKey && options.some(option => option.key === normalizedBaseAttributeKey)) {
            this.baseDefaultKey = normalizedBaseAttributeKey;
        } else if (fixedMatch) {
            this.baseDefaultKey = fixedMatch.key;
        } else {
            this.baseDefaultKey = "skill";
        }

        options.forEach(option => {
            if (option.type === "attribute") {
                option.value = this._resolveBaseValue(option.key, { fallbackValue: 10 });
            }
        });

        const defaultOption = options.find(option => option.key === this.baseDefaultKey) || options.find(option => option.key === "skill");
        this.baseDefaultLabel = defaultOption?.label || "Perícia";
        this.currentBaseKey = this.baseDefaultKey;
        this.currentBaseLabel = this.baseDefaultLabel;
        this.currentBaseValue = this._computeBaseValueFromOption(defaultOption);

        options.forEach(option => {
            option.isSelected = option.key === this.currentBaseKey;
            this.baseAttributeOptionsMap.set(option.key, option);
        });

        this.baseAttributeOptions = options;
        return options;
    }

    _getCurrentBaseLabelValue(option) {
        if (!option) return this.baseAttributeSourceLabel;
        if (option.type === "skill") return this.baseAttributeSourceLabel;
        if (option.type === "fixed") return `${option.value ?? option.label ?? ""}`;
        return option.label;
    }

    _buildBaseDetailLabel(option) {
        const baseLabelValue = this._getCurrentBaseLabelValue(option);
        if (!this.baseModifierParts.length) return baseLabelValue;
        const modifierText = this.baseModifierParts
            .map(value => `${value >= 0 ? "+" : ""}${value}`)
            .join("");
        return `${baseLabelValue}${modifierText}`;
    }

    _computeBaseValueFromOption(option) {
        if (!option) return this.originalBaseValue;
        if (option.type === "skill") return this.originalBaseValue;
        const optionValue = Number(option.value);
        const resolvedValue = Number.isNaN(optionValue) ? this.originalBaseValue : optionValue;
        return resolvedValue + this.baseDelta;
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
            let pack = game.packs.get("gum.gm_modifiers") || game.packs.find(p => p.metadata.label === "[GUM] Modificadores de Rolagem" || p.metadata.label === "[GUM] Modificadores Básicos");
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
        else if (context === 'skill' || context.startsWith('skill_') || context.startsWith('check_')) {
            validKeys.push('attr_all', 'attr_dx_all', 'attr_iq_all', 'attr_ht_all', 'attr_st_all', 'attr_per_all', 'attr_will_all'); 
            validKeys.push('skill_st', 'skill_dx', 'skill_iq', 'skill_ht', 'skill_per', 'skill_will');
        }

        return validKeys.some(k => targets[k] === true);
    }

   async getData() {
        const context = await super.getData();
        context.actor = this.actor;
        context.label = this.rollData.label || "Teste";
        context.img = this.rollData.img || this.actor.img || "icons/svg/d20.svg";
        context.baseValue = parseInt(this.rollData.value) || 10;
        context.baseAttributeOptions = this._prepareBaseAttributeOptions();
        context.baseAttributePrimary = context.baseAttributeOptions.filter(option => option.type === "attribute");
        context.baseAttributeSecondary = context.baseAttributeOptions.filter(option => option.type !== "attribute");
        const currentOption = this.baseAttributeOptionsMap.get(this.currentBaseKey);
        context.baseAttributeLabel = this._buildBaseDetailLabel(currentOption);
        
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

        html.find('.base-attr-btn').click(ev => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const key = btn.data('key');
            const option = this.baseAttributeOptionsMap.get(key);

            if (!option) return;

            html.find('.base-attr-btn').removeClass('active');
            btn.addClass('active');

            this.currentBaseKey = option.key;
            this.currentBaseLabel = option.label;
            this.currentBaseValue = this._computeBaseValueFromOption(option);

            this._updateTotals(html);
        });
        
        // Inicializa
        this._updateTotals(html);
    }

_updateTotals(html) {
        const base = parseInt(this.currentBaseValue) || parseInt(this.rollData.value) || 10;
        let manual = parseInt(html.find('input[name="manualMod"]').val()) || 0;
        let selected = 0;
        let activeCaps = [];
        const baseChanged = this.currentBaseKey !== this.baseDefaultKey;

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

        if (baseChanged) {
            stackContainer.append(`<span class="mod-tag locked base-attr-tag">Base: ${this.currentBaseLabel}</span>`);
        }

        if (manual !== 0) {
            stackContainer.append(`<span class="mod-tag locked">Manual <strong>${manual > 0 ? '+' : ''}${manual}</strong></span>`);
        }
        
       if (this.selectedModifiers.length === 0 && manual === 0 && !baseChanged) {
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

        html.find('.base-value-box .value').text(base);
        const currentOption = this.baseAttributeOptionsMap.get(this.currentBaseKey);
        html.find('.base-attr-label').text(this._buildBaseDetailLabel(currentOption));
        html.find('.base-summary').text(`Base ${base}`);
        
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
        const baseValue = parseInt(this.currentBaseValue) || parseInt(this.rollData.value) || 10;

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
        
const rollPayload = {
            ...this.rollData,
            // Enviamos o valor matemático puro, o performGURPSRoll aplica o corte visualmente
            value: baseValue + totalMod,
            originalValue: baseValue,
            modifier: totalMod
        };
        const rollOptions = {
            ignoreGlobals: true, // Já processamos os globais aqui no prompt
            effectiveCap: lowestCap // ✅ O SEGREDO: Enviamos o teto calculado aqui!
        };

        if (typeof this.onRoll === "function") {
            await this.onRoll(this.actor, rollPayload, rollOptions);
            return;
        }

        performGURPSRoll(this.actor, rollPayload, rollOptions);
    } 
}