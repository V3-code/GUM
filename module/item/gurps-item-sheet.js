import { EffectBrowser } from "../apps/effect-browser.js";
import { ConditionBrowser } from "../apps/condition-browser.js";
import { EqpModifierBrowser } from "../apps/eqp-modifier-browser.js";
import { ModifierBrowser } from "../apps/modifier-browser.js";

// ================================================================== //
//  CLASSE DA FICHA DO ITEM (GurpsItemSheet) - VERSÃO BLINDADA V12    //
// ================================================================== //
export class GurpsItemSheet extends ItemSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "theme-dark"],
            width: 550,
            height: 600,
            template: "systems/gum/templates/items/item-sheet.hbs",
            tabs: [{
                navSelector: ".sheet-tabs",
                contentSelector: ".sheet-body-content",
                initial: "details"
            }],
            scrollY: [".sheet-body-content", ".sheet-body"]
        });
    }

    async getData(options) {
        // Recupera os dados básicos
        const context = await super.getData(options);
        const itemData = context.item; 

        // Garante acesso fácil ao system e flags
        context.system = itemData.system;
        context.flags = itemData.flags;

        // =======================================================
        // 1. LISTAS DE CONFIGURAÇÃO (DEFINIÇÃO EXPLÍCITA)
        // =======================================================
        // Definimos o objeto config DIRETAMENTE no contexto para garantir que exista.
        context.config = {
            costModes: {
                "standard": "Padrão (GURPS Basic)",
                "linear": "Linear (Árvore/Técnica)"
            },
            difficulties: {
                "E": "Fácil (E)",
                "A": "Média (A)",
                "H": "Difícil (H)",
                "VH": "Muito Difícil (VH)",
                "TecM": "Técnica Média (TecM)",
                "TecD": "Técnica Difícil (TecD)"
            },
            attributes: {
                "st": "ST", "dx": "DX", "iq": "IQ", "ht": "HT", 
                "per": "Per", "vont": "Vont"
            },
            hierarchyTypes: {
                "normal": "Padrão (Sem Árvore)",
                "trunk": "Tronco (Trunk)",
                "branch": "Galho (Branch)",
                "twig": "Graveto (Twig)",
                "leaf": "Folha (Leaf)"
            }
        };

        // Disponibiliza as listas também na raiz para facilitar (opcional, mas seguro)
        context.skillDifficulties = context.config.difficulties;
        context.hierarchyTypes = context.config.hierarchyTypes;

        context.characteristic_blocks = { 
            "block1": "Traços Raciais", 
            "block2": "Vantagens", 
            "block3": "Desvantagens", 
            "block4": "Especiais" 
        };

        // =======================================================
        // 2. LÓGICA DE EQUIPAMENTOS
        // =======================================================
        if (['equipment', 'armor', 'melee_weapon', 'ranged_weapon'].includes(this.item.type)) {
            const eqpModsObj = this.item.system.eqp_modifiers || {};
            const modifiersArray = Object.entries(eqpModsObj).map(([id, data]) => ({
                id, ...data
            })).sort((a, b) => a.name.localeCompare(b.name));
            context.eqpModifiersList = modifiersArray;

            let baseCost = Number(this.item.system.cost) || 0;
            let baseWeight = Number(this.item.system.weight) || 0;
            let totalCF = 0;
            let weightMultiplier = 1;

            for (const mod of modifiersArray) {
                totalCF += Number(mod.cost_factor) || 0;
                if (mod.weight_mod) {
                    const wModStr = mod.weight_mod.toString().trim().toLowerCase();
                    if (wModStr.startsWith('x')) {
                        const mult = parseFloat(wModStr.substring(1));
                        if (!isNaN(mult)) weightMultiplier *= mult;
                    }
                }
            }

            const finalCostMultiplier = Math.max(0, 1 + totalCF);
            context.calculatedFinalCost = baseCost * finalCostMultiplier;
            context.calculatedFinalWeight = baseWeight * weightMultiplier;
            
            context.finalCostString = context.calculatedFinalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            context.finalWeightString = context.calculatedFinalWeight.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            context.hasCostChange = finalCostMultiplier !== 1;
            context.hasWeightChange = weightMultiplier !== 1;
        }

        // =======================================================
        // 3. CUSTO DE VANTAGENS
        // =======================================================
        if (['advantage', 'disadvantage', 'power'].includes(this.item.type)) {
            const basePoints = Number(this.item.system.points) || 0;
            const modifiers = this.item.system.modifiers || {};
            let totalModPercent = 0;
            for (const modifier of Object.values(modifiers)) {
                totalModPercent += parseInt(modifier.cost, 10) || 0;
            }
            const cappedModPercent = Math.max(-80, totalModPercent);
            const multiplier = 1 + (cappedModPercent / 100);
            let finalCost = Math.round(basePoints * multiplier);
            
            if (basePoints > 0 && finalCost < 1) finalCost = 1;
            if (basePoints < 0 && finalCost > -1) finalCost = -1;
            
            context.calculatedCost = { totalModifier: cappedModPercent, finalPoints: finalCost };
        }

        // =======================================================
        // 4. PREPARAÇÃO DE EFEITOS
        // =======================================================
        const _prepareLinkedItems = async (sourceObject) => {       
            const entries = Object.entries(sourceObject || {});
            const promises = entries.map(async ([id, linkData]) => {
                const uuid = linkData.effectUuid || linkData.uuid; 
                const originalItem = await fromUuid(uuid).catch(() => null);
                return {
                    id: id,
                    uuid: uuid,
                    ...linkData,
                    name: originalItem ? originalItem.name : "Item não encontrado/excluído",
                    img: originalItem ? originalItem.img : "icons/svg/mystery-man.svg"
                };
            });
            return Promise.all(promises);
        };

        context.system.preparedEffects = {
            activation: {
                success: await _prepareLinkedItems(this.item.system.activationEffects?.success),
                failure: await _prepareLinkedItems(this.item.system.activationEffects?.failure)
            },
            onDamage: await _prepareLinkedItems(this.item.system.onDamageEffects),
            general: await _prepareLinkedItems(this.item.system.generalConditions),
            passive: await _prepareLinkedItems(this.item.system.passiveEffects)
        };

        // =======================================================
        // 5. LISTA DE MODIFICADORES
        // =======================================================
        const modifiersObj = this.item.system.modifiers || {};
        const modifiersArray = Object.entries(modifiersObj).map(([id, data]) => {
            const isLimitation = (data.cost || "").includes('-');
            return { id, ...data, isLimitation: isLimitation };
        });
        
        modifiersArray.sort((a, b) => {
            const costA = parseInt(a.cost) || 0; 
            const costB = parseInt(b.cost) || 0;
            if (costB !== costA) return costB - costA;
            return a.name.localeCompare(b.name);
        });
        context.sortedModifiers = modifiersArray;

        return context; 
    }

    /* -------------------------------------------- */
    /* Listeners e Callbacks                       */
    /* -------------------------------------------- */

    activateListeners(html) {
        super.activateListeners(html);
        if (!this.isEditable) return;

        // Auto-Cálculo
        html.find('input[name="system.auto_points"], select[name="system.difficulty"], input[name="system.skill_level"], select[name="system.cost_mode"], input[name="system.cost_per_level"]').on('change', this._onAutoCalcPoints.bind(this));    

          // Ajuste de Valor (+/-)
        html.find('.adjust-value').click(ev => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const action = btn.data('action');
            const targetField = btn.data('target'); 
            let currentLevel = foundry.utils.getProperty(this.item, targetField) || 0;
            let newLevel = action === 'increase' ? currentLevel + 1 : currentLevel - 1;
            
            // Sincroniza o input na tela antes do update (evita ler valor antigo no formulário)
            const input = this.form?.querySelector(`input[name="${targetField}"]`);
            if (input) input.value = newLevel;

            const sys = this.item.system;
            const updateData = { [targetField]: newLevel };

            // Recalcula pontos automaticamente (aplicado em magias/poderes também)
            if (sys.auto_points !== false && targetField === "system.skill_level") {
                const pointsField = (this.item.type === 'power') ? "system.points_skill" : "system.points";
                const costMode = sys.cost_mode || "standard";
                if (costMode === 'linear') {
                    const cost = sys.cost_per_level || 1;
                    updateData[pointsField] = Math.max(0, newLevel * cost);
                } else {
                    const diff = sys.difficulty || "A"; 
                    const newPoints = this._calculateSkillPoints(diff, newLevel);
                    updateData[pointsField] = newPoints;
                }
            }
            this.item.update(updateData);
        });

        if (this.item?.type === "gm_modifier") {
            this._activateGmModifierBehaviors(html);
        }

        // Editor de Descrição
        html.find(".toggle-editor").on("click", ev => {
            const section = $(ev.currentTarget).closest(".description-section");
            section.find(".description-view, .toggle-editor").hide();
        });
        html.find(".cancel-description").on("click", ev => {
            const section = $(ev.currentTarget).closest(".description-section");
            section.find(".description-editor").hide();
            section.find(".description-view, .toggle-editor").show();
        });
        html.find(".save-description").on("click", async ev => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const section = btn.closest(".description-section");
            const field = btn.data("field");
            const editor = this.editors?.[field];
            if (!editor) return;
            
            const content = editor.instance.getContent();
            await this.item.update({[field]: content});
            
            const enriched = await TextEditor.enrichHTML(content, {async: true});
            section.find(".description-view").html(enriched);
            section.find(".description-editor").hide();
            section.find(".description-view, .toggle-editor").show();
        });

        // Adicionar/Remover Ataques
        html.find('.add-attack').click(this._onAddAttack.bind(this));
        html.find('.delete-attack').click(this._onDeleteAttack.bind(this));
        
        // Vincular Perícia
        html.find('.link-skill-button').click(this._onLinkSkill.bind(this));

        // Modificadores de Equipamento
        html.find('.add-eqp-modifier').click(ev => {
            ev.preventDefault();
            new EqpModifierBrowser(this.item).render(true);
        });
         html.find('.delete-eqp-modifier').click(ev => {
            const modId = $(ev.currentTarget).closest('[data-modifier-id]').data('modifier-id');
            if (modId) this.item.update({ [`system.eqp_modifiers.-=${modId}`]: null });
        });
        html.find('.view-eqp-modifier').click(this._onViewEqpModifier.bind(this));

        // Modificadores (Vantagens)
        html.find('.add-modifier').click(ev => {
            ev.preventDefault();
            new ModifierBrowser(this.item).render(true);
        });
        html.find('.delete-modifier').click(ev => {
            const modId = $(ev.currentTarget).data('modifier-id');
            this.item.update({ [`system.modifiers.-=${modId}`]: null });
        });
        html.find('.view-modifier').click(ev => {
            // Lógica de visualização rápida
        });
        
        // Efeitos
        html.find('.add-effect').click(async (ev) => {
            const targetList = $(ev.currentTarget).data('target-list');
            new EffectBrowser(this.item, {
                onSelect: (selectedEffects) => {
                    const updates = {};
                    for (const effect of selectedEffects) {
                        const newId = foundry.utils.randomID();
                        updates[`system.${targetList}.${newId}`] = { id: newId, effectUuid: effect.uuid, recipient: 'target', name: effect.name, img: effect.img };
                    }
                    this.item.update(updates);
                }
            }).render(true);
        });
        html.find('.delete-effect').click(ev => {
            const target = $(ev.currentTarget);
            const listName = target.closest('.effect-entry').data('list-name');
            const effectId = target.closest('.effect-entry').data('effect-id');
            this.item.update({ [`system.${listName}.-=${effectId}`]: null });
        });
        html.find('.add-general-condition').click(ev => {
             new ConditionBrowser(this.item, {
                onSelect: (selectedConditions) => {
                    const updates = {};
                    for (const condition of selectedConditions) {
                        const newId = foundry.utils.randomID();
                        updates[`system.generalConditions.${newId}`] = { id: newId, uuid: condition.uuid, name: condition.name, img: condition.img };
                    }
                    this.item.update(updates);
                }
            }).render(true);
        });
        
        // Modo Edição de Ataque
        html.find('.edit-attack-mode').click(ev => {
             ev.preventDefault();
             $(ev.currentTarget).closest('.attack-item').find('.attack-display-mode').hide();
             $(ev.currentTarget).closest('.attack-item').find('.attack-edit-mode').show();
        });
        html.find('.save-attack-mode').click(ev => {
             ev.preventDefault();
             $(ev.currentTarget).closest('.attack-item').find('.attack-edit-mode').hide();
             $(ev.currentTarget).closest('.attack-item').find('.attack-display-mode').show();
        });
    }

     /* -------------------------------------------- */
    /* Métodos Auxiliares                          */
    /* -------------------------------------------- */

    _activateGmModifierBehaviors(html) {
        if (!this._gmTreeState) this._gmTreeState = {};

        // Persistência de colapsáveis
        html.find('.gm-tree-group').each((index, el) => {
            const id = el.id || `gm-tree-${index}`;
            if (this._gmTreeState[id] === undefined) {
                this._gmTreeState[id] = el.hasAttribute('open');
            }
            el.dataset.treeId = id;
            el.open = !!this._gmTreeState[id];
            el.addEventListener('toggle', ev => {
                const treeId = ev.currentTarget.dataset.treeId;
                this._gmTreeState[treeId] = ev.currentTarget.open;
            });
        });

        // Lógica de checkboxes (implicações)
        html.on('change', '.gm-modifier-layout input[type="checkbox"]', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            this._handleGmCheckboxChange(event, html);
        });
    }

    _handleGmCheckboxChange(event, html) {
        const target = event.currentTarget;
        const name = target.name || "";
        const checked = target.checked;

        const setChecked = (selector, value) => {
            html.find(selector).each((_, el) => { el.checked = value; });
        };

        const syncAttrRow = (attr) => {
            const rowInputs = Array.from(html.find(`input.attr-child-${attr}`));
            const allChecked = rowInputs.length > 0 && rowInputs.every(el => el.checked);
            const parent = html.find(`input.attr-parent-toggle[data-attr="${attr}"]`)[0];
            if (parent) parent.checked = allChecked;
        };

        const syncAttrAll = () => {
            const parents = Array.from(html.find('input.attr-parent-toggle'));
            const allChecked = parents.length > 0 && parents.every(el => el.checked);
            const attrAll = html.find('input[name="system.target_type.attr_all"]')[0];
            if (attrAll) attrAll.checked = allChecked;
        };

        const applySkillAll = (value) => {
            setChecked('input[name^="system.target_type.skill_"]', value);
        };

        // Regras principais
        if (name === "system.target_type.global") {
            setChecked('.gm-modifier-layout input[type="checkbox"]', checked);
        } else if (name === "system.target_type.combat_all") {
            setChecked('input[name^="system.target_type.combat_"]', checked);
        } else if (name === "system.target_type.attr_all") {
            setChecked('input.attr-parent-toggle', checked);
            setChecked('input[name^="system.target_type.check_"]', checked);
            setChecked('input[name^="system.target_type.skill_"]', checked);
            setChecked('input[name^="system.target_type.spell_"]', checked);
            setChecked('input[name^="system.target_type.power_"]', checked);
        } else if (name === "system.target_type.skill_all") {
            applySkillAll(checked);
        } else if (target.classList.contains('attr-parent-toggle')) {
            const attr = target.dataset.attr;
            if (attr) {
                setChecked(`input.attr-child-${attr}`, checked);
            }
        } else if (name.startsWith("system.target_type.check_") ||
                   name.startsWith("system.target_type.skill_") ||
                   name.startsWith("system.target_type.spell_") ||
                   name.startsWith("system.target_type.power_")) {
            const parts = name.split("_");
            const attr = parts[parts.length - 1];
            if (attr) {
                syncAttrRow(attr);
            }
        }

        // Ajustes derivados
        syncAttrAll();

        // Atualizar apenas campos alterados para minimizar re-render
        const updateData = {};
        html.find('.gm-modifier-layout input[type="checkbox"]').each((_, el) => {
            const input = el;
            const path = input.name;
            if (!path) return;
            const value = input.checked;
            const current = foundry.utils.getProperty(this.item, path);
            if (current !== value) {
                foundry.utils.setProperty(updateData, path, value);
            }
        });
        if (Object.keys(updateData).length > 0) {
            this.item.update(updateData);
        }
    }

    _calculateSkillPoints(difficulty, relativeLevel) {
        const rl = parseInt(relativeLevel) || 0;
        const normalized = ({
            "E": "F", "A": "M", "H": "D", "VH": "MD"
        })[difficulty] || difficulty;


        const tables = {
            "F": { 0: 1, 1: 2, 2: 4, 3: 8, 4: 12, 5: 16 },
            "M": { "-1": 1, 0: 2, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 },
            "D": { "-2": 1, "-1": 2, 0: 4, 1: 8, 2: 12, 3: 16, 4: 20, 5: 24 },
            "MD": { "-3": 1, "-2": 2, "-1": 4, 0: 8, 1: 12, 2: 16, 3: 20, 4: 24, 5: 28 },
            "TecM": {},
            "TecD": {}
        };

        if (normalized === "TecM") return Math.max(0, rl * 1);
        if (normalized === "TecD") return Math.max(0, rl * 2);

        const table = tables[normalized] || tables["M"];
        const keys = Object.keys(table).map(k => parseInt(k));
        const minKey = Math.min(...keys);
        const maxKey = Math.max(...keys);

        if (rl < minKey) return 0;
        if (rl in table) return table[rl];

        const base = table[maxKey];
        return base + (rl - maxKey) * 4;
    }

    async _onAutoCalcPoints(event) {
        const formData = new FormDataExtended(this.form).object;
        const autoPoints = formData["system.auto_points"] || false;
        const costMode = formData["system.cost_mode"] || "standard";
        
        if (event.currentTarget.name === "system.auto_points") {
             await this.item.update({"system.auto_points": autoPoints});
             if (!autoPoints) return;
        }

        if (autoPoints) {
            const difficulty = formData["system.difficulty"] ?? this.item.system.difficulty ?? "M";
            const relativeLevel = formData["system.skill_level"];
            const pointsField = (this.item.type === 'power') ? "system.points_skill" : "system.points";
            let newPoints;
            if (costMode === "linear") {
                const perLevel = Number(formData["system.cost_per_level"]) || 0;
                newPoints = Math.max(0, (Number(relativeLevel) || 0) * perLevel);
            } else {
                newPoints = this._calculateSkillPoints(difficulty, relativeLevel);
            }
            
            if (foundry.utils.getProperty(this.item, pointsField) !== newPoints) {
                await this.item.update({[pointsField]: newPoints});
            }
        }
    }

    _onAddAttack(ev) {
        const attackType = $(ev.currentTarget).data('type');
        const newAttackId = foundry.utils.randomID(16);
        const newAttackData = (attackType === 'melee') 
            ? { "mode": "Novo Ataque", "damage_formula": "GdB", "damage_type": "cort", "reach": "C", "parry": "0", "skill_name": "" }
            : { "mode": "Novo Tiro", "damage_formula": "GdP", "damage_type": "perf", "range": "100/200", "rof": "1", "shots": "1", "skill_name": "" };
        
        this.item.update({ [`system.${attackType}_attacks.${newAttackId}`]: newAttackData });
    }

    _onDeleteAttack(ev) {
        const target = $(ev.currentTarget);
        const attackId = target.closest('.attack-item').data('attack-id');
        const listName = target.data('list'); 
        Dialog.confirm({
            title: "Deletar Modo de Ataque",
            content: "<p>Tem certeza?</p>",
            yes: () => this.item.update({ [`system.${listName}.-=${attackId}`]: null })
        });
    }

    _onLinkSkill(ev) {
        if (!this.item.isOwned) return ui.notifications.warn("Item precisa estar em um ator.");
        const actor = this.item.parent;
        const skills = actor.items.filter(i => i.type === 'skill').sort((a,b) => a.name.localeCompare(b.name));
        
        const input = $(ev.currentTarget).closest('.form-group').find('input[type="text"]');
        let path = input.attr('name') || input.data('name');
        if (!path) return;

        let options = skills.map(s => `<option value="${s.name}">${s.name} (NH ${s.system.final_nh})</option>`).join('');
        new Dialog({
            title: "Vincular Perícia",
            content: `<div class="form-group"><label>Escolha:</label><select name="skill_selector">${options}</select></div>`,
            buttons: {
                ok: {
                    label: "Vincular",
                    callback: (html) => this.item.update({ [path]: html.find('select').val() })
                }
            }
        }).render(true);
    }
    
    async _onViewEqpModifier(ev) {
        const modId = $(ev.currentTarget).closest('.modifier-tag').data('modifier-id');
        const modData = this.item.system.eqp_modifiers[modId];
        if (!modData) return;
        const desc = await TextEditor.enrichHTML(modData.features || "", { async: true });
        new Dialog({
            title: modData.name,
            content: `<div class="gum-dialog-content"><b>CF:</b> ${modData.cost_factor} | <b>Peso:</b> ${modData.weight_mod}<hr>${desc}</div>`,
            buttons: { close: { label: "Fechar" } }
        }).render(true);
    }

    activateEditor(name, options = {}, ...args) {
        options.plugins = "link lists";
        options.toolbar = "styleselect | bold italic | bullist numlist | link | gurpsExpand | removeformat";
        options.height = (name === "system.chat_description") ? 300 : 400;
        options.setup = (editor) => {
            editor.ui.registry.addButton("gurpsExpand", {
                tooltip: "Expandir", icon: "fullscreen",
                onAction: () => editor.getContainer().classList.toggle("expanded")
            });
        };
        return super.activateEditor(name, options, ...args);
    }

    _saveUIState() {
        const openDetails = [];
        this.form.querySelectorAll('details[open]').forEach((el, i) => openDetails.push(el.id || `details-${i}`));
        this._openDetailsState = openDetails;
    }

    async _render(force, options) {
        await super._render(force, options);
        if (this._openDetailsState) {
            this._openDetailsState.forEach(id => {
                const el = this.form.querySelector(`#${id}`) || this.form.querySelectorAll('details')[parseInt(id.split('-')[1])];
                if (el) el.open = true;
            });
        }
    }
    
    async _updateObject(event, formData) {
        for (const [k, v] of Object.entries(formData)) {
            const isDescriptionField = k.includes("description");
            if (!isDescriptionField && typeof v === 'string' && v.includes(',')) formData[k] = v.replace(',', '.');
        }
        this._saveUIState();
        return super._updateObject(event, formData);
    }
}