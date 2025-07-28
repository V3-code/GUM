import { GUM_DATA } from "../gum-data.js";

export class ConditionBuilder extends FormApplication {

    constructor(item, options = {}) {
        super(item, options);
        this.item = item;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "Assistente de Condições",
            classes: ["gum", "condition-builder", "theme-dark"],
            template: "systems/gum/templates/apps/condition-builder.hbs",
            width: 600,
            height: "auto",
            resizable: true
        });
    }

    async getData() {
        const context = await super.getData();
        context.item = this.item;
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('.palette-button').on('click', this._onPaletteClick.bind(this));
    }

    // --- MÉTODOS DA PALETA DE FERRAMENTAS ---

    _onPaletteClick(event) {
        event.preventDefault();
        const action = event.currentTarget.dataset.action;
        const textarea = this.element.find('textarea[name="system.when"]')[0];

        switch(action) {
            case 'open-structures':
                this._openStructurePicker(textarea);
                break;
            case 'open-attributes':
                this._openPicker("Selecionar Atributo", GUM_DATA.attributes, "actor.system.", textarea);
                break;
            case 'open-operators':
                this._openPicker("Selecionar Operador de Comparação", GUM_DATA.operators, "", textarea);
                break;
            case 'open-connectors':
                const connectors = { " && ": "E (&&)", " || ": "OU (||)" };
                this._openPicker("Selecionar Conector Lógico", connectors, "", textarea);
                break;
        }
    }

    _openStructurePicker(textarea) {
        // ✅ BIBLIOTECA DE ESTRUTURAS FINAL E COMPLETA
        const structures = {
            "Geral do Personagem": {
                attr_check: { label: "Verificar Atributo", value: "actor.system.attributes.NOME_DO_ATRIBUTO.value <= VALOR" }
            },
            "Itens e Equipamentos": {
                item_name: { label: "Verificar Item (por nome)", value: "actor.items.some(i => i.name === 'NOME_DO_ITEM')" },
                item_prop: { label: "Verificar Item Equipado (por propriedade)", value: "actor.items.some(i => i.type === 'TIPO' && i.system.location === 'equipped' && i.system.PROPRIEDADE === 'VALOR')" },
                armor_dr: { label: "Verificar RD de Armadura Equipada", value: "actor.items.some(i => i.type === 'armor' && i.system.location === 'equipped' && i.system.dr >= VALOR)" }
            },
            "Vantagens e Desvantagens": {
                has_adv: { label: "Verificar Vantagem (por nome)", value: "actor.items.some(i => i.type === 'advantage' && i.name === 'NOME_DA_VANTAGEM')" },
                adv_level: { label: "Verificar Nível de Vantagem", value: "(actor.items.find(i => i.type === 'advantage' && i.name === 'NOME_DA_VANTAGEM')?.system.level || 0) >= NÍVEL" },
                has_disadv: { label: "Verificar Desvantagem (por nome)", value: "actor.items.some(i => i.type === 'disadvantage' && i.name === 'NOME_DA_DESVANTAGEM')" }
            },
            "Habilidades (Perícia, Magia, Poder)": {
                has_ability: { 
                    label: "Verificar se Conhece Habilidade (por nome)",
                    picker: {
                        title: "Qual tipo de habilidade?",
                        options: { skill: "Perícia", spell: "Magia", power: "Poder" },
                        template: "actor.items.some(i => i.type === 'TYPE' && i.name === 'NOME_DA_HABILIDADE')"
                    }
                },
                ability_level: {
                    label: "Verificar Nível de Habilidade (NH)",
                    picker: {
                        title: "Qual tipo de habilidade?",
                        options: { skill: "Perícia", spell: "Magia", power: "Poder" },
                        template: "(actor.items.find(i => i.type === 'TYPE' && i.name === 'NOME_DA_HABILIDADE')?.system.final_nh || 0) >= NÍVEL"
                    }
                }
            },
            "Status e Estados do Jogo": {
                status_check: { label: "Verificar Status do Token", value: "actor.effects.some(e => e.getFlag('core', 'statusId') === 'prone')" },
                flag_check: { label: "Verificar Flag Customizada (Personagem)", value: "actor.getFlag('gum', 'NOME_DA_FLAG') === true" }
            },
            "Combate e Ambiente": {
                scene_flag_check: { label: "Verificar Flag da Cena (Ambiente)", value: "game.scenes.current.getFlag('gum', 'NOME_DA_FLAG') === true" },
                is_turn: { label: "Verificar se é o Turno do Personagem", value: "game.combat?.combatant?.actorId === actor.id" },
                combat_round: { label: "Verificar a Rodada do Combate", value: "game.combat?.round >= NÚMERO_DA_RODADA" }
            }
        };
        
        let content = `<div class="structure-picker-dialog">`;
        for (const [category, options] of Object.entries(structures)) {
            content += `<details class="category" open><summary>${category}</summary><div class="options">`;
            for (const [key, data] of Object.entries(options)) {
                content += `<a data-key="${key}" title="${data.value || data.picker.template}">${data.label}</a>`;
            }
            content += `</div></details>`;
        }
        content += `</div>`;

        const d = new Dialog({
            title: "Selecionar Estrutura de Regra",
            content,
            buttons: { close: { label: "Fechar" } },
            render: (html) => {
                html.find('.options a').on('click', (ev) => {
                    const key = ev.currentTarget.dataset.key;
                    let structureData;
                    for (const category of Object.values(structures)) {
                        if (category[key]) {
                            structureData = category[key];
                            break;
                        }
                    }
                    if (!structureData) return;

                    d.close();

                    if (structureData.value) {
                        const placeholder = structureData.value.match(/[A-Z_]+/)?.[0];
                        this._insertTextWithHighlight(textarea, structureData.value, placeholder);
                    } else if (structureData.picker) {
                        this._openTypePicker(structureData.picker, textarea);
                    }
                });
            }
        }, { width: 450, classes: ["dialog", "gum", "structure-picker-dialog"] }).render(true);
    }
    
    _openTypePicker(pickerData, textarea) {
        let content = `<div class="parameter-assistant"><div class="buttons">`;
        for (const [key, label] of Object.entries(pickerData.options)) {
            content += `<button type="button" class="param-button" data-type="${key}">${label}</button>`;
        }
        content += `</div></div>`;

        const d = new Dialog({
            title: pickerData.title,
            content: content,
            buttons: {},
            render: (html) => {
                html.find('.param-button').on('click', (ev) => {
                    const type = ev.currentTarget.dataset.type;
                    let value = pickerData.template.replace("'TYPE'", `'${type}'`);
                    const placeholder = value.match(/[A-Z_]+/)?.[0];
                    this._insertTextWithHighlight(textarea, value, placeholder);
                    d.close();
                });
            }
        }, { classes: ["dialog", "gum"] }).render(true);
    }

    _openPicker(title, items, valuePrefix = "", textarea) {
        let content = `<div class="parameter-assistant"><div class="buttons">`;
        for (const [key, label] of Object.entries(items)) {
            const value = `${valuePrefix}${key}`;
            content += `<button type="button" class="param-button" data-value="${value}">${label}</button>`;
        }
        content += `</div></div>`;

        const d = new Dialog({
            title: title, content, buttons: {},
            render: (html) => {
                html.find('.param-button').on('click', (ev) => {
                    this._insertTextWithHighlight(textarea, ` ${ev.currentTarget.dataset.value} `);
                    d.close();
                });
            }
        }, { width: 500, classes: ["dialog", "gum"] }).render(true);
    }

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

    async _updateObject(event, formData) {
        await this.item.update({ "system.when": formData["system.when"] });
    }
}