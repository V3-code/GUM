import { GUM_DEFAULTS } from "../gum-defaults.js"; 

export class GumGMScreen extends Application {
    
    constructor(options = {}) {
        super(options);
        this.selectedModifier = null; // Armazena o modificador que o Mestre clicou
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "gum-gm-screen",
            title: "Escudo do Mestre (GUM)",
            template: "systems/gum/templates/apps/gm-screen.hbs",
            width: 1100,
            height: 700,
            resizable: true,
            classes: ["gum", "gm-screen"],
            tabs: [{ navSelector: ".screen-tabs", contentSelector: ".screen-body", initial: "modifiers" }]
        });
    }

    async getData() {
        // Pega apenas personagens de jogadores
        const actors = game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner);
        
        // 1. Dados do Monitor (Esquerda)
        const monitorData = actors.map(actor => {
            const attr = actor.system.attributes;
            // Lê os modificadores que já foram empurrados (Flags)
            const activeGMMods = actor.getFlag("gum", "gm_modifiers") || [];

            return {
                id: actor.id,
                name: actor.name,
                img: actor.img,
                hp: { value: attr.hp.value, max: attr.hp.max, percent: Math.min(100, (attr.hp.value / attr.hp.max) * 100) },
                fp: { value: attr.fp.value, max: attr.fp.max, percent: Math.min(100, (attr.fp.value / attr.fp.max) * 100) },
                defenses: {
                    dodge: attr.dodge.final,
                    parry: this._getBestDefense(actor, 'parry'),
                    block: this._getBestDefense(actor, 'block')
                },
                activeGMMods: activeGMMods
            };
        });
        monitorData.sort((a, b) => a.name.localeCompare(b.name));

        // 2. Dados da Paleta (Direita)
        const modifiers = await this._fetchModifiers();

        return {
            actors: monitorData,
            modifiers: modifiers,
            selectedMod: this.selectedModifier
        };
    }

    /**
     * Busca modificadores do Compêndio "Modificadores Básicos"
     */
    async _fetchModifiers() {
        const packLabel = "Modificadores Básicos";
        let pack = game.packs.get("gum.gm_modifiers") || 
                   game.packs.get("world.modificadores-basicos") ||
                   game.packs.find(p => p.metadata.label.toLowerCase().includes(packLabel.toLowerCase()));

        if (!pack) return {};

        const content = await pack.getDocuments();
        
        // Estrutura de Categorias
        const sections = {
            melee:   { label: "Corpo a Corpo", items: [] },
            ranged:  { label: "À Distância",   items: [] },
            defense: { label: "Defesa",        items: [] },
            magic:   { label: "Magia/Poder",   items: [] },
            general: { label: "Geral/Situação", items: [] }
        };

        content.forEach(item => {
            const t = item.system.target_type || {};
            let placed = false;

            if (t.combat_attack_melee) { sections.melee.items.push(item); placed = true; }
            if (t.combat_attack_ranged) { sections.ranged.items.push(item); placed = true; }
            if (t.combat_defense_all || t.combat_defense_dodge) { sections.defense.items.push(item); placed = true; }
            if (t.combat_attack_spell || t.spell_iq || t.power_iq) { sections.magic.items.push(item); placed = true; }
            
            if (!placed || t.global || t.situation) {
                if (!placed || t.global) sections.general.items.push(item);
            }
        });

        // Ordena
        for (const key in sections) {
            sections[key].items.sort((a, b) => a.name.localeCompare(b.name));
        }

        return sections;
    }

    _getBestDefense(actor, type) {
        let best = 0;
        actor.items.filter(i => i.system.equipped).forEach(i => {
            if (i.system.melee_attacks) {
                Object.values(i.system.melee_attacks).forEach(atk => {
                    const val = type === 'parry' ? atk.final_parry : atk.final_block;
                    if (Number(val) > best) best = Number(val);
                });
            }
        });
        return best || "-";
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // 1. SELECIONAR MODIFICADOR (Paleta Direita)
        html.find('.palette-mod').click(ev => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const modId = btn.data('id');
            const modValue = btn.data('value');
            const modName = btn.find('.mod-name').text().trim();

            // Toggle de seleção
            if (this.selectedModifier && this.selectedModifier.id === modId) {
                this.selectedModifier = null;
                html.find('.palette-mod').removeClass('active');
            } else {
                html.find('.palette-mod').removeClass('active');
                btn.addClass('active');
                this.selectedModifier = { id: modId, name: modName, value: modValue };
            }
        });

        // 2. APLICAR NO PERSONAGEM (Clique no Card Esquerdo)
        html.find('.monitor-card').click(async ev => {
            // Só faz algo se tivermos uma "ferramenta" (modificador) selecionada
            if (!this.selectedModifier) return;

            // Ignora se clicou num botão de remover ou identidade
            if ($(ev.target).closest('.remove-mod, .actor-identity').length) return;

            const card = $(ev.currentTarget);
            const actorId = card.data('actor-id');
            const actor = game.actors.get(actorId);

            if (actor) {
                await this._applyModifierToActor(actor, this.selectedModifier);
                
                // Feedback visual (Piscar Verde)
                card.addClass('flash-success');
                setTimeout(() => card.removeClass('flash-success'), 500);
            }
        });

        // 3. REMOVER MODIFICADOR (Clique no X da Tag)
        html.find('.remove-mod').click(async ev => {
            ev.stopPropagation(); // Não ativa o clique do card
            const tag = $(ev.currentTarget).closest('.active-mod-tag');
            const index = tag.data('index'); // Índice no array
            const actorId = tag.closest('.monitor-card').data('actor-id');
            const actor = game.actors.get(actorId);

            if (actor) {
                const currentMods = actor.getFlag("gum", "gm_modifiers") || [];
                currentMods.splice(index, 1); // Remove pelo índice
                await actor.setFlag("gum", "gm_modifiers", currentMods);
                // O Hook 'updateActor' no main.js vai redesenhar a tela automaticamente
            }
        });
    }

    /**
     * Lógica de Negócio: Salva a Flag no Ator
     */
    async _applyModifierToActor(actor, modData) {
        // Pega os existentes ou cria array vazio
        const currentMods = actor.getFlag("gum", "gm_modifiers") || [];
        
        // Adiciona o novo
        currentMods.push({
            name: modData.name,
            value: modData.value,
            id: foundry.utils.randomID(), // ID único para garantir remoção precisa
            source: "GM Screen"
        });

        // Salva
        await actor.setFlag("gum", "gm_modifiers", currentMods);
        ui.notifications.info(`Modificador "${modData.name}" aplicado em ${actor.name}.`);
    }
}