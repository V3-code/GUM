import { performGURPSRoll } from "/systems/gum/scripts/main.js";
import { GurpsRollPrompt } from "../apps/roll-prompt.js";

// ================================================================== //
//  4. CLASSE DA FICHA DO ATOR (GurpsActorSheet) - EDITOR ATUALIZADO
// ================================================================== //

   export class GurpsActorSheet extends ActorSheet {
      static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
          classes: ["gum", "sheet", "actor", "character"],
          template: "systems/gum/templates/actors/characters.hbs",
          width: 900,
          height: 800,
          tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }]
        });
      }

async getData(options) {
        const context = await super.getData(options);
        
        context.hitLocations = {
            head: { label: "Crânio (-7)", roll: "3-4", penalty: -7 },
            face: { label: "Rosto (-5)", roll: "5", penalty: -5 },
            eyes: { label: "Olhos (-9)", roll: "--", penalty: -9 },
            neck: { label: "Pescoço (-5)", roll: "17-18", penalty: -5 },
            torso: { label: "Torso (0)", roll: "9-11", penalty: 0 },
            vitals: { label: "Órg. Vitais (-3)", roll: "--", penalty: -3 },
            groin: { label: "Virilha (-3)", roll: "11", penalty: -3 },
            arm_r: { label: "Braço D (-2)", roll: "8", penalty: -2 },
            arm_l: { label: "Braço E (-2)", roll: "12", penalty: -2 },
            hand_r: { label: "Mão D (-4)", "roll": "15", penalty: -4 },
            hand_l: { label: "Mão E (-4)", "roll": "--", penalty: -4 },
            leg_r: { label: "Perna D (-2)", roll: "6-7", penalty: -2 },
            leg_l: { label: "Perna E (-2)", roll: "13-14", penalty: -2 },
            foot_r: { label: "Pé D (-4)", roll: "16", penalty: -4 },
            foot_l: { label: "Pé E (-4)", roll: "--", penalty: -4 }
        };

        // Agrupa todos os itens por tipo
        const itemsByType = context.actor.items.reduce((acc, item) => {
          const type = item.type;
          if (!acc[type]) acc[type] = [];
          acc[type].push(item);
          return acc;
        }, {});
        context.itemsByType = itemsByType;

        
       // ================================================================== //
        // ✅ LÓGICA "CASTELO SÓLIDO" ATUALIZADA PARA A ABA DE CONDIÇÕES (INÍCIO)
        // ================================================================== //
        
        // 1. Prepara listas para Efeitos Ativos (divididos por Duração)
        const temporaryEffects = [];
        const permanentEffects = [];

        // Processa todos os ActiveEffects no ator
        const activeEffectsPromises = Array.from(this.actor.effects).map(async (effect) => {
            const effectData = effect.toObject(); 
            effectData.id = effect.id; 

            // --- Lógica de Duração ---
            const d = effect.duration;
            let isPermanent = true; // Assume permanente até que se prove o contrário

            if (d.seconds) {
                effectData.durationString = `${d.seconds} seg.`;
                isPermanent = false;
            } 
            else if (d.rounds) {
                // Calcula rodadas restantes
                const remaining = d.startRound ? (d.startRound + d.rounds - (game.combat?.round || 0)) : d.rounds;
                effectData.durationString = `${remaining} rodada(s)`;
                isPermanent = false;
            } 
            else if (d.turns) {
                // Calcula turnos restantes
                const remaining = d.startTurn ? (d.startTurn + d.turns - (game.combat?.turn || 0)) : d.turns;
                effectData.durationString = `${remaining} turno(s)`;
                isPermanent = false;
            } 
            else {
                effectData.durationString = "Permanente";
                isPermanent = true;
            }
            
            // --- Lógica de Identificação da Fonte (seu código original) ---
            let fonteNome = "Origem Desconhecida";
            let fonteIcon = "fas fa-question-circle";
            let fonteUuid = null;
            
            const effectUuid = foundry.utils.getProperty(effect, "flags.gum.effectUuid");
            if (effectUuid) {
                const originalEffectItem = await fromUuid(effectUuid);
                if (originalEffectItem) {
                    effectData.name = originalEffectItem.name; 
                    effectData.img = originalEffectItem.img;
                }
            }
            
            if (effect.origin) {
                const originItem = await fromUuid(effect.origin);
                if (originItem) {
                    fonteNome = originItem.name;
                    fonteUuid = originItem.uuid; 

                    switch (originItem.type) {
                        case 'spell': fonteIcon = 'fas fa-magic'; break;
                        case 'power': fonteIcon = 'fas fa-bolt'; break;
                        case 'advantage':
                        case 'disadvantage': fonteIcon = 'fas fa-star'; break;
                        case 'equipment':
                        case 'armor': fonteIcon = 'fas fa-shield-alt'; break;
                        default: fonteIcon = 'fas fa-archive';
                    }
                }
            }
            effectData.fonteNome = fonteNome;
            effectData.fonteIcon = fonteIcon;
            effectData.fonteUuid = fonteUuid; 

            // Adiciona o efeito processado à lista correta
            if (isPermanent) {
                permanentEffects.push(effectData);
            } else {
                temporaryEffects.push(effectData);
            }
        });
        
        // Espera todas as promessas de processamento de efeitos terminarem
        await Promise.all(activeEffectsPromises);

        // Salva as listas separadas no contexto para o .hbs usar
        context.temporaryEffects = temporaryEffects;
        context.permanentEffects = permanentEffects;

        // --- 2. Prepara a lista para "Condições Passivas" (Regras de Cenário) ---
        // Esta parte do seu código original já estava perfeita.
        context.installedConditions = itemsByType.condition || [];
        
        // --- FIM DA NOVA LÓGICA DE CONDIÇÕES ---
        
        // ================================================================== //
        //    FUNÇÃO AUXILIAR DE ORDENAÇÃO (Seu código original)
        // ================================================================== //
                    const getSortFunction = (sortPref) => {
                    return (a, b) => {
                        switch (sortPref) {
                            case 'name':
                                return (a.name || '').localeCompare(b.name || '');
                            case 'spell_school':
                                return (a.system.spell_school || '').localeCompare(b.system.spell_school || '');
                            case 'points':
                                return (b.system.points || 0) - (a.system.points || 0);
                            case 'weight': 
                                return (b.system.total_weight || 0) - (a.system.total_weight || 0);
                            case 'cost': 
                                return (b.system.total_cost || 0) - (a.system.total_cost || 0);
                            case 'group': return (a.system.group || 'Geral').localeCompare(b.system.group || 'Geral');
                            default:
                                return (a.sort || 0) - (b.sort || 0);
                                        }
                                    };
                                };

        // ================================================================== //
        //    AGRUPAMENTO DE PERÍCIAS (Seu código original)
        // ================================================================== //
        context.skillsByBlock = (itemsByType.skill || []).reduce((acc, skill) => {
                // Usa o block_id do item para agrupar. O padrão é 'block1'.
                const blockId = skill.system.block_id || 'block1';
                if (!acc[blockId]) {
                    acc[blockId] = [];
                }
                acc[blockId].push(skill);
                return acc;
                }, {});
        
        // Ordena as perícias dentro de cada bloco
        const skillSortPref = this.actor.system.sorting?.skill || 'manual';
                for (const blockId in context.skillsByBlock) {
                    context.skillsByBlock[blockId].sort(getSortFunction(skillSortPref));
                }

        // ================================================================== //
        //    ORDENAÇÃO DE LISTAS SIMPLES (Seu código original)
        // ================================================================== //
           const simpleSortTypes = ['spell', 'power'];
                for (const type of simpleSortTypes) {
                    if (itemsByType[type]) {
                        const sortPref = this.actor.system.sorting?.[type] || 'manual';
                        itemsByType[type].sort(getSortFunction(sortPref));
                    }
                }
                context.itemsByType = itemsByType; // Salva os itens já ordenados no contexto

        // ================================================================== //
        //    AGRUPAMENTO E ORDENAÇÃO DE EQUIPAMENTOS (CORRIGIDO)             //
        // ================================================================== //
            const equipmentTypes = ['equipment', 'melee_weapon', 'ranged_weapon', 'armor'];
            const allEquipment = equipmentTypes.flatMap(type => itemsByType[type] || []);

            allEquipment.forEach(item => {
                const s = item.system;
                const q = s.quantity || 1;
                
                // ✅ CORREÇÃO: Usa o valor efetivo (com modificadores) se existir
                // Se não existir (item sem mods), usa o valor base.
                const w = (s.effectiveWeight !== undefined) ? s.effectiveWeight : (s.weight || 0);
                const c = (s.effectiveCost !== undefined) ? s.effectiveCost : (s.cost || 0);
                
                // Formata para exibição (Total = Unitário * Quantidade)
                s.total_weight = (q * w).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                s.total_cost = (q * c).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                
                // (Opcional) Você pode salvar os unitários calculados para mostrar no tooltip se quiser
                s.unit_weight = w;
                s.unit_cost = c;
            });
            
            const sortingPrefs = this.actor.system.sorting?.equipment || {};
            const equippedSortFn = getSortFunction(sortingPrefs.equipped || 'manual');
            const carriedSortFn = getSortFunction(sortingPrefs.carried || 'manual');
            const storedSortFn = getSortFunction(sortingPrefs.stored || 'manual');

            context.equipmentInUse = allEquipment.filter(i => i.system.location === 'equipped').sort(equippedSortFn);
            context.equipmentCarried = allEquipment.filter(i => i.system.location === 'carried').sort(carriedSortFn);
            context.equipmentStored = allEquipment.filter(i => i.system.location === 'stored').sort(storedSortFn);

        // ================================================================== //
        //     FASE 3.1: PREPARAÇÃO DOS GRUPOS DE ATAQUE (REATORADO)          //
        // ================================================================== //
        
        // 1. Usamos a lista 'context.equipmentInUse' que você já calculou
        const equipmentAttackGroups = (context.equipmentInUse || []).map(item => {
            
            // 2. Processa os Ataques Corpo a Corpo (Melee)
            // ✅ MUDANÇA: Removemos toda a lógica de cálculo de NH daqui
            const meleeAttacks = Object.entries(item.system.melee_attacks || {}).map(([id, attack]) => {
                return {
                    ...attack, // Traz todos os campos do 'attack_melee'
                    id: id,
                    name: attack.mode, 
                    attack_type: "melee",
                    weight: item.system.weight,
                    unbalanced: attack.unbalanced, 
                    fencing: attack.fencing,
                    groupId: item.id,
                    itemId: item.id,
                    // ✅ MUDANÇA: Apenas lê o valor que o main.js já calculou
                    final_nh: attack.final_nh || 10, 
                    skill_name: attack.skill_name || "N/A"
                };
            });

            // 3. Processa os Ataques à Distância (Ranged)
            // ✅ MUDANÇA: Removemos toda a lógica de cálculo de NH daqui
            const rangedAttacks = Object.entries(item.system.ranged_attacks || {}).map(([id, attack]) => {
                return {
                    ...attack, // Traz todos os campos do 'attack_ranged'
                    id: id,
                    name: attack.mode,
                    attack_type: "ranged",
                    weight: item.system.weight,
                    unbalanced: attack.unbalanced, 
                    fencing: attack.fencing,
                    groupId: item.id,
                    itemId: item.id,
                    // ✅ MUDANÇA: Apenas lê o valor que o main.js já calculou
                    final_nh: attack.final_nh || 10,
                    skill_name: attack.skill_name || "N/A"
                };
            });

            // 4. Combina os ataques deste item
            const allAttacks = [...meleeAttacks, ...rangedAttacks];

            // Se este item não tiver ataques definidos, retorna nulo
            if (allAttacks.length === 0) return null;

            // 5. Retorna um "Grupo de Ataque" formatado
            return {
                id: item.id,
                name: item.name,
                weight: item.system.weight,
                defense_bonus: Number(item.system.defense_bonus) || 0,
                attacks: allAttacks,
                sort: item.sort || 0,
                isFromItem: true
            };
        }).filter(group => group !== null); // Remove itens que não tinham ataques

        // 6. Ordena a lista final e salva no contexto
        equipmentAttackGroups.sort((a, b) => (a.sort || 0) - (b.sort || 0));
        context.attackGroups = equipmentAttackGroups; // Salva no contexto para o .hbs usar

        // ================================================================== //
        //     FIM DA FASE 3.1                                                //
        // ================================================================== //

        // ================================================================== //
        //    AGRUPAMENTO E ORDENAÇÃO DE CARACTERÍSTICAS (Seu código original)
        // ================================================================== //
           const characteristics = [ ...(itemsByType.advantage || []), ...(itemsByType.disadvantage || []) ];
            context.characteristicsByBlock = characteristics.reduce((acc, char) => {
            const blockId = char.system.block_id || 'block2';
            if (!acc[blockId]) acc[blockId] = [];
            acc[blockId].push(char);
            return acc;
            }, {});
            
            const charSortPref = this.actor.system.sorting?.characteristic || 'manual';
            // Adicionei uma opção de ordenar por pontos como exemplo
            if(charSortPref === 'points') getSortFunction(charSortPref)
            // Ordena as características DENTRO de cada bloco
            for (const blockId in context.characteristicsByBlock) {
                context.characteristicsByBlock[blockId].sort(getSortFunction(charSortPref));
            }

        // ================================================================== //
        //    ENRIQUECIMENTO DE TEXTO (Seu código original)
        // ================================================================== //
                  // Prepara o campo de biografia, garantindo que funcione mesmo se estiver vazio
            context.enrichedBackstory = await TextEditor.enrichHTML(this.actor.system.details.backstory || "", {
                    secrets: this.actor.isOwner,
                    async: true
                });              
                context.survivalBlockWasOpen = this._survivalBlockOpen || false;
                const combatMeters = context.actor.system.combat.combat_meters || {};
                
                // Cria a lista de registros "preparados" para o template
                const preparedCombatMeters = Object.entries(combatMeters).map(([id, meter]) => {
                    return {
                        id: id,
                        meter: meter
                    };
                // Filtra os registros que estão marcados como "hidden"
                }).filter(m => !m.meter.hidden); 
                
                // Ordena por nome
                preparedCombatMeters.sort((a, b) => a.meter.name.localeCompare(b.meter.name));

                // Salva a lista pronta no contexto
                context.preparedCombatMeters = preparedCombatMeters;
        return context;
    }


_getSubmitData(updateData) {
        // Encontra todos os <details> na ficha
        const details = this.form.querySelectorAll('details');
        const openDetails = [];
        details.forEach((d, i) => {
            // Se o <details> estiver aberto, guarda seu "caminho"
            if (d.open) {
                const parentSection = d.closest('.form-section');
                const title = parentSection ? parentSection.querySelector('.section-title')?.innerText : `details-${i}`;
                openDetails.push(title);
            }
        });
        // Armazena a lista de seções abertas temporariamente
        this._openDetails = openDetails;
        
        return super._getSubmitData(updateData);
    }
    
    // ✅ MÉTODO 2: Restaura o estado depois que a ficha é redesenhada ✅
    async _render(force, options) {
        await super._render(force, options);
        // Se tínhamos uma lista de seções abertas...
        if (this._openDetails) {
            // Encontra todos os títulos de seção
            const titles = this.form.querySelectorAll('.section-title');
            titles.forEach(t => {
                // Se o texto do título estiver na nossa lista de abertos...
                if (this._openDetails.includes(t.innerText)) {
                    // ...encontra o <details> pai e o abre.
                    const details = t.closest('.form-section').querySelector('details');
                    if (details) details.open = true;
                }
            });
            // Limpa a lista para a próxima vez
            this._openDetails = null;
        }

    }

    // ================================================================== //
    // ✅ INÍCIO DA ATUALIZAÇÃO DO EDITOR
    // ================================================================== //
/**
     * @override
     * Ativa o editor de texto rico (TinyMCE) para a Ficha do Ator.
     */
    activateEditor(name, options = {}, ...args) {
        // 1. Plugins e Barra de Ferramentas
        options.plugins = "link lists image"; // Mantém 'image'
        
        // ✅ MUDANÇA: Adiciona "gurpsExpand" ao lado do botão de imagem
        options.toolbar = "styleselect | bold italic | bullist numlist | link image | gurpsExpand | removeformat"; 
        options.menubar = false;

        options.style_formats = [
            { title: 'Parágrafo', block: 'p' },
            { title: 'Cabeçalho 4', block: 'h4' },
            { title: 'Cabeçalho 5', block: 'h5' },
        ];
        
        // 2. Altura padrão (quando não expandido)
        options.height = 300; 

        // 3. CSS Interno (Tema Papiro e Espaçamento de Parágrafo)
        options.content_style = `
            body {
                background-color: var(--c-fundo-papiro, #f1e8e7); 
                color: var(--c-texto-escuro, #352425);
            }
            p { 
                margin: 0.2em 0 !important; 
                line-height: 1.4em !important;
            }
            h4, h5 {
                margin: 0.5em 0 0.2em 0 !important;
            }
        `;
        
        // ✅ MUDANÇA: Adiciona a lógica para o botão "gurpsExpand"
        options.setup = function (editor) {
          editor.ui.registry.addButton("gurpsExpand", {
            tooltip: "Expandir área de edição",
            icon: "fullscreen",
            onAction: function () {
              const container = editor.getContainer();
              // Adiciona/remove a classe "expanded"
              container.classList.toggle("expanded");
            }
          });
        };

        return super.activateEditor(name, options, ...args);
    }
    // ================================================================== //
    // ✅ FIM DA ATUALIZAÇÃO DO EDITOR
    // ================================================================== //
    
      async _updateObject(event, formData) {
        // Processa a conversão de vírgula para ponto
        for (const key in formData) {
          if (typeof formData[key] === 'string' && formData[key].includes(',')) {
            formData[key] = formData[key].replace(',', '.');
          }
        }

        return this.actor.update(formData);
      }

      /**
     * Função auxiliar para somar os valores de dois objetos de RD.
     */
    _mergeDRObjects(target, source) {
        if (!source || typeof source !== 'object') {
            const value = Number(source) || 0;
            if (value > 0) target.base = (target.base || 0) + value;
            return;
        }
        for (const [type, value] of Object.entries(source)) {
            target[type] = (target[type] || 0) + (Number(value) || 0);
        }
    }

/**
     * Converte o objeto de RD (ex: {base: 10, cont: -6})
     * em uma string GURPS legível (ex: "10, 4 cont").
     */
    _formatDRObjectToString(drObject) {
        if (!drObject || typeof drObject !== 'object' || Object.keys(drObject).length === 0) return "0";
        
        const parts = [];
        const baseDR = drObject.base || 0;
        parts.push(baseDR.toString()); // Sempre começa com o valor base

        for (const [type, mod] of Object.entries(drObject)) {
            if (type === 'base') continue; // Já cuidamos da base

            // ✅ CORREÇÃO: CALCULA O VALOR FINAL GURPS
            const finalDR = Math.max(0, baseDR + (mod || 0));
            
            // Só mostra se for diferente da base
            if (finalDR !== baseDR) {
                parts.push(`${finalDR} ${type}`);
            }
        }
        
        if (parts.length === 1 && parts[0] === "0") return "0"; 
        
        if (parts.length > 1 && parts[0] === "0") {
             parts.shift(); 
        }
        
        return parts.join(", ");
    }

/**
     * Converte a string de RD (ex: "5, 2 pi+" ou "3 cont")
     * em um objeto de modificador (ex: {base: 5, "pa+": -3} ou {cont: 3}).
     * ✅ AGORA COM TRADUÇÃO DE IDIOMA.
     */
    _parseDRStringToObject(drString) {
        if (typeof drString === 'object' && drString !== null) return drString;
        if (!drString || typeof drString !== 'string' || drString.trim() === "") return {}; 
        
        // O DICIONÁRIO DE TRADUÇÃO
        const DAMAGE_TYPE_MAP = {
            "cr": "cont", "cut": "cort", "imp": "perf", "pi": "pa",
            "pi-": "pa-", "pi+": "pa+", "pi++": "pa++", "burn": "qmd",
            "corr": "cor", "tox": "tox"
        };

        const drObject = {};
        const parts = drString.split(',').map(s => s.trim().toLowerCase());
        
        let baseDR = 0; 

        // 1. Primeira passada: Encontra o 'base'
        for (const part of parts) {
            const segments = part.split(' ').map(s => s.trim()).filter(Boolean);
            if (segments.length === 1 && !isNaN(Number(segments[0]))) {
                baseDR = Number(segments[0]);
                drObject['base'] = baseDR;
                break; 
            }
        }

        // 2. Segunda passada: Calcula os modificadores
        for (const part of parts) {
            const segments = part.split(' ').map(s => s.trim()).filter(Boolean);
            if (segments.length === 2 && !isNaN(Number(segments[0]))) {
                let type = segments[1];
                const value = Number(segments[0]);
                
                // ✅ TRADUZ O TIPO
                type = DAMAGE_TYPE_MAP[type] || type;

                if (baseDR > 0) {
                    drObject[type] = value - baseDR; 
                } 
                else {
                    drObject[type] = value; 
                }
            }
        }
        
        return drObject;
    }
activateListeners(html) {

    // [NENHUMA ALTERAÇÃO NECESSÁRIA AQUI]
    super.activateListeners(html);
    if (!this.isEditable) return;

    


    html.on('click', '.equipment-options-btn', ev => {
            ev.preventDefault();
            ev.stopPropagation();

            const button = $(ev.currentTarget);
            const li = button.closest('.item');
            const itemId = li.data('itemId');
            const item = this.actor.items.get(itemId);
            if (!item) return;
            
            // Define as opções do submenu "Mover Para"
            // (Estas ações 'update-location' já são tratadas pelo seu listener de menu existente)
            const moveSubmenu = `
                <div class="context-item" data-action="update-location" data-value="equipped">
                    <i class="fas fa-user-shield"></i> Em Uso
                </div>
                <div class="context-item" data-action="update-location" data-value="carried">
                    <i class="fas fa-shopping-bag"></i> Carregado
                </div>
                <div class="context-item" data-action="update-location" data-value="stored">
                    <i class="fas fa-archive"></i> Armazenado
                </div>
            `;

            // Define o menu principal
            const menuContent = `
                <div class="context-item" data-action="edit"><i class="fas fa-edit"></i> Editar Item</div>
                <div class="context-item" data-action="delete"><i class="fas fa-trash"></i> Deletar Item</div>
                <div class="context-divider"></div>
                <div class="context-submenu">
                    <div class="context-item"><i class="fas fa-exchange-alt"></i> Mover Para</div>
                    <div class="submenu-items">${moveSubmenu}</div>
                </div>
            `;

            // Pega o menu, injeta o HTML, armazena o ID do item e exibe
            const customMenu = this.element.find(".custom-context-menu");
            customMenu.html(menuContent);
            customMenu.data("itemId", itemId); // Armazena o ID do item no menu
            
            // Copia a lógica de posicionamento do menu de perícias
            customMenu.css({ display: "block", left: ev.clientX - 210 + "px", top: ev.clientY - 10 + "px" });
        });

    html.find('[data-action="delete-effect"]').on('click', ev => {
        const effectId = ev.currentTarget.dataset.effectId;
        if (effectId) {
            this.actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
        }
    });

    // ✅ LISTENER ESPECIALISTA APENAS PARA A FICHA ✅
html.on('click', '.rollable', ev => {
        ev.preventDefault();
        const element = ev.currentTarget;
        const dataset = element.dataset;

        // Prepara os dados do teste
        const rollData = {
            label: dataset.label || "Teste",
            value: parseInt(dataset.rollValue) || 10,
            type: dataset.type || "attribute", // attribute, skill, attack, spell
            itemId: dataset.itemId || "", // ✅ CRUCIAL: ID do item (se houver)
            img: dataset.img || ""        // ✅ CRUCIAL: Imagem para a janela
        };

        // LÓGICA INVERTIDA DE ROLAGEM
        if (ev.shiftKey) {
            // Shift Pressionado -> ROLAGEM RÁPIDA (Fast Forward)
            performGURPSRoll(this.actor, rollData);
        } else {
            // Clique Normal -> ABRE A JANELA DE OPÇÕES
            // Importante: Se a classe GurpsRollPrompt não estiver importada no topo,
            // o código quebrará aqui. Certifique-se de ter o import.
            new GurpsRollPrompt(this.actor, rollData).render(true);
        }
    });

    // ✅ NOVO LISTENER PARA EDITAR AS BARRAS DE PV E PF ✅
    html.on('click', '.edit-resource-bar', ev => {
        ev.preventDefault();
        const button = ev.currentTarget;
        const statKey = button.dataset.stat; // "hp" ou "fp"
        const statLabel = statKey === 'hp' ? "Pontos de Vida" : "Pontos de Fadiga";
        const attrs = this.actor.system.attributes;

        const content = `
            <form class="secondary-stats-editor">
                <p class="hint">Ajuste os valores base e os modificadores temporários aqui.</p>
                <div class="form-header">
                    <span></span>
                    <span>Base</span>
                    <span>Mod. Temp.</span>
                    <span>Final</span>
                </div>
                <div class="form-grid">
                    <label>${statLabel} (Máximo)</label>
                    <input type="number" name="${statKey}.max" value="${attrs[statKey].max}"/>
                    <input type="number" name="${statKey}.temp" value="${attrs[statKey].temp}"/>
                    <span class="final-display">${attrs[statKey].final}</span>
                </div>
            </form>
        `;

        new Dialog({
            title: `Editar ${statLabel}`,
            content: content,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar",
                    callback: (html) => {
                        const form = html.find('form')[0];
                        const formData = new FormDataExtended(form).object;
                        const updateData = {
                            [`system.attributes.${statKey}.max`]: formData[`${statKey}.max`],
                            [`system.attributes.${statKey}.temp`]: formData[`${statKey}.temp`]
                        };
                        this.actor.update(updateData);
                    }
                }
            },
            default: 'save'
        }, { classes: ["dialog", "gum", "secondary-stats-dialog"] }).render(true);
    });

// Listener para abrir o editor de Atributos Secundários (Engrenagem)
    html.on('click', '.edit-secondary-stats-btn', ev => {
        ev.preventDefault();
        const attrs = this.actor.system.attributes;
        const fmt = (val) => (val > 0 ? `+${val}` : val || 0);
        
        const getAttr = (key) => {
            return attrs[key] || { value: 10, mod: 0, passive: 0, temp: 0, points: 0, final: 10 };
        };

        const vision = getAttr('vision');
        const hearing = getAttr('hearing');
        const tastesmell = getAttr('tastesmell');
        const touch = getAttr('touch');
        
        const content = `
        <form class="secondary-stats-editor">
            <div class="form-header-grid">
                <span>Atributo</span>
                <span>Base</span>
                <span>Mod. Fixo</span>
                <span>Itens/Pass.</span>
                <span>Cond./Temp.</span>
                <span>Pontos</span>
                <span>Final</span>
            </div>

            <div class="form-grid-rows">
                
                <div class="form-row">
                    <label>Velocidade</label>
                    <input type="number" name="basic_speed.value" value="${attrs.basic_speed.value}" step="0.25"/>
                    <input type="number" name="basic_speed.mod" value="${attrs.basic_speed.mod}"/>
                    <span class="read-only">${fmt(attrs.basic_speed.passive)}</span>
                    <span class="read-only">${fmt(attrs.basic_speed.temp)}</span>
                    <input type="number" name="basic_speed.points" value="${attrs.basic_speed.points || 0}"/>
                    <span class="final-display">${attrs.basic_speed.final}</span>
                </div>
                <div class="form-row">
                    <label>Deslocamento</label>
                    <input type="number" name="basic_move.value" value="${attrs.basic_move.value}"/>
                    <input type="number" name="basic_move.mod" value="${attrs.basic_move.mod}"/>
                    <span class="read-only">${fmt(attrs.basic_move.passive)}</span>
                    <span class="read-only">${fmt(attrs.basic_move.temp)}</span>
                    <input type="number" name="basic_move.points" value="${attrs.basic_move.points || 0}"/>
                    <span class="final-display">${attrs.basic_move.final}</span>
                </div>
                <div class="form-row">
                    <label>MT (SM)</label>
                    <input type="number" name="mt.value" value="${attrs.mt.value}"/>
                    <input type="number" name="mt.mod" value="${attrs.mt.mod}"/>
                    <span class="read-only">${fmt(attrs.mt.passive)}</span>
                    <span class="read-only">${fmt(attrs.mt.temp)}</span>
                    <input type="number" name="mt.points" value="${attrs.mt.points || 0}"/>
                    <span class="final-display">${attrs.mt.final}</span>
                </div>
                <div class="form-row">
                    <label>Esquiva</label>
                    <span class="read-only base-calc">${Math.floor(attrs.basic_speed.final) + 3}</span>
                    <input type="number" name="dodge.mod" value="${attrs.dodge.mod || 0}"/>
                    <span class="read-only">${fmt(attrs.dodge.passive)}</span>
                    <span class="read-only">${fmt(attrs.dodge.temp)}</span>
                    <input type="number" name="dodge.points" value="${attrs.dodge.points || 0}"/>
                    <span class="final-display">${attrs.dodge.final}</span>
                </div>

                <hr style="grid-column: 1 / -1; border-color: #aaa;">
                
                <div class="form-row">
                    <label>Visão</label>
                    <input type="number" name="vision.value" value="${vision.value}"/>
                    <input type="number" name="vision.mod" value="${vision.mod}"/>
                    <span class="read-only">${fmt(vision.passive)}</span>
                    <span class="read-only">${fmt(vision.temp)}</span>
                    <input type="number" name="vision.points" value="${vision.points || 0}"/>
                    <span class="final-display">${vision.final}</span>
                </div>

                <div class="form-row">
                    <label>Audição</label>
                    <input type="number" name="hearing.value" value="${hearing.value}"/>
                    <input type="number" name="hearing.mod" value="${hearing.mod}"/>
                    <span class="read-only">${fmt(hearing.passive)}</span>
                    <span class="read-only">${fmt(hearing.temp)}</span>
                    <input type="number" name="hearing.points" value="${hearing.points || 0}"/>
                    <span class="final-display">${hearing.final}</span>
                </div>

                <div class="form-row">
                    <label>Olfato/Paladar</label>
                    <input type="number" name="tastesmell.value" value="${tastesmell.value}"/>
                    <input type="number" name="tastesmell.mod" value="${tastesmell.mod}"/>
                    <span class="read-only">${fmt(tastesmell.passive)}</span>
                    <span class="read-only">${fmt(tastesmell.temp)}</span>
                    <input type="number" name="tastesmell.points" value="${tastesmell.points || 0}"/>
                    <span class="final-display">${tastesmell.final}</span>
                </div>

                <div class="form-row">
                    <label>Tato</label>
                    <input type="number" name="touch.value" value="${touch.value}"/>
                    <input type="number" name="touch.mod" value="${touch.mod}"/>
                    <span class="read-only">${fmt(touch.passive)}</span>
                    <span class="read-only">${fmt(touch.temp)}</span>
                    <input type="number" name="touch.points" value="${touch.points || 0}"/>
                    <span class="final-display">${touch.final}</span>
                </div>

            </div>
        </form>
        <style>
            .secondary-stats-editor .form-header-grid,
            .secondary-stats-editor .form-row {
                display: grid;
                grid-template-columns: 110px 60px 60px 60px 60px 60px 60px;
                gap: 5px;
                align-items: center;
                text-align: center;
                margin-bottom: 5px;
            }
            .secondary-stats-editor .form-header-grid span { font-weight: bold; font-size: 0.85em; white-space: nowrap; }
            .secondary-stats-editor label { text-align: left; font-weight: bold; font-size: 0.9em; }
            .secondary-stats-editor input { text-align: center; }
            .secondary-stats-editor .read-only { color: #666; font-style: italic; }
            .secondary-stats-editor .final-display { font-weight: bold; color: #a53541; font-size: 1.1em; }
        </style>
        `;

        new Dialog({
            title: "Editar Atributos Secundários",
            content: content,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar",
                    callback: (html) => {
                        const form = html.find('form')[0];
                        const formData = new FormDataExtended(form).object;
                        const updateData = {};
                        
                        const fields = [
                            "basic_speed.value", "basic_speed.mod", "basic_speed.points",
                            "basic_move.value", "basic_move.mod", "basic_move.points",
                            "mt.value", "mt.mod", "mt.points",
                            "dodge.mod", "dodge.points",
                            // Agora salvamos Value, Mod e Points para os sentidos
                            "vision.value", "vision.mod", "vision.points",
                            "hearing.value", "hearing.mod", "hearing.points",
                            "tastesmell.value", "tastesmell.mod", "tastesmell.points",
                            "touch.value", "touch.mod", "touch.points"
                        ];

                        fields.forEach(field => {
                            if (formData[field] !== undefined) {
                                updateData[`system.attributes.${field}`] = Number(formData[field]);
                            }
                        });
                        
                        this.actor.update(updateData);
                    }
                }
            },
            default: 'save'
        }, { classes: ["dialog", "gum", "secondary-stats-dialog"], width: 600 }).render(true);
    });

    html.find('.quick-view-origin').on('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const originUuid = ev.currentTarget.dataset.originUuid;
        if (!originUuid) {
            ui.notifications.warn("Este efeito não possui um item de origem rastreável (pode ser um efeito legado ou de status).");
            return;
        }

        const item = await fromUuid(originUuid);
        if (!item) {
            ui.notifications.error("Item de origem não encontrado.");
            return;
        }
        
        const getTypeName = (type) => {
            const typeMap = {
                equipment: "Equipamento", melee_weapon: "Arma C. a C.",
                ranged_weapon: "Arma à Dist.", armor: "Armadura",
                advantage: "Vantagem", disadvantage: "Desvantagem",
                skill: "Perícia", spell: "Magia", power: "Poder",
                condition: "Condição"
            };
            return typeMap[type] || type;
        };

        const data = {
            name: item.name,
            type: getTypeName(item.type),
            system: item.system
        };

        let mechanicalTagsHtml = '';
        const s = data.system;
        const createTag = (label, value) => {
            if (value !== null && value !== undefined && value !== '' && value.toString().trim() !== '') {
                return `<div class="property-tag"><label>${label}</label><span>${value}</span></div>`;
            }
            return '';
        };

        switch (item.type) {
            case 'spell':
                mechanicalTagsHtml += createTag('Tempo', s.casting_time);
                mechanicalTagsHtml += createTag('Duração', s.duration);
                mechanicalTagsHtml += createTag('Custo', `${s.mana_cost || '0'} / ${s.mana_maint || '0'}`);
                break;
            case 'advantage':
                mechanicalTagsHtml += createTag('Pontos', s.points);
                break;
        }

        const description = await TextEditor.enrichHTML(item.system.chat_description || item.system.description || "<i>Sem descrição.</i>", {
            secrets: this.actor.isOwner,
            async: true
        });
        
        const content = `
            <div class="gurps-dialog-canvas">
                <div class="gurps-item-preview-card" data-item-id="${item.id}">
                    <header class="preview-header">
                        <h3>${data.name}</h3>
                        <div class="header-controls">
                            <span class="preview-item-type">${data.type}</span>
                            <a class="send-to-chat" title="Enviar para o Chat"><i class="fas fa-comment"></i></a>
                        </div>
                    </header>
                    <div class="preview-content">
                        <div class="preview-properties">
                            ${createTag('Pontos', s.points)}
                            ${createTag('Custo', s.total_cost ? `$${s.total_cost}`: null)}
                            ${createTag('Peso', s.total_weight ? `${s.total_weight} kg`: null)}
                            ${mechanicalTagsHtml}
                        </div>
                        ${description && description.trim() !== "<i>Sem descrição.</i>" ? '<hr class="preview-divider">' : ''}
                        <div class="preview-description">${description}</div>
                    </div>
                </div>
            </div>
        `;

        new Dialog({
            content: content,
            buttons: { close: { icon: '<i class="fas fa-times"></i>', label: "Fechar" } },
            default: "close",
            options: { classes: ["dialog", "gurps-item-preview-dialog"], width: 400, height: "auto" },
            render: (html) => {
                html.find('.send-to-chat').on('click', (event) => {
                    const cardHTML = $(event.currentTarget).closest('.gurps-item-preview-card').html();
                    const chatDataType = getTypeName(item.type);
                    const chatContent = `<div class="gurps-item-preview-card chat-card">${cardHTML.replace(/<div class="header-controls">.*?<\/div>/s, `<span class="preview-item-type">${chatDataType}</span>`)}</div>`;
                    ChatMessage.create({
                        user: game.user.id,
                        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                        content: chatContent
                    });
                });
            }
        }).render(true);
    });


    html.on('click', '.item-quick-view', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const itemId = $(ev.currentTarget).closest('.item').data('itemId');
        if (!itemId) return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        const getTypeName = (type) => {
            const typeMap = {
                equipment: "Equipamento", melee_weapon: "Arma C. a C.",
                ranged_weapon: "Arma à Dist.", armor: "Armadura",
                advantage: "Vantagem", disadvantage: "Desvantagem",
                skill: "Perícia", spell: "Magia", power: "Poder"
            };
            return typeMap[type] || type;
        };

        const data = {
            name: item.name,
            type: getTypeName(item.type),
            system: item.system
        };

        let mechanicalTagsHtml = '';
        const s = data.system;
        const createTag = (label, value) => {
            if (value !== null && value !== undefined && value !== '' && value.toString().trim() !== '') {
                return `<div class="property-tag"><label>${label}</label><span>${value}</span></div>`;
            }
            return '';
        };

        switch (item.type) {
            case 'melee_weapon':
                mechanicalTagsHtml += createTag('Dano', `${s.damage_formula || ''} ${s.damage_type || ''}`);
                mechanicalTagsHtml += createTag('Alcance', s.reach);
                mechanicalTagsHtml += createTag('Aparar', s.parry);
                mechanicalTagsHtml += createTag('ST', s.min_strength);
                break;
            case 'ranged_weapon':
                mechanicalTagsHtml += createTag('Dano', `${s.damage_formula || ''} ${s.damage_type || ''}`);
                mechanicalTagsHtml += createTag('Prec.', s.accuracy);
                mechanicalTagsHtml += createTag('Alcance', s.range);
                mechanicalTagsHtml += createTag('CdT', s.rof);
                mechanicalTagsHtml += createTag('Tiros', s.shots);
                mechanicalTagsHtml += createTag('RCO', s.rcl);
                mechanicalTagsHtml += createTag('ST', s.min_strength);
                break;
            case 'armor':
                mechanicalTagsHtml += createTag('RD', s.dr);
                mechanicalTagsHtml += createTag('Local', `<span class="capitalize">${s.worn_location || 'N/A'}</span>`);
                break;
            case 'skill':
                mechanicalTagsHtml += createTag('Attr.', `<span class="uppercase">${s.base_attribute || '--'}</span>`);
                mechanicalTagsHtml += createTag('Nível', `${s.skill_level > 0 ? '+' : ''}${s.skill_level || '0'}`);
                mechanicalTagsHtml += createTag('Grupo', s.group);
                break;
            case 'spell':
                mechanicalTagsHtml += createTag('Classe', s.spell_class);
                mechanicalTagsHtml += createTag('Tempo', s.casting_time);
                mechanicalTagsHtml += createTag('Duração', s.duration);
                mechanicalTagsHtml += createTag('Custo', `${s.mana_cost || '0'} / ${s.mana_maint || '0'}`);
                break;
        }

        const description = await TextEditor.enrichHTML(item.system.chat_description || item.system.description || "<i>Sem descrição.</i>", {
            secrets: this.actor.isOwner,
            async: true
        });
        
        const content = `
            <div class="gurps-dialog-canvas">
                <div class="gurps-item-preview-card" data-item-id="${item.id}">
                    <header class="preview-header">
                        <h3>${data.name}</h3>
                        <div class="header-controls">
                            <span class="preview-item-type">${data.type}</span>
                            <a class="send-to-chat" title="Enviar para o Chat"><i class="fas fa-comment"></i></a>
                        </div>
                    </header>
                    
                    <div class="preview-content">
                        <div class="preview-properties">
                            ${createTag('Pontos', s.points)}
                            ${createTag('Custo', s.total_cost ? `$${s.total_cost}`: null)}
                            ${createTag('Peso', s.total_weight ? `${s.total_weight} kg`: null)}
                            ${mechanicalTagsHtml}
                        </div>

                        ${description && description.trim() !== "<i>Sem descrição.</i>" ? '<hr class="preview-divider">' : ''}

                        <div class="preview-description">
                            ${description}
                        </div>
                    </div>
                </div>
            </div>
        `;

        new Dialog({
            content: content,
            buttons: { close: { icon: '<i class="fas fa-times"></i>', label: "Fechar" } },
            default: "close",
            options: { classes: ["dialog", "gurps-item-preview-dialog"], width: 400, height: "auto" },
            render: (html) => {
                html.on('click', '.send-to-chat', (event) => {
                    event.preventDefault();
                    const card = $(event.currentTarget).closest('.gurps-item-preview-card');
                    const chatItemId = card.data('itemId');
                    const chatItem = this.actor.items.get(chatItemId);
                    if (chatItem) {
                        const cardHTML = card.html();
                        const chatDataType = getTypeName(chatItem.type);
                        const chatContent = `<div class="gurps-item-preview-card chat-card">${cardHTML.replace(/<div class="header-controls">.*?<\/div>/s, `<span class="preview-item-type">${chatDataType}</span>`)}</div>`;
                        ChatMessage.create({
                            user: game.user.id,
                            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                            content: chatContent
                        });
                    }
                });
            }
        }).render(true);
    });
        
html.on('click', '.edit-basic-damage', ev => {
        ev.preventDefault();
        ev.stopPropagation(); 
        const attrs = this.actor.system.attributes;

        // ✅ MUDANÇA: HTML super simples com uma nova classe
        const content = `
            <form class="simple-form-dialog">
                <div class="form-group">
                    <label>Dano de GdP (Thrust)</label>
                    <input type="text" name="formula_thrust" value="${attrs.thrust_damage}" />
                </div>
                <div class="form-group">
                    <label>Dano de GeB (Swing)</label>
                    <input type="text" name="formula_swing" value="${attrs.swing_damage}" />
                </div>
            </form>
        `;

        new Dialog({
            title: `Editar Dano Básico (GdP & GeB)`,
            content: content,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar",
                    callback: (html) => {
                        const newThrust = html.find('input[name="formula_thrust"]').val();
                        const newSwing = html.find('input[name="formula_swing"]').val();
                        this.actor.update({ 
                            "system.attributes.thrust_damage": newThrust,
                            "system.attributes.swing_damage": newSwing 
                        });
                    }
                }
            },
            default: "save",
            // ✅ MUDANÇA: Usando a classe .gurps-dialog, mas NÃO a .gurps-stat-editor-dialog
            options: {
                classes: ["dialog", "gum", "gurps-dialog"],
                width: 300 // Tamanho menor e mais objetivo
            }
        }).render(true);
    });

    html.on('click', '.collapsible-header', ev => {
        const header = $(ev.currentTarget);
        const parentBlock = header.closest('.collapsible-block');
        parentBlock.toggleClass('active');
        this._survivalBlockOpen = parentBlock.hasClass('active');
    });

    html.on('click', '.vitals-tracker .tracker-dot', async ev => {
        ev.preventDefault();
        const dot = $(ev.currentTarget);
        const tracker = dot.closest('.vitals-tracker');

        const statName = tracker.data('stat');
        if (!statName) return;

        const value = dot.data('value');
        const currentValue = this.actor.system.attributes[statName]?.value || 0;
        const newValue = (currentValue === value) ? 0 : value;

        const updatePath = `system.attributes.${statName}.value`;
        await this.actor.update({ [updatePath]: newValue });
    });
        
    html.on('click', '.edit-biography-details', ev => {
        ev.preventDefault();
        const details = this.actor.system.details;

        const content = `
            <form>
                <div class="details-dialog-grid">
                    <div class="form-group"><label>Gênero</label><input type="text" name="gender" value="${details.gender || ''}"/></div>
                    <div class="form-group"><label>Idade</label><input type="text" name="age" value="${details.age || ''}"/></div>
                    <div class="form-group"><label>Altura</label><input type="text" name="height" value="${details.height || ''}"/></div>
                    <div class="form-group"><label>Peso</label><input type="text" name="weight" value="${details.weight || ''}"/></div>
                    <div class="form-group"><label>Pele</label><input type="text" name="skin" value="${details.skin || ''}"/></div>
                    <div class="form-group"><label>Cabelos</label><input type="text" name="hair" value="${details.hair || ''}"/></div>
                    <div class="form-group full-width"><label>Olhos</label><input type="text" name="eyes" value="${details.eyes || ''}"/></div>
                    <div class="form-group full-width"><label>Alinhamento</label><input type="text" name="alignment" value="${details.alignment || ''}"/></div>
                    <div class="form-group full-width"><label>Crença / Fé</label><input type="text" name="belief" value="${details.belief || ''}"/></div>
                </div>
            </form>
        `;

        new Dialog({
            title: "Editar Perfil do Personagem",
            content: content,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar",
                    callback: (html) => {
                        const newData = {
                            gender: html.find('[name="gender"]').val(),
                            age: html.find('[name="age"]').val(),
                            height: html.find('[name="height"]').val(),
                            weight: html.find('[name="weight"]').val(),
                            skin: html.find('[name="skin"]').val(),
                            hair: html.find('[name_config"hair"]').val(),
                            eyes: html.find('[name="eyes"]').val(),
                            alignment: html.find('[name="alignment"]').val(),
                            belief: html.find('[name="belief"]').val(),
                            concept: this.actor.system.details.concept,
                            backstory: this.actor.system.details.backstory
                        };
                        
                        this.actor.update({ "system.details": newData });
                    }
                }
            },
            default: 'save'
        }).render(true);
    });
        
    // (Este listener de .reserve-card está quebrado, mas não tem problema por agora)
    html.on('change', '.reserve-card input[type="number"]', ev => {
        const input = ev.currentTarget;
        const reserveCard = input.closest('.reserve-card'); 
        const reserveId = reserveCard.dataset.reserveId;    
        const property = input.dataset.property;            

        if (!reserveId || !property) {
            console.error("GUM | Não foi possível salvar a reserva de energia. Atributos faltando.");
            return;
        }
        const value = Number(input.value);
        // const key = `system.energy_reserves.${reserveId}.${property}`; // Caminho antigo e quebrado
        // this.actor.update({ [key]: value });
    });


    html.on('click', '.sort-control', ev => {
            ev.preventDefault();
            const button = ev.currentTarget;
            const itemType = button.dataset.itemType;
            const location = button.dataset.location; 

            if (!itemType) return;

            const sortOptions = {
                spell: { manual: "Manual", name: "Nome (A-Z)", spell_school: "Escola" },
                power: { manual: "Manual", name: "Nome (A-Z)" },
                equipment: { manual: "Manual", name: "Nome (A-Z)", weight: "Peso", cost: "Custo" },
                skill: { manual: "Manual", name: "Nome (A-Z)", group: "Grupo (A-Z)" },
                characteristic: { manual: "Manual", name: "Nome (A-Z)", points: "Pontos" }
            };

            const options = sortOptions[itemType];
            if (!options) return;

            const currentSort = location 
                ? this.actor.system.sorting?.[itemType]?.[location] || 'manual'
                : this.actor.system.sorting?.[itemType] || 'manual';

            let content = '<form class="sort-dialog"><p>Ordenar por:</p>';
            for (const [key, label] of Object.entries(options)) {
                const isChecked = key === currentSort ? "checked" : "";
                content += `
                    <div class="form-group">
                        <label for="${key}">${label}</label>
                        <input type="radio" name="sort-option" value="${key}" id="${key}" ${isChecked}>
                    </div>
                `;
            }
            content += '</form>';

            new Dialog({
                title: "Opções de Ordenação",
                content: content,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: "Aplicar",
                        callback: (html) => {
                            const selectedValue = html.find('input[name="sort-option"]:checked').val();
                            const updatePath = location 
                                ? `system.sorting.${itemType}.${location}` 
                                : `system.sorting.${itemType}`;
                            this.actor.update({ [updatePath]: selectedValue });
                        }
                    }
                },
                default: 'save'
            }).render(true);
        });

    // ================================================================== //
    //     DRAG & DROP DE ITENS (O IMPORTANTE) - ESTE ESTÁ CORRETO      //
    // ================================================================== //

    html.on('dragstart', 'li.item[draggable="true"]', ev => {
        const li = ev.currentTarget;
        const dragData = {
        type: "Item",
        actorId: this.actor.id,
        uuid: this.actor.items.get(li.dataset.itemId)?.uuid
        };
        if (!dragData.uuid) return;
        ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    });

    html.on('dragover', '.item-list', ev => {
        ev.preventDefault();
    });

    html.on('drop', '.item-list', async ev => {
        ev.preventDefault();
        const data = JSON.parse(ev.originalEvent.dataTransfer.getData("text/plain"));
        if (data.type !== "Item" || !data.uuid) return;

        const draggedItem = await fromUuid(data.uuid);
        if (!draggedItem || draggedItem.actor.id !== this.actor.id) return;

        const dropContainer = ev.currentTarget;
        const dropTarget = ev.target.closest('.item');
        let siblings = [];
        let updatePayload = {};

        const blockContainer = dropContainer.closest('[data-block-id]');
        const equipmentLocation = dropContainer.dataset.location;
        const itemType = dropContainer.dataset.itemType;
        const skillGroup = dropContainer.closest('.skill-group')?.dataset.groupName; 

        if (blockContainer) {
        const itemTypesInBlocks = ['skill', 'advantage', 'disadvantage'];
        if (itemTypesInBlocks.includes(draggedItem.type)) {
            const targetBlockId = blockContainer.dataset.blockId;
            siblings = this.actor.items
            .filter(i => itemTypesInBlocks.includes(i.type) && i.system.block_id === targetBlockId)
            .sort((a, b) => a.sort - b.sort);
            updatePayload['system.block_id'] = targetBlockId;
        }
        }
        else if (skillGroup && draggedItem.type === 'skill') {
            siblings = this.actor.items.filter(i => i.type === 'skill' && (i.system.group || 'Geral') === skillGroup);
            updatePayload['system.group'] = skillGroup;
        }
        else if (equipmentLocation) {
        const equipmentTypes = ['equipment', 'melee_weapon', 'ranged_weapon', 'armor'];
        if (equipmentTypes.includes(draggedItem.type)) {
            siblings = this.actor.items
                .filter(i => equipmentTypes.includes(i.type) && i.system.location === equipmentLocation)
                .sort((a, b) => a.sort - b.sort);
            updatePayload['system.location'] = equipmentLocation;
        }
        }
        else if (itemType && draggedItem.type === itemType) {
            siblings = this.actor.items
                .filter(i => i.type === itemType)
                .sort((a, b) => a.sort - b.sort);
        }

        if (siblings.length > 0) {
            siblings.sort((a, b) => a.sort - b.sort);
        }

        let newSort = 0;
        if (dropTarget) {
            const targetItem = this.actor.items.get(dropTarget.dataset.itemId);
            if (!targetItem || targetItem.id === draggedItem.id) return;

            const targetIndex = siblings.findIndex(s => s.id === targetItem.id);
            const targetBoundingRect = dropTarget.getBoundingClientRect();
            const dropInTopHalf = ev.clientY < (targetBoundingRect.top + targetBoundingRect.height / 2);

            if (dropInTopHalf) {
                const prevSibling = siblings[targetIndex - 1];
                newSort = (targetItem.sort + (prevSibling ? prevSibling.sort : 0)) / 2;
            } else {
                const nextSibling = siblings[targetIndex + 1];
                newSort = (targetItem.sort + (nextSibling ? nextSibling.sort : targetItem.sort + 2000)) / 2;
            }
        } else {
            newSort = (siblings.pop()?.sort || 0) + 1000;
        }

        updatePayload['sort'] = newSort;
        await draggedItem.update(updatePayload);
    });

    html.find('.add-combat-meter').click(ev => { const newMeter = { name: "Novo Registro", current: 10, max: 10 }; const newKey = `system.combat.combat_meters.${foundry.utils.randomID()}`; this.actor.update({ [newKey]: newMeter }); });
    
    html.find('.edit-casting-ability').click(ev => { const ability = this.actor.system.casting_ability; new Dialog({ title: "Editar Habilidade de Conjuração", content: `<div class="form-group"><label>Nome:</label><input type="text" name="name" value="${ability.name}"/></div><div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${ability.points}"/></div><div class="form-group"><label>Nível:</label><input type="number" name="level" value="${ability.level}"/></div><div class="form-group"><label>Fonte:</label><input type="text" name="source" value="${ability.source}"/></div><div class="form-group"><label>Descrição:</label><textarea name="description">${ability.description}</textarea></div>`, buttons: { save: { icon: '<i class="fas fa-save"></i>', label: "Salvar", callback: (html) => { const newData = { name: html.find('input[name="name"]').val(), points: parseInt(html.find('input[name="points"]').val()), level: parseInt(html.find('input[name="level"]').val()), source: html.find('input[name="source"]').val(), description: html.find('textarea[name="description"]').val() }; this.actor.update({ "system.casting_ability": newData }); } } }, default: "save" }).render(true); });
    html.find('.edit-power-source').click(ev => { const power = this.actor.system.power_source; new Dialog({ title: "Editar Fonte de Poder", content: `<div class="form-group"><label>Nome:</label><input type="text" name="name" value="${power.name}"/></div><div class="form-group"><label>Nível:</label><input type="number" name="level" value="${power.level}"/></div><div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${power.points}"/></div><div class="form-group"><label>Fonte:</label><input type="text" name="source" value="${power.source}"/></div><div class="form-group"><label>Talento de Poder:</label><input type="number" name="power_talent" value="${power.power_talent}"/></div><div class="form-group"><label>Descrição:</label><textarea name="description">${power.description}</textarea></div>`, buttons: { save: { icon: '<i class="fas fa-save"></i>', label: "Salvar", callback: (html) => { const newData = { name: html.find('input[name="name"]').val(), level: parseInt(html.find('input[name="level"]').val()), points: parseInt(html.find('input[name="points"]').val()), source: html.find('input[name="source"]').val(), power_talent: parseInt(html.find('input[name="power_talent"]').val()), description: html.find('textarea[name="description"]').val() }; this.actor.update({ "system.power_source": newData }); } } }, default: "save" }).render(true); });
    
    html.find('.edit-lifting-st').click(ev => {
    new Dialog({
        title: "Editar ST de Carga",
        content: `
            <div class="gurps-stat-editor-dialog">
                <p class="dialog-description">
                    Insira o valor usado para calcular a sua Base de Carga (BC).
                </p>
                <div class="form-group">
                    <label>ST de Carga</label>
                    <input type="number" name="lifting-st" value="${this.actor.system.attributes.lifting_st.value}" />
                </div>
            </div>
        `,
        buttons: {
            save: {
                icon: '<i class="fas fa-save"></i>',
                label: "Salvar",
                callback: (html) => {
                    const newST = html.find('input[name="lifting-st"]').val();
                    this.actor.update({ "system.attributes.lifting_st.value": newST });
                }
            }
        },
        options: {
            classes: ["dialog", "gurps-dialog"],
            width: 350
        }
    }).render(true);
});

    // --- Listeners para elementos dinâmicos (dentro de listas) ---
html.on('click', '.item-edit', ev => {
    const button = $(ev.currentTarget);
    
    // 1. Tenta pegar o ID do próprio botão (para a engrenagem do ataque)
    let itemId = button.data("item-id"); 

    if (!itemId) {
        // 2. Se não encontrar, procura no 'li.item' pai (para magias, vantagens, etc.)
        itemId = button.closest('.item').data("itemId");
    }
    
    if (!itemId) {
         console.error("GUM | .item-edit clicado, mas nenhum itemId encontrado.");
         return; 
    }

    const item = this.actor.items.get(itemId);
    if (item) {
        item.sheet.render(true); // Abre a ficha do item
    }
});
 html.on('click', '.item-delete', ev => { const li = $(ev.currentTarget).parents(".item"); this.actor.deleteEmbeddedDocuments("Item", [li.data("itemId")]); });
    
    // (O resto dos seus listeners .add-social-item, .edit-social-entry, etc. estão todos aqui e parecem corretos)
    // ... (Seu código dos listeners sociais) ...
    // (O código continua até o final do seu arquivo)
    
        html.on('click', '.add-social-item', ev => {
          ev.preventDefault();
          const button = ev.currentTarget;
          const itemType = button.dataset.type;
          const typeName = button.dataset.typeName || "Entrada";

          // Abre um diálogo para pedir o nome do novo item
          new Dialog({
            title: `Nova ${typeName}`,
            content: `<div class="form-group"><label>Nome:</label><input type="text" name="name" placeholder="Ex: Nobreza, Guilda dos Ladrões"/></div>`,
            buttons: {
              create: {
                icon: '<i class="fas fa-check"></i>',
                label: "Criar",
                callback: (html) => {
                  const name = html.find('input[name="name"]').val();
                  if (name) {
                    Item.create({ name: name, type: itemType }, { parent: this.actor });
                  }
                }
              }
            },
            default: "create"
          }).render(true);
        });

        html.on('click', '.add-social-entry[data-type="status"]', ev => {
          ev.preventDefault();
          
          // Cria a caixa de diálogo para preencher as informações
          new Dialog({
            title: "Adicionar Novo Status Social",
            content: `
              <div class="form-group"><label>Sociedade:</label><input type="text" name="society" placeholder="Ex: Imperial"/></div>
              <div class="form-group"><label>Status:</label><input type="text" name="status_name" placeholder="Ex: Escravo, Cidadão Comum, Barão "/></div>
              <div class="form-group"><label>Nível:</label><input type="number" name="level" value="0"/></div>
              <div class="form-group"><label>Custo de Vida Mensal:</label><input type="text" name="monthly_cost" value="$0"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="0"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description"></textarea></div>
            `,
            buttons: {
              save: {
                icon: '<i class="fas fa-check"></i>',
                label: 'Criar',
                callback: (html) => {
                  const newEntry = {
                    society: html.find('[name="society"]').val(),
                    status_name: html.find('[name="status_name"]').val(),
                    level: parseInt(html.find('[name="level"]').val()),
                    monthly_cost: html.find('[name="monthly_cost"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  const newKey = `system.social_status_entries.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: newEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para o ícone de EDITAR uma entrada de Status Social
        html.on('click', '.edit-social-entry[data-type="status"]', ev => {
          ev.preventDefault();
          const li = $(ev.currentTarget).closest(".item");
          const entryId = li.data("entryId");
          const entry = this.actor.system.social_status_entries[entryId];

          new Dialog({
            title: `Editar Status: ${entry.status_name}`,
            content: `
              <div class="form-group"><label>Sociedade:</label><input type="text" name="society" value="${entry.society}"/></div>
              <div class="form-group"><label>Status:</label><input type="text" name="status_name" value="${entry.status_name}"/></div>
              <div class="form-group"><label>Nível:</label><input type="number" name="level" value="${entry.level}"/></div>
              <div class="form-group"><label>Custo de Vida Mensal:</label><input type="text" name="monthly_cost" value="-$0"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${entry.points}"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description">${entry.description}</textarea></div>
            `,
            buttons: {
              save: {
                icon: '<i class="fas fa-save"></i>',
                label: 'Salvar',
                callback: (html) => {
                  const updateKey = `system.social_status_entries.${entryId}`;
                  const updatedEntry = {
                    society: html.find('[name="society"]').val(),
                    status_name: html.find('[name="status_name"]').val(),
                    level: parseInt(html.find('[name="level"]').val()),
                    monthly_cost: html.find('[name="monthly_cost"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  this.actor.update({ [updateKey]: updatedEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        html.on('click', '.add-social-entry[data-type="organization"]', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Adicionar Nova Organização",
            content: `
              <div class="form-group"><label>Organização:</label><input type="text" name="organization_name" placeholder="Ex: Guilda dos Ladrões"/></div>
              <div class="form-group"><label>Cargo:</label><input type="text" name="status_name" placeholder="Ex: Membro, Líder"/></div>
              <div class="form-group"><label>Nível:</label><input type="number" name="level" value="0"/></div>
              <div class="form-group"><label>Salário:</label><input type="text" name="salary" value="$0"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="0"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description"></textarea></div>
            `,
            buttons: {
              save: {
                icon: '<i class="fas fa-check"></i>', label: 'Criar',
                callback: (html) => {
                  const newEntry = {
                    organization_name: html.find('[name="organization_name"]').val(),
                    status_name: html.find('[name="status_name"]').val(),
                    level: parseInt(html.find('[name="level"]').val()),
                    salary: html.find('[name="salary"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  const newKey = `system.organization_entries.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: newEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para o ícone de EDITAR uma entrada de Organização
        html.on('click', '.edit-social-entry[data-type="organization"]', ev => {
          ev.preventDefault();
          const li = $(ev.currentTarget).closest(".item");
          const entryId = li.data("entryId");
          const entry = this.actor.system.organization_entries[entryId];
          new Dialog({
            title: `Editar Organização: ${entry.organization_name}`,
            content: `
              <div class="form-group"><label>Organização:</label><input type="text" name="organization_name" value="${entry.organization_name}"/></div>
              <div class="form-group"><label>Status/Cargo:</label><input type="text" name="status_name" value="${entry.status_name}"/></div>
              <div class="form-group"><label>Nível:</label><input type="number" name="level" value="${entry.level}"/></div>
              <div class="form-group"><label>Salário:</label><input type="text" name="salary" value="${entry.salary}"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${entry.points}"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description">${entry.description}</textarea></div>
            `,
            buttons: {
              save: {
                icon: '<i class="fas fa-save"></i>', label: 'Salvar',
                callback: (html) => {
                  const updateKey = `system.organization_entries.${entryId}`;
                  const updatedEntry = {
                    organization_name: html.find('[name="organization_name"]').val(),
                    status_name: html.find('[name="status_name"]').val(),
                    level: parseInt(html.find('[name="level"]').val()),
                    salary: html.find('[name="salary"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  this.actor.update({ [updateKey]: updatedEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para o ícone de DELETAR uma entrada de Organização
        html.on('click', '.delete-social-entry[data-type="organization"]', ev => {
            ev.preventDefault();
            const li = $(ev.currentTarget).closest(".item");
            const entryId = li.data("entryId");
            const entry = this.actor.system.organization_entries[entryId];
            Dialog.confirm({
                title: "Deletar Entrada de Organização",
                content: `<p>Você tem certeza que quer deletar <strong>${entry.organization_name}</strong>?</p>`,
                yes: () => {
                    const deleteKey = `system.organization_entries.-=${entryId}`;
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        html.on('click', '.add-social-entry[data-type="culture"]', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Adicionar Nova Cultura",
            content: `
              <div class="form-group"><label>Cultura:</label><input type="text" name="culture_name" placeholder="Ex: Angarana, Anã"/></div>
              <div class="form-group"><label>Nível:</label><input type="number" name="level" value="0"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="0"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description"></textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-check"></i>', label: 'Criar', callback: (html) => {
                  const newEntry = {
                    culture_name: html.find('[name="culture_name"]').val(),
                    level: parseInt(html.find('[name="level"]').val()),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  const newKey = `system.culture_entries.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: newEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para EDITAR uma entrada de Cultura
        html.on('click', '.edit-social-entry[data-type="culture"]', ev => {
          ev.preventDefault();
          const li = $(ev.currentTarget).closest(".item");
          const entryId = li.data("entryId");
          const entry = this.actor.system.culture_entries[entryId];
          new Dialog({
            title: `Editar Cultura: ${entry.culture_name}`,
            content: `
              <div class="form-group"><label>Cultura:</label><input type="text" name="culture_name" value="${entry.culture_name}"/></div>
              <div class="form-group"><label>Nível:</label><input type="number" name="level" value="${entry.level}"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${entry.points}"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description">${entry.description}</textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-save"></i>', label: 'Salvar', callback: (html) => {
                  const updateKey = `system.culture_entries.${entryId}`;
                  const updatedEntry = {
                    culture_name: html.find('[name="culture_name"]').val(),
                    level: parseInt(html.find('[name="level"]').val()),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  this.actor.update({ [updateKey]: updatedEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para DELETAR uma entrada de Cultura
        html.on('click', '.delete-social-entry[data-type="culture"]', ev => {
            ev.preventDefault();
            const li = $(ev.currentTarget).closest(".item");
            const entryId = li.data("entryId");
            const entry = this.actor.system.culture_entries[entryId];
            Dialog.confirm({
                title: "Deletar Entrada de Cultura",
                content: `<p>Você tem certeza que quer deletar <strong>${entry.culture_name}</strong>?</p>`,
                yes: () => {
                    const deleteKey = `system.culture_entries.-=${entryId}`;
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        html.on('click', '.add-social-entry[data-type="language"]', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Adicionar Novo Idioma",
            content: `
              <div class="form-group"><label>Idioma:</label><input type="text" name="language_name" placeholder="Ex: Comum, Élfico"/></div>
              <div class="form-group"><label>Nível de Escrita:</label><input type="text" name="written_level" placeholder="Ex: Nenhum, Rudimentar, Sotaque, Materna"/></div>
              <div class="form-group"><label>Nível de Fala:</label><input type="text" name="spoken_level" placeholder="Ex: Nenhum, Rudimentar, Sotaque, Materna"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="0"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description"></textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-check"></i>', label: 'Criar', callback: (html) => {
                  const newEntry = {
                    language_name: html.find('[name="language_name"]').val(),
                    written_level: html.find('[name="written_level"]').val(),
                    spoken_level: html.find('[name="spoken_level"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  const newKey = `system.language_entries.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: newEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para EDITAR uma entrada de Idioma
        html.on('click', '.edit-social-entry[data-type="language"]', ev => {
          ev.preventDefault();
          const li = $(ev.currentTarget).closest(".item");
          const entryId = li.data("entryId");
          const entry = this.actor.system.language_entries[entryId];
          new Dialog({
            title: `Editar Idioma: ${entry.language_name}`,
            content: `
              <div class="form-group"><label>Idioma: </label><input type="text" name="language_name" value="${entry.language_name}"/></div>
              <div class="form-group"><label>Nível de Escrita: </label><input type="text" name="written_level" value="${entry.written_level}"/></div>
              <div class="form-group"><label>Nível de Fala: </label><input type="text" name="spoken_level" value="${entry.spoken_level}"/></div>
              <div class="form-group"><label>Pontos: </label><input type="number" name="points" value="${entry.points}"/></div>
              <div class="form-group"><label>Descrição: </label><textarea name="description">${entry.description}</textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-save"></i>', label: 'Salvar', callback: (html) => {
                  const updateKey = `system.language_entries.${entryId}`;
                  const updatedEntry = {
                    language_name: html.find('[name="language_name"]').val(),
                    written_level: html.find('[name="written_level"]').val(),
                    spoken_level: html.find('[name="spoken_level"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  this.actor.update({ [updateKey]: updatedEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para DELETAR uma entrada de Idioma
        html.on('click', '.delete-social-entry[data-type="language"]', ev => {
            ev.preventDefault();
            const li = $(ev.currentTarget).closest(".item");
            const entryId = li.data("entryId");
            const entry = this.actor.system.language_entries[entryId];
            Dialog.confirm({
                title: "Deletar Idioma",
                content: `<p>Você tem certeza que quer deletar <strong>${entry.language_name}</strong>?</p>`,
                yes: () => {
                    const deleteKey = `system.language_entries.-=${entryId}`;
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        // Listener para ADICIONAR uma entrada de Reputação
        html.on('click', '.add-social-entry[data-type="reputation"]', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Adicionar Nova Reputação",
            content: `
              <div class="form-group"><label>Título:</label><input type="text" name="title" placeholder="Ex: Honrado, Cruel"/></div>
              <div class="form-group"><label>Modificador de Reação:</label><input type="text" name="reaction_modifier" placeholder="Ex: +2, -1"/></div>
              <div class="form-group"><label>Pessoas Afetadas:</label><input type="text" name="scope" placeholder="Ex: Toda a cidade, A Guilda"/></div>
              <div class="form-group"><label>Frequência de Reconhecimento:</label><input type="text" name="recognition_frequency" placeholder="Ex: Quase Sempre, Às vezes"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="0"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description"></textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-check"></i>', label: 'Criar', callback: (html) => {
                  const newEntry = {
                    title: html.find('[name="title"]').val(),
                    reaction_modifier: html.find('[name="reaction_modifier"]').val(),
                    scope: html.find('[name="scope"]').val(),
                    recognition_frequency: html.find('[name="recognition_frequency"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  const newKey = `system.reputation_entries.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: newEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para EDITAR uma entrada de Reputação
        html.on('click', '.edit-social-entry[data-type="reputation"]', ev => {
          ev.preventDefault();
          const li = $(ev.currentTarget).closest(".item");
          const entryId = li.data("entryId");
          const entry = this.actor.system.reputation_entries[entryId];
          new Dialog({
            title: `Editar Reputação: ${entry.title}`,
            content: `
              <div class="form-group"><label>Título: </label><input type="text" name="title" value="${entry.title}"/></div>
              <div class="form-group"><label>Modificador de Reação: </label><input type="text" name="reaction_modifier" value="${entry.reaction_modifier}"/></div>
              <div class="form-group"><label>Pessoas Afetadas: </label><input type="text" name="scope" value="${entry.scope}"/></div>
              <div class="form-group"><label>Frequência de Reconhecimento: </label><input type="text" name="recognition_frequency" value="${entry.recognition_frequency}"/></div>
              <div class="form-group"><label>Pontos: </label><input type="number" name="points" value="${entry.points}"/></div>
              <div class="form-group"><label>Descrição: </label><textarea name="description">${entry.description}</textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-save"></i>', label: 'Salvar', callback: (html) => {
                  const updateKey = `system.reputation_entries.${entryId}`;
                  const updatedEntry = {
                    title: html.find('[name="title"]').val(),
                    reaction_modifier: html.find('[name="reaction_modifier"]').val(),
                    scope: html.find('[name="scope"]').val(),
                    recognition_frequency: html.find('[name="recognition_frequency"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  this.actor.update({ [updateKey]: updatedEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para DELETAR uma entrada de Reputação
        html.on('click', '.delete-social-entry[data-type="reputation"]', ev => {
            ev.preventDefault();
            const li = $(ev.currentTarget).closest(".item");
            const entryId = li.data("entryId");
            const entry = this.actor.system.reputation_entries[entryId];
            Dialog.confirm({
                title: "Deletar Reputação",
                content: `<p>Você tem certeza que quer deletar a reputação "<strong>${entry.title}</strong>"?</p>`,
                yes: () => {
                    const deleteKey = `system.reputation_entries.-=${entryId}`;
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        html.on('click', '.add-social-entry[data-type="wealth"]', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Adicionar Nível de Riqueza",
            content: `
              <div class="form-group"><label>Nível de Riqueza: </label><input type="text" name="wealth_level" placeholder="Ex: Pobre, Confortável, Dívida"/></div>
              <div class="form-group"><label>Efeitos: </label><input type="text" name="effects" placeholder="Ex: Recursos Iniciais (RI) x 2 = $2000"/></div>
              <div class="form-group"><label>Pontos: </label><input type="number" name="points" value="0"/></div>
              <div class="form-group"><label>Descrição: </label><textarea name="description"></textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-check"></i>', label: 'Criar', callback: (html) => {
                  const newEntry = {
                    wealth_level: html.find('[name="wealth_level"]').val(),
                    effects: html.find('[name="effects"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  const newKey = `system.wealth_entries.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: newEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para EDITAR uma entrada de Riqueza
        html.on('click', '.edit-social-entry[data-type="wealth"]', ev => {
          ev.preventDefault();
          const li = $(ev.currentTarget).closest(".item");
          const entryId = li.data("entryId");
          const entry = this.actor.system.wealth_entries[entryId];
          new Dialog({
            title: `Editar Riqueza: ${entry.wealth_level}`,
            content: `
              <div class="form-group"><label>Nível de Riqueza:</label><input type="text" name="wealth_level" value="${entry.wealth_level}"/></div>
              <div class="form-group"><label>Efeitos:</label><input type="text" name="effects" value="${entry.effects}"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${entry.points}"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description">${entry.description}</textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-save"></i>', label: 'Salvar', callback: (html) => {
                  const updateKey = `system.wealth_entries.${entryId}`;
                  const updatedEntry = {
                    wealth_level: html.find('[name="wealth_level"]').val(),
                    effects: html.find('[name="effects"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  this.actor.update({ [updateKey]: updatedEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para DELETAR uma entrada de Riqueza
        html.on('click', '.delete-social-entry[data-type="wealth"]', ev => {
            ev.preventDefault();
            const li = $(ev.currentTarget).closest(".item");
            const entryId = li.data("entryId");
            const entry = this.actor.system.wealth_entries[entryId];
            Dialog.confirm({
                title: "Deletar Nível de Riqueza",
                content: `<p>Você tem certeza que quer deletar <strong>${entry.wealth_level}</strong>?</p>`,
                yes: () => {
                    const deleteKey = `system.wealth_entries.-=${entryId}`;
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        // Listener para ADICIONAR uma entrada de Vínculo
        html.on('click', '.add-social-entry[data-type="bond"]', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Adicionar Novo Vínculo",
            content: `
              <div class="form-group"><label>Nome:</label><input type="text" name="name" placeholder="Ex: taverneiro, a cidade de ..."/></div>
              <div class="form-group"><label>Vínculo:</label><input type="text" name="bond_type" placeholder="Ex: Aliado, Inimigo, Informante, Devedor, Cobrador"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="0"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description" rows="4"></textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-check"></i>', label: 'Criar', callback: (html) => {
                  const newEntry = {
                    name: html.find('[name="name"]').val(),
                    bond_type: html.find('[name="bond_type"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  const newKey = `system.bond_entries.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: newEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para EDITAR uma entrada de Vínculo
        html.on('click', '.edit-social-entry[data-type="bond"]', ev => {
          ev.preventDefault();
          const li = $(ev.currentTarget).closest(".item");
          const entryId = li.data("entryId");
          // CORREÇÃO DE BUG: Você estava lendo 'wealth_entries' aqui
          const entry = this.actor.system.bond_entries[entryId]; // CORRIGIDO
          new Dialog({
            title: `Editar Vínculo: ${entry.name}`, // CORRIGIDO
            content: `
              <div class="form-group"><label>Nome:</label><input type="text" name="name" value="${entry.name}"/></div>
              <div class="form-group"><label>Vínculo:</label><input type="text" name="bond_type" value="${entry.bond_type}"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${entry.points}"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description" rows="4">${entry.description}</textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-save"></i>', label: 'Salvar', callback: (html) => {
                  const updateKey = `system.bond_entries.${entryId}`; // CORRIGIDO
                  const updatedEntry = {
                    name: html.find('[name="name"]').val(), // CORRIGIDO
                    bond_type: html.find('[name="bond_type"]').val(), // CORRIGIDO
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  this.actor.update({ [updateKey]: updatedEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para DELETAR uma entrada de Vínculo
        html.on('click', '.delete-social-entry[data-type="bond"]', ev => {
          ev.preventDefault();
            const li = $(ev.currentTarget).closest(".item");
            const entryId = li.data("entryId");
            // CORREÇÃO DE BUG: Você estava lendo 'wealth_entries' aqui
            const entry = this.actor.system.bond_entries[entryId]; // CORRIGIDO
            Dialog.confirm({
                title: "Deletar Vínculo", // CORRIGIDO
                content: `<p>Você tem certeza que quer deletar <strong>${entry.name}</strong>?</p>`, // CORRIGIDO
                yes: () => {
                    const deleteKey = `system.bond_entries.-=${entryId}`; // CORRIGIDO
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        // Listener para o ícone de DELETAR uma entrada de Status Social
        html.on('click', '.delete-social-entry[data-type="status"]', ev => {
            ev.preventDefault();
            const li = $(ev.currentTarget).closest(".item");
            const entryId = li.data("entryId");
            const entry = this.actor.system.social_status_entries[entryId];

            Dialog.confirm({
                title: "Deletar Status Social",
                content: `<p>Você tem certeza que quer deletar <strong>${entry.status_name}</strong>?</p>`,
                yes: () => {
                    const deleteKey = `system.social_status_entries.-=${entryId}`;
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        /* ========== LISTENERS PARA ICONE MUDANÇA DE EQUIPAMENTO ==============*/
    // --- LÓGICA UNIFICADA DE MENUS CUSTOMIZADOS ---
        const customMenu = this.element.find(".custom-context-menu");

        // Listener para o ícone de MOVER EQUIPAMENTO
    html.on('click', '.equipment-options-btn', ev => {
            ev.preventDefault();
            ev.stopPropagation();

            const button = $(ev.currentTarget);
            const li = button.closest('.item');
            const itemId = li.data('itemId');
            const item = this.actor.items.get(itemId);
            if (!item) return;
            
            // Define as opções do submenu "Mover Para"
            // (Estas ações 'update-location' já são tratadas pelo seu listener de menu existente)
            const moveSubmenu = `
                <div class="context-item" data-action="update-location" data-value="equipped">
                    <i class="fas fa-user-shield"></i> Em Uso
                </div>
                <div class="context-item" data-action="update-location" data-value="carried">
                    <i class="fas fa-shopping-bag"></i> Carregado
                </div>
                <div class="context-item" data-action="update-location" data-value="stored">
                    <i class="fas fa-archive"></i> Armazenado
                </div>
            `;

            // Define o menu principal
            const menuContent = `
                <div class="context-item" data-action="edit"><i class="fas fa-edit"></i> Editar Item</div>
                <div class="context-item" data-action="delete"><i class="fas fa-trash"></i> Deletar Item</div>
                <div class="context-divider"></div>
                <div class="context-submenu">
                    <div class="context-item"><i class="fas fa-exchange-alt"></i> Mover Para</div>
                    <div class="submenu-items">${moveSubmenu}</div>
                </div>
            `;

            // Pega o menu, injeta o HTML, armazena o ID do item e exibe
            const customMenu = this.element.find(".custom-context-menu");
            customMenu.html(menuContent);
            customMenu.data("itemId", itemId); // Armazena o ID do item no menu
            
            // Copia a lógica de posicionamento do menu de perícias
            customMenu.css({ display: "block", left: ev.clientX - 210 + "px", top: ev.clientY - 10 + "px" });
        });
    // ================================================================== //
    //    LISTENER PARA O NOVO MENU DE OPÇÕES DA PERÍCIA                  //
    // ================================================================== //
    html.on('click', '.item-options-btn', ev => {
        ev.preventDefault();
        ev.stopPropagation();

        const button = $(ev.currentTarget);
        const li = button.closest('.item');
        const itemId = li.data('itemId');
        const skill = this.actor.items.get(itemId);
        if (!skill) return;
        
        const skillBlocks = this.actor.system.skill_blocks || {};
        let moveSubmenu = '';
        for (const [blockId, blockData] of Object.entries(skillBlocks)) {
            moveSubmenu += `<div class="context-item" data-action="update-skill-block" data-value="${blockId}"><i class="fas fa-folder"></i> ${blockData.name}</div>`;
        }

        const menuContent = `
            <div class="context-item" data-action="edit"><i class="fas fa-edit"></i> Editar Perícia</div>
            <div class="context-item" data-action="delete"><i class="fas fa-trash"></i> Deletar Perícia</div>
            <div class="context-divider"></div>
            <div class="context-submenu">
                <div class="context-item"><i class="fas fa-folder-open"></i> Mover Para</div>
                <div class="submenu-items">${moveSubmenu}</div>
            </div>
        `;

        const customMenu = this.element.find(".custom-context-menu");
        customMenu.html(menuContent);
        customMenu.data("item-id", itemId); 
        customMenu.css({ display: "block", left: ev.clientX - 210 + "px", top: ev.clientY - 10 + "px" });
    });

    // Listener para as ações DENTRO do menu (ESTE ESTÁ DUPLICADO, VAMOS REMOVER UM)
       html.on('click', '.custom-context-menu .context-item', async ev => {
        const button = ev.currentTarget;
        const customMenu = this.element.find(".custom-context-menu");
        const itemId = customMenu.data("itemId");
        const action = $(button).data("action");
        const value = $(button).data("value");

        if (itemId) {
            const item = this.actor.items.get(itemId);
            if (!item) return;

            switch(action) {
                case 'edit':
                    item.sheet.render(true);
                    break;
                case 'delete':
                    await Dialog.confirm({
                        title: `Deletar ${item.type}`,
                        content: `<p>Você tem certeza que quer deletar <strong>${item.name}</strong>?</p>`,
                        yes: () => item.delete(),
                        no: () => {},
                        defaultYes: false
                    });
                    break;
                case 'update-location':
                    await item.update({ "system.location": value });
                    break;
                case 'update-skill-block':
                    await item.update({ "system.block_id": value });
                    break;
            }
        }
        customMenu.hide();
        // this.render(false); // Removido 'this.render(false)' que estava no duplicado
    });

    // (O listener duplicado 'custom-context-menu .context-item' foi removido)

    $(document).on('click', (ev) => {
        // ✅ Adicionado '.equipment-options-btn' à lista de exceções
        if (!$(ev.target).closest('.item-move, .item-move-skill, .item-options-btn, .equipment-options-btn, .custom-context-menu').length) {
            customMenu.hide();
        }
    });

    html.on('contextmenu', '.item-move, .item-move-skill, .item-options-btn, .equipment-options-btn', ev => {
        // ✅ Adicionado '.equipment-options-btn' para prevenir o menu de clique direito
        ev.preventDefault();
    });
        
    // ============================================================= //
    //    NOVOS LISTENERS PARA RESERVAS DE ENERGIA (SEPARADOS)       //
    // ============================================================= //

    html.on('click', '.add-energy-reserve', ev => {
        const reserveType = ev.currentTarget.dataset.reserveType; 
        if (!reserveType) return;

        const newReserve = { name: "Nova Reserva", source: "Geral", current: 10, max: 10 };
        // CORREÇÃO: O caminho correto é 'spell_reserves' ou 'power_reserves'
        const newKey = `system.${reserveType}_reserves.${foundry.utils.randomID()}`;
        this.actor.update({ [newKey]: newReserve });
    });

    // (O listener 'change' .reserve-card já foi corrigido acima)
    // CORREÇÃO para o listener que você mesmo notou que estava quebrado:
    html.on('change', '.reserve-card input[type="number"]', ev => {
        const input = ev.currentTarget;
        const reserveCard = input.closest('.reserve-card');
        const reserveType = reserveCard.dataset.reserveType; // 'spell' ou 'power'
        const reserveId = reserveCard.dataset.reserveId;
        const property = input.dataset.property;

        if (!reserveType || !reserveId || !property) return;

        const value = Number(input.value);
        const key = `system.${reserveType}_reserves.${reserveId}.${property}`;
        this.actor.update({ [key]: value });
    });


    html.on('click', '.edit-energy-reserve', ev => {
        const reserveCard = ev.currentTarget.closest(".reserve-card");
        const reserveType = reserveCard.dataset.reserveType; 
        const reserveId = reserveCard.dataset.reserveId;
        if (!reserveId || !reserveType) return;

        const reserve = this.actor.system[`${reserveType}_reserves`][reserveId];
        new Dialog({
            title: `Editar Reserva: ${reserve.name}`,
            content: `
            <div class="form-group"><label>Nome:</label><input type="text" name="name" value="${reserve.name}"/></div>
            <div class="form-group"><label>Fonte:</label><input type="text" name="source" value="${reserve.source}"/></div>
            <div class="form-group"><label>Atual:</label><input type="number" name="current" value="${reserve.current}"/></div>
            <div class="form-group"><label>Máximo:</label><input type="number" name="max" value="${reserve.max}"/></div>
            `,
            buttons: {
            save: {
                icon: '<i class="fas fa-save"></i>', label: 'Salvar',
                callback: (html) => {
                const updateKey = `system.${reserveType}_reserves.${reserveId}`;
                this.actor.update({
                    [`${updateKey}.name`]: html.find('input[name="name"]').val(),
                    [`${updateKey}.source`]: html.find('input[name="source"]').val(),
                    [`${updateKey}.current`]: parseInt(html.find('input[name="current"]').val()),
                    [`${updateKey}.max`]: parseInt(html.find('input[name="max"]').val())
                });
                }
            }
            }
        }).render(true);
    });

    html.on('click', '.delete-energy-reserve', ev => {
        const reserveCard = ev.currentTarget.closest(".reserve-card");
        const reserveType = reserveCard.dataset.reserveType; 
        const reserveId = reserveCard.dataset.reserveId;
        if (!reserveId || !reserveType) return;

        Dialog.confirm({
            title: "Deletar Reserva",
            content: "<p>Você tem certeza que quer deletar esta reserva de energia?</p>",
            yes: () => {
                const deleteKey = `system.${reserveType}_reserves.-=${reserveId}`;
                this.actor.update({ [deleteKey]: null });
            },
            no: () => {},
            defaultYes: false
        });
    });

    html.on('click', '.edit-combat-meter', ev => { 
        const meterId = $(ev.currentTarget).parents(".meter-card").data("meterId"); 
        const meter = this.actor.system.combat.combat_meters[meterId]; 
        new Dialog({ title: `Editar Registro: ${meter.name}`, 
        content: `
            <div class="form-group"><label>Nome:</label><input type="text" name="name" value="${meter.name}"/></div>
            <div class="form-group"><label>Atual:</label><input type="number" name="current" value="${meter.current}"/></div>
            <div class="form-group"><label>Máximo:</label><input type="number" name="max" value="${meter.max}"/></div>
            `, 
        buttons: { 
            save: { 
            icon: '<i class="fas fa-save"></i>', 
            label: 'Salvar', 
            callback: (html) => { 
                const updateKey = `system.combat.combat_meters.${meterId}`; 
                this.actor.update({ 
                [`${updateKey}.name`]: html.find('input[name="name"]').val(),
                [`${updateKey}.current`]: parseInt(html.find('input[name="current"]').val()), 
                [`${updateKey}.max`]: parseInt(html.find('input[name="max"]').val())
                }); 
                } 
            } 
            }
        }).render(true); 
        });
    html.on('click', '.delete-combat-meter', ev => { const meterId = $(ev.currentTarget).parents(".meter-card").data("meterId"); Dialog.confirm({ title: "Deletar Registro", content: "<p>Você tem certeza que quer deletar este registro?</p>", yes: () => { const deleteKey = `system.combat.combat_meters.-=${meterId}`; this.actor.update({ [deleteKey]: null }); }, no: () => {}, defaultYes: false }); });
    html.on('click', '.hide-combat-meter', ev => { 
                const meterId = $(ev.currentTarget).parents(".meter-card").data("meterId");
                const entry = this.actor.system.combat.combat_meters[meterId];
                Dialog.confirm({ 
                    title: "Ocultar Registro", 
                    content: `<p>Você tem certeza que quer ocultar <strong>${entry.name}</strong>?<br><small>Ele poderá ser restaurado.</small></p>`, 
                    yes: () => { 
                        // Esta lógica de 'hidden: true' funciona para TODOS os casos
                        const updateKey = `system.combat.combat_meters.${meterId}.hidden`; 
                        this.actor.update({ [updateKey]: true });
                    }, 
                    no: () => {}, 
                    defaultYes: false 
                }); 
            });

            // NOVO Listener para o botão "MOSTRAR OCULTOS" (no cabeçalho)
            html.on('click', '.show-hidden-meters', ev => {
                const actor = this.actor;
                const allMeters = actor.system.combat.combat_meters || {};
                
                // 1. Encontra todos os registros que estão ocultos
                const hiddenMeters = Object.entries(allMeters).filter(([id, meter]) => meter.hidden === true);

                if (hiddenMeters.length === 0) {
                    return ui.notifications.info("Nenhum registro oculto para mostrar.");
                }

                // 2. Constrói o HTML para o diálogo
                let dialogContent = '<div class="meter-list" style="padding: 5px;">';
                hiddenMeters.sort((a, b) => a[1].name.localeCompare(b[1].name)); // Ordena por nome
                
                hiddenMeters.forEach(([id, meter]) => {
                    dialogContent += `
                        <div class="item-row meter-card" data-meter-id="${id}" style="margin-bottom: 5px;">
                            <span class="item-name" style="font-style: italic; color: #aaa;">${meter.name}</span>
                            <div class="item-controls">
                                <a class="item-control restore-combat-meter" title="Restaurar (Mostrar na ficha)">
                                    <i class="fas fa-eye"></i>
                                </a>
                            </div>
                        </div>
                    `;
                });
                dialogContent += '</div>';

                // 3. Cria o diálogo
                new Dialog({
                    title: "Restaurar Registros Ocultos",
                    content: dialogContent,
                    buttons: {
                        close: { label: "Fechar" }
                    },
                    render: (html) => {
                        // 4. Adiciona o listener para o botão "Restaurar" DENTRO do diálogo
                        html.find('.restore-combat-meter').click(async (ev) => {
                            const meterCard = $(ev.currentTarget).closest('.meter-card');
                            const meterId = meterCard.data('meter-id');
                            
                            // Esta é a forma correta de "remover" a flag 'hidden'
                            const updateKey = `system.combat.combat_meters.${meterId}.-=hidden`;
                            await actor.update({ [updateKey]: null });
                            
                            // Remove o item da lista do *diálogo* para feedback visual
                            meterCard.remove();
                        });
                    }
                }).render(true);
            });    
    
        // ================================================================== //
        //   LISTENER DE ROLAGEM DE DANO (VERSÃO FINAL - FASE 3.3)            //
        // ================================================================== //

        html.on('click', '.rollable-damage', async (ev) => {
            ev.preventDefault();
            const element = ev.currentTarget;
            let normalizedAttack;

            // 1. Pega os IDs do botão de dano
            const itemId = $(element).closest("[data-item-id]").data("itemId");
            const attackId = $(element).data("attack-id"); // O ID do *modo de ataque* (ex: "Balanço")

            if (!itemId) {
                console.warn("GUM | Rolagem de dano clicada, mas nenhum 'data-item-id' foi encontrado.");
                return;
            }

            const item = this.actor.items.get(itemId);
            if (!item) return ui.notifications.error("Item não encontrado para esta rolagem de dano.");
            
            // === INÍCIO DA NOVA LÓGICA DE NORMALIZAÇÃO ===

            if (attackId && (item.system.melee_attacks || item.system.ranged_attacks)) {
                // LÓGICA 1: É um ataque de Equipamento (tem attackId)
                
                const attack = item.system.melee_attacks?.[attackId] || item.system.ranged_attacks?.[attackId];
                if (!attack) return ui.notifications.warn("Modo de ataque não encontrado no item.");

                normalizedAttack = {
                    name: `${item.name} (${attack.mode})`,
                    formula: attack.damage_formula,
                    type: attack.damage_type,
                    armor_divisor: attack.armor_divisor,
                    follow_up_damage: attack.follow_up_damage,
                    fragmentation_damage: attack.fragmentation_damage,
                    onDamageEffects: attack.onDamageEffects || {}, // Efeitos específicos do modo
                    generalConditions: item.system.generalConditions || {} // Efeitos gerais do item
                };

            } else if (item.system.damage?.formula) {
                // LÓGICA 2: É uma Magia ou Poder (lógica antiga que preservamos)
                const damageData = item.system.damage;
                normalizedAttack = {
                    name: item.name,
                    formula: damageData.formula,
                    type: damageData.type,
                    armor_divisor: damageData.armor_divisor,
                    follow_up_damage: damageData.follow_up_damage,
                    fragmentation_damage: damageData.fragmentation_damage,
                    onDamageEffects: item.system.onDamageEffects || {},
                    generalConditions: item.system.generalConditions || {}
                };
            } else {
                return ui.notifications.warn("Este item/ataque não possui uma fórmula de dano válida.");
            }
            
            // --- FIM DA LÓGICA DE NORMALIZAÇÃO ---


            // A partir daqui, a função só usa o objeto 'normalizedAttack', que sempre terá a mesma estrutura.
            const performDamageRoll = async (modifier = 0) => {
                let totalRolls = [];
            
                // Rola o dano principal
                // 1. Pega a fórmula do ataque (ex: "gdp+1" ou "gdb")
        // 1. Pega a fórmula do ataque (ex: "gdp+1" ou "gdb")
        let formula = (normalizedAttack.formula || "0").toLowerCase();

        // 2. Pega as fórmulas de GdP e GdB do Ator
        const thrust = (this.actor.system.attributes.thrust_damage || "0").toLowerCase();
        const swing = (this.actor.system.attributes.swing_damage || "0").toLowerCase();

        // 3. Substitui "gdp" e "gdb" pelas fórmulas reais do ator
        // Os parênteses são cruciais para a ordem da operação (ex: (1d6-1)+1)
        formula = formula.replace(/gdp/g, `(${thrust})`);
        formula = formula.replace(/gdb/g, `(${swing})`);

        // 4. CORREÇÃO: A regex agora é case-insensitive ('i') e não para no primeiro espaço.
        // Ela pega tudo que for matemático (incluindo 'd') até encontrar texto (como 'cor', 'pi', etc.)
        const match = formula.match(/^([0-9dDkK+\-/*\s()]+)/i);
        const cleanedFormula = match ? match[1].trim() : "0";
                const mainRollFormula = cleanedFormula + (modifier ? `${modifier > 0 ? '+' : ''}${modifier}` : '');
                const mainRoll = new Roll(mainRollFormula);
                await mainRoll.evaluate();
                totalRolls.push(mainRoll);

                // Rola os danos extras, se existirem
                let followUpRoll, fragRoll;
                if (normalizedAttack.follow_up_damage?.formula) {
                    followUpRoll = new Roll(normalizedAttack.follow_up_damage.formula);
                    await followUpRoll.evaluate();
                    totalRolls.push(followUpRoll);
                }
                if (normalizedAttack.fragmentation_damage?.formula) {
                    fragRoll = new Roll(normalizedAttack.fragmentation_damage.formula);
                    await fragRoll.evaluate();
                    totalRolls.push(fragRoll);
                }
                
                // Monta a 'pílula' de fórmula completa no topo do card
                let fullFormula = `${mainRoll.formula}${normalizedAttack.armor_divisor && normalizedAttack.armor_divisor != 1 ? `(${normalizedAttack.armor_divisor})` : ''} ${normalizedAttack.type || ''}`;
                if (followUpRoll) {
                    let followUpText = `${normalizedAttack.follow_up_damage.formula}${normalizedAttack.follow_up_damage.armor_divisor && normalizedAttack.follow_up_damage.armor_divisor != 1 ? `(${normalizedAttack.follow_up_damage.armor_divisor})` : ''} ${normalizedAttack.follow_up_damage.type || ''}`;
                    fullFormula += ` + ${followUpText}`;
                }
                if (fragRoll) {
                    let fragText = `${normalizedAttack.fragmentation_damage.formula}${normalizedAttack.fragmentation_damage.armor_divisor && normalizedAttack.fragmentation_damage.armor_divisor != 1 ? `(${normalizedAttack.fragmentation_damage.armor_divisor})` : ''} ${normalizedAttack.fragmentation_damage.type || ''}`;
                    fullFormula += ` [${fragText}]`;
                }

                // MONTAGEM DO PACOTE DE DADOS
                const damagePackage = {
                    attackerId: this.actor.id,
                    sourceName: normalizedAttack.name,
                    main: {
                        total: mainRoll.total,
                        type: normalizedAttack.type || '',
                        armorDivisor: normalizedAttack.armor_divisor || 1
                    },
                    onDamageEffects: normalizedAttack.onDamageEffects,
                    generalConditions: normalizedAttack.generalConditions
                };
                if (followUpRoll) {
                    damagePackage.followUp = {
                        total: followUpRoll.total,
                        type: normalizedAttack.follow_up_damage.type || '',
                        armorDivisor: normalizedAttack.follow_up_damage.armor_divisor || 1
                    };
                }
                if (fragRoll) {
                    damagePackage.fragmentation = {
                        total: fragRoll.total,
                        type: normalizedAttack.fragmentation_damage.type || '',
                        armorDivisor: normalizedAttack.fragmentation_damage.armor_divisor || 1
                    };
                }
                // --- FIM DA MONTAGEM DO PACOTE ---


                // Monta o HTML do card de dano
                let flavor = `
                    <div class="gurps-damage-card">
                        <header class="card-header"><h3>${normalizedAttack.name || 'Dano'}</h3></header>
                        <div class="card-formula-container"><span class="formula-pill">${fullFormula}</span></div>
                        <div class="card-content">
                            <div class="card-main-flex">
                                <div class="roll-column">
                                    <span class="column-label">Dados</span>
                                    <div class="individual-dice-damage">
                                        ${mainRoll.dice.flatMap(d => d.results).map(r => `<span class="die-damage">${r.result}</span>`).join('')}
                                    </div>
                                </div>
                                <div class="column-separator"></div>
                                <div class="target-column">
                                    <span class="column-label">Dano Total</span>
                                    <div class="damage-total">
                                        <span class="damage-value">${mainRoll.total}</span>
                                        <span class="damage-type">${normalizedAttack.type || ''}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                `;

                // NOVA ESTRUTURA PARA DANOS EXTRAS
                const hasExtraDamage = followUpRoll || fragRoll;
                if (hasExtraDamage) {
                    flavor += `<footer class="card-footer">`;
                    
                    const createExtraDamageBlock = (roll, data, label) => {
                        return `
                            <div class="extra-damage-block">
                                <div class="extra-damage-label">${label}</div>
                                <div class="extra-damage-roll">
                                    <span class="damage-value">${roll.total}</span>
                                    <span class="damage-type">${data.type || ''}</span>
                                </div>
                            </div>
                        `;
                    };

                    if (followUpRoll) {
                        flavor += createExtraDamageBlock(followUpRoll, normalizedAttack.follow_up_damage, "Acompanhamento");
                    }
                    if (fragRoll) {
                        flavor += createExtraDamageBlock(fragRoll, normalizedAttack.fragmentation_damage, "Fragmentação");
                    }

                    flavor += `</footer>`;
                }
                
                // BOTÃO ATUALIZADO
                flavor += `
                    <footer class="card-actions">
                        <button type="button" class="apply-damage-button" data-damage='${JSON.stringify(damagePackage)}'>
                            <i class="fas fa-crosshairs"></i> Aplicar ao Alvo
                        </button>
                    </footer>
                `;

                flavor += `</div>`; 

                // CORREÇÃO: Removido 'type: CONST.CHAT_MESSAGE_TYPES.ROLL'
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                    content: flavor,
                    rolls: totalRolls
                });
            };
            
            // Lógica para abrir o diálogo de modificador com Shift+Click
            if (ev.shiftKey) {
                
                const label = normalizedAttack.name || "Ataque"; // Esta linha agora funciona para ambos
                
                new Dialog({
                    title: "Modificador de Dano",
                    content: `
                        <div class="modifier-dialog" style="text-align: center;">
                            <p>Insira ou clique nos modificadores para o dano de <strong>${label}</strong>:</p>
                            <input type="number" name="modifier" value="0" style="text-align: center; margin-bottom: 10px; width: 80px;"/>
                            <div class="modifier-grid" style="display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px;">
                                <div class="mod-row" style="display: flex; justify-content: center; gap: 5px;">
                                    <button type="button" class="mod-button" data-mod="-5">-5</button>
                                    <button type="button" class="mod-button" data-mod="-4">-4</button>
                                    <button type="button" class="mod-button" data-mod="-3">-3</button>
                                    <button type="button" class="mod-button" data-mod="-2">-2</button>
                                    <button type="button" class="mod-button" data-mod="-1">-1</button>
                                </div>
                                <div class="mod-row" style="display: flex; justify-content: center; gap: 5px;">
                                    <button type="button" class="mod-button" data-mod="+1">+1</button>
                                    <button type="button" class="mod-button" data-mod="+2">+2</button>
                                    <button type="button" class="mod-button" data-mod="+3">+3</button>
                                    <button type="button" class="mod-button" data-mod="+4">+4</button>
                                    <button type="button" class="mod-button" data-mod="+5">+5</button>
                                </div>
                            </div>
                            <button type="button" class="mod-clear-button" title="Zerar modificador">Limpar</button>
                        </div>
                    `,
                    buttons: {
                        roll: {
                            icon: '<i class="fas fa-dice-d6"></i>',
                            label: "Rolar Dano",
                            callback: (html) => {
                                const modifier = parseInt(html.find('input[name="modifier"]').val()) || 0;
                                performDamageRoll(modifier);
                            }
                        }
                    },
                    default: "roll",
                    render: (html) => {
                        const input = html.find('input[name="modifier"]');
                        html.find('.mod-button').click((event) => {
                            const currentMod = parseInt(input.val()) || 0;
                            const modToAdd = parseInt($(event.currentTarget).data('mod'));
                            input.val(currentMod + modToAdd);
                        });
                        html.find('.mod-clear-button').click(() => {
                            input.val(0);
                        });
                    }
                }).render(true);

            } else {
                performDamageRoll(0); 
            }
        });

        // Listener de rolagem de dano específicos para os danos básicos da ficha do personagem
        html.on('click', '.rollable-basic-damage', async (ev) => {
        ev.preventDefault();
        const element = ev.currentTarget;
        const actor = this.actor;
        
        // Pega os dados brutos do botão
        let formula = (element.dataset.rollFormula || "0").toLowerCase();
        const label = element.dataset.label || "Dano Básico";

        // Esta é a função que rola o dano
        const performBasicDamageRoll = async (modifier = 0) => {
            // Substitui gdp/gdb se necessário (embora o usuário provavelmente digite 1d-1)
            const thrust = (actor.system.attributes.thrust_damage || "0").toLowerCase();
            const swing = (actor.system.attributes.swing_damage || "0").toLowerCase();
            formula = formula.replace(/gdp/g, `(${thrust})`);
            formula = formula.replace(/gdb/g, `(${swing})`);

            const match = formula.match(/^([0-9dDkK+\-/*\s()]+)/i);
            const cleanedFormula = match ? match[1].trim() : "0";
            
            const mainRollFormula = cleanedFormula + (modifier ? `${modifier > 0 ? '+' : ''}${modifier}` : '');
            const mainRoll = new Roll(mainRollFormula);
            await mainRoll.evaluate();

            // Monta um "pacote de dano" mínimo
            const damagePackage = {
                attackerId: actor.id,
                sourceName: label,
                main: {
                    total: mainRoll.total,
                    type: "", // ✅ Tipo vazio, como você sugeriu
                    armorDivisor: 1
                },
                // Efeitos vazios, pois é um dano básico
                onDamageEffects: {},
                generalConditions: {} 
            };

            // Monta o card de chat
            const diceHtml = mainRoll.dice.flatMap(d => d.results).map(r => `<span class="die-damage">${r.result}</span>`).join('');
            let flavor = `
                <div class="gurps-damage-card">
                    <header class="card-header"><h3>${label}</h3></header>
                    <div class="card-formula-container"><span class="formula-pill">${mainRoll.formula}</span></div>
                    <div class="card-content">
                        <div class="card-main-flex">
                            <div class="roll-column">
                                <span class="column-label">Dados</span>
                                <div class="individual-dice-damage">${diceHtml}</div>
                            </div>
                            <div class="column-separator"></div>
                            <div class="target-column">
                                <span class="column-label">Dano Total</span>
                                <div class="damage-total">
                                    <span class="damage-value">${mainRoll.total}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <footer class="card-actions">
                        <button type="button" class="apply-damage-button" data-damage='${JSON.stringify(damagePackage)}'>
                            <i class="fas fa-crosshairs"></i> Aplicar ao Alvo
                        </button>
                    </footer>
                </div>
            `;

            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                content: flavor,
                rolls: [mainRoll]
            });
        };
        
        // Lógica de Shift+Click (copiada do seu .rollable-damage)
        if (ev.shiftKey) {
            new Dialog({
                title: "Modificador de Dano",
                content: ` <div class="modifier-dialog" style="text-align: center;">
                            <p>Insira ou clique nos modificadores para o dano de <strong>${label}</strong>:</p>
                            <input type="number" name="modifier" value="0" style="text-align: center; margin-bottom: 10px; width: 80px;"/>
                            <div class="modifier-grid" style="display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px;">
                                <div class="mod-row" style="display: flex; justify-content: center; gap: 5px;">
                                    <button type="button" class="mod-button" data-mod="-5">-5</button>
                                    <button type="button" class="mod-button" data-mod="-4">-4</button>
                                    <button type="button" class="mod-button" data-mod="-3">-3</button>
                                    <button type="button" class="mod-button" data-mod="-2">-2</button>
                                    <button type="button" class="mod-button" data-mod="-1">-1</button>
                                </div>
                                <div class="mod-row" style="display: flex; justify-content: center; gap: 5px;">
                                    <button type="button" class="mod-button" data-mod="+1">+1</button>
                                    <button type="button" class="mod-button" data-mod="+2">+2</button>
                                    <button type="button" class="mod-button" data-mod="+3">+3</button>
                                    <button type="button" class="mod-button" data-mod="+4">+4</button>
                                    <button type="button" class="mod-button" data-mod="+5">+5</button>
                                </div>
                            </div>
                            <button type="button" class="mod-clear-button" title="Zerar modificador">Limpar</button>
                        </div>
                    `,
                buttons: {
                    roll: {
                        icon: '<i class="fas fa-dice-d6"></i>',
                        label: "Rolar Dano",
                        callback: (html) => {
                            const modifier = parseInt(html.find('input[name="modifier"]').val()) || 0;
                            performBasicDamageRoll(modifier);
                        }
                    }
                },
                default: "roll",
                render: (html) => {
                        const input = html.find('input[name="modifier"]');
                        html.find('.mod-button').click((event) => {
                            const currentMod = parseInt(input.val()) || 0;
                            const modToAdd = parseInt($(event.currentTarget).data('mod'));
                            input.val(currentMod + modToAdd);
                        });
                        html.find('.mod-clear-button').click(() => {
                            input.val(0);
                        });
                    }
            }).render(true);
        } else {
            performBasicDamageRoll(0); 
        }
    });

    // ================================================================== //
    //    LISTENER DE HIT LOCATIONS (E OUTROS)                            //
    // ================================================================== //

    html.on('click', '.view-hit-locations', async ev => {
        ev.preventDefault();
        const actor = this.actor;
        const sheetData = await this.getData();
        
        // Pega todos os objetos de RD
        const actorDR_Armor = actor.system.combat.dr_from_armor || {};
        const actorDR_Mods = actor.system.combat.dr_mods || {};
        const actorDR_Temp = actor.system.combat.dr_temp_mods || {};
        const actorDR_Total = actor.system.combat.dr_locations || {};

        let tableRows = '';
        for (const [key, loc] of Object.entries(sheetData.hitLocations)) {
            
            // ✅ MUDANÇA: Formata cada parte separadamente
            const armorDR_String = this._formatDRObjectToString(actorDR_Armor[key]);
            const tempDR_String = this._formatDRObjectToString(actorDR_Temp[key]); // A nova coluna
            const manualMod_String = this._formatDRObjectToString(actorDR_Mods[key]);
            const totalDR_String = this._formatDRObjectToString(actorDR_Total[key]);

            // ✅ MUDANÇA: Tabela agora com 5 colunas
            tableRows += `
                <div class="table-row">
                    <div class="loc-label">${loc.label}</div>
                    <div class="loc-rd-armor" title="RD da Armadura">${armorDR_String}</div>
                    <div class="loc-rd-temp" title="Bônus Temporários">${tempDR_String}</div>
                    <div class="loc-rd-mod">
                        <input type="text" name="${key}" value="${manualMod_String}" />
                    </div>
                    <div class="loc-rd-total"><strong>${totalDR_String}</strong></div>
                </div>
            `;
        }

        // ✅ MUDANÇA: Cabeçalho agora com 5 colunas
        const content = `
            <form>
                <div class="gurps-rd-table">
                    <div class="table-header">
                        <div>Local</div>
                        <div>Armadura</div>
                        <div>Temp.</div>
                        <div>Manual</div>
                        <div>Total</div>
                    </div>
                    <div class="table-body">
                        ${tableRows}
                    </div>
                </div>
            </form>
        `;

        new Dialog({
            title: "Tabela de Locais de Acerto e RD",
            content: content,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar Modificadores",
                    callback: (html) => {
                        const form = html.find('form')[0];
                        const formData = new FormDataExtended(form).object;
                        const newDrMods = {};
                        
                        for (const [loc, drString] of Object.entries(formData)) {
                            newDrMods[loc] = this._parseDRStringToObject(drString);
                        }
                        // Esta lógica de substituição (que já corrigimos) está correta
                        actor.update({ "system.combat.dr_mods": newDrMods });
                    }
                }
            },
            default: "save",
            options: {
                classes: ["dialog", "gurps-rd-dialog"],
                width: 1000, // Aumenta a largura para caber a nova coluna
            },
            render: (html) => {
                // A lógica de render/live-update já estava correta,
                // pois ela já lia Armor, Temp e Manual separadamente.
                // Nenhuma mudança é necessária aqui.
                html.find('.loc-rd-mod input').on('input', (event) => {
                    const input = $(event.currentTarget);
                    const row = input.closest('.table-row'); 
                    const key = input.attr('name');

                    const armorTempDR = {};
                    this._mergeDRObjects(armorTempDR, actorDR_Armor[key]);
                    this._mergeDRObjects(armorTempDR, actorDR_Temp[key]);

                    const manualMod_Obj = this._parseDRStringToObject(input.val());
                    
                    const newTotal_Obj = {};
                    this._mergeDRObjects(newTotal_Obj, armorTempDR);
                    this._mergeDRObjects(newTotal_Obj, manualMod_Obj);

                    row.find('.loc-rd-total strong').text(this._formatDRObjectToString(newTotal_Obj));
                });

                html.find('input').on('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        html.closest('.dialog').find('.dialog-button.save').trigger('click');
                    }
                });
            }
        }).render(true);
    });

    html.on('click', '.manage-meters', ev => {
      ev.preventDefault();
      const actor = this.actor;
      const meters = actor.system.combat.combat_meters || {};

      let meterRows = '';
      for (const [id, meter] of Object.entries(meters)) {
        meterRows += `
          <div class="item-row meter-card" data-meter-id="${id}">
            <span class="item-name">${meter.name}</span>
            <div class="meter-inputs">
              <input type="number" data-path="system.combat.combat_meters.${id}.current" value="${meter.current}"/>
              <span>/</span>
              <input type="number" data-path="system.combat.combat_meters.${id}.max" value="${meter.max}"/>
            </div>
            <div class="item-controls">
              <a class="item-control pop-up-edit-meter" title="Editar"><i class="fas fa-edit"></i></a>
              <a class="item-control pop-up-delete-meter" title="Deletar"><i class="fas fa-trash"></i></a>
            </div>
          </div>
        `;
      }

      const content = `<form><div class="meter-list">${meterRows || '<p style="text-align:center; opacity:0.7;">Nenhum registro criado.</p>'}</div></form>`;

      new Dialog({
        title: "Gerenciar Registros de Combate",
        content: content,
        buttons: {
          close: {
            icon: '<i class="fas fa-times"></i>',
            label: "Fechar"
          }
        },
        render: (html) => {
          html.find('.meter-inputs input').change(async ev => {
            const input = ev.currentTarget;
            const key = input.dataset.path;
            const value = Number(input.value);
            await actor.update({ [key]: value });
          });

          html.find('.pop-up-edit-meter').click(ev => {
            const meterId = $(ev.currentTarget).closest(".meter-card").data("meterId");
            const meter = actor.system.combat.combat_meters[meterId];
            new Dialog({
              title: `Editar Registro: ${meter.name}`,
              content: `<div class="form-group"><label>Nome:</label><input type="text" name="name" value="${meter.name}"/></div><div class="form-group"><label>Máximo:</label><input type="number" name="max" value="${meter.max}"/></div>`,
              buttons: {
                save: {
                  icon: '<i class="fas fa-save"></i>', label: 'Salvar',
                  callback: (html) => {
                    const updateKey = `system.combat.combat_meters.${meterId}`;
                    actor.update({
                      [`${updateKey}.name`]: html.find('input[name="name"]').val(),
                      [`${updateKey}.max`]: parseInt(html.find('input[name="max"]').val())
                    });
                  }
                }
              }
            }).render(true);
          });

          html.find('.pop-up-delete-meter').click(ev => {
            const meterId = $(ev.currentTarget).closest(".meter-card").data("meterId");
            const entry = actor.system.combat.combat_meters[meterId];
            Dialog.confirm({
              title: "Deletar Registro",
              content: `<p>Você tem certeza que quer deletar <strong>${entry.name}</strong>?</p>`,
              yes: () => actor.update({ [`system.combat.combat_meters.-=${meterId}`]: null }),
              no: () => {},
              defaultYes: false
            });
          });
        }
      }).render(true);
    }); 
  
    html.on('click', '.manual-override-toggle', async (ev) => {
        const checkbox = ev.currentTarget;
        const itemId = checkbox.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) {
            await item.setFlag('gum', 'manual_override', checkbox.checked);
            this.render(false); // Reavalia as condições
        }
    });

    // =============================================================
    // ✅ INÍCIO: LISTENERS DO EDITOR DE TEXTO (BIOGRAFIA)
    // =============================================================
    
    // Botão "Editar Descrição" (lápis)
    html.find(".toggle-editor").on("click", ev => {
      const section = $(ev.currentTarget).closest(".description-section");
      section.find(".description-view, .toggle-editor").hide();
      section.find(".description-editor").show();
    });

    // Botão "Cancelar Edição"
    html.find(".cancel-description").on("click", ev => {
      const section = $(ev.currentTarget).closest(".description-section");
      section.find(".description-editor").hide();
      section.find(".description-view, .toggle-editor").show();
    });

// Botão "Salvar Descrição"
    html.find(".save-description").on("click", async ev => {
      ev.preventDefault();
      const btn = $(ev.currentTarget);
      const section = btn.closest(".description-section");
      const field = btn.data("field"); // Ex: "system.details.backstory"

      if (!field) return ui.notifications.error("Campo de descrição não identificado.");

      const editor = this.editors?.[field];
      if (!editor) {
        ui.notifications.warn("Editor não encontrado.");
        return;
      }

      // ✅ ETAPA 1: Obter o conteúdo RAW (não-enriquecido) do editor
      let content = "";
      try {
        // .getContent() pega o HTML bruto, que é o que queremos salvar
        content = editor.instance.getContent(); 
      } catch (err) {
        console.warn("Erro ao ler conteúdo:", err);
      }

      // ✅ ETAPA 2: Salvar o conteúdo RAW no ator
      const update = {};
      update[field] = content;
      await this.object.update(update);

      // ✅ ETAPA 3: Enriquecer o conteúdo RAW para exibição
      // (Esta é a etapa que estava faltando/incorreta)
      const enriched = await TextEditor.enrichHTML(content, {
          secrets: this.actor.isOwner,
          async: true
      });
      
      // ✅ ETAPA 4: Atualizar a view com o HTML ENRIQUECIDO
      section.find(".description-view").html(enriched);

      // Alterna de volta para modo visualização
      section.find(".description-editor").hide();
      section.find(".description-view, .toggle-editor").show();
    });
    
    // =============================================================
    // ✅ FIM: LISTENERS DO EDITOR DE TEXTO (BIOGRAFIA)
    // =============================================================

}

}