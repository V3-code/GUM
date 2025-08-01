export class EffectBuilder extends FormApplication {

    constructor(item, effect = null, options = {}) {
        super(effect || {}, options);
        this.item = item; // O item de condição pai
        this.effect = effect; // O efeito que estamos editando, ou null se for novo
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "Assistente de Efeito",
            classes: ["gum", "effect-builder", "theme-dark"],
            template: "systems/gum/templates/apps/effect-builder.hbs",
            width: 500,
            height: "auto",
            resizable: true
        });
    }

    async getData() {
        const context = await super.getData();
        context.effect = this.object;
        
        // Prepara a lista de Ícones de Status para o menu
        context.statusEffects = CONFIG.statusEffects.reduce((acc, effect) => {
            if (effect.id && effect.name) acc[effect.id] = effect.name;
            return acc;
        }, {});

        return context;
    }

    // A "mágica" acontece aqui: salvamos o novo efeito na lista do item pai
    async _updateObject(event, formData) {
        const effectsData = this.item.system.effects || [];
        const effects = Array.isArray(effectsData) ? effectsData : Object.values(effectsData);
        
        // Se estamos editando, substituímos o efeito existente. Se não, adicionamos um novo.
        if (this.object.index !== undefined) {
            effects[this.object.index] = formData;
        } else {
            effects.push(formData);
        }

        await this.item.update({ "system.effects": effects });
    }

    // Re-renderiza a janela quando o tipo de efeito muda
    _onEffectTypeChange(event) {
        // Atualiza o objeto de dados interno com o novo tipo
        this.object.type = event.currentTarget.value;
        // Renderiza a janela novamente para mostrar os campos corretos
        this.render();
    }
    
    activateListeners(html) {
        super.activateListeners(html);
        html.find('[name="type"]').on('change', this._onEffectTypeChange.bind(this));
    }
}