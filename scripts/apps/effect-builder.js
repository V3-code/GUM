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
    
    // Cria um objeto de efeito limpo para garantir que não haja dados extras
    const newEffect = { type: formData.type };
    
    // Adiciona apenas os campos relevantes para o tipo de efeito selecionado
    switch(formData.type) {
        case "attribute":
            newEffect.path = formData.path;
            newEffect.operation = formData.operation;
            newEffect.value = formData.value;
            break;
        case "status":
            newEffect.statusId = formData.statusId;
            break;
        case "macro":
            newEffect.value = formData.value;
            break;
        case "chat":
            newEffect.chat_text = formData.chat_text;
            newEffect.whisperMode = formData.whisperMode;
            newEffect.has_roll = formData.has_roll;
            if (formData.has_roll) {
                newEffect.roll_attribute = formData.roll_attribute;
                newEffect.roll_label = formData.roll_label;

                // ✅ LÓGICA CORRIGIDA E ADICIONADA AQUI ✅
                // Se for um valor fixo, salva o 'roll_fixed_value'.
                // Se não, salva o 'roll_modifier'.
                if (formData.roll_attribute === 'fixed') {
                    newEffect.roll_fixed_value = formData.roll_fixed_value;
                } else {
                    newEffect.roll_modifier = formData.roll_modifier;
                }
            }
            break;
    }

    if (this.effectIndex > -1) {
        effects[this.effectIndex] = newEffect;
    } else {
        effects.push(newEffect);
    }

    await this.item.update({ "system.effects": effects });
}

    activateListeners(html) {
        super.activateListeners(html);
        html.find('[name="type"], [name="has_roll"]').on('change', this._onTypeChange.bind(this));
        html.find('.open-attribute-picker').on('click', this._onOpenAttributePicker.bind(this));
        html.find('[name="type"], [name="has_roll"], [name="roll_attribute"]').on('change', this._onTypeChange.bind(this));
        html.find('.open-value-help').on('click', this._onOpenValueHelp.bind(this));
    }

    async _onTypeChange(event) {
        // Usa o caminho correto para FormDataExtended
        const formData = new foundry.applications.ux.FormDataExtended(this.form).object;
        this.object = formData;
        this.render();
    }

    _onOpenValueHelp(event) {
    const examples = [
        { label: "Valor fixo 2", code: "2" },
        { label: "Metade da ST final", code: "Math.floor(actor.system.attributes.st.final / 2)" },
        { label: "Negar o peso da carga", code: "actor.system.encumbrance.penalty * -1" },
        { label: "Se HP <= 5, então -2", code: "actor.system.attributes.hp.value <= 5 ? -2 : 0" },
        { label: "Valor da DX final", code: "actor.system.attributes.dx.final" }
    ];

    let content = `<div class="value-helper"><ul>`;
    for (let ex of examples) {
        content += `<li><strong>${ex.label}:</strong> <code class="copyable" data-code="${ex.code}">${ex.code}</code></li>`;
    }
    content += `</ul><p class="hint">Clique no código para copiá-lo.</p></div>`;

    const d = new Dialog({
        title: "Exemplos de Fórmulas para Valor",
        content: content,
        buttons: { ok: { label: "Fechar" } },
        render: html => {
            html.find(".copyable").on("click", ev => {
                const code = ev.currentTarget.dataset.code;
                navigator.clipboard.writeText(code);
                ui.notifications.info("Fórmula copiada!");
            });
        }
    }, { width: 500, classes: ["dialog", "gum"] }).render(true);
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