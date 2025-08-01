import { GUM_DATA } from "../gum-data.js";

export class EffectBuilder extends FormApplication {
    constructor(item, effect = null, effectIndex = -1, options = {}) {
        const initialData = effect || { type: "attribute", path: "", operation: "ADD", value: "0" };
        super(initialData, options);
        this.item = item;
        this.effectIndex = effectIndex;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "Assistente de Efeito",
            classes: ["gum", "effect-builder", "theme-dark"],
            template: "systems/gum/templates/apps/effect-builder.hbs",
            width: 500, height: "auto", resizable: true
        });
    }

    async getData() {
        const context = await super.getData();
        context.effect = this.object;
        context.statusEffects = CONFIG.statusEffects.reduce((acc, effect) => {
            if (effect.id && effect.name) acc[effect.id] = effect.name;
            return acc;
        }, {});
        return context;
    }

    async _updateObject(event, formData) {
        const effectsData = this.item.system.effects || [];
        const effects = Array.isArray(effectsData) ? effectsData : Object.values(effectsData);
        
        const newEffectData = foundry.utils.expandObject(formData);
        const cleanEffect = { type: newEffectData.type };

        switch(newEffectData.type) {
            case "attribute":
                cleanEffect.path = newEffectData.path;
                cleanEffect.operation = newEffectData.operation;
                cleanEffect.value = newEffectData.value;
                break;
            case "status":
                cleanEffect.statusId = newEffectData.statusId;
                break;
            case "macro":
                cleanEffect.value = newEffectData.value;
                break;
            case "chat":
                cleanEffect.chat_text = newEffectData.chat_text;
                cleanEffect.whisperMode = newEffectData.whisperMode;
                cleanEffect.has_roll = newEffectData.has_roll;
                if (newEffectData.has_roll) {
                    cleanEffect.roll_attribute = newEffectData.roll_attribute;
                    cleanEffect.roll_modifier = newEffectData.roll_modifier;
                    cleanEffect.roll_label = newEffectData.roll_label;
                }
                break;
        }

        if (this.effectIndex > -1) {
            effects[this.effectIndex] = cleanEffect;
        } else {
            effects.push(cleanEffect);
        }
        await this.item.update({ "system.effects": effects });
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('[name="type"], [name="has_roll"]').on('change', this._onTypeChange.bind(this));
        html.find('.open-attribute-picker').on('click', this._onOpenAttributePicker.bind(this));

    }

    async _onTypeChange(event) {
        // Usa o caminho correto para FormDataExtended
        const formData = new foundry.applications.ux.FormDataExtended(this.form).object;
        this.object = formData;
        this.render();
    }

    _onOpenAttributePicker(event) {
    const targetInput = $(event.currentTarget).siblings('input')[0];

    let content = `<div class="parameter-assistant"><div class="buttons">`;
    for (const [path, label] of Object.entries(GUM_DATA.attributes)) {
        const value = `system.${path}`; // O caminho completo que o efeito precisa
        content += `<button type="button" class="param-button" data-value="${value}">${label}</button>`;
    }
    content += `</div></div>`;

    const d = new Dialog({
        title: "Selecionar Atributo para Modificar",
        content: content,
        buttons: {},
        render: (html) => {
            html.find('.param-button').on('click', (ev) => {
                targetInput.value = ev.currentTarget.dataset.value;
                d.close();
            });
        }
    }, { width: 500, classes: ["dialog", "gum"] }).render(true);
}

}