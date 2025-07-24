// GUM/module/settings.js

export const registerSystemSettings = function() {
    
    // --- SUA CONFIGURAÇÃO EXISTENTE (MANTIDA 100%) ---
    game.settings.register("gum", "initiativeFormula", {
        name: "Fórmula de Iniciativa (GUM)",
        hint: "Fórmula para determinar a iniciativa. Verifique o caminho dos atributos no console com _token.actor.",
        scope: "world",
        config: true,
        type: String,
        default: "(@attributes.basic_speed.value*100) + ((@attributes.dx.value+@attributes.ht.temp)/100) + (1d6/1000)",
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

    // --- NOVAS CONFIGURAÇÕES PARA O SISTEMA DE CONDIÇÕES (ADICIONADAS ABAIXO) ---

    // Habilita a regra de condições automáticas por HP
    game.settings.register("gum", "enableHpConditions", {
        name: "Habilitar Condições Automáticas por HP",
        hint: "Se ativado, o sistema aplicará ou removerá condições automaticamente com base nos níveis de Pontos de Vida do personagem (ex: Vacilante). Requer que as condições estejam criadas em um Compêndio.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    // Permite ao GM definir um Compêndio com condições padrão para novos personagens
    game.settings.register("gum", "defaultConditionsCompendium", {
        name: "Compêndio de Condições Padrão",
        hint: "Selecione um Compêndio de Itens. Todas as condições deste compêndio serão adicionadas aos novos personagens criados.",
        scope: "world",
        config: true,
        type: String,
        default: ""
    });

    // Você pode adicionar futuras configurações do sistema aqui...
}