// GUM/module/settings.js

export const registerSystemSettings = function() {
    game.settings.register("gum", "initiativeFormula", {
        name: "Fórmula de Iniciativa (GUM)",
        hint: "Fórmula para determinar a iniciativa. Verifique o caminho dos atributos no console com _token.actor.",
        scope: "world",
        config: true,
        type: String,
        
        // --- CORREÇÃO 1: Usando o caminho mais provável com '.value' ---
        // Verifique com o console se o seu sistema usa '.value' ou não e ajuste se necessário.
        default: "(@attributes.basic_speed.value * 100) + (@attributes.dx.value / 100) + (1d6 / 1000)",

        // --- CORREÇÃO 2: Adicionando o pop-up de recarregamento ---
        // Esta função é executada toda vez que o valor no menu de configurações é salvo.
        onChange: value => {
            new Dialog({
                title: "Recarregar Necessário",
                content: "<p>A fórmula de iniciativa foi alterada. Para que a mudança tenha efeito, o Foundry precisa ser recarregado.</p>",
                buttons: {
                    reload: {
                        icon: '<i class="fas fa-redo"></i>',
                        label: "Recarregar Agora",
                        callback: () => window.location.reload()
                    },
                    later: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Lembrar-me Depois"
                    }
                },
                default: "reload"
            }).render(true);
        }
    });
}