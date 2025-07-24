

export class ConditionSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "condition-sheet", "theme-dark"],
            width: 580,
            height: "auto",
            template: "systems/gum/templates/items/condition-sheet.hbs"
        });
    }

    async getData(options) {
        const context = await super.getData(options);
        context.system = this.item.system;
        
        // Garante que a descrição seja processada para o editor de texto
        context.enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, { async: true });

        // Garante que 'effects' seja sempre um array para o template
        const effectsData = this.item.system.effects || [];
        context.system.effects = Array.isArray(effectsData) ? effectsData : Object.values(effectsData);

        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);
        if (!this.isEditable) return;

        // Listener para o botão "+ Adicionar Efeito"
        html.find('.add-effect').on('click', this._onAddEffect.bind(this));
        
        // Listener para o botão de deletar um efeito
        html.find('.delete-effect').on('click', this._onDeleteEffect.bind(this));

        html.find('.edit-text-btn').on('click', (ev) => {
            const fieldName = $(ev.currentTarget).data('target');
            const title = $(ev.currentTarget).attr('title');
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
        });
    }

    _onAddEffect(event) {
        event.preventDefault();
        
        // Garante que estamos modificando um array
        const effectsData = this.item.system.effects || [];
        const effects = Array.isArray(effectsData) ? effectsData : Object.values(effectsData);
        
        effects.push({ path: "", operation: "ADD", value: "0" });
        this.item.update({ "system.effects": effects });
    }

    _onDeleteEffect(event) {
        event.preventDefault();
        const effectIndex = $(event.currentTarget).closest('.effect-row').data('effectIndex');

        // Garante que estamos modificando um array
        const effectsData = this.item.system.effects || [];
        const effects = Array.isArray(effectsData) ? effectsData : Object.values(effectsData);
        
        effects.splice(effectIndex, 1);
        this.item.update({ "system.effects": effects });
    }
}