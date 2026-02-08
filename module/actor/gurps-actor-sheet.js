import { performGURPSRoll } from "/systems/gum/scripts/main.js";
import { applySingleEffect } from "/systems/gum/scripts/effects-engine.js";
import { GurpsRollPrompt } from "../apps/roll-prompt.js";
import { getBodyProfile, getBodyLocationDefinition, listBodyProfiles } from "../config/body-profiles.js";

const { ActorSheet } = foundry.appv1.sheets;
const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? foundry?.applications?.ux?.TextEditor ?? TextEditor;




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
          tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat" }]
        });
      }

async getData(options) {
        const context = await super.getData(options);
        
        const profileId = this.actor.system.combat?.body_profile || "humanoid";
        const profile = getBodyProfile(profileId);

        context.bodyProfileId = profileId;
        context.bodyProfileLabel = profile?.label ?? profileId;
        context.bodyProfiles = listBodyProfiles();         // útil pra dropdown depois
        context.hitLocations = profile.locations;          // <- isso substitui o hardcoded
        context.hitLocationOrder = profile.order || [];
        context.drDisplayRows = this._buildDrDisplayRows(profile, this.actor.system.combat?.dr_locations || {});



        // Agrupa todos os itens por tipo
        const itemsByType = context.actor.items.reduce((acc, item) => {
          const type = item.type;
          if (!acc[type]) acc[type] = [];
          acc[type].push(item);
          return acc;
        }, {});
        context.itemsByType = itemsByType;
// ---------------------------------------------------------
        // PREPARAÇÃO DA ABA DE MODIFICADORES (ORGANIZAÇÃO POR TIPO)
        // ---------------------------------------------------------
        const myMods = itemsByType.gm_modifier || [];
        
        const categoryLabels = {
            location: "Pontos de Impacto",
            maneuver: "Manobras",
            attack_opt: "Opções de Ataque",
            defense_opt: "Opções de Defesa",
            posture: "Postura",
            range: "Distância / Alcance",
            ritual: "Ritual & Mana",
            time: "Tempo / Duração",
            effort: "Esforço Extra",
            situation: "Situação / Condição",
            other: "Customizado / Outros"
        };

        const getSubgroup = (contextObj, catKey) => {
            if (!contextObj.subgroups[catKey]) {
                contextObj.subgroups[catKey] = {
                    key: catKey,
                    label: categoryLabels[catKey] || "Outros",
                    items: []
                };
            }
            return contextObj.subgroups[catKey];
        };

// 1. Inicializa os contextos (AGORA COM SKILL/ATTR)
        context.modifiersBySection = {
            melee:   { label: "ATAQUE CORPO A CORPO", icon: "fas fa-swords", subgroups: {} },
            ranged:  { label: "ATAQUE À DISTÂNCIA",   icon: "fas fa-bullseye", subgroups: {} },
            defense: { label: "DEFESA ATIVA",         icon: "fas fa-shield-alt", subgroups: {} },
            magic:   { label: "MAGIA",                icon: "fas fa-magic", subgroups: {} }, 
            power:   { label: "PODERES",              icon: "fas fa-bolt", subgroups: {} },
            skill:   { label: "ATRIBUTOS & PERÍCIAS", icon: "fas fa-person-digging", subgroups: {} },
            general: { label: "GERAL / SITUAÇÃO",     icon: "fas fa-globe", subgroups: {} }
        };

        // 2. Distribuição Estrita
        myMods.forEach(mod => {
            const targets = mod.system.target_type || {};
            const cat = mod.system.ui_category || "other";
            let placed = false;

            // Combat (Melee)
            if (targets.combat_attack_melee || targets.combat_all) { 
                getSubgroup(context.modifiersBySection.melee, cat).items.push(mod);
                placed = true; 
            }
            // Combat (Ranged)
            if (targets.combat_attack_ranged || targets.combat_all) { 
                getSubgroup(context.modifiersBySection.ranged, cat).items.push(mod);
                placed = true; 
            }
            // Defense
            if (targets.combat_defense_all || targets.combat_defense_dodge || targets.combat_defense_parry || targets.combat_all) {
                getSubgroup(context.modifiersBySection.defense, cat).items.push(mod);
                placed = true;
            }
            // Magic
            if (targets.combat_attack_spell || targets.spell_iq || targets.spell_all) {
                getSubgroup(context.modifiersBySection.magic, cat).items.push(mod);
                placed = true;
            }
            // Power
            if (targets.combat_attack_power || targets.power_iq || targets.power_ht || targets.power_will) {
                getSubgroup(context.modifiersBySection.power, cat).items.push(mod);
                placed = true;
            }
// ✅ LÓGICA DE ATRIBUTOS E PERÍCIAS (CORRIGIDA)
            // Verifica se afeta qualquer atributo ou perícia específica
            if (
                // Genéricos
                targets.skill_all || targets.attr_all || 
                
                // ST
                targets.attr_st_all || targets.check_st || targets.skill_st || 
                // DX
                targets.attr_dx_all || targets.check_dx || targets.skill_dx || 
                // IQ
                targets.attr_iq_all || targets.check_iq || targets.skill_iq || 
                // HT
                targets.attr_ht_all || targets.check_ht || targets.skill_ht || 
                // Vontade (Will)
                targets.attr_will_all || targets.check_will || targets.skill_will || targets.check_fright ||
                // Percepção
                targets.attr_per_all || targets.check_per || targets.skill_per ||
                // Sentidos
                targets.sense_vision || targets.sense_hearing || targets.sense_tastesmell || targets.sense_touch
            ) {
                getSubgroup(context.modifiersBySection.skill, cat).items.push(mod);
                placed = true;
            }

            // Geral / Fallback
            if (targets.global || (!placed && (targets.reaction))) {
                 getSubgroup(context.modifiersBySection.general, cat).items.push(mod);
            }
        });

        // Ordenação
        for (const section of Object.values(context.modifiersBySection)) {
            section.subgroupsArray = Object.values(section.subgroups).sort((a, b) => a.label.localeCompare(b.label));
            section.subgroupsArray.forEach(sub => {
                sub.items.sort((a, b) => a.name.localeCompare(b.name));
            });
        }
        
       // ================================================================== //
        // ✅ LÓGICA "CASTELO SÓLIDO" ATUALIZADA PARA A ABA DE CONDIÇÕES (INÍCIO)
        // ================================================================== //
        
        // 1. Prepara listas para Efeitos Ativos (divididos por Duração)
        const temporaryEffects = [];
        const permanentEffects = [];

        // Processa todos os ActiveEffects no ator
        const activeEffects = Array.from(this.actor.effects ?? []);
        const activeEffectsPromises = activeEffects.map(async (effect) => {
            try {
                const effectData = effect.toObject(); 
                effectData.id = effect.id; 
                effectData.disabled = effect.disabled;
                effectData.pendingCombat = effectData.flags?.gum?.duration?.pendingCombat === true; 

                // --- Lógica de Identificação da Fonte (seu código original) ---
                let fonteNome = "Origem Desconhecida";
                let fonteIcon = "fas fa-question-circle";
                let fonteUuid = null;
                
                let originalEffectItem = null;
                const effectUuid = foundry.utils.getProperty(effect, "flags.gum.effectUuid");
                if (effectUuid) {
                    originalEffectItem = await fromUuid(effectUuid).catch(() => null);
                    if (originalEffectItem) {
                        effectData.name = originalEffectItem.name; 
                        effectData.img = originalEffectItem.img;
                        if (originalEffectItem.system?.type === "status" && originalEffectItem.system?.statusId) {
                            const statusEffect = CONFIG.statusEffects.find(status => status.id === originalEffectItem.system.statusId);
                            effectData.appliedStatusLabel = statusEffect?.name || originalEffectItem.system.statusId;
                        }
                    }
                }
                
                if (effect.origin) {
                    const originItem = await fromUuid(effect.origin).catch(() => null);
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

                // --- Lógica de Duração ---
                const d = effect.duration || {};
                const gumDuration = effectData.flags?.gum?.duration || {};
                const originalDuration = originalEffectItem?.system?.duration || gumDuration || {};
                const isMarkedPermanent = originalDuration.isPermanent === true;
                const countsInCombatOnly = originalDuration.inCombat === true;
                let isPermanent = true; // Assume permanente até que se prove o contrário

                if (effectData.pendingCombat && countsInCombatOnly) {
                    effectData.durationString = "Pendente (combate)";
                    isPermanent = false;
                }
                else if (gumDuration.pendingStart && countsInCombatOnly) {
                    effectData.durationString = "Inicia no próximo turno";
                    isPermanent = false;
                }
                else if (d.seconds) {
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
                else if (!isMarkedPermanent && countsInCombatOnly) {
                    // Efeitos marcados como "apenas em combate" devem ser tratados como temporários,
                    // mesmo que ainda não tenham campos de duração preenchidos pelo Foundry.
                    const fallbackValue = originalDuration.value ?? 1;
                    const unit = originalDuration.unit === "seconds" ? "seg." : originalDuration.unit === "turns" ? "turno(s)" : "rodada(s)";
                    effectData.durationString = `${fallbackValue} ${unit}`;
                    isPermanent = false;
                }
                else {
                    effectData.durationString = "Permanente";
                    isPermanent = true;
                }

                // Adiciona o efeito processado à lista correta
                if (isPermanent) {
                    permanentEffects.push(effectData);
                } else {
                    temporaryEffects.push(effectData);
                }
            } catch (error) {
                console.warn("GUM | Falha ao processar efeito ativo:", error);
            }
        });
        
        // Espera todas as promessas de processamento de efeitos terminarem
        await Promise.allSettled(activeEffectsPromises);

        // Salva as listas separadas no contexto para o .hbs usar
        context.temporaryEffects = temporaryEffects;
        context.permanentEffects = permanentEffects;

        // --- 2. Prepara a lista para "Condições Passivas" (Regras de Cenário) ---
        // Esta parte do seu código original já estava perfeita.
         context.installedConditions = this.actor.items.filter(item => item.type === "condition");
        
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
        //    AGRUPAMENTO DE PERÍCIAS (MODO HÍBRIDO: GRUPO OU ÁRVORE)         //
        // ================================================================== //
        
        // 1. Pegar o modo atual (padrão é 'group')
        // Se a flag não existir, assume 'group' para manter compatibilidade
        const skillsViewMode = this.actor.getFlag('gum', 'skillsViewMode') || 'group';
        context.skillsViewMode = skillsViewMode; // Passa para o HTML saber qual ícone mostrar

        // 2. Separar apenas os itens do tipo 'skill'
        let skills = itemsByType.skill || [];

        // Objeto final que vai para o HTML
        let skillsByGroup = {};

        if (skillsViewMode === 'group') {
            // -------------------------------------------------------
            // MODO 1: AGRUPAMENTO SIMPLES (Padrão / Legado)
            // -------------------------------------------------------
            skills.forEach(skill => {
                // Normaliza o nome do grupo
                let groupName = (skill.system.group || "Geral").trim();
                if (!groupName) groupName = "Geral";

                if (!skillsByGroup[groupName]) skillsByGroup[groupName] = [];
                
                // No modo grupo, limpamos a indentação para ficar tudo alinhado
                skill.indentClass = ""; 
                skill.isTrunk = false; 
                
                skillsByGroup[groupName].push(skill);
            });

       } else {
            // -------------------------------------------------------
            // MODO 2: ÁRVORE HIERÁRQUICA (Power-Ups 10) - COM RASTREIO DE CAMINHO
            // -------------------------------------------------------
            
            const normalize = (str) => str ? str.toLowerCase().trim() : "";
            const trunks = skills.filter(s => s.system.hierarchy_type === 'trunk');

            // =========================================================
            // FUNÇÃO RECURSIVA APRIMORADA (Soma + Histórico)
            // =========================================================
            // parentName: Nome do pai
            // depth: Profundidade visual
            // inheritedLevel: Soma matemática acumulada
            // pathTrace: Array com o histórico [{name: "Espada", val: 2, type: "trunk"}, ...]
            const processChildren = (parentName, depth, inheritedLevel = 0, pathTrace = []) => {
                let childrenList = [];
                
                // Filtra quem é filho deste pai
                let directChildren = skills.filter(s => {
                    const p = s.system;
                    const pName = normalize(parentName);
                    return normalize(p.root_parent) === pName ||
                           normalize(p.branch_parent) === pName ||
                           normalize(p.twig_parent) === pName ||
                           normalize(p.parent_skill) === pName;
                });

                directChildren.sort((a, b) => a.name.localeCompare(b.name));

                directChildren.forEach(child => {
                    // 1. Configuração Visual
                    child.indentClass = `indent-${depth}`;
                    child.isTrunk = false;
                    
                    // 2. Salva o histórico para o HTML desenhar as "pílulas"
                    child.inheritancePath = pathTrace; 

                    // 3. Cálculo Matemático (Soma ao NH Final para rolagem)
                    if (child.system.final_nh) {
                        child.system.final_nh += inheritedLevel;
                    }

                    // 4. Preparar dados para os filhos deste filho (Netos)
                    const myRelativeLevel = Number(child.system.skill_level) || 0;
                    const nextInheritedLevel = inheritedLevel + myRelativeLevel;
                    
                    // Adiciona a si mesmo ao histórico dos descendentes
                    const myNodeInfo = {
                        name: child.name,
                        value: myRelativeLevel,
                        type: child.system.hierarchy_type // trunk, branch, etc.
                    };
                    const nextPathTrace = [...pathTrace, myNodeInfo];

                    childrenList.push(child);
                    
                    // Recursão
                    childrenList = childrenList.concat(processChildren(child.name, depth + 1, nextInheritedLevel, nextPathTrace));
                });

                return childrenList;
            };

            // --- A. Processar Troncos ---
            trunks.forEach(trunk => {
                let groupName = trunk.name; 
                skillsByGroup[groupName] = [];

                trunk.indentClass = "";
                trunk.isTrunk = true;
                trunk.inheritancePath = []; // Tronco não herda de ninguém
                skillsByGroup[groupName].push(trunk);

                // Pega o nível do Tronco para iniciar a cascata
                const trunkLevel = Number(trunk.system.skill_level) || 0;
                
                // Cria o histórico inicial (O Tronco é o primeiro ancestral)
                const trunkNodeInfo = {
                    name: trunk.name,
                    value: trunkLevel,
                    type: "trunk"
                };

                // Busca descendentes
                let descendants = processChildren(trunk.name, 1, trunkLevel, [trunkNodeInfo]);
                skillsByGroup[groupName] = skillsByGroup[groupName].concat(descendants);
            });

            // --- B. Processar Órfãos ---
            let handledIds = new Set();
            Object.values(skillsByGroup).flat().forEach(s => handledIds.add(s.id));
            let orphans = skills.filter(s => !handledIds.has(s.id));
            
            if (orphans.length > 0) {
                orphans.forEach(skill => {
                    let g = (skill.system.group || "Geral").trim();
                    if (!g) g = "Geral";
                    if (!skillsByGroup[g]) skillsByGroup[g] = [];
                    
                    skill.indentClass = "";
                    skill.isTrunk = false;
                    skill.inheritancePath = []; // Órfão não tem herança
                    
                    skillsByGroup[g].push(skill);
                });
            }
        }

      // Salvamos no contexto antes de tentar ler
        context.skillsByGroup = skillsByGroup;

        // 3. Ordenar as Chaves dos Grupos (A-Z) para exibir na ordem certa
        context.skillGroupsKeys = Object.keys(context.skillsByGroup).sort((a, b) => {
            if (a === "Geral") return -1;
            if (b === "Geral") return 1;
            return a.localeCompare(b);
        });

        // 4. Ordenação Interna (apenas se estiver no modo grupo, pois árvore tem ordem própria)
        if (skillsViewMode === 'group') {
            const skillSortPref = this.actor.system.sorting?.skill || 'manual';
            const sortFn = getSortFunction(skillSortPref); // Usa sua função auxiliar existente
            
            for (const groupName in context.skillsByGroup) {
                context.skillsByGroup[groupName].sort(sortFn);
            }
        }
        

  // ================================================================== //
        //    AGRUPAMENTO DE MAGIAS (EM BLOCOS COMO PERÍCIAS)
        // ================================================================== //
        const spellSortPref = this.actor.system.sorting?.spell || 'manual';
        const spellSortFn = getSortFunction(spellSortPref);
        const spells = itemsByType.spell || [];
        const spellsByGroup = {};

        spells.forEach((spell) => {
            let groupName = (spell.system.group || 'Geral').trim();
            if (!groupName) groupName = 'Geral';
            if (!spellsByGroup[groupName]) spellsByGroup[groupName] = [];
            spellsByGroup[groupName].push(spell);
        });

        Object.keys(spellsByGroup).forEach((groupName) => {
            spellsByGroup[groupName].sort(spellSortFn);
        });

        context.spellsByGroup = spellsByGroup;
        context.spellGroupsKeys = Object.keys(spellsByGroup).sort((a, b) => {
            if (a === 'Geral') return -1;
            if (b === 'Geral') return 1;
            return a.localeCompare(b);
        });

        // ================================================================== //
        //    AGRUPAMENTO DE PODERES (MESMO PADRÃO DA ABA DE MAGIAS)
        // ================================================================== //
        const powerSortPref = this.actor.system.sorting?.power || 'manual';
        const powerSortFn = getSortFunction(powerSortPref);
        const powers = itemsByType.power || [];
        const powersByGroup = {};

        powers.forEach((power) => {
            let groupName = (power.system.group || 'Geral').trim();
            if (!groupName) groupName = 'Geral';
            if (!powersByGroup[groupName]) powersByGroup[groupName] = [];
            powersByGroup[groupName].push(power);
        });

        Object.keys(powersByGroup).forEach((groupName) => {
            powersByGroup[groupName].sort(powerSortFn);
        });

        context.powersByGroup = powersByGroup;
        context.powerGroupsKeys = Object.keys(powersByGroup).sort((a, b) => {
            if (a === 'Geral') return -1;
            if (b === 'Geral') return 1;
            return a.localeCompare(b);
        });

        // ================================================================== //
        //    ORDENAÇÃO DE LISTAS SIMPLES (Seu código original)
        // ================================================================== //
        const simpleSortTypes = [];
        for (const type of simpleSortTypes) {
            if (itemsByType[type]) {
                const sortPref = this.actor.system.sorting?.[type] || 'manual';
                itemsByType[type].sort(getSortFunction(sortPref));
            }
        }
        context.itemsByType = itemsByType; // Salva os itens já ordenados no contexto


// ================================================================== //
        //    AGRUPAMENTO E ORDENAÇÃO DE EQUIPAMENTOS (VERSÃO FINAL)          //
        // ================================================================== //
        const equipmentTypes = ['equipment', 'melee_weapon', 'ranged_weapon', 'armor'];
        const allEquipment = context.actor.items.filter(i => equipmentTypes.includes(i.type));

        allEquipment.forEach(item => {
            const s = item.system;
            const q = s.quantity || 1;
            
            // Cálculo de peso e custo efetivo
            const w = (s.effectiveWeight !== undefined) ? s.effectiveWeight : (s.weight || 0);
            const c = (s.effectiveCost !== undefined) ? s.effectiveCost : (s.cost || 0);
            
            s.total_weight = (q * w).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            s.total_cost = (q * c).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        });

        // ✅ FILTROS PARA O HTML (HBS) - Incluindo todos os tipos de equipamentos
        context.equipmentInUse = allEquipment.filter(i => i.system.equipped);
        context.equipmentStored = allEquipment.filter(i => i.system.stored);
        context.equipmentCarried = allEquipment.filter(i => !i.system.equipped && !i.system.stored);

        // Ordenação das listas (Opcional, usando suas funções existentes)
        const sortingPrefs = this.actor.system.sorting?.equipment || {};
        context.equipmentInUse.sort(getSortFunction(sortingPrefs.equipped || 'manual'));
        context.equipmentCarried.sort(getSortFunction(sortingPrefs.carried || 'manual'));
        context.equipmentStored.sort(getSortFunction(sortingPrefs.stored || 'manual'));

        // ================================================================== //
        //     FASE 3.1: PREPARAÇÃO DOS GRUPOS DE ATAQUE (REATORADO)          //
        // ================================================================== //
        
        // 1. Usamos a lista 'context.equipmentInUse' que você já calculou
 const calculateDefaultDefense = (nhValue) => {
            const parsed = Number(nhValue);
            if (!Number.isFinite(parsed)) return null;
            return Math.floor(parsed / 2) + 3;
        };

        const normalizeDefenseValue = (value) => {
            if (value === null || value === undefined) return null;
            const trimmed = String(value).trim();
            if (trimmed === "" || trimmed === "0" || trimmed === "-") return null;
            return trimmed;
        };

        const equipmentAttackGroups = (context.equipmentInUse || []).map(item => {
            
            // 2. Processa os Ataques Corpo a Corpo (Melee)
            // ✅ MUDANÇA: Removemos toda a lógica de cálculo de NH daqui
            const meleeAttacks = Object.entries(item.system.melee_attacks || {}).map(([id, attack]) => {
                const finalNh = attack.final_nh || 10;
                const defaultDefense = calculateDefaultDefense(finalNh);
                const parryValue = attack.parry_default && defaultDefense !== null ? defaultDefense : attack.parry;
                const blockValue = attack.block_default && defaultDefense !== null ? defaultDefense : attack.block;
                const normalizedParry = normalizeDefenseValue(parryValue);
                const normalizedBlock = normalizeDefenseValue(blockValue);
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
                    final_nh: finalNh,
                    skill_name: attack.skill_name || "N/A",
                    parry: normalizedParry ?? "",
                    block: normalizedBlock ?? "",
                    final_parry: normalizedParry,
                    final_block: normalizedBlock
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
            const defaultBlockId = char.type === 'disadvantage' ? 'block3' : 'block2';
            const blockId = char.system.block_id || defaultBlockId;
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
            const racialBlockId = 'block1';
            const racialItems = context.characteristicsByBlock[racialBlockId] || [];
            context.racialCharacteristics = {
                advantages: racialItems.filter((item) => item.type === 'advantage'),
                disadvantages: racialItems.filter((item) => item.type === 'disadvantage')
            };

        // ================================================================== //
        //    ENRIQUECIMENTO DE TEXTO (Seu código original)
        // ================================================================== //
                  // Prepara o campo de biografia, garantindo que funcione mesmo se estiver vazio
            context.enrichedBackstory = await TextEditorImpl.enrichHTML(this.actor.system.details.backstory || "", {
                    secrets: this.actor.isOwner,
                    async: true
                });              
                context.survivalBlockWasOpen = this._survivalBlockOpen || false;

                this._showHiddenMeters = this._showHiddenMeters ?? false;
                const combatMeters = context.actor.system.combat.combat_meters || {};
                const includeHiddenMeters = this._showHiddenMeters === true;

                const preparedCombatMeters = Object.entries(combatMeters)
                    .map(([id, meter]) => {
                        const normalized = this._normalizeResourceEntry(meter, { defaultName: "Registro", allowHidden: true });
                        return { id, meter: normalized };
                    })
                    .filter((m) => includeHiddenMeters || !m.meter.hidden);

                preparedCombatMeters.sort((a, b) => a.meter.name.localeCompare(b.meter.name));

                context.preparedCombatMeters = preparedCombatMeters;
                context.showHiddenMeters = includeHiddenMeters;
                context.spellReserves = this._normalizeResourceCollection(context.actor.system.spell_reserves || {}, { defaultName: "Reserva de Magia" });
                                context.powerReserves = this._normalizeResourceCollection(context.actor.system.power_reserves || {}, { defaultName: "Reserva de Poder" });
                context.castingAbilities = this._prepareCastingAbilities();
                context.powerSources = this._preparePowerSources();

                // Lê o estado dos grupos colapsáveis para serem salvos
                context.collapsedData = this.actor.getFlag('gum', 'sheetCollapsedState') || {};

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
    // ✅ CONFIGURAÇÃO DO EDITOR (API ATUAL)
    // ================================================================== //
    /**
     * @override
     * Configura o editor de texto rico para a ficha do ator usando o engine atual.
     */
    activateEditor(name, options = {}, ...args) {
        options.engine = "prosemirror";
        options.minHeight ??= 300;
        return super.activateEditor(name, options, ...args);
    }
    // ================================================================== //
    // ✅ FIM DA CONFIGURAÇÃO DO EDITOR
    // ================================================================== //

    _getEditorInstance(field) {
        const editor = this.editors?.[field];
        if (!editor) return null;
        return editor.editor ?? editor.instance ?? editor;
    }

    async _getEditorContent(field, section) {
        const instance = this._getEditorInstance(field);
        if (instance?.getHTML) {
            const html = instance.getHTML();
            return html?.then ? await html : html;
        }
        if (instance?.getContent) {
            const content = instance.getContent();
            return content?.then ? await content : content;
        }
        if (instance?.view?.dom?.innerHTML) return instance.view.dom.innerHTML;
        if (TextEditorImpl?.getContent) {
            const element = section.find(`[name="${field}"]`).get(0)
                ?? section.find(`.editor[data-edit="${field}"]`).get(0);
            if (element) return TextEditorImpl.getContent(element);
        }
        const namedInput = section.find(`[name="${field}"]`);
        if (namedInput.length) return namedInput.val();
        const editorElement = section.find(`.editor[data-edit="${field}"]`);
        if (editorElement.length) return editorElement.val() ?? editorElement.html();
        return "";
    }
    
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

 _buildDrDisplayRows(profile, drLocations) {
        const rows = [];
        const order = profile.order ?? Object.keys(profile.locations || {});
        const locations = profile.locations || {};
        const items = [];
        const extraKeys = Object.keys(drLocations || {})
            .filter(key => !locations[key] && getBodyLocationDefinition(key))
            .sort((a, b) => {
                const aLabel = getBodyLocationDefinition(a)?.label ?? a;
                const bLabel = getBodyLocationDefinition(b)?.label ?? b;
                return aLabel.localeCompare(bLabel);
            });
        const combinedOrder = [...order, ...extraKeys];

        for (const key of combinedOrder) {
            const loc = locations[key] ?? getBodyLocationDefinition(key);
            if (!loc) continue;
            const drObject = drLocations?.[key] || {};
            const base = Number(drObject?.base) || 0;
            const extraLine = this._formatDRExtraLine(drObject);
            items.push({
                key,
                label: loc.label ?? loc.name ?? key,
                groupKey: loc.groupKey,
                groupLabel: loc.groupLabel,
                groupPlural: loc.groupPlural,
                base,
                extraLine,
                drSignature: this._getDRSignature(drObject)
            });
        }

        const groupedKeys = new Set();
        const groups = new Map();

        for (const item of items) {
            if (!item.groupKey) continue;
            if (!groups.has(item.groupKey)) groups.set(item.groupKey, []);
            groups.get(item.groupKey).push(item);
        }

        const groupSummaries = new Map();
        for (const [groupKey, groupItems] of groups.entries()) {
            if (groupItems.length < 2) continue;
            const signature = groupItems[0].drSignature;
            const isUniform = groupItems.every(member => member.drSignature === signature);
            if (!isUniform) continue;
            groupItems.forEach(member => groupedKeys.add(member.key));

            const labelBase = groupItems[0].groupPlural || groupItems[0].groupLabel || groupKey;
            groupSummaries.set(groupKey, {
                id: `group-${groupKey}`,
                isGroup: true,
                label: `${labelBase} (${groupItems.length})`,
                base: groupItems[0].base,
                extraLine: groupItems[0].extraLine,
                children: groupItems
            });
        }

        const renderedGroups = new Set();
        for (const item of items) {
            if (item.groupKey && groupSummaries.has(item.groupKey)) {
                if (renderedGroups.has(item.groupKey)) continue;
                rows.push(groupSummaries.get(item.groupKey));
                renderedGroups.add(item.groupKey);
                continue;
            }
            if (groupedKeys.has(item.key)) continue;
            rows.push({
                ...item,
                isGroup: false
            });
        }

        return rows;
    }

    _formatDRExtraLine(drObject) {
        if (!drObject || typeof drObject !== "object") return "";
        const base = Number(drObject.base) || 0;
        const extras = [];

        for (const [type, mod] of Object.entries(drObject)) {
            if (type === "base") continue;
            const finalValue = Math.max(0, base + (Number(mod) || 0));
            if (finalValue === base) continue;
            extras.push(`${finalValue} ${type}`);
        }

        return extras.join(", ");
    }

    _getDRSignature(drObject) {
        if (!drObject || typeof drObject !== "object") return "0";
        const normalized = {};
        for (const [key, value] of Object.entries(drObject)) {
            const numeric = Number(value) || 0;
            if (numeric === 0) continue;
            normalized[key] = numeric;
        }
        const sortedEntries = Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b));
        return JSON.stringify(sortedEntries);
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

    _normalizeResourceEntry(entry = {}, { defaultName = "Registro", allowHidden = false } = {}) {
        const data = foundry.utils.duplicate(entry || {});
        data.name = data.name || defaultName;
        const current = Number(data.current ?? data.value ?? 0);
        const max = Number(data.max ?? data.value ?? current);
        data.current = current;
        data.max = max;
        data.value = data.value ?? current; // Mantém compatibilidade com referências antigas
        if (allowHidden) data.hidden = Boolean(data.hidden);
        return data;
    }

    _normalizeResourceCollection(collection = {}, { defaultName = "Reserva" } = {}) {
        const normalized = {};
        for (const [id, entry] of Object.entries(collection)) {
            normalized[id] = this._normalizeResourceEntry(entry, { defaultName });
        }
        return normalized;
    }

    /**
     * Função auxiliar para importar modificadores do compêndio.
     * @param {boolean} reset - Se true, apaga os existentes antes de importar.
     */
    async _importModifiersFromCompendium(reset = false) {
        const pack = game.packs.get("gum.gm_modifiers") || game.packs.find(p => p.metadata.label === "[GUM] Modificadores Básicos");
        if (!pack) return ui.notifications.warn("Compêndio de Modificadores não encontrado.");

        const sourceItems = await pack.getDocuments();
        if (sourceItems.length === 0) return ui.notifications.warn("O Compêndio está vazio.");

        // 1. Se for Reset, apaga tudo primeiro
        if (reset) {
            const currentIds = this.actor.items.filter(i => i.type === 'gm_modifier').map(i => i.id);
            if (currentIds.length > 0) await this.actor.deleteEmbeddedDocuments("Item", currentIds);
        }

        // 2. Filtra duplicatas (se não for reset, não queremos adicionar o que já tem)
        const currentModsNames = new Set(this.actor.items.filter(i => i.type === 'gm_modifier').map(i => i.name));
        const toCreate = [];

        sourceItems.forEach(item => {
            if (reset || !currentModsNames.has(item.name)) {
                const data = item.toObject();
                data._stats = { compendiumSource: item.uuid };
                toCreate.push(data);
            }
        });

        if (toCreate.length > 0) {
            await this.actor.createEmbeddedDocuments("Item", toCreate);
            ui.notifications.info(`${toCreate.length} modificadores importados.`);
        } else {
            ui.notifications.info("Nenhum modificador novo para importar.");
        }
 }
    
_getRollDataFromElement(element) {
    const dataset = element.dataset;

    return {
        label: dataset.label || "Teste",
        value: parseInt(dataset.rollValue) || 10,
        type: dataset.type || "attribute",
        itemId: dataset.itemId || $(element).closest('.item').data('itemId') || "",
        img: dataset.img || "",
        attackType: dataset.attackType || null,
        isRanged: dataset.isRanged === "true",
        attributeKey: dataset.attributeKey || null
    };
}

_onDragStart(event) {
    const target = event.currentTarget;
    const dataTransfer = event?.dataTransfer || event?.originalEvent?.dataTransfer;

    if (target?.classList?.contains("rollable")) {
        if (!dataTransfer) return;
        const rollData = this._getRollDataFromElement(target);
        const dragData = {
            type: "GUM.Roll",
            actorId: this.actor.id,
            actorUuid: this.actor.uuid,
            rollData
        };

        dataTransfer.setData("text/plain", JSON.stringify(dragData));
        return;
    }

    return super._onDragStart(event);
}

async _onDrop(event) {
    const data = TextEditorImpl.getDragEventData(event);
    if (data?.type === "Item") {
        const item = await Item.fromDropData(data);
        if (item?.type === "effect") {
            event.preventDefault();
            const activeTokens = this.actor.getActiveTokens(true);
            const targets = activeTokens.length ? activeTokens : [{ actor: this.actor }];
            await applySingleEffect(item, targets, { actor: this.actor, origin: item });
            return;
        }
    }

    return super._onDrop(event);
}

activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

// -------------------------------------------------------------
//  BIOGRAFIA - Editor de História
// -------------------------------------------------------------
html.on("click", ".edit-biography-details", (ev) => {
  ev.preventDefault();
  const details = this.actor.system.details || {};

  const content = `
    <form class="secondary-stats-editor biography-details-editor">
      <p class="hint">Atualize os dados do perfil do personagem.</p>
      <div class="form-header-grid">
        <span>Campo</span>
        <span>Valor</span>
      </div>
      <div class="form-row">
        <label>Gênero</label>
        <input type="text" name="details.gender" value="${details.gender ?? ""}" />
      </div>
      <div class="form-row">
        <label>Idade</label>
        <input type="text" name="details.age" value="${details.age ?? ""}" />
      </div>
      <div class="form-row">
        <label>Altura</label>
        <input type="text" name="details.height" value="${details.height ?? ""}" />
      </div>
      <div class="form-row">
        <label>Peso</label>
        <input type="text" name="details.weight" value="${details.weight ?? ""}" />
      </div>
      <div class="form-row">
        <label>Pele</label>
        <input type="text" name="details.skin" value="${details.skin ?? ""}" />
      </div>
      <div class="form-row">
        <label>Cabelos</label>
        <input type="text" name="details.hair" value="${details.hair ?? ""}" />
      </div>
      <div class="form-row">
        <label>Olhos</label>
        <input type="text" name="details.eyes" value="${details.eyes ?? ""}" />
      </div>
      <div class="form-row">
        <label>Alinhamento</label>
        <input type="text" name="details.alignment" value="${details.alignment ?? ""}" />
      </div>
      <div class="form-row">
        <label>Crença / Fé</label>
        <input type="text" name="details.belief" value="${details.belief ?? ""}" />
      </div>
    </form>
    <style>
      .biography-details-editor .form-header-grid,
      .biography-details-editor .form-row {
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: 8px;
        align-items: center;
        margin-bottom: 6px;
      }
      .biography-details-editor label {
        text-align: left;
        font-weight: bold;
      }
      .biography-details-editor input {
        width: 100%;
      }
    </style>
  `;

  new Dialog({
    title: "Editar Perfil",
    content,
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: "Salvar",
        callback: (html) => {
          const form = html.find("form")[0];
          const formData = new FormDataExtended(form).object;
          const updateData = {};
          const fields = [
            "gender",
            "age",
            "height",
            "weight",
            "skin",
            "hair",
            "eyes",
            "alignment",
            "belief"
          ];
          fields.forEach((field) => {
            updateData[`system.details.${field}`] = formData[`details.${field}`] ?? "";
          });
          this.actor.update(updateData);
        }
      }
    },
    default: "save"
  }, { classes: ["dialog", "gum", "secondary-stats-dialog"] }).render(true);
});

html.find(".biography-story .toggle-editor").on("click", ev => {
  const section = $(ev.currentTarget).closest(".description-section");
  const field = $(ev.currentTarget).data("field") ?? $(ev.currentTarget).data("target");
  const editorWrapper = section.find(".description-editor");
  section.find(".description-view, .toggle-editor").hide();
  editorWrapper.show();
  const editor = this._getEditorInstance(field);
  if (editor?.focus) {
    setTimeout(() => editor.focus(), 0);
  } else if (editor?.view?.focus) {
    setTimeout(() => editor.view.focus(), 0);
  }
});

html.find(".biography-story .cancel-description").on("click", ev => {
  const section = $(ev.currentTarget).closest(".description-section");
  section.find(".description-editor").hide();
  section.find(".description-view, .toggle-editor").show();
});

html.find(".biography-story .expand-description").on("click", ev => {
  const btn = $(ev.currentTarget);
  const section = btn.closest(".description-section");
  const editorWrapper = section.find(".description-editor");
  editorWrapper.toggleClass("expanded");
  const expanded = editorWrapper.hasClass("expanded");
  const expandedHeight = expanded ? "600px" : "300px";
  editorWrapper.find(".editor, .editor-content, .ProseMirror").css({
    minHeight: expandedHeight,
    height: expanded ? expandedHeight : ""
  });
  btn.attr("data-expanded", expanded ? "true" : "false");
  btn.html(expanded
    ? '<i class="fas fa-compress"></i> Reduzir'
    : '<i class="fas fa-expand"></i> Expandir');
});

html.find(".biography-story .save-description").on("click", async ev => {
  ev.preventDefault();
  const btn = $(ev.currentTarget);
  const section = btn.closest(".description-section");
  const field = btn.data("field") ?? btn.data("target");
  const content = await this._getEditorContent(field, section);
  if (content === null || content === undefined) return;
  await this.actor.update({ [field]: content });

  const enriched = await TextEditorImpl.enrichHTML(content || "", { async: true, secrets: this.actor.isOwner });
  section.find(".description-view").html(enriched);
  section.find(".description-editor").hide();
  section.find(".description-view, .toggle-editor").show();
});

// -------------------------------------------------------------
//  MODIFICADORES (ABA DO PERSONAGEM) - Botões da Toolbar
// -------------------------------------------------------------
html.on("click", ".import-modifiers-btn", async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();
  if (typeof this._importModifiersFromCompendium !== "function") {
    return ui.notifications.error("Função de importação não encontrada no GurpsActorSheet.");
  }
  await this._importModifiersFromCompendium();
  this.render(false);
});

html.on("click", ".clear-modifiers-btn", async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();

  const toDelete = this.actor.items.filter(i => i.type === "gm_modifier");
  if (!toDelete.length) return ui.notifications.info("Nenhum modificador para limpar.");

  Dialog.confirm({
    title: "Limpar Modificadores",
    content: `<p>Isso vai apagar <b>${toDelete.length}</b> modificadores desta ficha. Continuar?</p>`,
    yes: async () => {
      await this.actor.deleteEmbeddedDocuments("Item", toDelete.map(i => i.id));
      this.render(false);
    },
    no: () => {}
  });
});

html.on("click", ".reset-modifiers-btn", async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();

  const toDelete = this.actor.items.filter(i => i.type === "gm_modifier");

  Dialog.confirm({
    title: "Resetar Modificadores",
    content: `<p>Isso vai limpar os modificadores atuais e reimportar do compêndio. Continuar?</p>`,
    yes: async () => {
      if (toDelete.length) {
        await this.actor.deleteEmbeddedDocuments("Item", toDelete.map(i => i.id));
      }
      if (typeof this._importModifiersFromCompendium !== "function") {
        ui.notifications.error("Função de importação não encontrada no GurpsActorSheet.");
        return;
      }
      await this._importModifiersFromCompendium();
      this.render(false);
    },
    no: () => {}
  });
});

// Ler Compêndio (toggle)
html.find(".toggle-default-mods").on("change", async (ev) => {
  const checked = ev.currentTarget.checked;
  await this.actor.setFlag("gum", "useDefaultModifiers", checked);
  this.render(false);
});

// Busca de modificadores
html.find(".modifier-search").on("input", (ev) => {
  const term = String(ev.currentTarget.value || "").toLowerCase().trim();

  const cards = html.find(".mod-mini-card");
  cards.each((_, el) => {
    const name = $(el).find(".mod-name").text().toLowerCase();
    const match = !term || name.includes(term);
    $(el).toggle(match);
  });

  // Esconde subgrupos/contexts vazios após o filtro
  html.find(".subgroup-details").each((_, el) => {
    const hasVisible = $(el).find(".mod-mini-card:visible").length > 0;
    $(el).toggle(hasVisible);
  });
 html.find(".context-wrapper").each((_, el) => {
    const hasVisible = $(el).find(".mod-mini-card:visible").length > 0;
    $(el).toggle(hasVisible);
  });
});

// -------------------------------------------------------------
//  REGISTROS DE COMBATE
// -------------------------------------------------------------
html.on("click", ".add-combat-meter", (ev) => this._onAddCombatMeter(ev));
html.on("click", ".edit-combat-meter", (ev) => this._onEditCombatMeter(ev));
html.on("click", ".delete-combat-meter", (ev) => this._onDeleteCombatMeter(ev));
html.on("click", ".hide-combat-meter", (ev) => this._onToggleCombatMeterVisibility(ev));
html.on("click", ".show-hidden-meters", (ev) => this._onToggleHiddenMeters(ev));
html.on("change", ".combat-meters-box .meter-inputs input", (ev) => this._onCombatMeterInputChange(ev));
this._setupActionMenuListeners(html);

// -------------------------------------------------------------
//  RESERVAS DE ENERGIA (MAGIA / PODER)
// -------------------------------------------------------------
html.on("click", ".add-energy-reserve", (ev) => this._onAddEnergyReserve(ev));
html.on("click", ".edit-energy-reserve", (ev) => this._onEditEnergyReserve(ev));
html.on("click", ".delete-energy-reserve", (ev) => this._onDeleteEnergyReserve(ev));
html.on("change", ".reserve-card .meter-inputs input", (ev) => this._onEnergyReserveInputChange(ev));

// -------------------------------------------------------------
//  HABILIDADES DE CONJURAÇÃO
// -------------------------------------------------------------
html.on("click", ".add-casting-ability", (ev) => this._onAddCastingAbility(ev));
html.on("click", ".edit-casting-ability", (ev) => this._onEditCastingAbility(ev));
html.on("click", ".delete-casting-ability", (ev) => this._onDeleteCastingAbility(ev));
html.on("click", ".view-casting-ability", (ev) => this._onViewCastingAbility(ev));
html.on("click", ".add-power-source", (ev) => this._onAddPowerSource(ev));
html.on("click", ".edit-power-source", (ev) => this._onEditPowerSource(ev));
html.on("click", ".view-power-source", (ev) => this._onViewPowerSource(ev));
html.on("click", ".delete-power-source", (ev) => this._onDeletePowerSource(ev));

// -------------------------------------------------------------
//  ASPECTOS SOCIAIS
// -------------------------------------------------------------
html.on("click", ".add-social-entry", (ev) => this._onAddSocialEntry(ev));
html.on("click", ".edit-social-entry", (ev) => this._onEditSocialEntry(ev));
html.on("click", ".delete-social-entry", (ev) => this._onDeleteSocialEntry(ev));

// -------------------------------------------------------------
//  EDITAR ITEM (ABRIR ITEM SHEET)
// -------------------------------------------------------------
html.on('click', '.item-edit, .item-control.item-edit', (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation(); // garante que não acione o acordeão

  const el = $(ev.currentTarget);

  // Pega o itemId do container padrão (.item / .item-row) OU do próprio botão
  const itemId =
    el.closest('.item, .item-row').data('itemId') ??
    el.closest('[data-item-id]').data('itemId') ??
    el.data('itemId') ??
    ev.currentTarget.dataset.itemId;

  if (!itemId) return;

  const item = this.actor.items.get(itemId);
  if (!item) return;

  item.sheet.render(true);
});

// -------------------------------------------------------------
// 0. BLOQUEIA O "TOGGLE" NATIVO DO <summary> QUANDO CLICAR EM CONTROLES
// (garante que botões/links dentro do cabeçalho funcionem sem abrir/fechar o details)
// -------------------------------------------------------------
html.on('click', 'details > summary a, details > summary button, details > summary .item-control, details > summary .rollable', (ev) => {
    // Não queremos navegação nem o toggle automático do summary
    ev.preventDefault();
    // Não precisa stopImmediatePropagation: queremos que outros listeners (rolagens, edit, delete) executem
    ev.stopPropagation();
});

// -------------------------------------------------------------
// 0.1. BOTÕES ESPECÍFICOS DO COMBATE (fora de <summary>, mas por segurança)
// -------------------------------------------------------------
html.on('click', '.edit-basic-damage', this._onEditBasicDamage.bind(this));
html.on('click', '.view-hit-locations', this._onViewHitLocations.bind(this));
html.on('click', '.attack-group-details .group-summary .item-edit', this._onEditAttackGroupItem.bind(this));
html.on('click', '.dr-group-toggle', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const groupRow = ev.currentTarget.closest('.dr-group');
    if (!groupRow) return;
    groupRow.classList.toggle('is-expanded');
});


    // -------------------------------------------------------------
    // 1. PERSISTÊNCIA DOS DETALHES (ACORDEÃO - VISUAL)
    // -------------------------------------------------------------
    html.find('.gum-details').on('toggle', async (ev) => {
        const details = ev.currentTarget;
        const section = details.dataset.section; 
        const isOpen = details.open;
        if (section) {
            await this.actor.setFlag('gum', `sheet_settings.${section}_closed`, !isOpen);
        }
    });

    html.find('details[data-group-id]').on('toggle', this._onDetailsToggle.bind(this));

    // -------------------------------------------------------------
    // 2. MOVER EQUIPAMENTO (Botão Camiseta: Equipar / Desequipar)
    // -------------------------------------------------------------
    html.find('.item-toggle-equip').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        
        const btn = $(ev.currentTarget);
        // Garante que pegamos o ID independente de onde foi o clique (ícone ou link)
        const li = btn.closest(".item"); 
        const itemId = li.data("itemId"); 
        const item = this.actor.items.get(itemId);
        
        if (!item) {
            console.warn("GUM | Item não encontrado para equipar.");
            return;
        }

        // Verifica o estado atual
        const isCurrentlyEquipped = item.system.equipped === true;
        
        // Define o novo estado (Inverte o atual)
        const newState = !isCurrentlyEquipped;

        // ATUALIZAÇÃO HÍBRIDA (Sincroniza Antigo e Novo sistema)
        await item.update({
            // 1. Sistema Booleano (Para as listas visuais do HBS funcionarem)
            "system.equipped": newState,
            "system.stored": false, // Se mexeu nisso, certeza que não está guardado

            // 2. Sistema de String (Para o main.js calcular peso e lógica futura)
            "system.location": newState ? "equipped" : "carried" 
        });

        // Feedback visual opcional
        if (newState) ui.notifications.info(`${item.name} equipado.`);
        else ui.notifications.info(`${item.name} movido para a mochila.`);
    });

    // -------------------------------------------------------------
    // 3. MOVER EQUIPAMENTO (Botão Caixa: Guardar / Sacar)
    // -------------------------------------------------------------
    html.find('.item-toggle-stored').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        
        const btn = $(ev.currentTarget);
        const li = btn.closest(".item");
        const itemId = li.data("itemId");
        const item = this.actor.items.get(itemId);

        if (!item) return;

        // Verifica o estado atual
        const isCurrentlyStored = item.system.stored === true;
        
        // Define o novo estado
        const newState = !isCurrentlyStored;

        await item.update({
            // 1. Sistema Booleano
            "system.stored": newState,
            "system.equipped": false, // Se mexeu nisso, certeza que não está vestido

            // 2. Sistema de String
            "system.location": newState ? "stored" : "carried"
        });

        if (newState) ui.notifications.info(`${item.name} guardado no baú.`);
        else ui.notifications.info(`${item.name} sacado para a mochila.`);
    });

    // -------------------------------------------------------------
    // 4. DELETAR ITEM (COM CONFIRMAÇÃO)
    // -------------------------------------------------------------
    html.find('.item-delete').click(ev => {
    ev.preventDefault();
    ev.stopPropagation(); // Garante que não feche o bloco ao clicar no lixo

    const container = $(ev.currentTarget).closest(".item, [data-item-id]");
    const itemId = container.data("itemId") ?? ev.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    // Cria a janela de diálogo para confirmação
    Dialog.confirm({
        title: `Excluir ${item.name}?`,
        content: `<p>Tem certeza que deseja excluir este item permanentemente?</p>`,
        yes: () => item.delete(),
        no: () => {}, // Não faz nada se cancelar
        defaultYes: false
    });
});

// -------------------------------------------------------------
//  CONDIÇÕES PASSIVAS (OVERRIDE MANUAL)
// -------------------------------------------------------------
html.on('change', '.manual-override-toggle', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    const itemId = ev.currentTarget.dataset.itemId;
    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    const isDisabled = ev.currentTarget.checked;
    await item.update({ 'flags.gum.manual_override': isDisabled }, { render: false });

    const pill = html.find(`.effect-pill-enhanced[data-item-id="${itemId}"]`);
    const statusTag = pill.find('.pill-tag.status');
    if (statusTag.length) {
        statusTag.toggleClass('off', isDisabled);
        statusTag.toggleClass('on', !isDisabled);
        statusTag.text(isDisabled ? 'Desativado' : 'Automático');
 }
});

// -------------------------------------------------------------
//  EFEITOS TEMPORÁRIOS / PERMANENTES (ATIVAR/DESATIVAR)
// -------------------------------------------------------------
html.on('change', '.effect-toggle', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    const effectId = ev.currentTarget.dataset.effectId;
    if (!effectId) return;

    const effect = this.actor.effects.get(effectId);
    if (!effect) return;

    const isDisabled = ev.currentTarget.checked;
    const updateData = {
        disabled: isDisabled,
        "flags.gum.manualDisabled": isDisabled
    };

    if (!isDisabled) {
        updateData["flags.gum.duration.pendingCombat"] = false;
        updateData["flags.gum.duration.pendingStart"] = false;
    }

    await effect.update(updateData, { render: false });

    const pill = html.find(`.effect-pill-enhanced[data-effect-id="${effectId}"]`);
    const statusTag = pill.find('.pill-tag.status');
    if (statusTag.length) {
        statusTag.toggleClass('off', isDisabled);
        statusTag.toggleClass('on', !isDisabled);
        statusTag.text(isDisabled ? 'Desativado' : 'Ativo');
    }

    this.actor.sheet.render(false);
    this.actor.getActiveTokens().forEach(token => token.drawEffects());
});

// -------------------------------------------------------------
//  CONDIÇÕES PASSIVAS (EVITA TOGGLE DO <details>)
// -------------------------------------------------------------
html.on('click', '.passive-section .effects-grid-container', (ev) => {
    ev.stopPropagation();
});

html.on('click', '.temporary-section .effects-grid-container, .permanent-section .effects-grid-container', (ev) => {
    ev.stopPropagation();
});

    // ================================================================== //
    //  CONTROLE MANUAL DE ACORDEÃO (VERSÃO 3.0 - FINAL)
    // ================================================================== //

    html.find('.spell-summary, .group-summary').click(async (ev) => {
        const target = $(ev.target);

        // 1. CASO ESPECIAL: INPUTS
        if (target.closest('input, select, textarea').length) return; 

        // 2. CASO BOTÕES (Editar, Deletar, Dados, Links)
        // Isso protege o acordeão de fechar se você clicar num botão que NãO tem stopPropagation
        if (target.closest('a, button, .item-control, .rollable, .item-edit, .item-delete, .item-quick-view, .effect-control').length) {
        return;
        }

        // 3. CASO GERAL
        ev.preventDefault(); 
        ev.stopPropagation();

        const details = $(ev.currentTarget).closest('details');
        const groupId = details.data('groupId');
        const wasOpen = details[0].hasAttribute('open');

        if (wasOpen) details.removeAttr('open');
        else details.attr('open', '');  

        if (groupId) {
            const newState = !wasOpen;
            await this.actor.setFlag("gum", `sheetCollapsedState.${groupId}`, newState);
        }
    });

    // GATILHO PARA ACORDEÃO DE MAGIAS/COMBATE (NOME OU SETA)
    html.find('.spell-main-info, .summary-left').click(async (ev) => {
        ev.stopPropagation(); 
        const trigger = $(ev.currentTarget);
        const details = trigger.closest('details');
        const wasOpen = details[0].hasAttribute('open');
        
        if (wasOpen) details.removeAttr('open');
        else details.attr('open', '');

        const id = details.data('groupId');
        if (id) {
            let currentState = foundry.utils.duplicate(this.actor.getFlag("gum", "sheetCollapsedState") || {});
            currentState[id] = !wasOpen ? false : true; 
            await this.actor.setFlag("gum", "sheetCollapsedState", currentState);
        }
    });

    // ================================================================== //
    //   LISTENER DE SOBREVIVÊNCIA (+ e -)
    // ================================================================== //
    html.find('.adjust-survival').click(ev => {
        ev.preventDefault();
        const btn = $(ev.currentTarget);
        const action = btn.data('action'); 
        const attrKey = btn.data('attr');  
        
        const input = btn.siblings('input');
        let value = parseInt(input.val()) || 0;

        if (action === 'increase') value++;
        else value = Math.max(0, value - 1);

        input.val(value);
        this.actor.update({ [`system.attributes.${attrKey}.value`]: value });
    });

    // Alternar Modo de Visualização de Perícias
    html.find('.toggle-skills-view').click(async ev => {
        const currentMode = this.actor.getFlag('gum', 'skillsViewMode') || 'group';
        const newMode = currentMode === 'group' ? 'tree' : 'group';
        await this.actor.setFlag('gum', 'skillsViewMode', newMode);
    });

    // MENU DE CONTEXTO (Botão de Opções)
    html.on('click', '.equipment-options-btn', ev => {
            ev.preventDefault();
            ev.stopPropagation();

            const button = $(ev.currentTarget);
            const li = button.closest('.item');
            const itemId = li.data('itemId');
            const item = this.actor.items.get(itemId);
            if (!item) return;
            
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

            const menuContent = `
                <div class="context-item" data-action="edit"><i class="fas fa-edit"></i> Editar Item</div>
                <div class="context-item" data-action="delete"><i class="fas fa-trash"></i> Deletar Item</div>
                <div class="context-divider"></div>
                <div class="context-submenu">
                    <div class="context-item"><i class="fas fa-exchange-alt"></i> Mover Para</div>
                    <div class="submenu-items">${moveSubmenu}</div>
                </div>
            `;

            const customMenu = this.element.find(".custom-context-menu");
            customMenu.html(menuContent);
            customMenu.data("itemId", itemId); 
            customMenu.css({ display: "block", left: ev.clientX - 210 + "px", top: ev.clientY - 10 + "px" });
    });

    // Listener para deletar efeitos
    html.find('[data-action="delete-effect"]').on('click', ev => {
        const effectId = ev.currentTarget.dataset.effectId;
        if (effectId) {
            this.actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
        }
    });

   // ================================================================== //
    //   LISTENER: ROLAGENS GERAIS (ROLLABLE)
    // ================================================================== //
    // Correção: Unifiquei seus dois listeners de .rollable em um só mais robusto para evitar duplicidade
    html.on('click', '.rollable', ev => {
        ev.preventDefault();
        ev.stopPropagation(); // Importante

        const element = ev.currentTarget;
        const rollData = this._getRollDataFromElement(element);

        if (ev.shiftKey) {
            // Shift = Rápido
            if(typeof performGURPSRoll !== 'undefined') performGURPSRoll(this.actor, rollData);
        } else {
            // Normal = Prompt
             if(typeof GurpsRollPrompt !== 'undefined') new GurpsRollPrompt(this.actor, rollData).render(true);
        }
    });

    html.find(".rollable").attr("draggable", true);
    html.on("dragstart", ".rollable", this._onDragStart.bind(this));

// ================================================================== //
//  ROLAGEM DE DANO (ATAQUES DE EQUIPAMENTO + MAGIAS / PODERES)
// ================================================================== //
html.on("click", ".rollable-damage", async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();

  const element = ev.currentTarget;
  let normalizedAttack;

  // --------------------------------------------------
  // 1) Identificação segura do Item e do Modo de Ataque
  // --------------------------------------------------
  const $el = $(element);

  const itemId =
    element.dataset.itemId ||
    $el.data("itemId") ||
    $el.closest("[data-item-id]").data("itemId") ||
    $el.closest(".item").data("itemId");

  const attackId =
    element.dataset.attackId ||
    $el.data("attackId") ||
    $el.attr("data-attack-id");

  if (!itemId) {
    console.warn("GUM | Rolagem de dano sem itemId.");
    return;
  }

  const item = this.actor.items.get(itemId);
  if (!item) {
    ui.notifications.error("Item não encontrado para esta rolagem de dano.");
    return;
  }

  // --------------------------------------------------
  // 2) NORMALIZAÇÃO (EXATAMENTE COMO SEU MODELO ANTIGO)
  // --------------------------------------------------

  // A) Equipamento com modos de ataque
  if (attackId && (item.system.melee_attacks || item.system.ranged_attacks)) {
    const attack =
      item.system.melee_attacks?.[attackId] ||
      item.system.ranged_attacks?.[attackId];

    if (!attack) {
      ui.notifications.warn("Modo de ataque não encontrado.");
      return;
    }

    normalizedAttack = {
      name: `${item.name} (${attack.mode ?? attackId})`,
      formula: attack.damage_formula,
      type: attack.damage_type,
      armor_divisor: attack.armor_divisor,
      follow_up_damage: attack.follow_up_damage,
      fragmentation_damage: attack.fragmentation_damage,
      onDamageEffects: attack.onDamageEffects || {},
      generalConditions: item.system.generalConditions || {}
    };

  // B) Magias / Poderes
  } else if (item.system.damage?.formula) {
    const dmg = item.system.damage;

    normalizedAttack = {
      name: item.name,
      formula: dmg.formula,
      type: dmg.type,
      armor_divisor: dmg.armor_divisor,
      follow_up_damage: dmg.follow_up_damage,
      fragmentation_damage: dmg.fragmentation_damage,
      onDamageEffects: item.system.onDamageEffects || {},
      generalConditions: item.system.generalConditions || {}
    };

 } else {
    ui.notifications.warn("Este item não possui fórmula de dano válida.");
    return;
  }

  const mergeEffects = (...sources) => {
    const merged = [];
    for (const source of sources) {
      if (!source) continue;
      if (Array.isArray(source)) {
        source.forEach((data, index) => {
          if (!data) return;
          merged.push({ id: data.id ?? `effect-${merged.length + index}`, ...data });
        });
      } else {
        for (const [id, data] of Object.entries(source)) {
          if (!data) continue;
          merged.push({ id, ...data });
        }
      }
    }
    return merged;
  };

  const combinedOnDamageEffects = mergeEffects(
    normalizedAttack.generalConditions,
    item.system?.onDamageEffects,
    normalizedAttack.onDamageEffects
  );

  // --------------------------------------------------
  // 3) Helpers (GdP / GeB / limpeza de fórmula)
  // --------------------------------------------------
  const resolveBaseDamage = (actor, formula) => {
    let f = String(formula || "0").toLowerCase();

    const thrust = String(actor.system.attributes.thrust_damage || "0").toLowerCase();
    const swing  = String(actor.system.attributes.swing_damage || "0").toLowerCase();

    f = f.replace(/\b(gdp|thrust)\b/gi, `(${thrust})`);
    f = f.replace(/\b(geb|gdb|swing)\b/gi, `(${swing})`);

    return f;
  };

  const extractMathFormula = (formula) => {
    const match = String(formula).match(/^([0-9dDkK+\-/*\s()]+)/i);
    return match ? match[1].trim() : "0";
  };

  // --------------------------------------------------
  // 4) Função principal de rolagem
  // --------------------------------------------------
  const performDamageRoll = async (modifier = 0) => {
    const rolls = [];

    // ---- DANO PRINCIPAL ----
    let base = resolveBaseDamage(this.actor, normalizedAttack.formula);
    const cleaned = extractMathFormula(base);
    const mainFormula = cleaned + (modifier ? `${modifier > 0 ? "+" : ""}${modifier}` : "");

    const mainRoll = new Roll(mainFormula);
    await mainRoll.evaluate();
    rolls.push(mainRoll);

 // ---- FOLLOW-UP ----
    let followUpRoll = null;
    let fuClean = null;
    if (normalizedAttack.follow_up_damage?.formula) {
      const fu = resolveBaseDamage(this.actor, normalizedAttack.follow_up_damage.formula);
      fuClean = extractMathFormula(fu);
      followUpRoll = new Roll(fuClean);
      await followUpRoll.evaluate();
      rolls.push(followUpRoll);
    }

    // ---- FRAGMENTAÇÃO ----
    let fragRoll = null;
    let frClean = null;
    if (normalizedAttack.fragmentation_damage?.formula) {
      const fr = resolveBaseDamage(this.actor, normalizedAttack.fragmentation_damage.formula);
      frClean = extractMathFormula(fr);
      fragRoll = new Roll(frClean);
      await fragRoll.evaluate();
      rolls.push(fragRoll);
    }

    // ---- Pacote de Dano (para Damage Application)
    const damagePackage = {
      attackerId: this.actor.id,
      sourceName: normalizedAttack.name,
      main: {
        total: mainRoll.total,
        type: normalizedAttack.type || "",
        armorDivisor: normalizedAttack.armor_divisor || 1
      },
      onDamageEffects: combinedOnDamageEffects,
      generalConditions: normalizedAttack.generalConditions
    };

    if (followUpRoll) {
      damagePackage.followUp = {
        total: followUpRoll.total,
        type: normalizedAttack.follow_up_damage.type || "",
        armorDivisor: normalizedAttack.follow_up_damage.armor_divisor || 1
      };
    }

    if (fragRoll) {
      damagePackage.fragmentation = {
        total: fragRoll.total,
        type: normalizedAttack.fragmentation_damage.type || "",
        armorDivisor: normalizedAttack.fragmentation_damage.armor_divisor || 1
      };
    }

    // ---- Chat (simples, funcional)
     const mainDiceHtml = mainRoll.dice.flatMap((d) => d.results).map((r) => `<span class="die-damage">${r.result}</span>`).join("");

    const formulaSegments = [];
    formulaSegments.push(`${mainFormula}${normalizedAttack.armor_divisor && normalizedAttack.armor_divisor !== 1 ? `(${normalizedAttack.armor_divisor})` : ""} ${normalizedAttack.type || ""}`.trim());
    if (followUpRoll) {
      formulaSegments.push(`${fuClean}${normalizedAttack.follow_up_damage.armor_divisor && normalizedAttack.follow_up_damage.armor_divisor !== 1 ? `(${normalizedAttack.follow_up_damage.armor_divisor})` : ""} ${normalizedAttack.follow_up_damage.type || ""}`.trim());
    }
    if (fragRoll) {
      formulaSegments.push(`${frClean}${normalizedAttack.fragmentation_damage.armor_divisor && normalizedAttack.fragmentation_damage.armor_divisor !== 1 ? `(${normalizedAttack.fragmentation_damage.armor_divisor})` : ""} ${normalizedAttack.fragmentation_damage.type || ""}`.trim());
    }

    const formulaPill = formulaSegments.join(" • ");

    const content = `
      <div class="gurps-damage-card">
        <header class="card-header">
          <h3>${normalizedAttack.name}</h3>
        </header>

        <div class="card-formula-container">
          <span class="formula-pill">${formulaPill}</span>
        </div>

        <div class="card-content">
          <div class="card-main-flex">
            <div class="roll-column">
              <span class="column-label">Dados</span>
              <div class="individual-dice-damage">${mainDiceHtml || `<span class="die-damage">–</span>`}</div>
            </div>

            <div class="column-separator"></div>

            <div class="target-column">
              <span class="column-label">Dano Total</span>
              <div class="damage-total">
                <span class="damage-value">${mainRoll.total}</span>
                <span class="damage-type">${normalizedAttack.type || ""}</span>
              </div>
            </div>
          </div>
        </div>

        ${(followUpRoll || fragRoll) ? `
          <footer class="card-footer">
            ${followUpRoll ? `
              <div class="extra-damage-block">
                <div class="extra-damage-label">Acompanhamento</div>
                <div class="extra-damage-roll">
                  <div class="extra-total">
                    <span class="damage-value">${followUpRoll.total}</span>
                    <span class="damage-type">${normalizedAttack.follow_up_damage.type || ""}</span>
                  </div>
                </div>
              </div>
            ` : ""}

            ${fragRoll ? `
              <div class="extra-damage-block">
                <div class="extra-damage-label">Fragmentação</div>
                <div class="extra-damage-roll">
                  <div class="extra-total">
                    <span class="damage-value">${fragRoll.total}</span>
                    <span class="damage-type">${normalizedAttack.fragmentation_damage.type || ""}</span>
                  </div>
                </div>
              </div>
            ` : ""}
          </footer>
        ` : ""}

        <footer class="card-actions">
          <button class="apply-damage-button" data-damage='${JSON.stringify(damagePackage)}'>
            <i class="fas fa-crosshairs"></i> Aplicar ao Alvo
          </button>
        </footer>
      </div>
    `;



    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
      rolls
    });
  };

  // --------------------------------------------------
  // 5) Shift+Click = diálogo de modificador
  // --------------------------------------------------
  if (ev.shiftKey) {
    new Dialog({
      title: "Modificador de Dano",
      content: `<p>Informe o modificador:</p><input type="number" name="modifier" value="0"/>`,
      buttons: {
        roll: {
          label: "Rolar",
          callback: (html) => {
            const mod = parseInt(html.find('[name="modifier"]').val()) || 0;
            performDamageRoll(mod);
          }
        }
      }
    }).render(true);
  } else {
    performDamageRoll(0);
  }
});

// ================================================================== //
//  ROLAGEM DE DANO BÁSICO (CARD GdP / GeB)
// ================================================================== //
html.on("click", ".rollable-basic-damage", async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();

  const element = ev.currentTarget;
  const actor = this.actor;

  let formula = String(
    element.dataset.rollFormula ||
    element.getAttribute("data-roll-formula") ||
    "0"
  ).toLowerCase();

  const label =
    element.dataset.label ||
    element.getAttribute("data-label") ||
    "Dano Básico";

  const resolveBaseDamage = (f) => {
    const thrust = String(actor.system.attributes.thrust_damage || "0").toLowerCase();
    const swing  = String(actor.system.attributes.swing_damage || "0").toLowerCase();

    return String(f)
      .replace(/\b(gdp|thrust)\b/gi, `(${thrust})`)
      .replace(/\b(geb|gdb|swing)\b/gi, `(${swing})`);
  };

  const extractMathFormula = (f) => {
    const match = String(f).match(/^([0-9dDkK+\-/*\s()]+)/i);
    return match ? match[1].trim() : "0";
  };

  const performBasicRoll = async (modifier = 0) => {
    const resolved = resolveBaseDamage(formula);
    const cleaned = extractMathFormula(resolved);
    const finalFormula = cleaned + (modifier ? `${modifier > 0 ? "+" : ""}${modifier}` : "");

    const roll = new Roll(finalFormula);
    await roll.evaluate();

    const damagePackage = {
      attackerId: actor.id,
      sourceName: label,
      main: { total: roll.total, type: "", armorDivisor: 1 },
      onDamageEffects: {},
      generalConditions: {}
    };

 const mainDiceHtml = roll.dice.flatMap((d) => d.results).map((r) => `<span class="die-damage">${r.result}</span>`).join("");
    const formulaPill = `${finalFormula}`.trim();

    const content = `
      <div class="gurps-damage-card">
        <header class="card-header">
          <h3>${label}</h3>
          <div class="card-subtitle">Dano Básico</div>
        </header>

        <div class="card-formula-container">
          <span class="formula-pill">${formulaPill}</span>
        </div>

        <div class="card-content">
          <div class="card-main-flex">
            <div class="roll-column">
              <span class="column-label">Dados</span>
              <div class="individual-dice-damage">${mainDiceHtml || `<span class="die-damage">–</span>`}</div>
            </div>

            <div class="column-separator"></div>

            <div class="target-column">
              <span class="column-label">Dano Total</span>
              <div class="damage-total">
                <span class="damage-value">${roll.total}</span>
              </div>
            </div>
          </div>
        </div>

        <footer class="card-actions">
          <button class="apply-damage-button" data-damage='${JSON.stringify(damagePackage)}'>
            <i class="fas fa-crosshairs"></i> Aplicar ao Alvo
          </button>
        </footer>
      </div>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      rolls: [roll]
    });
  };

  if (ev.shiftKey) {
    new Dialog({
      title: "Modificador de Dano",
      content: `<p>Informe o modificador:</p><input type="number" name="modifier" value="0"/>`,
      buttons: {
        roll: {
          label: "Rolar",
          callback: (html) => {
            const mod = parseInt(html.find('[name="modifier"]').val()) || 0;
            performBasicRoll(mod);
          }
        }
      }
    }).render(true);
  } else {
    performBasicRoll(0);
  }
});



    // EDITOR DE BARRAS DE PV/PF
    html.on('click', '.edit-resource-bar', ev => {
        ev.preventDefault();
        const button = ev.currentTarget;
        const statKey = button.dataset.stat; 
        const statLabel = statKey === 'hp' ? "Pontos de Vida" : "Pontos de Fadiga";
        const attrs = this.actor.system.attributes;

        const content = `
            <form class="secondary-stats-editor">
                <p class="hint">Ajuste os valores base e os modificadores temporários aqui.</p>
                <div class="form-header">
                    <span></span><span>Base</span><span>Mod. Temp.</span><span>Final</span>
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
                        this.actor.update({
                            [`system.attributes.${statKey}.max`]: formData[`${statKey}.max`],
                            [`system.attributes.${statKey}.temp`]: formData[`${statKey}.temp`]
                        });
                    }
                }
            },
default: 'save'
        }, { classes: ["dialog", "gum", "secondary-stats-dialog"] }).render(true);
    });

    // EDITOR DE ST DE CARGA
    html.on('click', '.edit-lifting-st', ev => {
        ev.preventDefault();

        const lifting = this.actor.system.attributes.lifting_st ?? { value: 0, mod: 0, temp: 0, passive: 0, final: 0, final_computed: 0 };
        const fmt = (val) => (val > 0 ? `+${val}` : val || 0);

        const content = `
            <form class="secondary-stats-editor">
                <p class="hint">Defina a ST utilizada para calcular a base de carga.</p>
                <div class="form-header-grid">
                    <span>Atributo</span>
                    <span>Base</span>
                    <span>Mod. Fixo</span>
                    <span>Itens/Pass.</span>
                    <span>Cond./Temp.</span>
                    <span>Final</span>
                </div>

                <div class="form-row">
                    <label>ST de Carga</label>
                    <input type="number" name="lifting_st.value" value="${lifting.value ?? 0}" />
                    <input type="number" name="lifting_st.mod" value="${lifting.mod ?? 0}" />
                    <span class="read-only">${fmt(lifting.passive ?? 0)}</span>
                    <input type="number" name="lifting_st.temp" value="${lifting.temp ?? 0}" />
                    <span class="final-display">${lifting.final ?? lifting.final_computed ?? 0}</span>
                </div>
            </form>

            <style>
                .secondary-stats-editor .form-header-grid,
                .secondary-stats-editor .form-row {
                    display: grid;
                    grid-template-columns: 110px 60px 60px 60px 60px 60px;
                    gap: 5px;
                    align-items: center;
                    text-align: center;
                    margin-bottom: 5px;
                }
            </style>
        `;

        new Dialog({
            title: "Editar ST de Carga",
            content: content,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar",
                    callback: (html) => {
                        const form = html.find('form')[0];
                        const formData = new FormDataExtended(form).object;
                        const updateData = {};

                        const fields = ["value", "mod", "temp"];
                        fields.forEach(field => {
                            if (formData[`lifting_st.${field}`] !== undefined) {
                                updateData[`system.attributes.lifting_st.${field}`] = Number(formData[`lifting_st.${field}`]);
                            }
                        });

                        this.actor.update(updateData);
                    }
                }
            },
            default: 'save'
        }, { classes: ["dialog", "gum", "secondary-stats-dialog"] }).render(true);
    });

    // EDITOR DE ATRIBUTOS SECUNDÁRIOS
    html.on('click', '.edit-secondary-stats-btn', ev => {
        ev.preventDefault();
        const attrs = this.actor.system.attributes;
        const fmt = (val) => (val > 0 ? `+${val}` : val || 0);
        
        const getAttr = (key) => attrs[key] || { value: 10, mod: 0, passive: 0, temp: 0, points: 0, final: 10 };
        const vision = getAttr('vision');
        const hearing = getAttr('hearing');
        const tastesmell = getAttr('tastesmell');
        const touch = getAttr('touch');
        const thrustDamage = attrs.thrust_damage ?? "";
        const swingDamage = attrs.swing_damage ?? "";
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

                <div class="form-section-title">Dano Básico</div>
                <div class="form-row basic-damage-row">
                    <label>GdP (Thrust)</label>
                    <input type="text" name="thrust_damage" value="${thrustDamage}" placeholder="ex: 1d-2"/>
                </div>
                <div class="form-row basic-damage-row">
                    <label>GeB (Swing)</label>
                    <input type="text" name="swing_damage" value="${swingDamage}" placeholder="ex: 1d"/>
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
            .secondary-stats-editor .form-section-title {
                grid-column: 1 / -1;
                font-weight: bold;
                text-align: left;
                margin: 8px 0 4px;
                color: #a53541;
            }
            .secondary-stats-editor .basic-damage-row {
                grid-template-columns: 110px 1fr;
                text-align: left;
            }
            .secondary-stats-editor .basic-damage-row input {
                text-align: left;
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

                        if (formData.thrust_damage !== undefined) {
                            updateData["system.attributes.thrust_damage"] = formData.thrust_damage.toString().trim();
                        }
                        if (formData.swing_damage !== undefined) {
                            updateData["system.attributes.swing_damage"] = formData.swing_damage.toString().trim();
                        }
                        
                        this.actor.update(updateData);
                    }
                }
            },
            default: 'save'
        }, { classes: ["dialog", "gum", "secondary-stats-dialog"], width: 600 }).render(true);
    });

    // QUICK VIEW ORIGIN
    html.find('.quick-view-origin').on('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const originUuid = ev.currentTarget.dataset.originUuid;
        if (!originUuid) return ui.notifications.warn("Sem origem rastreável.");
        const item = await fromUuid(originUuid);
        if (!item) return ui.notifications.error("Item não encontrado.");
        
        // ... Lógica de renderização do Quick View de Origem (Mantida igual) ...
        // Para economizar espaço, use sua lógica existente aqui, ela estava correta.
        this._renderQuickView(item); // Sugiro criar essa função auxiliar ou manter o código inline.
    });

    // ================================================================== //
    //   LISTENER: VISUALIZAÇÃO RÁPIDA (ITEM CARD)
    // ================================================================== //
    html.on('click', '.item-quick-view', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation(); 
        ev.stopImmediatePropagation(); // 🛑 Garante que não feche o acordeão

        const itemId = $(ev.currentTarget).closest('.item, .item-row').data('itemId') || $(ev.currentTarget).data('itemId');
        if (!itemId) return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        // Chama sua função de renderização (mantida a lógica que você enviou)
        this._renderItemQuickView(item); 
    });
}

// -----------------------------------------------------------------------
// MÉTODO AUXILIAR - HTML COMPLETO DO EDITOR DE ATRIBUTOS SECUNDÁRIOS
// -----------------------------------------------------------------------
_getSecondaryStatsHTML(attrs, vision, hearing, tastesmell, touch, fmt) {
  // Helpers seguros (evita crash se algum atributo não existir)
  const safe = (obj, fallback = {}) => obj ?? fallback;

  const basic_speed = safe(attrs.basic_speed, { value: 0, mod: 0, passive: 0, temp: 0, points: 0, final: 0 });
  const basic_move  = safe(attrs.basic_move,  { value: 0, mod: 0, passive: 0, temp: 0, points: 0, final: 0 });
  const mt          = safe(attrs.mt,          { value: 0, mod: 0, passive: 0, temp: 0, points: 0, final: 0 });
  const dodge       = safe(attrs.dodge,       { value: 0, mod: 0, passive: 0, temp: 0, points: 0, final: 0 });

  return `
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

        <!-- Velocidade Básica -->
        <div class="form-row">
          <label>Velocidade</label>
          <input type="number" name="basic_speed.value" value="${basic_speed.value ?? 0}" step="0.25"/>
          <input type="number" name="basic_speed.mod" value="${basic_speed.mod ?? 0}"/>
          <span class="read-only">${fmt(basic_speed.passive ?? 0)}</span>
          <span class="read-only">${fmt(basic_speed.temp ?? 0)}</span>
          <input type="number" name="basic_speed.points" value="${basic_speed.points ?? 0}"/>
          <span class="final-display">${basic_speed.final ?? 0}</span>
        </div>

        <!-- Deslocamento -->
        <div class="form-row">
          <label>Deslocamento</label>
          <input type="number" name="basic_move.value" value="${basic_move.value ?? 0}"/>
          <input type="number" name="basic_move.mod" value="${basic_move.mod ?? 0}"/>
          <span class="read-only">${fmt(basic_move.passive ?? 0)}</span>
          <span class="read-only">${fmt(basic_move.temp ?? 0)}</span>
          <input type="number" name="basic_move.points" value="${basic_move.points ?? 0}"/>
          <span class="final-display">${basic_move.final ?? 0}</span>
        </div>

        <!-- Modificador de Tamanho -->
        <div class="form-row">
          <label>MT</label>
          <input type="number" name="mt.value" value="${mt.value ?? 0}"/>
          <input type="number" name="mt.mod" value="${mt.mod ?? 0}"/>
          <span class="read-only">${fmt(mt.passive ?? 0)}</span>
          <span class="read-only">${fmt(mt.temp ?? 0)}</span>
          <input type="number" name="mt.points" value="${mt.points ?? 0}"/>
          <span class="final-display">${mt.final ?? 0}</span>
        </div>

        <!-- Esquiva (normalmente não editamos "value" direto, só mod/points) -->
        <div class="form-row">
          <label>Esquiva</label>
          <span class="read-only">${dodge.value ?? 0}</span>
          <input type="number" name="dodge.mod" value="${dodge.mod ?? 0}"/>
          <span class="read-only">${fmt(dodge.passive ?? 0)}</span>
          <span class="read-only">${fmt(dodge.temp ?? 0)}</span>
          <input type="number" name="dodge.points" value="${dodge.points ?? 0}"/>
          <span class="final-display">${dodge.final ?? 0}</span>
        </div>

        <hr/>

        <!-- Sentidos -->
        <div class="form-row">
          <label>Visão</label>
          <input type="number" name="vision.value" value="${vision.value ?? 0}"/>
          <input type="number" name="vision.mod" value="${vision.mod ?? 0}"/>
          <span class="read-only">${fmt(vision.passive ?? 0)}</span>
          <span class="read-only">${fmt(vision.temp ?? 0)}</span>
          <input type="number" name="vision.points" value="${vision.points ?? 0}"/>
          <span class="final-display">${vision.final ?? 0}</span>
        </div>

        <div class="form-row">
          <label>Audição</label>
          <input type="number" name="hearing.value" value="${hearing.value ?? 0}"/>
          <input type="number" name="hearing.mod" value="${hearing.mod ?? 0}"/>
          <span class="read-only">${fmt(hearing.passive ?? 0)}</span>
          <span class="read-only">${fmt(hearing.temp ?? 0)}</span>
          <input type="number" name="hearing.points" value="${hearing.points ?? 0}"/>
          <span class="final-display">${hearing.final ?? 0}</span>
        </div>

        <div class="form-row">
          <label>Olfato</label>
          <input type="number" name="tastesmell.value" value="${tastesmell.value ?? 0}"/>
          <input type="number" name="tastesmell.mod" value="${tastesmell.mod ?? 0}"/>
          <span class="read-only">${fmt(tastesmell.passive ?? 0)}</span>
          <span class="read-only">${fmt(tastesmell.temp ?? 0)}</span>
          <input type="number" name="tastesmell.points" value="${tastesmell.points ?? 0}"/>
          <span class="final-display">${tastesmell.final ?? 0}</span>
        </div>

        <div class="form-row">
          <label>Tato</label>
          <input type="number" name="touch.value" value="${touch.value ?? 0}"/>
          <input type="number" name="touch.mod" value="${touch.mod ?? 0}"/>
          <span class="read-only">${fmt(touch.passive ?? 0)}</span>
          <span class="read-only">${fmt(touch.temp ?? 0)}</span>
          <input type="number" name="touch.points" value="${touch.points ?? 0}"/>
          <span class="final-display">${touch.final ?? 0}</span>
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
      .secondary-stats-editor .form-header-grid span {
        font-weight: bold;
        font-size: 0.85em;
        white-space: nowrap;
      }
      .secondary-stats-editor label {
        text-align: left;
        font-weight: bold;
        font-size: 0.9em;
      }
      .secondary-stats-editor input { text-align: center; }
      .secondary-stats-editor .read-only { color: #666; font-style: italic; }
      .secondary-stats-editor .final-display { font-weight: bold; color: #a53541; font-size: 1.1em; }
      .secondary-stats-editor hr { grid-column: 1 / -1; width: 100%; margin: 8px 0; opacity: 0.4; }
    </style>
  `;
}


// ================================================================== //
  //  MÉTODO AUXILIAR: VISUALIZAÇÃO RÁPIDA (QUICK VIEW)
  // ================================================================== //
  async _renderItemQuickView(item) {
    if (!item) return;

    // 1. Mapa de Nomes Legíveis
    const getTypeName = (type) => {
      const typeMap = {
        equipment: "Equipamento",
        melee_weapon: "Arma C. a C.",
        ranged_weapon: "Arma à Dist.",
        armor: "Armadura",
        advantage: "Vantagem",
        disadvantage: "Desvantagem",
        skill: "Perícia",
        spell: "Magia",
        power: "Poder",
        condition: "Condição",
        gm_modifier: "Modificador"
      };
      return typeMap[type] || type.toUpperCase();
    };

    // 2. Preparação de Dados Básicos
    const data = {
      name: item.name,
      img: item.img,
      type: getTypeName(item.type),
      system: item.system
    };

    // 3. Função Auxiliar para Criar Tags Visuais
    const createTag = (label, value) => {
      if (value !== null && value !== undefined && value !== '' && value.toString().trim() !== '') {
        return `<div class="property-tag"><label>${label}</label><span>${value}</span></div>`;
      }
      return '';
    };

    // 4. Montagem das Tags Específicas por Tipo
    let mechanicalTagsHtml = '';
    const s = data.system;

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
        mechanicalTagsHtml += createTag('Local', `<span style="text-transform:capitalize">${s.worn_location || 'N/A'}</span>`);
        break;

      case 'skill':
        mechanicalTagsHtml += createTag('Attr.', `<span style="text-transform:uppercase">${s.base_attribute || '--'}</span>`);
        mechanicalTagsHtml += createTag('Nível', `${s.skill_level > 0 ? '+' : ''}${s.skill_level || '0'}`);
        mechanicalTagsHtml += createTag('Grupo', s.group);
        break;

      case 'spell':
        mechanicalTagsHtml += createTag('Classe', s.spell_class);
        mechanicalTagsHtml += createTag('Tempo', s.casting_time);
        mechanicalTagsHtml += createTag('Duração', s.duration);
        mechanicalTagsHtml += createTag('Custo', `${s.mana_cost || '0'} / ${s.mana_maint || '0'}`);
        break;

      case 'power':
        mechanicalTagsHtml += createTag('Custo', `${s.activation_cost || '0'} / ${s.maint_cost || '0'}`);
        mechanicalTagsHtml += createTag('Duração', s.duration);
        break;

      case 'advantage':
      case 'disadvantage':
        mechanicalTagsHtml += createTag('Pontos', s.points);
        break;
    }

    // Adiciona Peso e Custo para itens físicos (se existirem)
    if (['equipment', 'melee_weapon', 'ranged_weapon', 'armor'].includes(item.type)) {
       mechanicalTagsHtml += createTag('Qtd', `x${s.quantity || 1}`);
       mechanicalTagsHtml += createTag('Peso', s.total_weight ? `${s.total_weight} kg` : null);
       mechanicalTagsHtml += createTag('Custo', s.total_cost ? `$${s.total_cost}` : null);
    }

    // 5. Enriquecimento da Descrição (Links, HTML, Secrets)
    const description = await TextEditorImpl.enrichHTML(s.chat_description || s.description || "<i>Sem descrição.</i>", {
      secrets: this.actor.isOwner,
      async: true
    });

    // 6. Montagem do Conteúdo HTML Final
    const content = `
        <div class="gurps-dialog-canvas">
            <div class="gurps-item-preview-card" data-item-id="${item.id}">
                <header class="preview-header">
                    <img src="${data.img}" class="header-icon"/>
                    <div class="header-text">
                        <h3>${data.name}</h3>
                        <span class="preview-item-type">${data.type}</span>
                    </div>
                    <div class="header-controls">
                        <a class="send-to-chat" title="Enviar para o Chat"><i class="fas fa-comment"></i></a>
                    </div>
                </header>
                
                <div class="preview-content">
                    <div class="preview-properties">
                        ${mechanicalTagsHtml}
                    </div>
                    
                    ${(description && description.trim() !== "<i>Sem descrição.</i>") ? '<hr class="preview-divider">' : ''}
                    
                    <div class="preview-description">
                        ${description}
                    </div>
                </div>
            </div>
        </div>
    `;

    // 7. Renderização do Dialog
    new Dialog({
      title: `Detalhes: ${data.name}`,
      content: content,
      buttons: {
        close: {
          icon: '<i class="fas fa-times"></i>',
          label: "Fechar"
        }
      },
      default: "close",
      options: {
        classes: ["dialog", "gurps-item-preview-dialog"],
        width: 420,
        height: "auto",
        resizable: true
      },
      render: (html) => {
        // Listener do Botão "Enviar para o Chat"
        html.find('.send-to-chat').on('click', (event) => {
          const cardHTML = $(event.currentTarget).closest('.gurps-item-preview-card').html();
          // Remove os controles de header antes de mandar pro chat para ficar limpo
          const cleanHTML = cardHTML.replace(/<div class="header-controls">.*?<\/div>/s, ``);
          
          const chatContent = `<div class="gurps-item-preview-card chat-card">${cleanHTML}</div>`;
          
          ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: chatContent,
             style: CONST.CHAT_MESSAGE_STYLES.OTHER
          });
          ui.notifications.info("Enviado para o chat.");
        });
      }
    }).render(true);
  }

_renderQuickView(item) {
   // Mesma lógica para o Quick View de Origem
   this._renderItemQuickView(item);
}

  /**
   * Salva o estado (aberto/fechado) das caixas colapsáveis nas Flags do ator
   */
  async _onDetailsToggle(event) {
    const details = event.currentTarget;
    
    // Verifica se o elemento tem um ID de grupo para salvar
    const groupId = details.dataset.groupId;
    if (!groupId) return; // Se não tiver ID, não salva

    const isOpen = details.open; // True se aberto, False se fechado

    // Salva dentro de 'flags.gum.sheetCollapsedState'
    // O 'gum' é o ID do seu sistema/módulo. Se for outro nome, troque aqui.
    await this.actor.setFlag('gum', `sheetCollapsedState.${groupId}`, isOpen);
  }



/**
 * Abre um diálogo simples para editar as fórmulas de Dano Básico (GdP/GeB).
 * Campos: system.attributes.thrust_damage e system.attributes.swing_damage
 */
async _onEditBasicDamage(ev) {
  ev.preventDefault();
  ev.stopPropagation();

  const attrs = this.actor.system.attributes || {};
  const thrust = attrs.thrust_damage ?? "";
  const swing = attrs.swing_damage ?? "";

  const content = `
    <form class="gum-dialog-content basic-damage-editor">
      <div class="form-group">
        <label>GdP (Thrust)</label>
        <input type="text" name="thrust" value="${thrust}" placeholder="ex: 1d-2" />
      </div>
      <div class="form-group">
        <label>GeB (Swing)</label>
        <input type="text" name="swing" value="${swing}" placeholder="ex: 1d" />
      </div>
      <p style="opacity:0.75; font-size: 12px; margin-top: 8px;">
        Dica: aqui você pode registrar a fórmula final exibida na ficha (ex.: <b>2d+1</b>).
      </p>
    </form>
  `;

  return new Dialog({
    title: "Editar Dano Básico",
    content,
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: "Salvar",
        callback: async (html) => {
          const form = html.find("form")[0];
          const fd = new FormData(form);
          const update = {
            "system.attributes.thrust_damage": (fd.get("thrust") ?? "").toString().trim(),
            "system.attributes.swing_damage": (fd.get("swing") ?? "").toString().trim()
          };
          await this.actor.update(update);
        }
      },
      cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" }
    },
    default: "save"
  }, { classes: ["dialog", "gum"], width: 360 }).render(true);
}

async _onViewHitLocations(ev) {
  ev.preventDefault();
  ev.stopPropagation();

  const actor = this.actor;
  const profiles = listBodyProfiles();
  const currentProfileId = actor.system.combat?.body_profile || "humanoid";
  const sheetData = await this.getData();

  // Pega todos os objetos de RD
  const actorDR_Armor = actor.system.combat.dr_from_armor || {};
  const actorDR_Mods  = actor.system.combat.dr_mods || {};
  const actorDR_Temp  = actor.system.combat.dr_temp_mods || {};
  const actorDR_Total = actor.system.combat.dr_locations || {};

   let tableRows = "";
   const baseOrder = sheetData.hitLocationOrder?.length
    ? sheetData.hitLocationOrder
    : Object.keys(sheetData.hitLocations || {});
  const extraKeys = Object.keys(actor.system.combat?.dr_locations || {})
    .filter(key => !sheetData.hitLocations?.[key] && getBodyLocationDefinition(key))
    .sort((a, b) => {
      const aLabel = getBodyLocationDefinition(a)?.label ?? a;
      const bLabel = getBodyLocationDefinition(b)?.label ?? b;
      return aLabel.localeCompare(bLabel);
    });
  const locationOrder = [...baseOrder, ...extraKeys];

  for (const key of locationOrder) {
    const loc = sheetData.hitLocations?.[key] ?? getBodyLocationDefinition(key);
    if (!loc) continue;
    const armorDR_String  = this._formatDRObjectToString(actorDR_Armor[key]);
    const tempDR_String   = this._formatDRObjectToString(actorDR_Temp[key]);
    const manualMod_String= this._formatDRObjectToString(actorDR_Mods[key]);
    const totalDR_String  = this._formatDRObjectToString(actorDR_Total[key]);

    tableRows += `
      <div class="table-row">
        <div class="loc-label">${loc.label ?? loc.name ?? key}</div>
        <div class="loc-rd-armor" title="RD da Armadura">${armorDR_String}</div>
        <div class="loc-rd-temp" title="Bônus Temporários">${tempDR_String}</div>
        <div class="loc-rd-mod">
          <input type="text" name="${key}" value="${manualMod_String}" />
        </div>
        <div class="loc-rd-total"><strong>${totalDR_String}</strong></div>
      </div>
    `;
  }

  const profileOptionsHtml = profiles.map(p =>
  `<option value="${p.id}" ${p.id === currentProfileId ? "selected" : ""}>${p.label}</option>`
).join("");

const profileSelectorHtml = `
  <div class="gum-rd-profile-row" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
    <label style="font-weight:700; white-space:nowrap;">Tipo Corporal</label>
    <select class="gum-body-profile-select" name="body_profile">
      ${profileOptionsHtml}
    </select>
    <span style="opacity:.7; font-size:12px;">(altera as localizações exibidas)</span>
  </div>
`;

  const content = `
  <form class="gum-rd-form">
    ${profileSelectorHtml}

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

const dlg = new Dialog({
  title: "Tabela de Locais de Acerto e RD",
  content,
  buttons: {
    save: {
      icon: '<i class="fas fa-save"></i>',
      label: "Salvar Modificadores",
      callback: async (html) => {
        const form = html.find("form")[0];
        const formData = new FormDataExtended(form).object;

        // ✅ IMPORTANTE: remove o campo do dropdown para não virar dr_mods.body_profile
        delete formData.body_profile;

        const newDrMods = {};
        for (const [loc, drString] of Object.entries(formData)) {
          newDrMods[loc] = this._parseDRStringToObject(drString);
        }

        await actor.update({ "system.combat.dr_mods": newDrMods });
      }
    },
    cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" }
  },
  default: "save",

  // ✅ AQUI é onde entra o "render" (fica DENTRO do primeiro objeto do Dialog)
  render: (dialogHtml) => {
    // Quando trocar o tipo corporal:
    dialogHtml.on("change", ".gum-body-profile-select", async (e) => {
      const newProfileId = e.currentTarget.value;
      if (!newProfileId || newProfileId === currentProfileId) return;

      // Salva o perfil corporal no ator
      await actor.update({ "system.combat.body_profile": newProfileId });

      // Fecha este dialog
      dlg.close();

      // Reabre o dialog já com o novo perfil (recalcula hitLocations)
      const fakeEv = { preventDefault() {}, stopPropagation() {} };
      await this._onViewHitLocations(fakeEv);
    });
  }

}, { classes: ["dialog", "gum"], width: 650 });

dlg.render(true);

}

_setupActionMenuListeners(html) {
  const namespace = `.gumActionMenu-${this.appId}`;
  $(document).off(`click${namespace}`);
  $(document).on(`click${namespace}`, (ev) => this._handleDocumentActionMenuClick(ev));

  html.on("click", ".js-action-menu-toggle", (ev) => this._onActionMenuToggle(ev));
  html.on("click", ".js-action-menu-panel .item-control", () => this._closeAllActionMenus());
}

_handleDocumentActionMenuClick(ev) {
  if (!this.element?.length) return;
  if ($(ev.target).closest(".js-action-menu").length) return;
  this._closeAllActionMenus();
}

_onActionMenuToggle(ev) {
  ev.preventDefault();
  ev.stopPropagation();

  const menu = ev.currentTarget.closest(".js-action-menu");
  if (!menu) return;

  const isOpen = menu.classList.contains("is-open");
  this._closeAllActionMenus();

  if (!isOpen) {
    menu.classList.add("is-open");
    const controls = menu.closest(".item-controls");
    if (controls) controls.classList.add("menu-open");
    const toggle = menu.querySelector(".js-action-menu-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
  }
}

_closeAllActionMenus() {
  if (!this.element?.length) return;
  this.element.find(".item-controls.menu-open").removeClass("menu-open");
  this.element.find(".js-action-menu.is-open").removeClass("is-open")
    .find(".js-action-menu-toggle").attr("aria-expanded", "false");
}

async close(options = {}) {
  $(document).off(`click.gumActionMenu-${this.appId}`);
  return super.close(options);
}

async _onAddCombatMeter(ev) {
  ev.preventDefault();
  const meterData = await this._promptCombatMeterData({}, { isEdit: false });
  if (!meterData) return;

  const meterId = foundry.utils.randomID();
  await this.actor.update({ [`system.combat.combat_meters.${meterId}`]: meterData });
}

async _onEditCombatMeter(ev) {
  ev.preventDefault();
  const meterId = ev.currentTarget.closest(".meter-card")?.dataset?.meterId;
  if (!meterId) return;

  const existing = this.actor.system.combat.combat_meters?.[meterId];
  const meterData = await this._promptCombatMeterData(existing, { isEdit: true });
  if (!meterData) return;

  await this.actor.update({ [`system.combat.combat_meters.${meterId}`]: meterData });
}

async _onDeleteCombatMeter(ev) {
  ev.preventDefault();
  const meterId = ev.currentTarget.closest(".meter-card")?.dataset?.meterId;
  if (!meterId) return;

  const name = this.actor.system.combat.combat_meters?.[meterId]?.name || "registro";
  Dialog.confirm({
    title: `Excluir ${name}?`,
    content: `<p>Tem certeza que deseja remover este registro?</p>`,
    yes: async () => {
      await this.actor.update({ [`system.combat.combat_meters.-=${meterId}`]: null });
    }
  });
}

async _onToggleCombatMeterVisibility(ev) {
  ev.preventDefault();
  const meterId = ev.currentTarget.closest(".meter-card")?.dataset?.meterId;
  if (!meterId) return;

  const current = this.actor.system.combat.combat_meters?.[meterId];
  if (!current) return;

  const newState = !current.hidden;
  await this.actor.update({ [`system.combat.combat_meters.${meterId}.hidden`]: newState });
}

_onToggleHiddenMeters(ev) {
  ev.preventDefault();
  this._showHiddenMeters = !this._showHiddenMeters;
  this.render(false);
}

async _onCombatMeterInputChange(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();

  const input = ev.currentTarget;
  const meterCard = input.closest(".meter-card");
  if (!meterCard) return;

  const meterId = meterCard.dataset.meterId;
  const prop =
    input.name?.split(".").pop() ||
    input.dataset.property;
  if (!meterId || !prop) return;

  const value = Number(input.value) || 0;
  const updateData = { [`system.combat.combat_meters.${meterId}.${prop}`]: value };
  if (prop === "current") updateData[`system.combat.combat_meters.${meterId}.value`] = value;

  await this.actor.update(updateData);
}

async _promptCombatMeterData(initialData = {}, { isEdit = false } = {}) {
  const data = this._normalizeResourceEntry(initialData, { defaultName: "Registro", allowHidden: true });
  const content = `
    <form class="gum-meter-form">
      <div class="form-group">
        <label>Nome do Registro</label>
        <input type="text" name="name" value="${data.name || ""}" required/>
      </div>
      <div class="form-group">
        <label>Valor Atual</label>
        <input type="number" name="current" value="${data.current ?? 0}" min="0"/>
      </div>
      <div class="form-group">
        <label>Valor Máximo</label>
        <input type="number" name="max" value="${data.max ?? 0}" min="0"/>
      </div>
      <div class="form-group">
        <label class="checkbox">
          <input type="checkbox" name="hidden" ${data.hidden ? "checked" : ""}/>
          Ocultar na ficha
        </label>
      </div>
    </form>`;

  const title = isEdit ? "Editar Registro" : "Novo Registro";

  return Dialog.prompt({
    title,
    content,
    label: "Salvar",
    callback: (html) => {
      const form = html[0].querySelector("form");
      const name = form.name.value.trim();
      if (!name) return ui.notifications.warn("Informe um nome para o registro.");

      const current = Number(form.current.value) || 0;
      const max = Number(form.max.value) || 0;
      const hidden = form.hidden?.checked ?? false;

      return { name, current, max, value: current, hidden };
    },
    rejectClose: false
  });
}

async _onAddEnergyReserve(ev) {
  ev.preventDefault();
  const reserveType = ev.currentTarget?.dataset?.reserveType === "power" ? "power" : "spell";
  const reserveData = await this._promptEnergyReserveData(reserveType, {}, { isEdit: false });
  if (!reserveData) return;

  const reserveId = foundry.utils.randomID();
  await this.actor.update({ [`system.${reserveType}_reserves.${reserveId}`]: reserveData });
}

async _onEditEnergyReserve(ev) {
  ev.preventDefault();
  const card = ev.currentTarget.closest(".reserve-card");
  const reserveId = card?.dataset?.reserveId;
  const reserveType = card?.dataset?.reserveType === "power" ? "power" : "spell";
  if (!reserveId) return;

  const existing = this.actor.system?.[`${reserveType}_reserves`]?.[reserveId];
  const reserveData = await this._promptEnergyReserveData(reserveType, existing, { isEdit: true });
  if (!reserveData) return;

  await this.actor.update({ [`system.${reserveType}_reserves.${reserveId}`]: reserveData });
}

async _onDeleteEnergyReserve(ev) {
  ev.preventDefault();
  const card = ev.currentTarget.closest(".reserve-card");
  const reserveId = card?.dataset?.reserveId;
  const reserveType = card?.dataset?.reserveType === "power" ? "power" : "spell";
  if (!reserveId) return;

  const name = this.actor.system?.[`${reserveType}_reserves`]?.[reserveId]?.name || "reserva";

  Dialog.confirm({
    title: `Excluir ${name}?`,
    content: `<p>Tem certeza que deseja remover esta reserva?</p>`,
    yes: async () => {
      await this.actor.update({ [`system.${reserveType}_reserves.-=${reserveId}`]: null });
    }
  });
}

async _onEnergyReserveInputChange(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();

  const input = ev.currentTarget;
  const card = input.closest(".reserve-card");
  if (!card) return;

  const reserveId = card.dataset.reserveId;
  const reserveType = card.dataset.reserveType === "power" ? "power" : "spell";
  const prop = input.dataset.property;
  if (!reserveId || !prop) return;

  const value = Number(input.value) || 0;
  const pathBase = `system.${reserveType}_reserves.${reserveId}`;
  const updateData = { [`${pathBase}.${prop}`]: value };
  if (prop === "current") updateData[`${pathBase}.value`] = value;

  await this.actor.update(updateData);
}

async _promptEnergyReserveData(reserveType, initialData = {}, { isEdit = false } = {}) {
  const data = this._normalizeResourceEntry(initialData, { defaultName: reserveType === "power" ? "Reserva de Poder" : "Reserva de Magia" });
  const content = `
    <form class="gum-meter-form">
      <div class="form-group">
        <label>Nome</label>
        <input type="text" name="name" value="${data.name || ""}" required/>
      </div>
      <div class="form-group">
        <label>Fonte / Origem</label>
        <input type="text" name="source" value="${data.source || ""}" />
      </div>
      <div class="form-group">
        <label>Valor Atual</label>
        <input type="number" name="current" value="${data.current ?? 0}" min="0"/>
      </div>
      <div class="form-group">
        <label>Valor Máximo</label>
        <input type="number" name="max" value="${data.max ?? 0}" min="0"/>
      </div>
    </form>`;

  const title = reserveType === "power"
    ? isEdit ? "Editar Reserva de Poder" : "Nova Reserva de Poder"
    : isEdit ? "Editar Reserva de Magia" : "Nova Reserva de Magia";

  return Dialog.prompt({
    title,
    content,
    label: "Salvar",
    callback: (html) => {
      const form = html[0].querySelector("form");
      const name = form.name.value.trim();
      if (!name) return ui.notifications.warn("Informe um nome para a reserva.");

      const source = form.source.value.trim();
      const current = Number(form.current.value) || 0;
      const max = Number(form.max.value) || 0;

      return { name, source, current, max, value: current };
    },
 rejectClose: false
  });
}


_prepareCastingAbilities() {
  const collection = foundry.utils.duplicate(this.actor.system.casting_abilities || {});
  const abilities = Object.entries(collection).map(([id, ability]) => ({
    id,
    name: ability?.name || "Habilidade de Conjuração",
    source: ability?.source || "Fonte indefinida",
    level: Number(ability?.level) || 0,
    points: Number(ability?.points) || 0,
    description: ability?.description || ""
  }));

  if (!abilities.length) {
    const legacy = this.actor.system.casting_ability || {};
    const hasLegacyData = Boolean(
      String(legacy.name || "").trim() ||
      String(legacy.source || "").trim() ||
      String(legacy.description || "").trim() ||
      Number(legacy.level) ||
      Number(legacy.points)
    );

    if (hasLegacyData) {
      abilities.push({
        id: "legacy",
        name: legacy.name || "Habilidade de Conjuração",
        source: legacy.source || "Fonte Mágica",
        level: Number(legacy.level) || 0,
        points: Number(legacy.points) || 0,
        description: legacy.description || ""
      });
    }
  }

  return abilities.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

_getCastingAbilityById(abilityId) {
  if (!abilityId) return null;

  if (abilityId === "legacy") {
    const legacy = this.actor.system.casting_ability || {};
    return {
      id: "legacy",
      name: legacy.name || "Habilidade de Conjuração",
      source: legacy.source || "Fonte Mágica",
      level: Number(legacy.level) || 0,
      points: Number(legacy.points) || 0,
      description: legacy.description || ""
    };
  }

  const ability = this.actor.system.casting_abilities?.[abilityId];
  if (!ability) return null;

  return {
    id: abilityId,
    name: ability.name || "Habilidade de Conjuração",
    source: ability.source || "Fonte indefinida",
    level: Number(ability.level) || 0,
    points: Number(ability.points) || 0,
    description: ability.description || ""
  };
}

async _promptCastingAbilityData(initialData = {}, { isEdit = false } = {}) {
  const data = {
    name: initialData?.name || "",
    source: initialData?.source || "",
    level: Number(initialData?.level) || 0,
    points: Number(initialData?.points) || 0,
    description: initialData?.description || ""
  };

  const content = `
    <form class="gum-meter-form casting-ability-form">
      <div class="form-group">
        <label>Habilidade de Conjuração</label>
        <input type="text" name="name" value="${data.name}" required/>
      </div>
      <div class="form-group">
        <label>Fonte</label>
        <input type="text" name="source" value="${data.source}" />
      </div>
      <div class="form-group">
        <label>Nível</label>
        <input type="number" name="level" value="${data.level}" />
      </div>
      <div class="form-group">
        <label>Pontos</label>
        <input type="number" name="points" value="${data.points}" />
      </div>
      <div class="form-group">
        <label>Descrição</label>
        <textarea name="description" rows="6">${data.description}</textarea>
      </div>
    </form>`;

  return Dialog.prompt({
    title: isEdit ? "Editar Habilidade de Conjuração" : "Nova Habilidade de Conjuração",
    content,
    label: "Salvar",
    callback: (html) => {
      const form = html[0].querySelector("form");
      const name = form.name.value.trim();
      if (!name) return ui.notifications.warn("Informe o nome da habilidade de conjuração.");

      return {
        name,
        source: form.source.value.trim(),
        level: Number(form.level.value) || 0,
        points: Number(form.points.value) || 0,
        description: form.description.value.trim()
      };
    },
    rejectClose: false
  });
}

async _onAddCastingAbility(ev) {
  ev.preventDefault();
  const abilityData = await this._promptCastingAbilityData({}, { isEdit: false });
  if (!abilityData) return;

  const abilityId = foundry.utils.randomID();
  await this.actor.update({ [`system.casting_abilities.${abilityId}`]: abilityData });
}

async _onEditCastingAbility(ev) {
  ev.preventDefault();
  const card = ev.currentTarget.closest(".casting-ability-card");
  const abilityId = card?.dataset?.abilityId;
  if (!abilityId) return;

  const current = this._getCastingAbilityById(abilityId);
  if (!current) return;

  const updated = await this._promptCastingAbilityData(current, { isEdit: true });
  if (!updated) return;

  if (abilityId === "legacy") {
    await this.actor.update({ "system.casting_ability": updated });
    return;
  }

  await this.actor.update({ [`system.casting_abilities.${abilityId}`]: updated });
}

async _onDeleteCastingAbility(ev) {
  ev.preventDefault();
  const card = ev.currentTarget.closest(".casting-ability-card");
  const abilityId = card?.dataset?.abilityId;
  if (!abilityId) return;

  const ability = this._getCastingAbilityById(abilityId);
  if (!ability) return;

  Dialog.confirm({
    title: `Excluir ${ability.name}?`,
    content: "<p>Tem certeza que deseja remover esta habilidade de conjuração?</p>",
    yes: async () => {
      if (abilityId === "legacy") {
        await this.actor.update({
          "system.casting_ability": {
            name: "",
            source: "",
            level: 0,
            points: 0,
            description: ""
          }
        });
        return;
      }

      await this.actor.update({ [`system.casting_abilities.-=${abilityId}`]: null });
    }
  });
}

_onViewCastingAbility(ev) {
  ev.preventDefault();
  const card = ev.currentTarget.closest(".casting-ability-card");
  const abilityId = card?.dataset?.abilityId;
  if (!abilityId) return;

  const ability = this._getCastingAbilityById(abilityId);
  if (!ability) return;

  const description = ability.description || "<em>Sem descrição.</em>";

  new Dialog({
    title: `${ability.name} (Nv ${ability.level})`,
    content: `
      <div class="casting-ability-preview">
        <p><strong>Fonte:</strong> ${ability.source || "-"}</p>
        <p><strong>Pontos:</strong> ${ability.points}</p>
        <hr>
        <div>${description}</div>
      </div>
    `,
    buttons: {
      close: {
        icon: '<i class="fas fa-times"></i>',
        label: "Fechar"
      }
    },
    default: "close"
  }).render(true);
}

_preparePowerSources() {
  const collection = foundry.utils.duplicate(this.actor.system.power_sources || {});
  const sources = Object.entries(collection).map(([id, source]) => ({
    id,
    name: source?.name || "Fonte de Poder",
    source: source?.source || "",
    focus: source?.focus || "",
    level: Number(source?.level) || 0,
    points: Number(source?.points) || 0,
    power_talent_name: source?.power_talent_name || "",
    power_talent_level: Number(source?.power_talent_level) || Number(source?.power_talent) || 0,
    power_talent_points: Number(source?.power_talent_points) || 0,
    description: source?.description || ""
  }));

  if (!sources.length) {
    const legacy = this.actor.system.power_source || {};
    const hasLegacyData = Boolean(
      String(legacy.name || "").trim() ||
      String(legacy.source || "").trim() ||
      String(legacy.focus || "").trim() ||
      String(legacy.description || "").trim() ||
      Number(legacy.level) ||
      Number(legacy.points) ||
      String(legacy.power_talent_name || "").trim() ||
      Number(legacy.power_talent_level) ||
      Number(legacy.power_talent_points) ||
      Number(legacy.power_talent)
    );

    if (hasLegacyData) {
      sources.push({
        id: "legacy",
        name: legacy.name || "Fonte de Poder",
        source: legacy.source || "",
        focus: legacy.focus || "",
        level: Number(legacy.level) || 0,
        points: Number(legacy.points) || 0,
        power_talent_name: legacy.power_talent_name || "",
        power_talent_level: Number(legacy.power_talent_level) || Number(legacy.power_talent) || 0,
        power_talent_points: Number(legacy.power_talent_points) || 0,
        description: legacy.description || ""
      });
    }
  }

  return sources.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

_getPowerSourceById(sourceId) {
  if (!sourceId) return null;

  if (sourceId === "legacy") {
    const legacy = this.actor.system.power_source || {};
    return {
      id: "legacy",
      name: legacy.name || "Fonte de Poder",
      source: legacy.source || "",
      focus: legacy.focus || "",
      level: Number(legacy.level) || 0,
      points: Number(legacy.points) || 0,
      power_talent_name: legacy.power_talent_name || "",
      power_talent_level: Number(legacy.power_talent_level) || Number(legacy.power_talent) || 0,
      power_talent_points: Number(legacy.power_talent_points) || 0,
      description: legacy.description || ""
    };
  }

  const source = this.actor.system.power_sources?.[sourceId];
  if (!source) return null;

  return {
    id: sourceId,
    name: source.name || "Fonte de Poder",
    source: source.source || "",
    focus: source.focus || "",
    level: Number(source.level) || 0,
    points: Number(source.points) || 0,
    power_talent_name: source.power_talent_name || "",
    power_talent_level: Number(source.power_talent_level) || Number(source.power_talent) || 0,
    power_talent_points: Number(source.power_talent_points) || 0,
    description: source.description || ""
  };
}

async _promptPowerSourceData(initialData = {}, { isEdit = false } = {}) {
  const data = {
    name: initialData?.name || "",
    source: initialData?.source || "",
    focus: initialData?.focus || "",
    level: Number(initialData?.level) || 0,
    points: Number(initialData?.points) || 0,
    power_talent_name: initialData?.power_talent_name || "",
    power_talent_level: Number(initialData?.power_talent_level) || 0,
    power_talent_points: Number(initialData?.power_talent_points) || 0,
    description: initialData?.description || ""
  };

  const content = `
    <form class="gum-meter-form power-source-form">
      <div class="form-group">
        <label>Nome do Poder</label>
        <input type="text" name="name" value="${data.name}" required/>
      </div>
      <div class="form-group">
        <label>Origem/Fonte</label>
        <input type="text" name="source" value="${data.source}"/>
      </div>
      <div class="form-group">
        <label>Foco do Poder</label>
        <input type="text" name="focus" value="${data.focus}"/>
      </div>
      <div class="form-group">
        <label>Nível</label>
        <input type="number" name="level" value="${data.level}" />
      </div>
      <div class="form-group">
        <label>Pontos</label>
        <input type="number" name="points" value="${data.points}" />
      </div>
      <div class="form-group">
        <hr>
      </div>
      <div class="form-group">
        <label>Talento de Poder</label>
        <input type="text" name="power_talent_name" value="${data.power_talent_name}" />
      </div>
      <div class="form-group">
        <label>Nível do talento</label>
        <input type="number" name="power_talent_level" value="${data.power_talent_level}" />
      </div>
      <div class="form-group">
        <label>Pontos (Talento de Poder)</label>
        <input type="number" name="power_talent_points" value="${data.power_talent_points}" />
      </div>
      <div class="form-group">
        <hr>
      </div>
      <div class="form-group">
        <label>Descrição do Poder</label>
        <textarea name="description" rows="6">${data.description}</textarea>
      </div>
    </form>`;

  return Dialog.prompt({
    title: isEdit ? "Editar Fonte de Poder" : "Configurar Fonte de Poder",
    content,
    label: "Salvar",
    callback: (html) => {
      const form = html[0].querySelector("form");
      const name = form.name.value.trim();
      if (!name) return ui.notifications.warn("Informe o nome da fonte de poder.");

      return {
        name,
        source: form.source.value.trim(),
        focus: form.focus.value.trim(),
        level: Number(form.level.value) || 0,
        points: Number(form.points.value) || 0,
        power_talent_name: form.power_talent_name.value.trim(),
        power_talent_level: Number(form.power_talent_level.value) || 0,
        power_talent_points: Number(form.power_talent_points.value) || 0,
        description: form.description.value.trim()
      };
    },
    rejectClose: false
  });
}

async _onAddPowerSource(ev) {
  ev.preventDefault();
  const sourceData = await this._promptPowerSourceData({}, { isEdit: false });
  if (!sourceData) return;

  const sourceId = foundry.utils.randomID();
  await this.actor.update({ [`system.power_sources.${sourceId}`]: sourceData });
}

async _onEditPowerSource(ev) {
  ev.preventDefault();
  const card = ev.currentTarget.closest(".power-source-card");
  const sourceId = card?.dataset?.powerSourceId;
  if (!sourceId) return;

  const current = this._getPowerSourceById(sourceId);
  if (!current) return;

  const updated = await this._promptPowerSourceData(current, { isEdit: true });
  if (!updated) return;

  if (sourceId === "legacy") {
    await this.actor.update({ "system.power_source": updated });
    return;
  }

  await this.actor.update({ [`system.power_sources.${sourceId}`]: updated });
}

async _onDeletePowerSource(ev) {
  ev.preventDefault();
  const card = ev.currentTarget.closest(".power-source-card");
  const sourceId = card?.dataset?.powerSourceId;
  if (!sourceId) return;

  const source = this._getPowerSourceById(sourceId);
  if (!source) return;

  Dialog.confirm({
    title: `Excluir ${source.name}?`,
    content: "<p>Tem certeza que deseja remover esta fonte de poder?</p>",
    yes: async () => {
          if (sourceId === "legacy") {
          await this.actor.update({
            "system.power_source": {
              name: "",
              source: "",
              focus: "",
              level: 0,
              points: 0,
              power_talent_name: "",
              power_talent_level: 0,
              power_talent_points: 0,
             description: ""
            }
          });
          return;
          }

          await this.actor.update({ [`system.power_sources.-=${sourceId}`]: null });
    }
  });
}

_onViewPowerSource(ev) {
  ev.preventDefault();
  const card = ev.currentTarget.closest(".power-source-card");
  const sourceId = card?.dataset?.powerSourceId;
  if (!sourceId) return;

  const source = this._getPowerSourceById(sourceId);
  if (!source) return;

  const description = source.description || "<em>Sem descrição.</em>";

  new Dialog({
    title: `${source.name} (Nv ${source.level})`,
    content: `
      <div class="casting-ability-preview">
        <p><strong>Origem/Fonte:</strong> ${source.source || "-"}</p>
        <p><strong>Foco do Poder:</strong> ${source.focus || "-"}</p>
        <p><strong>Nível:</strong> ${source.level}</p>
        <p><strong>Pontos:</strong> ${source.points}</p>
        <hr>
        <p><strong>Talento de Poder:</strong> ${source.power_talent_name || "-"}</p>
        <p><strong>Nível do Talento:</strong> ${source.power_talent_level}</p>
        <p><strong>Pontos do Talento:</strong> ${source.power_talent_points}</p>
        <hr>
        <div>${description}</div>
      </div>
    `,
    buttons: {
      close: {
        icon: '<i class="fas fa-times"></i>',
        label: "Fechar"
      }
    },
    default: "close"
  }).render(true);
}

_getSocialEntryConfig(type) {
  const configs = {
    status: {
      label: "Status Social",
      path: "system.social_status_entries",
      fields: [
        { name: "society", label: "Sociedade", type: "text", placeholder: "Ex: Nobreza, Guilda" },
        { name: "status_name", label: "Status", type: "text", placeholder: "Ex: Cavaleiro, Membro" },
        { name: "level", label: "Nível", type: "number" },
        { name: "monthly_cost", label: "Custo Mensal", type: "text", placeholder: "Ex: 50" }
      ]
    },
    organization: {
      label: "Organização",
      path: "system.organization_entries",
      fields: [
        { name: "organization_name", label: "Organização", type: "text" },
        { name: "status_name", label: "Status", type: "text" },
        { name: "level", label: "Nível", type: "number" },
        { name: "salary", label: "Salário", type: "text" }
      ]
    },
    culture: {
      label: "Cultura",
      path: "system.culture_entries",
      fields: [
        { name: "culture_name", label: "Cultura", type: "text" },
        { name: "level", label: "Nível", type: "number" }
      ]
    },
    language: {
      label: "Idioma",
      path: "system.language_entries",
      fields: [
        { name: "language_name", label: "Idioma", type: "text" },
        { name: "written_level", label: "Escrita", type: "text", placeholder: "Ex: Nenhuma, Básica, Fluente" },
        { name: "spoken_level", label: "Fala", type: "text", placeholder: "Ex: Nenhuma, Básica, Fluente" }
      ]
    },
    reputation: {
      label: "Reputação",
      path: "system.reputation_entries",
      fields: [
        { name: "title", label: "Título", type: "text" },
        { name: "reaction_modifier", label: "Modificador de Reação", type: "text", placeholder: "Ex: +2" },
        { name: "scope", label: "Escopo", type: "text", placeholder: "Ex: Cidade, Reino" },
        { name: "recognition_frequency", label: "Frequência de Reconhecimento", type: "text" }
      ]
    },
    wealth: {
      label: "Riqueza",
      path: "system.wealth_entries",
      fields: [
        { name: "wealth_level", label: "Nível de Riqueza", type: "text" },
        { name: "effects", label: "Efeitos", type: "textarea" }
      ]
    },
    bond: {
      label: "Vínculo",
      path: "system.bond_entries",
      fields: [
        { name: "name", label: "Nome", type: "text" },
        { name: "bond_type", label: "Tipo", type: "text", placeholder: "Ex: Familiar, Juramento" },
        { name: "description", label: "Descrição", type: "textarea" }
      ]
    }
  };

  return configs[type] || null;
}

async _promptSocialEntryData(type, initialData = {}, { isEdit = false } = {}) {
  const config = this._getSocialEntryConfig(type);
  if (!config) return null;

  const fieldHtml = config.fields.map((field) => {
    const value = initialData[field.name] ?? "";
    if (field.type === "textarea") {
      return `
        <div class="form-group">
          <label>${field.label}</label>
          <textarea name="${field.name}" rows="3" placeholder="${field.placeholder || ""}">${value}</textarea>
        </div>`;
    }
    const placeholder = field.placeholder ? `placeholder="${field.placeholder}"` : "";
    const min = field.type === "number" ? "min=\"0\"" : "";
    return `
      <div class="form-group">
        <label>${field.label}</label>
        <input type="${field.type}" name="${field.name}" value="${value}" ${placeholder} ${min}/>
      </div>`;
  }).join("");

  const content = `
    <form class="gum-social-entry-form">
      ${fieldHtml}
    </form>`;

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    new Dialog({
      title: isEdit ? `Editar ${config.label}` : `Adicionar ${config.label}`,
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Salvar",
          callback: (html) => {
            const form = html.find("form")[0];
            const formData = new FormDataExtended(form).object;
            const entryData = {};

            for (const field of config.fields) {
              let value = formData[field.name];
              if (field.type === "number") {
                value = Number(value) || 0;
              } else {
                value = (value ?? "").toString().trim();
              }
              entryData[field.name] = value;
            }

            finish(entryData);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancelar",
          callback: () => finish(null)
        }
      },
      default: "save",
      close: () => finish(null)
    }, { classes: ["dialog", "gum"] }).render(true);
  });
}

async _onAddSocialEntry(ev) {
  ev.preventDefault();
  const type = ev.currentTarget?.dataset?.type;
  const config = this._getSocialEntryConfig(type);
  if (!config) return;

  const entryData = await this._promptSocialEntryData(type, {}, { isEdit: false });
  if (!entryData) return;

  const entryId = foundry.utils.randomID();
  await this.actor.update({ [`${config.path}.${entryId}`]: entryData });
}

async _onEditSocialEntry(ev) {
  ev.preventDefault();
  const type = ev.currentTarget?.dataset?.type;
  const entryId = ev.currentTarget.closest(".item-row")?.dataset?.entryId;
  const config = this._getSocialEntryConfig(type);
  if (!config || !entryId) return;

  const existing = foundry.utils.getProperty(this.actor.system, config.path.split(".").slice(1).join("."))?.[entryId];
  const entryData = await this._promptSocialEntryData(type, existing || {}, { isEdit: true });
  if (!entryData) return;

  await this.actor.update({ [`${config.path}.${entryId}`]: entryData });
}

async _onDeleteSocialEntry(ev) {
  ev.preventDefault();
  const type = ev.currentTarget?.dataset?.type;
  const entryId = ev.currentTarget.closest(".item-row")?.dataset?.entryId;
  const config = this._getSocialEntryConfig(type);
  if (!config || !entryId) return;

  const entries = foundry.utils.getProperty(this.actor.system, config.path.split(".").slice(1).join(".")) || {};
  const name = entries?.[entryId]?.name
    || entries?.[entryId]?.organization_name
    || entries?.[entryId]?.society
    || entries?.[entryId]?.culture_name
    || entries?.[entryId]?.language_name
    || entries?.[entryId]?.title
    || entries?.[entryId]?.wealth_level
    || "registro";

  Dialog.confirm({
    title: `Excluir ${name}?`,
    content: "<p>Tem certeza que deseja remover este registro?</p>",
    yes: async () => {
      await this.actor.update({ [`${config.path}.-=${entryId}`]: null });
    }
  });
}


/**
 * Abre a ficha do item "grupo de ataque" (a engrenagem no cabeçalho do grupo).
 * Esse botão não fica dentro de um `.item`, então o handler genérico não acha o itemId.
 */
async _onEditAttackGroupItem(ev) {
  ev.preventDefault();
  ev.stopPropagation();

  const itemId = ev.currentTarget?.dataset?.itemId;
  if (!itemId) return;

  const item = this.actor.items.get(itemId);
  if (!item) return ui.notifications.warn("Item do grupo de ataque não encontrado.");

  item.sheet.render(true);
}


}
