import { EffectBrowser } from "../apps/effect-browser.js";
import { ConditionBrowser } from "../apps/condition-browser.js";

// ================================================================== //
//  CLASSE DA FICHA DO ITEM (GurpsItemSheet) - VERSÃO CORRIGIDA       //
// ================================================================== //
export class GurpsItemSheet extends ItemSheet {
  static get defaultOptions() { 
    return foundry.utils.mergeObject(super.defaultOptions, { 
      classes: ["gum", "sheet", "item", "theme-dark"],
      width: 450,
      height: 495, // A altura da janela pode precisar de ajuste se o editor crescer
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

  async _render(force, options) {
      await super._render(force, options);
      
      if (this._openDetailsState) {
          this.form.querySelectorAll('details').forEach((detailsEl, index) => {
              const summaryText = detailsEl.querySelector('summary')?.innerText || `details-${index}`;
              if (this._openDetailsState.includes(summaryText)) {
                  detailsEl.open = true;
              }
          });
          this._openDetailsState = null;
      }

      if (this._openAttackModeId) {
          const attackItem = this.form.querySelector(`.attack-item[data-attack-id="${this._openAttackModeId}"]`);
          if (attackItem) {
              const displayMode = attackItem.querySelector('.attack-display-mode');
              const editMode = attackItem.querySelector('.attack-edit-mode');
              
              if (displayMode) displayMode.style.display = 'none';
              if (editMode) editMode.style.display = 'block';
          }
          this._openAttackModeId = null;
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
  
  activateListeners(html) {
      super.activateListeners(html);

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

      html.find('.delete-attack').on('click', (ev) => {
          const target = $(ev.currentTarget);
          const attackId = target.closest('.attack-item').data('attack-id');
          const listName = target.data('list'); 
          const attack = this.item.system[listName][attackId];
          if (!attackId || !attack) return;
          Dialog.confirm({
              title: `Deletar Modo de Ataque "${attack.mode}"`,
              content: "<p>Você tem certeza?</p>",
              yes: () => { this.item.update({ [`system.${listName}.-=${attackId}`]: null }); },
              no: () => {},
              defaultYes: false
          });
      });

      html.find('.link-skill-button').on('click', (ev) => {
          if (!this.item.isOwned) {
              return ui.notifications.warn("Este item precisa estar em um ator para vincular uma perícia.");
          }
          const actor = this.item.parent;
          const skills = actor.items.filter(i => i.type === 'skill');
          if (skills.length === 0) {
              return ui.notifications.warn("Este ator não possui nenhuma perícia para vincular.");
          }
          const input = $(ev.currentTarget).closest('.stat-row').find('input[name$=".skill_name"]');
          if (!input.length) return;
          const path = input.attr('name');
          let content = `<div class="dialog-skill-list"><select name="skill_selector">`;
          content += `<option value="">-- Nenhuma --</option>`;
          skills.sort((a,b) => a.name.localeCompare(b.name)).forEach(skill => {
              content += `<option value="${skill.name}">${skill.name} (NH ${skill.system.final_nh})</option>`;
          });
          content += `</select></div>`;
          new Dialog({
              title: "Vincular Perícia do Ator", content: content,
              buttons: {
                  select: {
                      icon: '<i class="fas fa-link"></i>', label: "Vincular",
                      callback: (html) => {
                          const selectedSkillName = html.find('select[name="skill_selector"]').val();
                          this.item.update({ [path]: selectedSkillName });
                      }
                  }
              },
              default: "select"
          }).render(true);
      });

      html.find('.add-attack-effect').on('click', (ev) => {
          this._saveUIState(); 
          const target = $(ev.currentTarget);
          const list = target.data('list'); 
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

      html.find('.delete-attack-effect').on('click', (ev) => {
          this._saveUIState();
          const target = $(ev.currentTarget);
          const list = target.data('list');
          const effectId = target.closest('.effect-summary').data('effect-id');
          const attackType = target.closest('.attack-item').data('attack-type');
          const attackId = target.closest('.attack-item').data('attack-id');
          const path = `system.${attackType}_attacks.${attackId}.${list}.-=${effectId}`;
          Dialog.confirm({
              title: "Remover Efeito do Ataque", content: "<p>Você tem certeza?</p>",
              yes: () => { this.item.update({ [path]: null }); },
              no: () => {
                  this._openAttackModeId = null;
                  this._openDetailsState = null;
              }
          });
      });

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

      html.find('.add-modifier').on('click', (ev) => {
          ev.preventDefault();
          new ModifierBrowser(this.item).render(true);
      });

      html.find('.delete-modifier').on('click', (ev) => {
          ev.preventDefault();
          const modifierId = $(ev.currentTarget).data('modifier-id');
          if (modifierId) {
              Dialog.confirm({
                  title: "Remover Modificador", content: "<p>Você tem certeza?</p>",
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
      
  } // Fim do activateListeners
}