import { EffectBrowser } from "../apps/effect-browser.js";
import { ConditionBrowser } from "../apps/condition-browser.js";
import { EqpModifierBrowser } from "../apps/eqp-modifier-browser.js";
import { ModifierBrowser } from "../apps/modifier-browser.js";
import { TriggerBrowser } from "../apps/trigger-browser.js";

// ================================================================== //
//  CLASSE DA FICHA DO ITEM (GurpsItemSheet) - VERSÃO CORRIGIDA       //
// ================================================================== //
export class GurpsItemSheet extends ItemSheet {
static get defaultOptions() { 
    return foundry.utils.mergeObject(super.defaultOptions, { 
      classes: ["gum", "sheet", "item", "theme-dark"],
      width: 500,
      height: 600, // Você pode querer aumentar isso para 550, já que as abas têm mais conteúdo
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
    
    // ✅ MANTIDO: Dificuldades para o dropdown de Perícias
    context.skillDifficulties = {
        "F": "Fácil (F)",
        "M": "Média (M)",
        "D": "Difícil (D)",
        "MD": "Muito Difícil (MD)",
        "TecM": "Técnica (Média)",
        "TecD": "Técnica (Difícil)"
    };

    // ✅ NOVO: LÓGICA DE EQUIPAMENTOS E ARMADURAS (Cálculo de CF e Peso)
    if (['equipment', 'armor'].includes(this.item.type)) {
        const eqpModsObj = this.item.system.eqp_modifiers || {};
        
        // 1. Prepara a lista para o template
        const modifiersArray = Object.entries(eqpModsObj).map(([id, data]) => ({
            id, ...data
        })).sort((a, b) => a.name.localeCompare(b.name));
        context.eqpModifiersList = modifiersArray;

        // 2. Calcula Custo e Peso Finais
        let baseCost = Number(this.item.system.cost) || 0;
        let baseWeight = Number(this.item.system.weight) || 0;
        let totalCF = 0;
        let weightMultiplier = 1;

        for (const mod of modifiersArray) {
            // Soma CF (ex: +1.5)
            totalCF += Number(mod.cost_factor) || 0;
            
            // Multiplica Peso (ex: "x0.75")
            if (mod.weight_mod) {
                const wModStr = mod.weight_mod.toString().trim().toLowerCase();
                if (wModStr.startsWith('x')) {
                    const mult = parseFloat(wModStr.substring(1));
                    if (!isNaN(mult)) weightMultiplier *= mult;
                }
            }
        }

        // Aplica as fórmulas do GURPS
        // Custo Final = Base * (1 + total CF) -> CF não pode reduzir custo abaixo de 0
        const finalCostMultiplier = Math.max(0, 1 + totalCF);
        context.calculatedFinalCost = baseCost * finalCostMultiplier;
        
        context.calculatedFinalWeight = baseWeight * weightMultiplier;
        
        // Formata para exibição bonita (ex: "1.250,00")
        context.finalCostString = context.calculatedFinalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        context.finalWeightString = context.calculatedFinalWeight.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        
        // Flags para saber se houve alteração (para destacar no HTML)
        context.hasCostChange = finalCostMultiplier !== 1;
        context.hasWeightChange = weightMultiplier !== 1;
    }

    // Lógica de cálculo de custo final (Vantagens/Poderes) - MANTIDA
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

    // Função auxiliar para buscar e preparar os dados dos itens linkados
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

    // Lógica de ordenação e preparação dos modificadores de Vantagem (MANTIDA)
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

    return context; 
  }

  async _updateObject(event, formData) {
    for (const key in formData) {
      if (typeof formData[key] === 'string' && formData[key].includes(',')) {
        formData[key] = formData[key].replace(',', '.');
      }
    }
    return this.object.update(formData);
  }

  _getSubmitData(updateData) {
      const data = super._getSubmitData(updateData);
      this._saveUIState(); 
      return data;
  }

  
  /**
     * Calcula o custo de pontos de uma perícia GURPS.
     * @param {string} difficulty - O código da dificuldade (F, M, D, MD, TecM, TecD).
     * @param {number} relativeLevel - O nível relativo ao atributo (ex: -1, 0, +1).
     * @returns {number} - O custo em pontos.
     */
    _calculateSkillPoints(difficulty, relativeLevel) {
        const rl = parseInt(relativeLevel) || 0;

        // Lógica para Técnicas (rl = níveis comprados)
        if (difficulty === "TecM") {
            return Math.max(0, rl * 1); // Custo de 1 por nível
        }
        if (difficulty === "TecD") {
            return Math.max(0, rl * 2); // Custo de 2 por nível
        }

        // Lógica para Perícias Padrão (rl = nível relativo ao atributo)
        let defaultLevel = 0;
        switch (difficulty) {
            case "F":  defaultLevel = 0;  break;
            case "M":  defaultLevel = -1; break;
            case "D":  defaultLevel = -2; break;
            case "MD": defaultLevel = -3; break;
            default: return 0; // Dificuldade não reconhecida
        }

        // 'pointLevel' é o número de "passos" acima do nível de 1 ponto
        const pointLevel = rl - defaultLevel;

        if (pointLevel < 0) return 0; // Não custa pontos (está abaixo do nível de 1 ponto)
        
        // Tabela de custo [Nível 0=1pt, Nível 1=2pt, Nível 2=4pt, Nível 3=8pt]
        const costs = [1, 2, 4, 8];
        if (pointLevel < costs.length) {
            return costs[pointLevel];
        }
        
        // A partir do Nível 3 (8 pts), são +4 pontos por nível
        return 8 + (pointLevel - 3) * 4;
    }

/**
     * Manipulador de eventos para o cálculo automático de pontos. (Versão CORRIGIDA)
     * Disparado quando os campos de automação mudam.
     */
    async _onAutoCalcPoints(event) {
        // Pega o formulário como um objeto
        const formData = new FormDataExtended(this.form).object;
        
        // 1. Pega o estado do checkbox (um checkbox desmarcado não aparece no formData,
        //    então `|| false` garante que ele seja 'false' se não estiver presente)
        const autoPoints = formData["system.auto_points"] || false;
        
        // 2. Descobre qual campo disparou o evento
        const changedElementName = event.currentTarget.name;

        // 3. Prepara um objeto para salvar todas as mudanças de uma vez
        const updateData = {};
        const pointsField = (this.item.type === 'power') ? "system.points_skill" : "system.points";

        // --- Caso A: O *próprio checkbox* foi alterado ---
        if (changedElementName === "system.auto_points") {
            // A primeira coisa a fazer é salvar o novo estado do checkbox
            updateData["system.auto_points"] = autoPoints;

            // Se o usuário acabou de LIGAR a automação,
            // devemos recalcular os pontos imediatamente
            if (autoPoints === true) {
                const difficulty = formData["system.difficulty"];
                const relativeLevel = formData["system.skill_level"];
                updateData[pointsField] = this._calculateSkillPoints(difficulty, relativeLevel);
            }
            // Se o usuário DESLIGOU, não fazemos nada (apenas salvar o estado 'false')
        } 
        // --- Caso B: O Nível ou a Dificuldade mudaram ---
        else {
            // Só calculamos se a automação estiver LIGADA
            if (autoPoints) {
                const difficulty = formData["system.difficulty"];
                const relativeLevel = formData["system.skill_level"];
                const newPoints = this._calculateSkillPoints(difficulty, relativeLevel);
                
                // Só atualiza se o valor realmente mudou
                if (foundry.utils.getProperty(this.item, pointsField) !== newPoints) {
                    updateData[pointsField] = newPoints;
                }
            }
        }

        // 4. Se houver *qualquer coisa* para atualizar (o checkbox ou os pontos),
        //    envia UMA ÚNICA atualização para o banco de dados.
        if (Object.keys(updateData).length > 0) {
            // Esta atualização salvará os dados E disparará o re-render,
            // garantindo que o HTML reflita os dados corretos.
            await this.item.update(updateData);
        }
    }

/**
     * @override
     * Sobrescreve a renderização para preservar estado dos <details> e POSIÇÃO DO SCROLL.
     */
    async _render(force, options) {
        // 1. Captura IDs abertos
        const openDetailsIds = [];
        if (this.element && this.element.length > 0) {
            this.element.find('details').each((index, element) => {
                if (element.open && element.id) openDetailsIds.push(element.id);
            });
        }

        // 2. ✅ CAPTURA A POSIÇÃO DO SCROLL
        let scrollPositions = [];
        if (this.element && this.element.length > 0) {
             this.element.find('.sheet-body-content, form').each((i, el) => {
                 scrollPositions.push({ selector: el.className, top: el.scrollTop });
             });
        }

        // 3. Renderiza
        await super._render(force, options);

        // 4. Restaura IDs abertos
        if (openDetailsIds.length > 0) {
            openDetailsIds.forEach(id => {
                const el = this.element.find(`#${id}`);
                if (el.length) el.prop('open', true);
            });
        }

        // 5. ✅ RESTAURA A POSIÇÃO DO SCROLL
        if (scrollPositions.length > 0) {
             scrollPositions.forEach(pos => {
                 // Tenta encontrar pelo seletor mais específico possível
                 // Se for o form principal:
                 if (pos.selector.includes('gum-item-sheet')) {
                     this.form.scrollTop = pos.top;
                 } else {
                     // Se for um container interno
                     const el = this.element.find(`.${pos.selector.split(' ')[0]}`); 
                     if (el.length) el[0].scrollTop = pos.top;
                 }
             });
        }
    }
    
  /**
   * @override
   * Configuração do editor de texto (TinyMCE)
   */
  activateEditor(name, options = {}, ...args) {
    options.plugins = "link lists";
    options.toolbar = "styleselect | bold italic | bullist numlist | link | gurpsExpand | removeformat";
    options.menubar = false;

    // ✅ MUDANÇA: Altura padrão aumentada de 200 para 300
    options.height = (name === "system.chat_description") ? 300 : 400;

    options.content_style = `
        body {
            color: var(--c-bg-dark, #2b2a29);
        }
        p { 
            margin: 0.2em 0 !important;
            line-height: 1em !important;
        }
        h4, h5 {
            margin: 0.5em 0 0.2em 0 !important;
        }
    `;

    options.setup = function (editor) {
      editor.ui.registry.addButton("gurpsExpand", {
        tooltip: "Expandir área de edição",
        icon: "fullscreen",
        onAction: function () {
          const container = editor.getContainer();
          container.classList.toggle("expanded");
        }
      });
    };

    return super.activateEditor(name, options, ...args);
  }

  _saveUIState() {
      const openDetails = [];
      this.form.querySelectorAll('details[open]').forEach((detailsEl, index) => {
          const summaryText = detailsEl.querySelector('summary')?.innerText || `details-${index}`;
          openDetails.push(summaryText);
      });
      this._openDetailsState = openDetails;

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
   */
/**
   * @override
   * Ativa todos os listeners de interatividade da ficha de item.
   */
  activateListeners(html) {
      super.activateListeners(html);

      // [Dentro de activateListeners]

    // ==================================================================
    // LÓGICA DE CASCATA AVANÇADA (MODIFICADORES DO MESTRE)
    // ==================================================================
    if (this.item.type === 'gm_modifier') {
        
        // Mapeamento Pai -> Filhos
        const treeMap = {
            // GERAL
            'global': 'ALL', // Código especial para marcar TUDO

            // COMBATE
            'combat_all': [
                'combat_attack_melee', 'combat_attack_ranged', 'combat_attack_spell', 'combat_attack_power',
                'combat_defense_dodge', 'combat_defense_parry', 'combat_defense_block',
                'combat_damage_melee', 'combat_damage_ranged', 'combat_damage_spell', 'combat_damage_power'
            ],
            
            // ATRIBUTOS (PAI GERAL)
            'attr_all': ['attr_st_all', 'attr_dx_all', 'attr_iq_all', 'attr_ht_all', 'attr_will_all', 'attr_per_all'],

            // ATRIBUTOS (PAIS ESPECÍFICOS)
            'attr_st_all': ['check_st', 'skill_st', 'spell_st', 'power_st'],
            'attr_dx_all': ['check_dx', 'skill_dx', 'spell_dx', 'power_dx'],
            'attr_iq_all': ['check_iq', 'skill_iq', 'spell_iq', 'power_iq'],
            'attr_ht_all': ['check_ht', 'skill_ht', 'spell_ht', 'power_ht'],
            'attr_will_all': ['check_will', 'skill_will', 'spell_will', 'power_will', 'check_fright'],
            'attr_per_all': ['check_per', 'skill_per', 'spell_per', 'power_per', 'sense_vision', 'sense_hearing', 'sense_tastesmell', 'sense_touch']
        };

        // Listener Genérico para qualquer Checkbox
        html.find('input[type="checkbox"]').change(async (ev) => {
            const checkboxName = ev.currentTarget.name; // ex: "system.target_type.combat_all"
            const isChecked = ev.currentTarget.checked;
            
            // Extrai a chave simples (ex: "combat_all")
            const key = checkboxName.replace('system.target_type.', '');
            
            // Se não for um Pai, não faz nada além do padrão
            if (!treeMap[key]) return;

            const updates = {};
            const allTargets = this.item.system.target_type;

            // Função recursiva para marcar filhos
            const markChildren = (parentKey) => {
                const children = treeMap[parentKey];
                if (!children) return;

                if (children === 'ALL') {
                    // Marca TUDO (exceto a si mesmo para evitar loop)
                    for (const targetKey in allTargets) {
                        if (targetKey !== parentKey) {
                            updates[`system.target_type.${targetKey}`] = isChecked;
                        }
                    }
                    return;
                }

                children.forEach(childKey => {
                    updates[`system.target_type.${childKey}`] = isChecked;
                    // Se o filho também for um pai (ex: attr_all -> attr_st_all), continua descendo
                    if (treeMap[childKey]) {
                        markChildren(childKey);
                    }
                });
            };

            // Inicia a cascata
            markChildren(key);

            // Aplica as mudanças se houver
            if (Object.keys(updates).length > 0) {
                await this.item.update(updates);
            }
        });
    }

      html.find('.view-eqp-modifier').on('click', async (ev) => {
        ev.preventDefault();
        const modId = $(ev.currentTarget).closest('.modifier-tag').data('modifier-id');
        const modData = this.item.system.eqp_modifiers[modId];
        
        if (!modData) return;

        // Enriquece o texto (links clicáveis)
        const features = await TextEditor.enrichHTML(modData.features || "<i>Sem efeitos adicionais.</i>", { async: true });
        
        // Monta o conteúdo do diálogo
        const content = `
            <div class="sheet-body-content">
                <div class="form-section">
                    <h4 class="section-title">Detalhes: ${modData.name}</h4>
                    <div class="summary-list">
                        <div class="summary-item">
                            <label>Fator de Custo (CF):</label>
                            <span class="summary-dots"></span>
                            <span class="value">${modData.cost_factor > 0 ? '+' : ''}${modData.cost_factor}</span>
                        </div>
                        <div class="summary-item">
                            <label>Mod. Peso:</label>
                            <span class="summary-dots"></span>
                            <span class="value">${modData.weight_mod}</span>
                        </div>
                        <div class="summary-item">
                            <label>Nível Tec.:</label>
                            <span class="summary-dots"></span>
                            <span class="value">${modData.tech_level_mod || '-'}</span>
                        </div>
                         <div class="summary-item">
                            <label>Ref.:</label>
                            <span class="summary-dots"></span>
                            <span class="value">${modData.ref || '-'}</span>
                        </div>
                    </div>
                    <hr class="summary-divider">
                    <label style="font-weight:bold; color:#a0a0a0; font-size:11px; text-transform:uppercase;">Efeitos / Notas:</label>
                    <div class="summary-description rendered-text" style="margin-top:5px;">
                        ${features}
                    </div>
                </div>
            </div>
        `;

        new Dialog({
            title: `Modificador: ${modData.name}`,
            content: content,
            buttons: { close: { label: "Fechar", icon: '<i class="fas fa-times"></i>' } },
            default: "close",
        }, {
            width: 400,
            classes: ["dialog", "modifier-preview-dialog"]
        }).render(true);
    });

    html.find('input[name="system.auto_points"], select[name="system.difficulty"], input[name="system.skill_level"]').on('change', this._onAutoCalcPoints.bind(this));

      // Listener para ADICIONAR um Modo de Ataque (Melee ou Ranged)
      html.find('.add-attack').on('click', (ev) => {
          const attackType = $(ev.currentTarget).data('type');
          const newAttackId = foundry.utils.randomID(16);
          let newAttackData;
          let path;

          if (attackType === 'melee') {
              path = `system.melee_attacks.${newAttackId}`;
              newAttackData = {
                  "mode": "Novo Ataque C.C.", "unbalanced": false, "fencing": false, "skill_name": "", "skill_level_mod": 0,
                  "damage_formula": "GdB", "damage_type": "cort", "armor_divisor": 1, "reach": "C", "parry": "0", "block": "0",
                  "min_strength": 0, "onDamageEffects": {},
                  "follow_up_damage": { "formula": "", "type": "", "armor_divisor": 1 },
                  "fragmentation_damage": { "formula": "", "type": "", "armor_divisor": 1 }
              };
          } else {
              path = `system.ranged_attacks.${newAttackId}`;
              newAttackData = {
                  "mode": "Novo Ataque L.D.", "unbalanced": false, "fencing": false, "skill_name": "", "skill_level_mod": 0,
                  "damage_formula": "GdP", "damage_type": "perf", "armor_divisor": 1, "accuracy": "0", "range": "100/1500",
                  "rof": "1", "shots": "1(3i)", "rcl": "1", "mag": "1", "min_strength": 0, "onDamageEffects": {},
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

// Listener para VINCULAR PERÍCIA (VERSÃO UNIVERSAL)
      html.find('.link-skill-button').on('click', (ev) => {
          if (!this.item.isOwned) {
              return ui.notifications.warn("Este item precisa estar em um ator para vincular uma perícia.");
          }
          const actor = this.item.parent;
          const skills = actor.items.filter(i => i.type === 'skill');
          if (skills.length === 0) {
              return ui.notifications.warn("Este ator não possui nenhuma perícia para vincular.");
          }
          
          // ✅ INÍCIO DA CORREÇÃO: Lógica de seletor universal
          
          // 1. Encontra o input de texto mais próximo dentro do mesmo grupo
          const input = $(ev.currentTarget).closest('.form-group').find('input[type="text"]');
          if (!input.length) {
              console.error("GUM | .link-skill-button: Não foi possível encontrar o input de texto adjacente.");
              return; 
          }

          // 2. Tenta pegar o 'data-name' (usado em Modos de Ataque)
          let path = input.data('name'); 
          
          // 3. Se não houver 'data-name', pega o 'name' (usado em Magias, Poderes, etc.)
          if (!path) {
              path = input.attr('name');
          }

          if (!path) {
              console.error("GUM | .link-skill-button: O input adjacente não tem 'name' nem 'data-name'.");
              return;
          }
          // ✅ FIM DA CORREÇÃO

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
                          // 'path' agora conterá o atributo correto (data-name ou name)
                          this.item.update({ [path]: selectedSkillName });
                      }
                  }
              },
              default: "select"
          }).render(true);
      });

      // Listener para ADICIONAR um Efeito *dentro* de um Modo de Ataque
      html.find('.add-attack-effect').on('click', (ev) => {
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
              yes: () => { this.item.update({ [path]: null }); },
              no: () => {
                  this._openAttackModeId = null;
                  this._openDetailsState = null;
              }
          });
      });

      // Listeners da "effectsTab" e Modificadores (ANTIGOS)
      html.find('.view-original-effect, .view-original-condition').on('click', async (ev) => {
          ev.preventDefault();
          const target = $(ev.currentTarget);
          const effectEntry = target.closest('.effect-entry, .effect-summary');
          const listName = effectEntry.data('list-name');
          const effectId = effectEntry.data('effect-id');
          let uuid = target.data('uuid');
          if (!uuid) {
              const effectData = getProperty(this.item, `system.${listName}.${effectId}`);
              uuid = effectData.effectUuid || effectData.uuid;
          }
          if (uuid) {
              const originalItem = await fromUuid(uuid);
              if (originalItem) { originalItem.sheet.render(true); } 
              else { ui.notifications.warn("O item original não foi encontrado."); }
          } else { ui.notifications.error("Não foi possível encontrar o UUID para este item."); }
      });

      if (!this.isEditable) return;

      // --- Modificadores ---
      html.find('.add-modifier').on('click', (ev) => {
          ev.preventDefault();
          new ModifierBrowser(this.item).render(true);
      });
      html.find('.delete-modifier').on('click', (ev) => {
          ev.preventDefault();
          const modifierId = $(ev.currentTarget).data('modifier-id');
          if (modifierId) {
              Dialog.confirm({
                  title: "Remover Modificador",
                  content: "<p>Você tem certeza?</p>",
                  yes: () => { this.item.update({ [`system.modifiers.-=${modifierId}`]: null }); },
                  no: () => {}
              });
          }
      });
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
                          <div class="summary-item"><label>Custo:</label><span class="summary-dots"></span><span class="value">${modifierData.cost}</span></div>
                          <div class="summary-item"><label>Referência:</label><span class="summary-dots"></span><span class="value">${modifierData.ref || 'N/A'}</span></div>
                      </div>
                      <hr class="summary-divider">
                      <div class="summary-description rendered-text">${description}</div>
                  </div>
              </div>`;
          new Dialog({
              title: `Detalhes: ${modifierData.name}`, content: content,
              buttons: { close: { label: "Fechar", icon: '<i class="fas fa-times"></i>' } },
              default: "close",
          }, { width: 420, height: "auto", resizable: true, classes: ["dialog", "modifier-preview-dialog"] }).render(true);
      });

      // --- Aba de Efeitos (Padrão) ---
      html.find('.add-effect').on('click', async (ev) => {
          const targetList = $(ev.currentTarget).data('target-list');
          if (!targetList) return;
          new EffectBrowser(this.item, {
              onSelect: (selectedEffects) => {
                  const updates = {};
                  for (const effect of selectedEffects) {
                      const newId = foundry.utils.randomID();
                      const newLinkData = { id: newId, effectUuid: effect.uuid, recipient: 'target', name: effect.name, img: effect.img };
                      updates[`system.${targetList}.${newId}`] = newLinkData;
                  }
                  this.item.update(updates);
              }
          }).render(true);
      });
      html.find('.add-general-condition').on('click', (ev) => {
          new ConditionBrowser(this.item, {
              onSelect: (selectedConditions) => {
                  const updates = {};
                  for (const condition of selectedConditions) {
                      const newId = foundry.utils.randomID();
                      const newLinkData = { id: newId, uuid: condition.uuid, name: condition.name, img: condition.img };
                      updates[`system.generalConditions.${newId}`] = newLinkData;
                  }
                  this.item.update(updates);
              }
          }).render(true);
      });
      html.find('.delete-effect').on('click', (ev) => {
          const target = $(ev.currentTarget);
          const listName = target.closest('.effect-entry').data('list-name');
          const effectId = target.closest('.effect-entry').data('effect-id');
          Dialog.confirm({
              title: "Remover Efeito", content: "<p>Você tem certeza?</p>",
              yes: () => { this.item.update({ [`system.${listName}.-=${effectId}`]: null }); },
              no: () => {}
          });
      });

      // --- Modo Edição/Visualização de Ataque ---
      html.find('.edit-attack-mode').on('click', (ev) => {
          ev.preventDefault();
          const attackItem = $(ev.currentTarget).closest('.attack-item');
          attackItem.find('.attack-display-mode').hide();
          attackItem.find('.attack-edit-mode').show();
      });
      html.find('.save-attack-mode').on('click', (ev) => {
          ev.preventDefault();
          const attackItem = $(ev.currentTarget).closest('.attack-item');
          const updateData = {};
          let hasChanges = false; 
          attackItem.find('input[data-name], select[data-name], textarea[data-name]').each((i, el) => {
              const name = el.dataset.name;
              const value = (el.type === 'checkbox') ? el.checked : el.value;
              if (foundry.utils.getProperty(this.item, name) != value) {
                  hasChanges = true;
              }
              updateData[name] = value;
          });
          this._openAttackModeId = null; 
          if (hasChanges) {
              this.item.update(updateData);
          } else {
              attackItem.find('.attack-edit-mode').hide();
              attackItem.find('.attack-display-mode').show();
          }
      });
      
      // --- Listeners do Editor de Texto ---
      html.find(".toggle-editor").on("click", ev => {
        const section = $(ev.currentTarget).closest(".description-section");
        section.find(".description-view, .toggle-editor").hide();
        section.find(".description-editor").show();
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
        if (!field) return ui.notifications.error("Campo de descrição não identificado.");
        const editor = this.editors?.[field];
        if (!editor) {
          ui.notifications.warn("Editor não encontrado.");
          return;
        }
        let content = "";
        try {
          content = editor.instance.getContent();
        } catch (err) {
          console.warn("Erro ao ler conteúdo:", err);
        }
        const update = {};
        update[field] = content;
        await this.object.update(update);
        const enriched = await TextEditor.enrichHTML(content, { async: true });
        section.find(".description-view").html(enriched);
        section.find(".description-editor").hide();
        section.find(".description-view, .toggle-editor").show();
      });

      html.find('.add-eqp-modifier').on('click', (ev) => {
        ev.preventDefault();
        new EqpModifierBrowser(this.item).render(true);
    });

    html.find('.delete-eqp-modifier').on('click', (ev) => {
        ev.preventDefault();
        const modId = $(ev.currentTarget).closest('.modifier-tag').data('modifier-id');
        const modName = $(ev.currentTarget).closest('.modifier-tag').find('.modifier-name').text();
        
        Dialog.confirm({
            title: "Remover Modificador",
            content: `<p>Remover <strong>${modName}</strong> deste item?</p>`,
            yes: () => {
                this.item.update({ [`system.eqp_modifiers.-=${modId}`]: null });
            },
            defaultYes: false
        });
    });
  } 
}