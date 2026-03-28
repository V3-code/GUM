const { ItemSheet } = foundry.appv1.sheets;
const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? foundry?.applications?.ux?.TextEditor ?? TextEditor;

export class TriggerSheet extends ItemSheet {
    
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "trigger-sheet", "theme-dark"],
            width: 520,
            height: 480, // Aumentamos a altura para acomodar os botões
               resizable: true,
            template: "systems/gum/templates/items/trigger-sheet.hbs",
            // ✅ Ativa o sistema de abas
            tabs: [{
                navSelector: ".sheet-tabs",
                contentSelector: ".sheet-body-content",
                initial: "codigo"
            }],
            scrollY: [".sheet-body-content"]
        });
    }

    async getData(options) {
        const context = await super.getData(options);
        context.system = this.item.system;
        context.enrichedDescription = await TextEditorImpl.enrichHTML(this.item.system.description || "", { async: true });
        context.enrichedChatDescription = await TextEditorImpl.enrichHTML(this.item.system.chat_description || "", { async: true });
        context.owner = context.owner ?? this.item.isOwner;
        context.editable = this.options.editable ?? this.isEditable;
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);
        if (!this.isEditable) return;

        html.find('.toggle-editor').on('click', this._toggleEditor.bind(this));
        html.find('.save-description').on('click', this._saveDescription.bind(this));
        html.find('.cancel-description').on('click', this._cancelDescription.bind(this));
    }

    _toggleEditor(event) {
        event.preventDefault();
        const field = event.currentTarget.dataset.field;
        const container = $(event.currentTarget).closest('.description-section');
        container.find('.description-view').toggle();
        container.find('.description-editor').toggle();
        if (field) {
            const editor = container.find(`.editor[data-edit="${field}"]`);
            if (editor.length) editor.trigger('focus');
        }
    }

    async _saveDescription(event) {
        event.preventDefault();
        const field = event.currentTarget.dataset.field;
        const container = $(event.currentTarget).closest('.description-section');
        const content = await this._getEditorContent(field, container);
        if (!field || content === null || content === undefined) return;

        await this.item.update({ [field]: content });
        const enriched = await TextEditorImpl.enrichHTML(content, { async: true });
        container.find('.description-view').html(enriched);
        container.find('.description-view').show();
        container.find('.description-editor').hide();
    }

    _cancelDescription(event) {
        event.preventDefault();
        const container = $(event.currentTarget).closest('.description-section');
        container.find('.description-view').show();
        container.find('.description-editor').hide();
    }

    _getEditorInstance(field) {
        const editor = this.editors?.[field];
        if (!editor) return null;
        return editor.editor ?? editor.instance ?? editor;
    }

    async _getEditorContent(field, container) {
        if (!field) return null;
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
            const element = container.find(`[name="${field}"]`).get(0)
                ?? container.find(`.editor[data-edit="${field}"]`).get(0);
            if (element) return TextEditorImpl.getContent(element);
        }
        const namedInput = container.find(`[name="${field}"]`);
        if (namedInput.length) return namedInput.val();
        const editorElement = container.find(`.editor[data-edit="${field}"]`);
        if (editorElement.length) return editorElement.val() ?? editorElement.html();
        return "";
    }
}