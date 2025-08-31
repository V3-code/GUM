import { ConditionBuilder } from "./condition-builder.js";
import { EffectBuilder } from "./effect-builder.js";
import { EffectBrowser } from "../../module/apps/effect-browser.js";

export class ConditionSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "condition-sheet", "theme-dark"],
            width: 450, height: 495, resizable: true,
            template: "systems/gum/templates/items/condition-sheet.hbs",
            tabs: [{
                navSelector: ".sheet-tabs",
                contentSelector: ".sheet-body-content",
                initial: "detalhes"
            }]
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

    // Listener para o botão Adicionar Efeito
    html.find('.add-effect').on('click', (ev) => {
        new EffectBrowser(this.item).render(true);
    });
    
    // Lógica de Edição do item efeito na ficha
    html.find('.edit-effect').on('click', (ev) => {
        const effectIndex = $(ev.currentTarget).closest('.effect-tag').data('effectIndex');
        const effects = Array.isArray(this.item.system.effects) ? this.item.system.effects : Object.values(this.item.system.effects || {});
        const effectData = effects[effectIndex];
        
        if (effectData) {
            // Simplesmente abre o nosso novo EffectBuilder com os dados.
            // O próprio EffectBuilder agora cuida de salvar.
            new EffectBuilder(this.item, effectData, effectIndex).render(true);
        }
    });

    // Listener para o botão Deletar Efeito
    html.find('.delete-effect').on('click', this._onDeleteEffect.bind(this));
    
    // Listeners dos assistentes
    html.find('.condition-assistant-btn').on('click', (ev) => { new ConditionBuilder(this.item).render(true); });
    html.find('.saved-triggers-btn').on('click', (ev) => {
        const textarea = this.element.find('textarea[name="system.when"]')[0];
        this._openTriggerPicker(textarea);
    });

    // Listener para editar descrições
    html.find('.edit-text-btn').on('click', this._onEditText.bind(this));
}
    
 async _openTriggerPicker(textarea) {
        const pack = game.packs.get("world.gum-gatilhos");
        let savedTriggers = [];
        if (pack) {
            savedTriggers = await pack.getDocuments();
        }

        if (savedTriggers.length === 0) {
            return ui.notifications.warn("Nenhum gatilho salvo encontrado no compêndio '[GUM] Gatilhos'.");
        }

        let content = `<div class="structure-picker-dialog"><div class="options">`;
        for (const trigger of savedTriggers) {
            content += `<a data-code="${trigger.system.code}" title="${trigger.system.code}">${trigger.name}</a>`;
        }
        content += `</div></div>`;

        const d = new Dialog({
            title: "Selecionar Gatilho Salvo",
            content,
            buttons: { close: { label: "Fechar" } },
            render: (html) => {
                html.find('.options a').on('click', (ev) => {
                    const triggerCode = ev.currentTarget.dataset.code;
                    this._insertTextWithHighlight(textarea, triggerCode);
                    d.close();
                });
            }
        }, { width: 450, classes: ["dialog", "gum", "structure-picker-dialog"] }).render(true);
    }

    // ✅ NOVA FUNÇÃO AUXILIAR (adaptada do ConditionBuilder) ✅
    _insertTextWithHighlight(textarea, text, placeholder = null) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
        
        if (placeholder) {
            const selectStart = textarea.value.indexOf(placeholder, start);
            if (selectStart !== -1) {
                textarea.focus();
                textarea.setSelectionRange(selectStart, selectStart + placeholder.length);
            }
        } else {
            const newCursorPos = start + text.length;
            textarea.focus();
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }
    }

    // Deletar um efeito (lógica simplificada)
    _onDeleteEffect(event) {
        event.preventDefault();
        const effectIndex = $(event.currentTarget).closest('.effect-tag').data('effectIndex');
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