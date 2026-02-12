import { EffectBrowser } from "../apps/effect-browser.js";
import { ConditionBrowser } from "../apps/condition-browser.js";
import { EqpModifierBrowser } from "../apps/eqp-modifier-browser.js";
import { ModifierBrowser } from "../apps/modifier-browser.js";
import { listBodyLocations } from "../config/body-profiles.js";

const { ItemSheet } = foundry.appv1.sheets;
const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? foundry?.applications?.ux?.TextEditor ?? TextEditor;

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

        if (this.item.type === 'skill') {
            const baseAttrValue = (itemData.system.base_attribute ?? "").toString();
            const baseAttrNormalized = baseAttrValue.trim().toLowerCase();
            const standardSkillAttrs = ["st", "dx", "iq", "ht", "per", "will"];
            const isStandardAttr = standardSkillAttrs.includes(baseAttrNormalized);
            context.skillBaseAttributeSelect = isStandardAttr ? baseAttrNormalized : "skill";
            context.skillBaseAttributeCustom = isStandardAttr ? "" : baseAttrValue;
        }

        const defaultBlockId = this.item.type === 'disadvantage' ? 'block3' : 'block2';
        context.characteristic_blocks = {
            [defaultBlockId]: "Nenhuma",
            "block1": "Traços Raciais",
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
            context.eqpModifiersHasFeatures = modifiersArray.some(mod => mod.features);

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

        if (this.item.type === "equipment") {
            const drLocations = this.item.system.dr_locations || {};
            const bodyLocationOptions = listBodyLocations();
            const locationLookup = new Map(bodyLocationOptions.map(option => [option.id, option]));

            context.bodyLocationOptions = bodyLocationOptions;
            context.drLocationRows = Object.entries(drLocations)
                .filter(([, drObject]) => this._hasVisibleDR(drObject))
                .map(([key, drObject]) => {
                    const option = locationLookup.get(key);
                    return {
                        key,
                        label: option?.name ?? key,
                        dr: this._formatDRObjectToString(drObject)
                    };
                });
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

        const baseAttributeSelect = html.find('select[name="system.base_attribute_select"]');
        if (baseAttributeSelect.length) {
            const toggleCustomField = () => {
                const isSkillBased = baseAttributeSelect.val() === "skill";
                const customField = html.find('.skill-base-attribute-custom');
                customField.toggle(isSkillBased);
                customField.find('input').prop('disabled', !isSkillBased);
            };
            toggleCustomField();
            baseAttributeSelect.on('change', toggleCustomField);
        }

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
            const field = $(ev.currentTarget).data("field");
            const editorWrapper = section.find(".description-editor");
            section.find(".description-view, .toggle-editor").hide();
            editorWrapper.show();
            const editor = this._getEditorInstance(field);
            if (editor?.focus) {
                // Aguarda o próximo tick para garantir que o editor esteja visível antes do foco
                setTimeout(() => editor.focus(), 0);
            } else if (editor?.view?.focus) {
                setTimeout(() => editor.view.focus(), 0);
            }
        });
        html.find(".expand-description").on("click", ev => {
            const btn = $(ev.currentTarget);
            const section = btn.closest(".description-section");
            const editorWrapper = section.find(".description-editor");
            editorWrapper.toggleClass("expanded");
            const expanded = editorWrapper.hasClass("expanded");
            const expandedHeight = expanded ? "600px" : "300px";
            editorWrapper.find(".editor, .editor-content, .ProseMirror").css({
                minHeight: expandedHeight,
                height: expanded ? expandedHeight : ""
            });
            btn.attr("data-expanded", expanded ? "true" : "false");
            btn.html(expanded
                ? '<i class="fas fa-compress"></i> Reduzir'
                : '<i class="fas fa-expand"></i> Expandir');
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
            const content = await this._getEditorContent(field, section);
            if (content === null || content === undefined) return;
            await this.item.update({[field]: content});
            
            const enriched = await TextEditorImpl.enrichHTML(content, {async: true});
            section.find(".description-view").html(enriched);
            section.find(".description-editor").hide();
            section.find(".description-view, .toggle-editor").show();
        });

if (this.item?.type === "equipment") {
            html.on("click", ".add-dr-location", () => {
                this._addDrLocationRow(html);
            });

            html.on("click", ".dr-location-delete", async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                ev.currentTarget.closest("[data-dr-location-row]")?.remove();
                await this.object.update(this._buildDRLocationsUpdate(this._collectDRLocationsFromForm()));
            });

            html.on("change", ".dr-location-label", (ev) => {
                this._syncDrLocationKey(ev.currentTarget);
            });
        }

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
 html.find('.delete-eqp-modifier').click(async ev => {
            ev.preventDefault();
            const modId = $(ev.currentTarget).closest('[data-modifier-id]').data('modifier-id');
            if (!modId) return;
            const confirmed = await Dialog.confirm({
                title: "Remover modificador de equipamento",
                content: "<p>Tem certeza que deseja remover este modificador?</p>"
            });
            if (!confirmed) return;
            await this.item.update({ [`system.eqp_modifiers.-=${modId}`]: null });
        });
        html.find('.view-eqp-modifier').click(this._onViewEqpModifier.bind(this));

        // Modificadores (Vantagens)
        html.find('.add-modifier').click(ev => {
            ev.preventDefault();
            new ModifierBrowser(this.item).render(true);
        });
html.find('.delete-modifier').click(async ev => {
            ev.preventDefault();
            const modId = $(ev.currentTarget).data('modifier-id');
            if (!modId) return;
            const confirmed = await Dialog.confirm({
                title: "Remover modificador",
                content: "<p>Tem certeza que deseja remover este modificador?</p>"
            });
            if (!confirmed) return;
            await this.item.update({ [`system.modifiers.-=${modId}`]: null });
        });
        html.find('.view-modifier').click(async ev => {
            ev.preventDefault();
            const modId = $(ev.currentTarget).data('modifier-id');
            const modifierData = this.item.system.modifiers?.[modId];
            if (!modifierData) return;
            if (modifierData.source_id) {
                const sourceItem = await fromUuid(modifierData.source_id).catch(() => null);
                if (sourceItem?.sheet) return sourceItem.sheet.render(true);
            }

            const createTag = (label, value) => value ? `<div class="property-tag"><label>${label}</label><span>${value}</span></div>` : "";
            const tags = [
                createTag("Custo", modifierData.cost),
                createTag("Referência", modifierData.ref),
                createTag("Efeito", modifierData.applied_effect)
            ].join("");
            const description = await TextEditorImpl.enrichHTML(modifierData.description || "<i>Sem descrição.</i>", { async: true });
            const content = `
                <div class="gurps-dialog-canvas">
                    <div class="gurps-item-preview-card">
                        <header class="preview-header">
                            <h3>${modifierData.name || "Modificador"}</h3>
                            <div class="header-controls"><span class="preview-item-type">Modificador</span></div>
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
                title: `Detalhes: ${modifierData.name || "Modificador"}`,
                content,
                buttons: { close: { label: "Fechar" } },
                default: "close",
                options: { classes: ["dialog", "gurps-item-preview-dialog"], width: 420 }
            }).render(true);
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
       html.find('.delete-effect').click(async ev => {
            ev.preventDefault();
            const target = $(ev.currentTarget);
            const entry = target.closest('[data-list-name][data-effect-id]');
            const listName = entry.data('list-name');
            const effectId = entry.data('effect-id');
            if (!listName || !effectId) return;
            const confirmed = await Dialog.confirm({
                title: "Remover efeito",
                content: "<p>Tem certeza que deseja remover este efeito?</p>"
            });
            if (!confirmed) return;
            await this.item.update({ [`system.${listName}.-=${effectId}`]: null });
        });
        html.find('.view-original-effect, .view-original-condition').click(async ev => {
            ev.preventDefault();
            const uuid = $(ev.currentTarget).data('uuid');
            if (!uuid) return ui.notifications.warn("Nenhum item vinculado foi encontrado.");
            const linkedItem = await fromUuid(uuid).catch(() => null);
            if (!linkedItem) return ui.notifications.warn("Item vinculado não encontrado.");
            linkedItem.sheet?.render(true);
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
            this._onEditAttack(ev);
        });

        const saveAttackHandler = this._onSaveAttackMode ? this._onSaveAttackMode.bind(this) : null;
        if (saveAttackHandler) {
            html.find('.save-attack-mode').click(saveAttackHandler);
        }

        const cancelAttackHandler = this._onCancelAttackEdit ? this._onCancelAttackEdit.bind(this) : null;
        if (cancelAttackHandler) {
            html.find('.cancel-attack-edit').click(cancelAttackHandler);
        }
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
        ev.preventDefault();
        const attackType = $(ev.currentTarget).data('type');
        const newAttackId = foundry.utils.randomID(16);
        const newAttackData = this._getDefaultAttackData(attackType);

        this._openAttackEditorDialog({
            attackType,
            attackId: newAttackId,
            attackData: newAttackData
        });
    }

    _getDefaultAttackData(attackType) {
        const baseAttack = {
            mode: "",
            skill_name: "",
            skill_level_mod: 0,
            damage_formula: "",
            damage_type: "",
            armor_divisor: null,
            min_strength: null,
            unbalanced: false,
            fencing: false,
            follow_up_damage: {
                formula: "",
                type: "",
                armor_divisor: null
            },
            fragmentation_damage: {
                formula: "",
                type: "",
                armor_divisor: null
            }
        };

        if (attackType === "melee") {
        return {
                ...baseAttack,
                mode: "Novo Ataque",
                damage_formula: "GdB",
                damage_type: "cort",
                reach: "C",
                parry: "0",
                block: "",
                parry_default: false,
                block_default: false,
                min_strength: ""
            };
        }

        return {
            ...baseAttack,
            mode: "Novo Tiro",
            damage_formula: "GdP",
            damage_type: "perf",
            accuracy: "",
            range: "100/200",
            rof: "1",
            shots: "1",
            rcl: "",
            mag: "",
            min_strength: ""
        };
    }

    _openAttackEditorDialog({attackType, attackId, attackData, isEdit = false}) {
        const title = isEdit
            ? (attackType === "melee" ? "Editar Ataque Corpo a Corpo" : "Editar Ataque à Distância")
            : (attackType === "melee" ? "Novo Ataque Corpo a Corpo" : "Novo Ataque à Distância");
        const content = this._renderAttackEditorForm(attackType, attackId, attackData);

new Dialog({
            title,
            content,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar",
                    callback: async (html) => {
                        const form = html.find("form")[0];
                        const updateData = this._collectAttackFormData(form);
                        if (Object.keys(updateData).length > 0) {
                            await this.item.update(updateData);
                        }
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancelar"
                }
            },
            default: "save"
        }, {
            classes: ["dialog", "gum-dialog", "attack-editor-dialog", "gum", "sheet", "item"]
        }).render(true);
    }

    _onEditAttack(ev) {
        const attackItem = $(ev.currentTarget).closest('.attack-item');
        const attackId = attackItem.data('attack-id');
        const attackType = attackItem.data('attack-type');
        if (!attackId || !attackType) return;

        const attackData = foundry.utils.getProperty(this.item, `system.${attackType}_attacks.${attackId}`);
        if (!attackData) return;

        this._openAttackEditorDialog({
            attackType,
            attackId,
            attackData,
            isEdit: true
        });
    }

    _collectAttackFormData(form) {
        const inputs = Array.from(form.querySelectorAll("[data-name]"));
        const updateData = {};

        inputs.forEach((input) => {
            const path = input.dataset.name;
            if (!path) return;

            let value;
            if (input.type === "checkbox") {
                value = input.checked;
            } else if (input.type === "number") {
                const raw = input.value.trim();
                if (raw === "") {
                    value = null;
                } else {
                    const normalized = raw.replace(',', '.');
                    const parsed = Number(normalized);
                    value = Number.isNaN(parsed) ? normalized : parsed;
                }
            } else {
                value = input.value;
            }

            foundry.utils.setProperty(updateData, path, value);
        });

        return updateData;
    }

    _renderAttackEditorForm(attackType, attackId, attackData) {
        const safe = (value) => foundry.utils.escapeHTML(String(value ?? ""));
        const basePath = `system.${attackType}_attacks.${attackId}`;
        const followUp = attackData.follow_up_damage ?? {};
        const fragmentation = attackData.fragmentation_damage ?? {};

       const defaultParry = Boolean(attackData.parry_default);
        const defaultBlock = Boolean(attackData.block_default);
        const resolveDefaultDefense = (nhValue) => {
            const parsed = Number(nhValue);
            if (!Number.isFinite(parsed)) return "";
            return Math.floor(parsed / 2) + 3;
        };
        const defaultDefenseValue = resolveDefaultDefense(attackData.final_nh);
        const parryValue = defaultParry && defaultDefenseValue !== "" ? defaultDefenseValue : attackData.parry;
        const blockValue = defaultBlock && defaultDefenseValue !== "" ? defaultDefenseValue : attackData.block;

        const commonFields = `
            <div class="form-section">
                <h4 class="section-title">Identificação</h4>
                <div class="form-row">
                    <div class="row-label">Modo de Uso</div>
                    <div class="row-fields">
                        <input type="text" data-name="${basePath}.mode" value="${safe(attackData.mode)}"/>
                    </div>
                </div>
                <div class="form-row">
                    <div class="row-label">Perícia Vinculada</div>
                    <div class="row-fields">
                        <input type="text" data-name="${basePath}.skill_name" value="${safe(attackData.skill_name)}" placeholder="Atributo, Perícia ou Valor Fixo"/>
                    </div>
                </div>
                <div class="form-row">
                    <div class="row-label">Mod. NH</div>
                    <div class="row-fields">
                        <input type="number" data-name="${basePath}.skill_level_mod" value="${safe(attackData.skill_level_mod)}"/>
                    </div>
                </div>
                ${attackType === "melee" ? `
                <div class="form-row">
                    <div class="row-label">Alcance</div>
                    <div class="row-fields">
                        <input type="text" data-name="${basePath}.reach" value="${safe(attackData.reach)}"/>
                    </div>
                </div>
                ` : `
                <div class="form-row">
                    <div class="row-label">Alcance</div>
                    <div class="row-fields">
                        <input type="text" data-name="${basePath}.range" value="${safe(attackData.range)}"/>
                    </div>
                </div>
                `}
                <div class="form-row">
                    <div class="row-label">ST Mín.</div>
                    <div class="row-fields">
                        <input type="number" data-name="${basePath}.min_strength" value="${safe(attackData.min_strength)}"/>
                    </div>
                </div>
            </div>
            <div class="form-section">
                <h4 class="section-title">Dano</h4>
                <div class="form-row">
                    <div class="row-label">Dano Primário</div>
                    <div class="row-fields">
                        <div class="form-grid-3">
                            <div class="form-group">
                                <label>Fórmula</label>
                                <input type="text" data-name="${basePath}.damage_formula" value="${safe(attackData.damage_formula)}"/>
                            </div>
                            <div class="form-group">
                                <label>Tipo</label>
                                <input type="text" data-name="${basePath}.damage_type" value="${safe(attackData.damage_type)}"/>
                            </div>
                            <div class="form-group" title="Divisor de Armadura">
                                <label>Divisor</label>
                                <input type="number" step="0.1" data-name="${basePath}.armor_divisor" value="${safe(attackData.armor_divisor)}"/>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="row-label">Dano Acompanh.</div>
                    <div class="row-fields">
                        <div class="form-grid-3">
                            <div class="form-group">
                                <label>Fórmula</label>
                                <input type="text" data-name="${basePath}.follow_up_damage.formula" value="${safe(followUp.formula)}"/>
                            </div>
                            <div class="form-group">
                                <label>Tipo</label>
                                <input type="text" data-name="${basePath}.follow_up_damage.type" value="${safe(followUp.type)}"/>
                            </div>
                            <div class="form-group" title="Divisor">
                                <label>Divisor</label>
                                <input type="number" step="0.1" data-name="${basePath}.follow_up_damage.armor_divisor" value="${safe(followUp.armor_divisor)}"/>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="row-label">Dano Frag.</div>
                    <div class="row-fields">
                        <div class="form-grid-3">
                            <div class="form-group">
                                <label>Fórmula</label>
                                <input type="text" data-name="${basePath}.fragmentation_damage.formula" value="${safe(fragmentation.formula)}"/>
                            </div>
                            <div class="form-group">
                                <label>Tipo</label>
                                <input type="text" data-name="${basePath}.fragmentation_damage.type" value="${safe(fragmentation.type)}"/>
                            </div>
                            <div class="form-group" title="Divisor">
                                <label>Divisor</label>
                                <input type="number" step="0.1" data-name="${basePath}.fragmentation_damage.armor_divisor" value="${safe(fragmentation.armor_divisor)}"/>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const meleeFields = `
            <div class="form-section">
                <h4 class="section-title">Defesa</h4>
                <div class="form-row">
                    <div class="row-label">Aparar</div>
                    <div class="row-fields">
                        <div class="form-grid-2">
                            <input type="text" data-name="${basePath}.parry" value="${safe(parryValue)}" ${defaultParry ? "disabled" : ""}/>
                            <label class="custom-checkbox defense-toggle">
                                <input type="checkbox" data-name="${basePath}.parry_default" ${defaultParry ? "checked" : ""}/>
                                <span>Aparar Padrão</span>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="row-label">Bloqueio</div>
                    <div class="row-fields">
                        <div class="form-grid-2">
                            <input type="text" data-name="${basePath}.block" value="${safe(blockValue)}" ${defaultBlock ? "disabled" : ""}/>
                            <label class="custom-checkbox defense-toggle">
                                <input type="checkbox" data-name="${basePath}.block_default" ${defaultBlock ? "checked" : ""}/>
                                <span>Bloqueio Padrão</span>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="row-label">Características</div>
                    <div class="row-fields">
                        <div class="form-grid-2">
                            <label class="custom-checkbox">
                                <input type="checkbox" data-name="${basePath}.unbalanced" ${attackData.unbalanced ? "checked" : ""}/>
                                <span>Desbalanceada(U)</span>
                            </label>
                            <label class="custom-checkbox">
                                <input type="checkbox" data-name="${basePath}.fencing" ${attackData.fencing ? "checked" : ""}/>
                                <span>Esgrima(F)</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const rangedFields = `
            <div class="form-section  form-grid-3">
                <h4 class="section-title">Precisão & Alcance</h4>
                <div class="form-row">
                    <div class="row-label">Precisão</div>
                    <div class="row-fields">
                        <input type="text" data-name="${basePath}.accuracy" value="${safe(attackData.accuracy)}"/>
                    </div>
                </div>
                <div class="form-row">
                    <div class="row-label">CdT</div>
                    <div class="row-fields">
                        <input type="text" data-name="${basePath}.rof" value="${safe(attackData.rof)}"/>
                    </div>
                </div>
                <div class="form-row">
                    <div class="row-label">Tiros</div>
                    <div class="row-fields">
                        <input type="text" data-name="${basePath}.shots" value="${safe(attackData.shots)}"/>
                    </div>
                </div>
                <div class="form-row">
                    <div class="row-label">Recuo</div>
                    <div class="row-fields">
                        <input type="text" data-name="${basePath}.rcl" value="${safe(attackData.rcl)}"/>
                    </div>
                </div>
                <div class="form-row">
                    <div class="row-label">Mag.</div>
                    <div class="row-fields">
                        <input type="text" data-name="${basePath}.mag" value="${safe(attackData.mag)}"/>
                    </div>
                </div>
            </div>
        `;

               return `
            <div class="attack-editor-dialog gum sheet item">
                <form class="gum-dialog-content attack-editor-form">
                    ${commonFields}
                    ${attackType === "melee" ? meleeFields : rangedFields}
                </form>
            </div>
        `;
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

    async _onSaveAttackMode(ev) {
        ev.preventDefault();
        const attackItem = $(ev.currentTarget).closest('.attack-item');
        const inputs = attackItem.find('input[data-name]');
        const updateData = {};

        inputs.each((_, el) => {
            const input = el;
            const path = input.dataset.name;
            if (!path) return;

            let value;
            if (input.type === "checkbox") {
                value = input.checked;
            } else if (input.type === "number") {
                const raw = input.value.trim();
                if (raw === "") {
                    value = null;
                } else {
                    const normalized = raw.replace(',', '.');
                    const parsed = Number(normalized);
                    value = Number.isNaN(parsed) ? normalized : parsed;
                }
            } else {
                value = input.value;
            }

            foundry.utils.setProperty(updateData, path, value);
        });

        if (Object.keys(updateData).length > 0) {
            await this.item.update(updateData);
        }

        attackItem.find('.attack-edit-mode').hide();
        attackItem.find('.attack-display-mode').show();
    }

    _onCancelAttackEdit(ev) {
        ev.preventDefault();
        const attackItem = $(ev.currentTarget).closest('.attack-item');
        attackItem.find('.attack-edit-mode').hide();
        attackItem.find('.attack-display-mode').show();
    }

 _onLinkSkill(ev) {
        if (!this.item.isOwned) return ui.notifications.warn("Item precisa estar em um ator.");
        const actor = this.item.parent;
        const trigger = $(ev.currentTarget);
        const skillFilter = (trigger.data('skill-filter') || '').toString().trim();
        let skills = actor.items.filter(i => i.type === 'skill');

        if (skillFilter) {
            const allowedTypes = new Set(skillFilter.split('|').map(type => type.trim()).filter(Boolean));
            if (allowedTypes.size > 0) {
                skills = skills.filter(skill => allowedTypes.has(skill.system?.hierarchy_type));
            }
        }

        skills = skills.sort((a,b) => a.name.localeCompare(b.name));

        const explicitPath = trigger.data('link-target');
        const scopedInput = trigger.closest('.form-group, .skill-hierarchy-card').find('input[type="text"]').first();
        const input = scopedInput.length ? scopedInput : trigger.closest('label').siblings('input[type="text"]').first();
        let path = explicitPath || input.attr('name') || input.data('name');
        if (!path) return;

        if (!skills.length) {
            return ui.notifications.warn("Nenhuma perícia compatível foi encontrada neste ator.");
        }

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
        ev.preventDefault();
        const modId = $(ev.currentTarget).closest('[data-modifier-id]').data('modifier-id');
        const modData = this.item.system.eqp_modifiers?.[modId];
        if (!modData) return;

        if (modData.source_uuid) {
            const sourceModifier = await fromUuid(modData.source_uuid).catch(() => null);
            if (sourceModifier?.sheet) return sourceModifier.sheet.render(true);
        }

        const tempItem = await Item.create({
            name: modData.name || "Modificador de Equipamento",
            type: "eqp_modifier",
            img: modData.img || "icons/svg/mystery-man.svg",
            system: {
                cost_factor: modData.cost_factor ?? 0,
                weight_mod: modData.weight_mod ?? "x1",
                tech_level_mod: modData.tech_level_mod ?? "",
                target_type: modData.target_type ?? {},
                features: modData.features ?? "",
                ref: modData.ref ?? ""
            }
        }, { temporary: true, renderSheet: true });

        tempItem?.sheet?.render(true);
    }

     activateEditor(name, options = {}, ...args) {
        options.engine = "prosemirror";
        options.minHeight ??= (name === "system.chat_description") ? 300 : 400;
        return super.activateEditor(name, options, ...args);
    }

    _getEditorInstance(field) {
        const editor = this.editors?.[field];
        if (!editor) return null;
        return editor.editor ?? editor.instance ?? editor;
    }

    async _getEditorContent(field, section) {
        const instance = this._getEditorInstance(field);
        if (instance?.getHTML) {
            const html = instance.getHTML();
            return html?.then ? await html : html;
        }
        if (instance?.getContent) {
            const content = instance.getContent();
            return content?.then ? await content : content;
        }
        if (instance?.view?.dom?.innerHTML) return instance.view.dom.innerHTML;
        if (TextEditorImpl?.getContent) {
            const element = section.find(`[name="${field}"]`).get(0)
                ?? section.find(`.editor[data-edit="${field}"]`).get(0);
            if (element) return TextEditorImpl.getContent(element);
        }
        const namedInput = section.find(`[name="${field}"]`);
        if (namedInput.length) return namedInput.val();
        const editorElement = section.find(`.editor[data-edit="${field}"]`);
        if (editorElement.length) return editorElement.val() ?? editorElement.html();
        return "";
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
    
 _getSubmitData(updateData) {
        const data = super._getSubmitData(updateData);

        if (this.item?.type === "equipment") {
            for (const key in data) {
                if (key.startsWith("system.dr_locations.")) {
                    delete data[key];
                }
            }

            const drLocations = this._collectDRLocationsFromForm();
            Object.assign(data, this._buildDRLocationsUpdate(drLocations));
        }

        return data;
    }

    async _updateObject(event, formData) {
        for (const [k, v] of Object.entries(formData)) {
            const isDescriptionField = k.includes("description");
            if (!isDescriptionField && typeof v === 'string' && v.includes(',')) formData[k] = v.replace(',', '.');
        }
        if (formData["system.base_attribute_select"] !== undefined) {
            const selected = formData["system.base_attribute_select"];
            const customValue = (formData["system.base_attribute_custom"] ?? "").toString().trim();
            const standardSkillAttrs = ["st", "dx", "iq", "ht", "per", "will"];
            if (selected === "skill") {
                formData["system.base_attribute"] = customValue;
            } else if (standardSkillAttrs.includes(selected)) {
                formData["system.base_attribute"] = selected;
            }
            delete formData["system.base_attribute_select"];
            delete formData["system.base_attribute_custom"];
 }
        this._saveUIState();
        return super._updateObject(event, formData);
    }

    _formatDRObjectToString(drObject) {
        if (!drObject || typeof drObject !== 'object' || Object.keys(drObject).length === 0) return "0";

        const parts = [];
        const baseDR = drObject.base || 0;
        parts.push(baseDR.toString());

        for (const [type, mod] of Object.entries(drObject)) {
            if (type === 'base') continue;

            const finalDR = Math.max(0, baseDR + (mod || 0));
            if (finalDR !== baseDR) {
                parts.push(`${finalDR} ${type}`);
            }
        }

        if (parts.length === 1 && parts[0] === "0") return "0";

        if (parts.length > 1 && parts[0] === "0") {
            parts.shift();
        }

        return parts.join(", ");
    }

    _parseDRStringToObject(drString) {
        if (typeof drString === 'object' && drString !== null) return drString;
        if (!drString || typeof drString !== 'string' || drString.trim() === "") return {};

        const DAMAGE_TYPE_MAP = {
            "cr": "cont", "cut": "cort", "imp": "perf", "pi": "pa",
            "pi-": "pa-", "pi+": "pa+", "pi++": "pa++", "burn": "qmd",
            "corr": "cor", "tox": "tox"
        };

        const drObject = {};
        const parts = drString.split(',').map(s => s.trim().toLowerCase());

        let baseDR = 0;

        for (const part of parts) {
            const segments = part.split(' ').map(s => s.trim()).filter(Boolean);
            if (segments.length === 1 && !isNaN(Number(segments[0]))) {
                baseDR = Number(segments[0]);
                drObject['base'] = baseDR;
                break;
            }
        }

        for (const part of parts) {
            const segments = part.split(' ').map(s => s.trim()).filter(Boolean);
            if (segments.length === 2 && !isNaN(Number(segments[0]))) {
                let type = segments[1];
                const value = Number(segments[0]);

                type = DAMAGE_TYPE_MAP[type] || type;

                if (baseDR > 0) {
                    drObject[type] = value - baseDR;
                } else {
                    drObject[type] = value;
                }
            }
        }

        return drObject;
    }

    _hasVisibleDR(drObject) {
        if (!drObject || typeof drObject !== "object") return false;
        return Object.keys(drObject).length > 0;
    }

    _collectDRLocationsFromForm() {
        const drLocations = {};
        const rows = this.element?.[0]?.querySelectorAll("[data-dr-location-row]") || [];

        rows.forEach(row => {
            const keyInput = row.querySelector(".dr-location-key");
            const labelInput = row.querySelector(".dr-location-label");
            const valueInput = row.querySelector(".dr-location-value");

            const label = labelInput?.value?.trim() || "";
            const resolvedKey = label ? this._getLocationKeyFromLabel(label) : (keyInput?.value?.trim() || "");
            if (!resolvedKey) return;

            const rawDrString = valueInput?.value;
            const drString = typeof rawDrString === "string" ? rawDrString.trim() : "";
            const normalizedDrString = drString === "" ? "0" : drString;

            drLocations[resolvedKey] = this._parseDRStringToObject(normalizedDrString);
        });

        return drLocations;
    }

    _buildDRLocationsUpdate(drLocations) {
        const update = {
            "system.dr_locations": drLocations
        };
        const existing = this.item.system.dr_locations || {};

        for (const key of Object.keys(existing)) {
            if (!(key in drLocations)) {
                update[`system.dr_locations.-=${key}`] = null;
            }
        }

        return update;
    }

    _addDrLocationRow(html, { label = "", key = "", dr = "" } = {}) {
        const container = html.find(".dr-locations-table");
        if (!container.length) return;

        const rowHtml = `
            <li class="attack-item dr-location-item" data-dr-location-row>
                <div class="attack-display-card">
                    <div class="attack-line">
                        <div class="attack-cell">
                            <input class="dr-location-label" type="text" list="gum-body-location-options" value="${label}" placeholder="Ex: Braço E"/>
                            <input class="dr-location-key" type="hidden" value="${key}"/>
                        </div>
                        <div class="attack-cell">
                            <input class="dr-location-value" type="text" value="${dr}" placeholder="0"/>
                        </div>
                        <div class="attack-cell">
                            <button class="dr-location-delete" type="button" title="Remover"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>
            </li>
        `;

        container.append(rowHtml);
    }

    _syncDrLocationKey(input) {
        const row = input.closest("[data-dr-location-row]");
        if (!row) return;

        const keyInput = row.querySelector(".dr-location-key");
        if (!keyInput) return;

        const label = input.value?.trim();
        if (!label) {
            keyInput.value = "";
            return;
        }

        keyInput.value = this._getLocationKeyFromLabel(label);
    }

    _getLocationKeyFromLabel(label) {
        const list = this.element?.[0]?.querySelector("#gum-body-location-options");
        if (!list) return label;

        const escape = window.CSS?.escape || ((value) => value.replace(/["\\]/g, "\\$&"));
        const option = list.querySelector(`option[value="${escape(label)}"]`);
        return option?.dataset?.key || label;
    }
}