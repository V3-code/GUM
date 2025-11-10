import { EffectBrowser } from "../apps/effect-browser.js";
import { ConditionBrowser } from "../apps/condition-browser.js";

// ================================================================== //
//  CLASSE DA FICHA DO ITEM (GurpsItemSheet) - VERSÃO FINAL COMPLETA  //
// ================================================================== //
export class GurpsItemSheet extends ItemSheet {
  static get defaultOptions() { 
    return foundry.utils.mergeObject(super.defaultOptions, { 
      classes: ["gum", "sheet", "item", "theme-dark"],
      width: 450,
      height: 495,
      template: "systems/gum/templates/items/item-sheet.hbs",
      tabs: [{ 
        navSelector: ".sheet-tabs",
        contentSelector: ".sheet-body-content",
        initial: "details"
      }]
    }); 
  }

  async getData(options) { 
    const context = await super.getData(options); 
    context.system = this.item.system;  
    context.characteristic_blocks = { "block1": "Traços Raciais", "block2": "Vantagens", "block3": "Desvantagens", "block4": "Especiais" };
    
    // Lógica de cálculo de custo final
    const validTypes = ['advantage', 'disadvantage', 'power'];
    if (validTypes.includes(this.item.type)) {
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

        // Função auxiliar para buscar e preparar os dados dos itens linkados (Efeitos ou Condições)
    const _prepareLinkedItems = async (sourceObject) => {       
        const entries = Object.entries(sourceObject || {});
        const promises = entries.map(async ([id, linkData]) => {
            const uuid = linkData.effectUuid || linkData.uuid; 
            const originalItem = await fromUuid(uuid);
            return {
                id: id,
                uuid: uuid,
                ...linkData, // Inclui os campos contextuais (recipient, minInjury, etc.)
                name: originalItem ? originalItem.name : "Item não encontrado",
                img: originalItem ? originalItem.img : "icons/svg/mystery-man.svg"
            };
        });
        return Promise.all(promises);
    };

    // Prepara os dados para o template
    context.system.preparedEffects = {
        activation: {
            success: await _prepareLinkedItems(this.item.system.activationEffects?.success),
            failure: await _prepareLinkedItems(this.item.system.activationEffects?.failure)
        },
        onDamage: await _prepareLinkedItems(this.item.system.onDamageEffects),
        general: await _prepareLinkedItems(this.item.system.generalConditions),
        passive: await _prepareLinkedItems(this.item.system.passiveEffects)
    };

    // Lógica de ordenação e preparação dos modificadores
    const modifiersObj = this.item.system.modifiers || {};
    const modifiersArray = Object.entries(modifiersObj).map(([id, data]) => {
      const isLimitation = (data.cost || "").includes('-');
      return { id, ...data, isLimitation: isLimitation };
    });
    modifiersArray.sort((a, b) => {
      const costA = parseInt(a.cost) || 0; const costB = parseInt(b.cost) || 0;
      if (costB !== costA) return costB - costA;
      return a.name.localeCompare(b.name);
    });
    context.sortedModifiers = modifiersArray;


    // Lógica de preparação da descrição para o template
        context.enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, {
            secrets: this.item.isOwner,
            async: true
        });
        context.enrichedChatDescription = await TextEditor.enrichHTML(this.item.system.chat_description, {
            secrets: this.item.isOwner,
            async: true
        });

    return context; 
  }

async _updateObject(event, formData) {
    // 'formData' já é o objeto processado pelo _getSubmitData.

    // A lógica de conversão de vírgula agora checa o VALOR, não a CHAVE.
    for (const key in formData) {
      // ✅ CORREÇÃO: Checa formData[key] em vez de key
      if (typeof formData[key] === 'string' && formData[key].includes(',')) {
        // Isso vai "consertar" campos de peso/custo (ex: 1,5 -> 1.5)
        // mas vai IGNORAR nossos objetos de RD (que não são strings).
        formData[key] = formData[key].replace(',', '.');
      }
    }
    
    // Salva os dados limpos.
    return this.object.update(formData);
  }

_getSubmitData(updateData) {
    const data = super._getSubmitData(updateData);
    
    // ✅ Agora, este método apenas chama nosso helper unificado
    this._saveUIState(); 
    
    return data;
}

    /**
     * ✅ NOVO MÉTODO 2: Restaura o estado da UI após a ficha ser redesenhada.
     * Este método é chamado automaticamente pelo Foundry após a renderização.
     */
async _render(force, options) {
        await super._render(force, options);
        
        // --- Lógica de <details> (agora lê a memória unificada) ---
        if (this._openDetailsState) {
            this.form.querySelectorAll('details').forEach((detailsEl, index) => {
                const summaryText = detailsEl.querySelector('summary')?.innerText || `details-${index}`;
                if (this._openDetailsState.includes(summaryText)) {
                    detailsEl.open = true;
                }
            });
            this._openDetailsState = null; // ✅ Limpa a memória de details
        }

        // --- Lógica de 'Modo Edição' (agora lê a memória unificada) ---
        if (this._openAttackModeId) {
            const attackItem = this.form.querySelector(`.attack-item[data-attack-id="${this._openAttackModeId}"]`);
            if (attackItem) {
                const displayMode = attackItem.querySelector('.attack-display-mode');
                const editMode = attackItem.querySelector('.attack-edit-mode');
                
                if (displayMode) displayMode.style.display = 'none';
                if (editMode) editMode.style.display = 'block';
            }
            this._openAttackModeId = null; // ✅ Limpa a memória do ataque
        }
    }

    /**
     * Salva o estado atual da UI (modos de ataque abertos, details abertos)
     * na memória da ficha ANTES de uma re-renderização.
     */
    _saveUIState() {
        // 1. Salva <details> abertos (lógica do _getSubmitData)
        const openDetails = [];
        this.form.querySelectorAll('details[open]').forEach((detailsEl, index) => {
            const summaryText = detailsEl.querySelector('summary')?.innerText || `details-${index}`;
            openDetails.push(summaryText);
        });
        this._openDetailsState = openDetails;

        // 2. Salva o 'Modo Edição' aberto
        const openAttack = this.form.querySelector('.attack-edit-mode[style*="display: block;"], .attack-edit-mode:not([style*="display: none;"])');
        if (openAttack) {
            this._openAttackModeId = openAttack.closest('.attack-item').dataset.attackId;
        } else {
            this._openAttackModeId = null;
        }
    }
  
  /**
 * @override
 * Ativa todos os listeners de interatividade da ficha de item.
 * ESTA É A VERSÃO FINAL E COMPLETA.
 */

activateListeners(html) {
    super.activateListeners(html);

    // ==================================================================
    // ▼▼▼ LISTENERS DO NOVO "SUPER-ITEM" (Fase 2.3) ▼▼▼
    // ==================================================================

// Listener para ADICIONAR um Modo de Ataque (Melee ou Ranged)
    html.find('.add-attack').on('click', (ev) => {
        const attackType = $(ev.currentTarget).data('type');
        const newAttackId = foundry.utils.randomID(16);
        let newAttackData;
        let path;

        if (attackType === 'melee') {
            path = `system.melee_attacks.${newAttackId}`;
            // CORREÇÃO: Definindo o objeto manualmente, como no seu código original,
            // mas com TODOS os novos campos que planejamos na Fase 2.
            newAttackData = {
                "mode": "Novo Ataque C.C.",
                "unbalanced": false, 
                "fencing": false,
                "skill_name": "",
                "skill_level_mod": 0,
                "damage_formula": "GdB",
                "damage_type": "cort",
                "armor_divisor": 1,
                "reach": "C",
                "parry": "0",
                "block": "0",
                "min_strength": 0,
                "onDamageEffects": {},
                "follow_up_damage": { "formula": "", "type": "", "armor_divisor": 1 },
                "fragmentation_damage": { "formula": "", "type": "", "armor_divisor": 1 }
            };
        } else {
            path = `system.ranged_attacks.${newAttackId}`;
            // CORREÇÃO: Definindo o objeto manualmente com os campos de L.D.
            newAttackData = {
                "mode": "Novo Ataque L.D.",
                "unbalanced": false, 
                "fencing": false,
                "skill_name": "",
                "skill_level_mod": 0,
                "damage_formula": "GdP",
                "damage_type": "perf",
                "armor_divisor": 1,
                "accuracy": "0",
                "range": "100/1500",
                "rof": "1",
                "shots": "1(3i)",
                "rcl": "1",
                "mag": "1",
                "min_strength": 0,
                "onDamageEffects": {},
                "follow_up_damage": { "formula": "", "type": "", "armor_divisor": 1 },
                "fragmentation_damage": { "formula": "", "type": "", "armor_divisor": 1 }
            };
        }

        this.item.update({ [path]: newAttackData });
    });

    // Listener para DELETAR um Modo de Ataque (Melee ou Ranged)
    html.find('.delete-attack').on('click', (ev) => {
        const target = $(ev.currentTarget);
        const attackId = target.closest('.attack-item').data('attack-id');
        const listName = target.data('list'); // 'melee_attacks' ou 'ranged_attacks'
        const attack = this.item.system[listName][attackId];

        if (!attackId || !attack) return;

        Dialog.confirm({
            title: `Deletar Modo de Ataque "${attack.mode}"`,
            content: "<p>Você tem certeza?</p>",
            yes: () => {
                this.item.update({ [`system.${listName}.-=${attackId}`]: null });
            },
            no: () => {},
            defaultYes: false
        });
    });

    // Listener para VINCULAR PERÍCIA (Sua ideia!)
    html.find('.link-skill-button').on('click', (ev) => {
        if (!this.item.isOwned) {
            return ui.notifications.warn("Este item precisa estar em um ator para vincular uma perícia.");
        }
        
        const actor = this.item.parent;
        const skills = actor.items.filter(i => i.type === 'skill');
        if (skills.length === 0) {
            return ui.notifications.warn("Este ator não possui nenhuma perícia para vincular.");
        }
        
        // Pega o caminho para o campo 'skill_name'
        const input = $(ev.currentTarget).closest('.stat-row').find('input[name$=".skill_name"]');
        if (!input.length) return;
        const path = input.attr('name');

        // Cria o HTML para o diálogo de seleção
        let content = `<div class="dialog-skill-list"><select name="skill_selector">`;
        content += `<option value="">-- Nenhuma --</option>`;
        skills.sort((a,b) => a.name.localeCompare(b.name)).forEach(skill => {
            content += `<option value="${skill.name}">${skill.name} (NH ${skill.system.final_nh})</option>`;
        });
        content += `</select></div>`;

        new Dialog({
            title: "Vincular Perícia do Ator",
            content: content,
            buttons: {
                select: {
                    icon: '<i class="fas fa-link"></i>',
                    label: "Vincular",
                    callback: (html) => {
                        const selectedSkillName = html.find('select[name="skill_selector"]').val();
                        this.item.update({ [path]: selectedSkillName });
                    }
                }
            },
            default: "select"
        }).render(true);
    });

    // Listener para ADICIONAR um Efeito *dentro* de um Modo de Ataque
html.find('.add-attack-effect').on('click', (ev) => {
        // ✅ CORREÇÃO (BUG 3): Salva TODO o estado da UI (incluindo <details>)
        this._saveUIState(); 

        const target = $(ev.currentTarget);
        const list = target.data('list'); // "onDamageEffects"
        const attackType = target.closest('.attack-item').data('attack-type');
        const attackId = target.closest('.attack-item').data('attack-id');
        const basePath = `system.${attackType}_attacks.${attackId}.${list}`;

        new EffectBrowser(this.item, {
            onSelect: (selectedEffects) => {
                const updates = {};
                for (const effect of selectedEffects) {
                    const newId = foundry.utils.randomID();
                    const newLinkData = { id: newId, effectUuid: effect.uuid, name: effect.name, img: effect.img };
                    updates[`${basePath}.${newId}`] = newLinkData;
                }
                this.item.update(updates);
            }
        }).render(true);
    });

    // Listener para DELETAR um Efeito *dentro* de um Modo de Ataque
    html.find('.delete-attack-effect').on('click', (ev) => {
        // ✅ CORREÇÃO (BUG 3): Salva TODO o estado da UI (incluindo <details>)
        this._saveUIState();

        const target = $(ev.currentTarget);
        const list = target.data('list');
        const effectId = target.closest('.effect-summary').data('effect-id');
        const attackType = target.closest('.attack-item').data('attack-type');
        const attackId = target.closest('.attack-item').data('attack-id');
        const path = `system.${attackType}_attacks.${attackId}.${list}.-=${effectId}`;

        Dialog.confirm({
            title: "Remover Efeito do Ataque",
            content: "<p>Você tem certeza?</p>",
            yes: () => {
                this.item.update({ [path]: null });
            },
            no: () => {
                // Se o usuário clicar "Não", limpe a memória
                this._openAttackModeId = null;
                this._openDetailsState = null;
            }
        });
    });

    // ==================================================================
    // ▼▼▼ SEUS LISTENERS ANTIGOS (Preservados) ▼▼▼
    // ==================================================================

    html.find('.view-original-effect, .view-original-condition').on('click', async (ev) => {
        ev.preventDefault();
        const target = $(ev.currentTarget);
        const effectEntry = target.closest('.effect-entry, .effect-summary');
        
        // Pega as informações do elemento HTML
        const listName = effectEntry.data('list-name');
        const effectId = effectEntry.data('effect-id');
        
        // Tenta pegar o UUID direto do botão (para os novos botões)
        let uuid = target.data('uuid');

        if (!uuid) {
            // Lógica antiga de fallback (para 'effectsTab')
            const effectData = getProperty(this.item, `system.${listName}.${effectId}`);
            uuid = effectData.effectUuid || effectData.uuid;
        }

        if (uuid) {
            const originalItem = await fromUuid(uuid);
            if (originalItem) {
                originalItem.sheet.render(true);
            } else {
                ui.notifications.warn("O item original não foi encontrado. O link pode estar quebrado.");
            }
        } else {
            ui.notifications.error("Não foi possível encontrar o UUID para este item.");
        }
    });

    // Impede a ativação de listeners se o usuário não tiver permissão para editar.
    if (!this.isEditable) return;

    // --- Listener para o botão de EDITAR DESCRIÇÃO ---
    html.find('.edit-text-btn').on('click', (ev) => {
        const fieldName = $(ev.currentTarget).data('target');
        const title = $(ev.currentTarget).attr('title');
        const currentContent = getProperty(this.item.system, fieldName.replace('system.', '')) || "";

        new Dialog({
            title: title,
            content: `<form><textarea name="content" style="width: 100%; height: 300px;">${currentContent}</textarea></form>`,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar",
                    callback: (html) => {
                        const newContent = html.find('textarea[name="content"]').val();
                        this.item.update({ [fieldName]: newContent });
                    }
                }
            },
            default: "save"
        }, { width: 500, height: 400, resizable: true }).render(true);
    });

    // --- Listener para ADICIONAR um modificador ---
    html.find('.add-modifier').on('click', (ev) => {
        ev.preventDefault();
        new ModifierBrowser(this.item).render(true);
    });

    // --- Listener para DELETAR um modificador ---
    html.find('.delete-modifier').on('click', (ev) => {
        ev.preventDefault();
        const modifierId = $(ev.currentTarget).data('modifier-id');
        if (modifierId) {
            Dialog.confirm({
                title: "Remover Modificador",
                content: "<p>Você tem certeza que deseja remover este modificador?</p>",
                yes: () => {
                    this.item.update({ [`system.modifiers.-=${modifierId}`]: null });
                },
                no: () => {}
            });
        }
    });

    // --- Listener para VISUALIZAR os detalhes de um modificador ---
    html.find('.view-modifier').on('click', async (ev) => {
        ev.preventDefault();
        const modifierId = $(ev.currentTarget).data('modifier-id');
        const modifierData = this.item.system.modifiers[modifierId];
        if (!modifierData) return;

        const description = await TextEditor.enrichHTML(modifierData.description || "<i>Sem descrição.</i>", { async: true });

        const content = `
            <div class="sheet-body-content">
                <div class="form-section">
                    <h4 class="section-title">Detalhes do Modificador</h4>
                    <div class="summary-list">
                        <div class="summary-item">
                            <label>Custo:</label>
                            <span class="summary-dots"></span>
                            <span class="value">${modifierData.cost}</span>
                        </div>
                        <div class="summary-item">
                            <label>Referência:</label>
                            <span class="summary-dots"></span>
                            <span class="value">${modifierData.ref || 'N/A'}</span>
                        </div>
                    </div>
                    <hr class="summary-divider">
                    <div class="summary-description rendered-text">
                        ${description}
                    </div>
                </div>
            </div>
        `;

        new Dialog({
            title: `Detalhes: ${modifierData.name}`,
            content: content,
            buttons: {
                close: {
                    label: "Fechar",
                    icon: '<i class="fas fa-times"></i>'
                }
            },
            default: "close",
        }, {
            width: 420,
            height: "auto",
            resizable: true,
            classes: ["dialog", "modifier-preview-dialog"]
        }).render(true);
    });

    // Listener para ADICIONAR EFEITOS (para as seções da 'effectsTab')
    html.find('.add-effect').on('click', async (ev) => {
        const targetList = $(ev.currentTarget).data('target-list');
        if (!targetList) return;

        new EffectBrowser(this.item, {
            onSelect: (selectedEffects) => {
                const updates = {};
                for (const effect of selectedEffects) {
                    const newId = foundry.utils.randomID();
                    const newLinkData = {
                        id: newId, // Adicionado para consistência
                        effectUuid: effect.uuid,
                        recipient: 'target',
                        name: effect.name, // Adicionado para 'preparedEffects'
                        img: effect.img    // Adicionado para 'preparedEffects'
                    };
                    updates[`system.${targetList}.${newId}`] = newLinkData;
                }
                this.item.update(updates); // Não precisa de .then(() => this.render())
            }
        }).render(true);
    });

    // Listener para ADICIONAR CONDIÇÕES GERAIS (para 'effectsTab')
    html.find('.add-general-condition').on('click', (ev) => {
        new ConditionBrowser(this.item, {
            onSelect: (selectedConditions) => {
                const updates = {};
                for (const condition of selectedConditions) {
                    const newId = foundry.utils.randomID();
                    const newLinkData = {
                        id: newId, // Adicionado para consistência
                        uuid: condition.uuid,
                        name: condition.name,
                        img: condition.img // Adicionado para 'preparedEffects'
                    };
                    updates[`system.generalConditions.${newId}`] = newLinkData;
                }
                this.item.update(updates);
            }
        }).render(true);
    });
    
    // Listener para DELETAR um Efeito ou Condição da 'effectsTab'
    html.find('.delete-effect').on('click', (ev) => {
        const target = $(ev.currentTarget);
        const listName = target.closest('.effect-entry').data('list-name');
        const effectId = target.closest('.effect-entry').data('effect-id');
        
        Dialog.confirm({
            title: "Remover Efeito",
            content: "<p>Você tem certeza que deseja remover este efeito da habilidade?</p>",
            yes: () => {
                this.item.update({ [`system.${listName}.-=${effectId}`]: null });
            },
            no: () => {}
        });
    });

    // =============================================================
    // LISTENER PARA O NOVO MODO DE EXIBIÇÃO/EDIÇÃO DE ATAQUE
    // =============================================================

    // Botão "Editar" (lápis)
    html.find('.edit-attack-mode').on('click', (ev) => {
        ev.preventDefault();
        const attackItem = $(ev.currentTarget).closest('.attack-item');
        // Esconde o modo de exibição
        attackItem.find('.attack-display-mode').hide();
        // Mostra o formulário de edição
        attackItem.find('.attack-edit-mode').show();
    });

    // Botão "Concluir Edição" (check)
html.find('.save-attack-mode').on('click', (ev) => {
        ev.preventDefault();
        const attackItem = $(ev.currentTarget).closest('.attack-item');
        
        const updateData = {};
        let hasChanges = false; 

        // 1. Coleta os dados CORRETAMENTE
        attackItem.find('input[data-name], select[data-name], textarea[data-name]').each((i, el) => {
            const name = el.dataset.name;

            // ✅ A CORREÇÃO: Verifica se é um checkbox
            const value = (el.type === 'checkbox') ? el.checked : el.value;

            // Verifica se o valor realmente mudou
            if (foundry.utils.getProperty(this.item, name) != value) {
                hasChanges = true;
            }
            updateData[name] = value;
        });

        // 2. Limpa a memória (para o bug de fechar/não fechar)
        this._openAttackModeId = null; 
          
        // 3. Salva os dados (SE houver mudanças)
        if (hasChanges) {
            this.item.update(updateData);
        } else {
            // Se não houver mudanças, força o fechamento visual
            attackItem.find('.attack-edit-mode').hide();
            attackItem.find('.attack-display-mode').show();
        }
    });

}

}