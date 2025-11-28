import { performGURPSRoll } from "../../scripts/main.js";

export class GurpsRollPrompt extends FormApplication {
    
    /**
     * @param {Actor} actor - O ator que está rolando.
     * @param {Object} rollData - Dados do teste { value, label, type, etc. }
     */
    constructor(actor, rollData, options = {}) {
        super(options);
        this.actor = actor;
        this.rollData = rollData;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "Configurar Rolagem",
            id: "gurps-roll-prompt",
            template: "systems/gum/templates/apps/roll-prompt.hbs",
            width: 400,
            height: "auto",
            classes: ["gum", "roll-prompt", "theme-dark"],
            closeOnSubmit: true
        });
    }

    getData() {
        const context = super.getData();
        context.actor = this.actor;
        context.label = this.rollData.label || "Teste de Atributo";
        context.baseValue = this.rollData.value || 10;
        // Futuramente: ícones baseados no tipo de teste (ataque, magia, etc)
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);
        // Aqui colocaremos os listeners dos botões de manobra no futuro
    }

    /**
     * Quando o usuário clica em ROLAR
     */
    async _updateObject(event, formData) {
        // 1. Coleta os dados do formulário
        const manualMod = parseInt(formData.manualMod) || 0;
        
        // 2. Calcula o valor final (Base + Mod)
        // Futuramente somará os modificadores de manobra/escudo aqui
        const finalValue = parseInt(this.rollData.value) + manualMod;

        // 3. Dispara a rolagem real (usando a função que já existe no main.js)
        performGURPSRoll(this.actor, {
            ...this.rollData,
            value: finalValue, // Substitui o valor base pelo modificado
            originalValue: this.rollData.value, // Guarda o original para referência
            modifier: manualMod // Passa o modificador para aparecer no chat
        });
    }
}