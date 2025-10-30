// GUM/module/settings.js

/**
 * ✅ A FUNÇÃO DE SINCRONIZAÇÃO (V2 - Corrigida)
 * Esta é a lógica para a sua ideia do "botão de atualização".
 * Ela varre todos os personagens e atualiza seus itens vinculados.
 */
async function syncCompendiumRules() {
    ui.notifications.info("Iniciando sincronização das Regras do Compêndio...");

    const pack = game.packs.get("gum.Regras");
    if (!pack) {
        return ui.notifications.error("Compêndio de regras [GUM] Regras (gum.Regras) não encontrado.");
    }

    const sourceRules = await pack.getDocuments();
    const sourceRulesMap = new Map();
    for (const rule of sourceRules) {
        sourceRulesMap.set(rule.uuid, rule);
    }

    if (sourceRulesMap.size === 0) {
        return ui.notifications.warn("Compêndio [GUM] Regras está vazio. Nenhuma regra para sincronizar.");
    }

    let updateCount = 0;
    const actorsToUpdate = game.actors.filter(a => a.type === "character");

    for (const actor of actorsToUpdate) {
        const updates = [];
        
        // ✅ CORREÇÃO 1 (Depreciação): Lendo a propriedade moderna '_stats.compendiumSource'
        //    em vez do antigo 'flags.core.sourceId'.
        const itemsToUpdate = actor.items.filter(i => i._stats.compendiumSource);

        for (const item of itemsToUpdate) {
            // ✅ CORREÇÃO 1 (Continuação): Lendo a propriedade moderna.
            const sourceId = item._stats.compendiumSource; 
            
            const sourceRule = sourceRulesMap.get(sourceId);

            if (sourceRule) {
                const sourceData = sourceRule.toObject();
                updates.push({
                    _id: item.id,
                    system: sourceData.system,
                    img: sourceData.img
                });
            }
        }

        if (updates.length > 0) {
            await actor.updateEmbeddedDocuments("Item", updates);
            updateCount += updates.length;
        }
    }

    ui.notifications.info(`Sincronização completa! ${updateCount} regras atualizadas em ${actorsToUpdate.length} personagens.`);
}


// --- REGISTRO DAS CONFIGURAÇÕES ---

export const registerSystemSettings = function() {
    
    // --- FÓRMULA DE INICIATIVA CORRIGIDA ---
    game.settings.register("gum", "initiativeFormula", {
        name: "Fórmula de Iniciativa (GUM)",
        hint: "Fórmula padrão do GURPS: Velocidade Básica, com DX como desempate e 1d6 como segundo desempate.",
        scope: "world",
        config: true,
        type: String,
        default: "@attributes.basic_speed.final + (@attributes.dx.final/100) + (1d6/1000)",

        
        onChange: value => {
             new Dialog({
                title: "Recarregar Necessário",
                content: "<p>A fórmula de iniciativa foi alterada. Para que a mudança tenha efeito, o Foundry precisa ser recarregado.</p>",
                buttons: {
                    reload: { icon: '<i class="fas fa-redo"></i>', label: "Recarregar Agora", callback: () => window.location.reload() },
                    later: { icon: '<i class="fas fa-times"></i>', label: "Lembrar-me Depois" }
                },
                default: "reload"
            }).render(true);
        }
    });

    // --- CONFIGURAÇÃO DE ADIÇÃO DE REGRAS PADRÃO ---
    game.settings.register("gum", "addDefaultRules", {
        name: "Adicionar Regras Padrão na Criação",
        hint: "Se marcado, adiciona automaticamente todas as 'Condições Passivas' do compêndio [GUM] Regras a todos os novos Atores de personagem criados.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    // --- "BOTÃO" DE ATUALIZAÇÃO ---
    game.settings.register("gum", "syncCompendiumRulesBtn", {
        name: "Sincronizar Regras do Compêndio",
        hint: "MARQUE e SALVE para forçar a atualização de todas as 'Condições Passivas' em todos os personagens com as versões mais recentes do compêndio [GUM] Regras. A caixa desmarcará automaticamente após o uso.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            if (value) {
                console.log("GUM | Sincronização de regras iniciada pelo GM...");
                syncCompendiumRules(); 
                game.settings.set("gum", "syncCompendiumRulesBtn", false); 
            }
        }
    });
}