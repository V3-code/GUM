// GUM/scripts/apps/effect-sheet.js

export class EffectSheet extends ItemSheet {
    
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "effect-sheet", "theme-dark"],
            width: "450",
            height: "495",
            resizable: true,
            template: "systems/gum/templates/items/effect-sheet.hbs"
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

        return context;
    }

        activateListeners(html) {
        super.activateListeners(html);

        html.find('input[name="system.flag_value_selector"]').on('change', (event) => {
            const selectorValue = event.currentTarget.value;
            
            // Se o usuário selecionar "Verdadeiro" ou "Falso",
            // nós forçamos a atualização do valor real da flag.
            if (selectorValue === 'true' || selectorValue === 'false') {
                this.item.update({ 'system.flag_value': selectorValue });
            }
        });
        
        // Encontra o campo de input da macro
        const macroInput = html.find('input[name="system.value"]')[0];
        if (!macroInput) return;

        // Função que faz a validação
        const validateMacro = () => {
            const icon = html.find('.validation-icon')[0];
            const macroName = macroInput.value;
            // A lista de macros já está disponível através do this.object.macros
            // que foi carregada no nosso getData()
            const macroExists = game.macros.some(m => m.name === macroName);

            if (macroName === "") {
                icon.innerHTML = ""; // Limpa o ícone se o campo estiver vazio
            } else if (macroExists) {
                icon.innerHTML = '<i class="fas fa-check"></i>'; // Ícone de "V"
                icon.style.color = "var(--c-accent-green, #389c68)";
            } else {
                icon.innerHTML = '<i class="fas fa-times"></i>'; // Ícone de "X"
                icon.style.color = "var(--c-accent-red, #a53541)";
            }
        };

        // Adiciona um "ouvinte" que dispara a validação sempre que o usuário digita algo
        macroInput.addEventListener('keyup', validateMacro);
        
        // Executa a validação uma vez quando a ficha é aberta, caso já tenha um valor
        validateMacro();
    }
}

