// GUM/module/settings.js

/**
 * ✅ A FUNÇÃO DE SINCRONIZAÇÃO
 * Esta é a lógica para a sua ideia do "botão de atualização".
 * Ela varre todos os personagens e atualiza seus itens vinculados.
 */
async function syncCompendiumRules() {
    ui.notifications.info("Iniciando sincronização das Regras do Compêndio...");

    // 1. Pega o compêndio de regras
    const pack = game.packs.get("gum.Regras"); //
    if (!pack) {
        return ui.notifications.error("Compêndio de regras [GUM] Regras (gum.Regras) não encontrado.");
    }

    // 2. Carrega as regras-fonte do compêndio e as mapeia por UUID
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

    // 3. Itera em todos os atores de personagem do mundo
    for (const actor of actorsToUpdate) {
        const updates = [];
        // 4. Encontra todos os itens no ator que têm um "vínculo" (sourceId)
        const itemsToUpdate = actor.items.filter(i => i.getFlag("core", "sourceId"));

        for (const item of itemsToUpdate) {
            const sourceId = item.getFlag("core", "sourceId");
            // 5. Verifica se o vínculo do item aponta para uma regra no nosso compêndio
            const sourceRule = sourceRulesMap.get(sourceId);

            if (sourceRule) {
                // 6. Se encontrou, prepara uma atualização para este item
                // Nós copiamos o 'system' (que contém as regras 'when' e 'effects')
                // e a 'img', mas mantemos o _id e o nome que o usuário possa ter mudado.
                const sourceData = sourceRule.toObject();
                updates.push({
                    _id: item.id,
                    system: sourceData.system, // Atualiza as regras 'when' e 'effects'
                    img: sourceData.img
                    // Note que mantemos o nome do item no ator, caso o usuário o tenha renomeado.
                });
            }
        }

        // 7. Aplica todas as atualizações encontradas para este ator
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
        default: "@system.attributes.basic_speed.final + (@system.attributes.dx.final / 100) + (1d6 / 1000)", //
        onChange: value => {
             // ... (sua lógica de recarregar a página) ...
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
    }); //

    // --- ✅ SEU NOVO "BOTÃO" DE ATUALIZAÇÃO ---
    // Esta é a sua ideia implementada.
    game.settings.register("gum", "syncCompendiumRulesBtn", {
        name: "Sincronizar Regras do Compêndio",
        hint: "MARQUE e SALVE para forçar a atualização de todas as 'Condições Passivas' em todos os personagens com as versões mais recentes do compêndio [GUM] Regras. A caixa desmarcará automaticamente após o uso.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            if (value) {
                // O usuário marcou a caixa.
                console.log("GUM | Sincronização de regras iniciada pelo GM...");
                // Chama nossa função de sincronização
                syncCompendiumRules(); 
                // Desmarca a caixa automaticamente
                game.settings.set("gum", "syncCompendiumRulesBtn", false); 
            }
        }
    });
}