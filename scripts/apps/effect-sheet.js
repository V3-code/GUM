// GUM/scripts/apps/effect-sheet.js

export class EffectSheet extends ItemSheet {
    
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "effect-sheet", "theme-dark"],
            width: "450",
            height: "495",
            resizable: true,
            template: "systems/gum/templates/items/effect-sheet.hbs",
            tabs: [{
                navSelector: ".sheet-tabs",
                contentSelector: ".sheet-body-content",
                initial: "configuracao"
            }]
        });
    }

    async getData(options) {
        const context = await super.getData(options);
        context.system = this.item.system;
        context.statusEffects = CONFIG.statusEffects.map(s => ({ id: s.id, label: s.name }));
        context.macros = game.macros.map(m => m.name);
        const flagValue = context.system.flag_value;
            context.flagValueIsBoolean = (flagValue === 'true' || flagValue === 'false');
            context.flagValueSelection = context.flagValueIsBoolean ? flagValue : 'custom';
        context.enrichedChatDescription = await TextEditor.enrichHTML(this.item.system.chat_description, { async: true });
        context.enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, { async: true });
        context.owner = this.item.isOwner;
        context.editable = this.options.editable;


        return context;
    }

    /**
     * Preserve scroll position when the sheet re-renders to avoid jumping to the top.
     */
    async _render(force, options = {}) {
        const container = this.element?.[0]?.querySelector('.sheet-body-content');
        const scrollTop = container?.scrollTop ?? null;
        const result = await super._render(force, options);
        if (scrollTop !== null) {
            const refreshed = this.element?.[0]?.querySelector('.sheet-body-content');
            if (refreshed) refreshed.scrollTop = scrollTop;
        }
        return result;
    }

activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return; // Adicionando uma verificação de segurança

    // Listener para o seletor de valor da flag (funciona independentemente)
    html.find('input[name="system.flag_value_selector"]').on('change', (event) => {
        const selectorValue = event.currentTarget.value;
        if (selectorValue === 'true' || selectorValue === 'false') {
            this.item.update({ 'system.flag_value': selectorValue });
        }
    });
    
 // ✅ OUVINTE DO BOTÃO DE EDITAR AGORA É ATIVADO SEMPRE ✅
    html.find('.edit-text-btn').on('click', this._onEditText.bind(this));

    // Alterna os editores padrão da aba de descrição (padrão dos outros itens)
    html.find('.toggle-editor').on('click', this._toggleEditor.bind(this));
    html.find('.save-description').on('click', this._saveDescription.bind(this));
    html.find('.cancel-description').on('click', this._cancelDescription.bind(this));

    // ✅ LÓGICA DA MACRO AGORA ESTÁ DENTRO DE UMA VERIFICAÇÃO SEGURA ✅
    const macroInput = html.find('input[name="system.value"]')[0];
    // Só executa este bloco SE o campo da macro existir na ficha
    if (macroInput) {
        
        // A função de validação agora vive dentro do 'if'
        const validateMacro = () => {
            const icon = html.find('.validation-icon')[0];
            if (!icon) return; // Segurança extra para o ícone
            const macroName = macroInput.value;
            const macroExists = game.macros.some(m => m.name === macroName);

            if (macroName === "") {
                icon.innerHTML = "";
            } else if (macroExists) {
                icon.innerHTML = '<i class="fas fa-check"></i>';
                icon.style.color = "var(--c-accent-green, #389c68)";
            } else {
                icon.innerHTML = '<i class="fas fa-times"></i>';
                icon.style.color = "var(--c-accent-red, #a53541)";
            }
        };

        macroInput.addEventListener('keyup', validateMacro);
        validateMacro(); // Valida ao abrir a ficha
    }
}

     // ✅ FUNÇÃO AUXILIAR PARA ABRIR O EDITOR DE TEXTO (A PARTE QUE FALTAVA) ✅
    _onEditText(event) {
        const target = $(event.currentTarget);
        const fieldName = target.data('target');
        const title = target.attr('title');
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
        }, { width: 500, height: 400, resizable: true }).render(true);
    }

    _toggleEditor(event) {
        event.preventDefault();
        const field = event.currentTarget.dataset.field;
        const container = $(event.currentTarget).closest('.description-section');
        container.find('.description-view').toggle();
        container.find('.description-editor').toggle();
        if (field) {
            const editor = container.find(`.editor[data-edit=\"${field}\"]`);
            if (editor.length) {
                editor.trigger('focus');
            }
        }
    }

    async _saveDescription(event) {
        event.preventDefault();
        const field = event.currentTarget.dataset.field;
        const container = $(event.currentTarget).closest('.description-section');
        const editor = container.find(`.editor[data-edit=\"${field}\"]`);
        const content = editor.length ? editor.val() : container.find(`textarea[name=\"${field}\"]`).val();
        if (field) await this.item.update({ [field]: content });
        container.find('.description-view').show();
        container.find('.description-editor').hide();
    }

    _cancelDescription(event) {
        event.preventDefault();
        const container = $(event.currentTarget).closest('.description-section');
        container.find('.description-view').show();
        container.find('.description-editor').hide();
    }
}
