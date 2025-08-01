import { ConditionBuilder } from "./condition-builder.js";
import { EffectBuilder } from "./effect-builder.js";

export class ConditionSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "condition-sheet", "theme-dark"],
            width: 645, height: "auto", resizable: true,
            template: "systems/gum/templates/items/condition-sheet.hbs"
        });
    }

    async getData(options) {
        const context = await super.getData(options);
        context.system = this.item.system;
        context.enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, { async: true });
        
        const effectsData = this.item.system.effects || [];
        context.system.effects = Array.isArray(effectsData) ? effectsData : Object.values(effectsData);
        return context;
    }

activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // BOTÃO DE ADICIONAR ABRE O ASSISTENTE PARA UM NOVO EFEITO
    html.find('.add-effect').on('click', (ev) => {
        const newEffect = { type: "attribute" };
        new EffectBuilder(this.item, newEffect, -1).render(true);
    });
    
    // BOTÃO DE EDITAR ABRE O ASSISTENTE COM DADOS DO EFEITO EXISTENTE
    html.find('.edit-effect').on('click', (ev) => {
        const effectIndex = $(ev.currentTarget).closest('.effect-summary').data('effectIndex');
        const effects = Array.isArray(this.item.system.effects) ? this.item.system.effects : Object.values(this.item.system.effects || {});
        const effect = effects[effectIndex];
        if (effect) {
            new EffectBuilder(this.item, effect, effectIndex).render(true);
        }
    });

    html.find('.delete-effect').on('click', this._onDeleteEffect.bind(this));
    html.find('.condition-assistant-btn').on('click', (ev) => { new ConditionBuilder(this.item).render(true); });
    html.find('.edit-text-btn').on('click', this._onEditText.bind(this));
}
    
    // Deletar um efeito (lógica simplificada)
    _onDeleteEffect(event) {
        event.preventDefault();
        const effectIndex = $(event.currentTarget).closest('.effect-block').data('effectIndex');
        const effectsData = this.item.system.effects || [];
        const effects = Array.isArray(effectsData) ? effectsData : Object.values(effectsData);
        effects.splice(effectIndex, 1);
        this.item.update({ "system.effects": effects });
    }


    // ✅ MÉTODO PARA EDITAR TEXTO (DESCRIÇÃO)
    _onEditText(event) {
        const fieldName = $(event.currentTarget).data('target');
        const title = $(event.currentTarget).attr('title');
        const currentContent = foundry.utils.getProperty(this.item, fieldName) || "";

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
        }).render(true);
    }
}