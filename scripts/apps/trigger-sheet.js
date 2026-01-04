const { ItemSheet } = foundry.appv1.sheets;

export class TriggerSheet extends ItemSheet {
    
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "trigger-sheet", "theme-dark"],
            width: 520,
            height: 480, // Aumentamos a altura para acomodar os botões
            resizable: true,
            template: "systems/gum/templates/items/trigger-sheet.hbs",
            // ✅ Ativa o sistema de abas
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body-content", initial: "codigo" }]
        });
    }

    async getData(options) {
        const context = await super.getData(options);
        context.system = this.item.system;
        // ✅ Prepara a descrição para ser exibida
        context.enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, { async: true });
        return context;
    }

    // ✅ ATIVA OS LISTENERS PARA OS NOVOS BOTÕES
    activateListeners(html) {
        super.activateListeners(html);
        if (!this.isEditable) return;

    html.find('.edit-text-btn').on('click', this._onEditText.bind(this));
    }
    
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