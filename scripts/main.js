// ================================================================== //
//  1. IMPORTAÇÕES 
// ================================================================== //
import { registerSystemSettings } from "../module/settings.js";

// ================================================================== //
//  2. HOOK DE INICIALIZAÇÃO (`init`)
// ================================================================== //
Hooks.once('init', async function() { 
    console.log("GUM | Fase 'init': Registrando configurações e fichas."); 
    
    // Tarefas de inicialização que não dependem de dados do mundo:
    
    // Registra as fichas de Ator e Item
    Actors.registerSheet("gum", GurpsActorSheet, { 
        types: ["character"], makeDefault: true 
    }); 
    Items.registerSheet("gum", GurpsItemSheet, { makeDefault: true }); 
    
    // Apenas REGISTRA as configurações do sistema. Não as lê ainda.
    registerSystemSettings();
});

// ================================================================== //
//  2.1 HOOK DE PRONTO (`ready`)
// ================================================================== //
Hooks.once('ready', async function() {
    console.log("GUM | Fase 'ready': Aplicando configurações.");

    CONFIG.Combat.initiative = {
        formula: game.settings.get("gum", "initiativeFormula"),
        decimals: 4 
    };
});

// ================================================================== //
//  3. HELPERS DO HANDLEBARS
// ================================================================== //
Handlebars.registerHelper('includes', function(array, value) {
  return Array.isArray(array) && array.includes(value);
});

Handlebars.registerHelper('array', function(...args) {
  return args.slice(0, -1);
});

Handlebars.registerHelper('capitalize', function(str) {
  if (typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
});

Handlebars.registerHelper('eq', function (a, b) {
  return a === b;
});
    // Ajudante para transformar um objeto em um array de seus valores
    Handlebars.registerHelper('objectValues', function(obj) { return obj ? Object.values(obj) : []; });
    // Ajudante para pegar o primeiro elemento de um array
    Handlebars.registerHelper('first', function(arr) { return arr?.[0]; });
    // Este ajudante ensina ao sistema como executar um loop 'for' simples,
    Handlebars.registerHelper('for', function(from, to, block) {
        let accum = '';
        for(let i = from; i <= to; i++) {
            accum += block.fn(this, {data: {index: i}});
        }
        return accum;
    });
    // Este pequeno ajudante adiciona uma função chamada 'bar_width' que é usado no HTML para calcular a largura da barra.
    Handlebars.registerHelper('bar_width', function(current, max) {
        const M = Math.max(1, max);
        // Calcula a porcentagem, garantindo que ela fique entre 0 e 100
        const width = Math.min(100, Math.max(0, (current / M) * 100));
        // Retorna o estilo CSS pronto para ser usado
        return new Handlebars.SafeString(`width: ${width}%;`);
    });

// ================================================================== //
//  4. CLASSE DA FICHA DO ATOR (GurpsActorSheet)
// ================================================================== //

    class GurpsActorSheet extends ActorSheet {
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
        this._prepareCharacterItems(context);
        context.hitLocations = {
        head: { label: "Crânio (-7)", roll: "3-4", penalty: -7 },
        face: { label: "Rosto (-5)", roll: "5", penalty: -5 },
        eyes: { label: "Olhos (-9)", roll: "--", penalty: -9 },
        neck: { label: "Pescoço (-5)", roll: "17-18", penalty: -5 },
        torso: { label: "Torso (0)", roll: "9-11", penalty: 0 },
        vitals: { label: "Órg. Vitais (-3)", roll: "--", penalty: -3 },
        groin: { label: "Virilha (-3)", roll: "11", penalty: -3 },
        arms: { label: "Braço (-2)", roll: "8, 12", penalty: -2 },
        hands: { label: "Mão (-4)", "roll": "15", penalty: -4 },
        legs: { label: "Perna (-2)", roll: "6-7, 13-14", penalty: -2 },
        feet: { label: "Pé (-4)", roll: "16", penalty: -4 }
        };

            
        // Prepara os novos Grupos de Ataque para serem exibidos na ficha
        const attackGroupsObject = this.actor.system.combat.attack_groups || {};
        context.attackGroups = Object.entries(attackGroupsObject)
          .map(([id, group]) => {
            // Para cada grupo, também preparamos seus ataques internos
            const attacks = group.attacks ? Object.entries(group.attacks).map(([attackId, attack]) => ({ ...attack, id: attackId })) : [];
            return { ...group, id: id, attacks: attacks };
          })
          .sort((a, b) => (a.sort || 0) - (b.sort || 0));

        // Agrupa todos os itens por tipo
        const itemsByType = context.actor.items.reduce((acc, item) => {
          const type = item.type;
          if (!acc[type]) acc[type] = [];
          acc[type].push(item);
          return acc;
        }, {});
        context.itemsByType = itemsByType;

        // ================================================================== //
        //    FUNÇÃO AUXILIAR DE ORDENAÇÃO (PARA EVITAR REPETIÇÃO)            //
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
        //    AGRUPAMENTO DE PERÍCIAS POR BLOCO ESTÁTICO                       //
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
        //    ORDENAÇÃO DE LISTAS SIMPLES (MAGIAS E PODERES)                   //
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
        //    AGRUPAMENTO E ORDENAÇÃO DE EQUIPAMENTOS                          //
        // ================================================================== //
        const equipmentTypes = ['equipment', 'melee_weapon', 'ranged_weapon', 'armor'];
        const allEquipment = equipmentTypes.flatMap(type => itemsByType[type] || []);
        
        const sortingPrefs = this.actor.system.sorting?.equipment || {};
        const equippedSortFn = getSortFunction(sortingPrefs.equipped || 'manual');
        const carriedSortFn = getSortFunction(sortingPrefs.carried || 'manual');
        const storedSortFn = getSortFunction(sortingPrefs.stored || 'manual');

        context.equipmentInUse = allEquipment.filter(i => i.system.location === 'equipped').sort(equippedSortFn);
        context.equipmentCarried = allEquipment.filter(i => i.system.location === 'carried').sort(carriedSortFn);
        context.equipmentStored = allEquipment.filter(i => i.system.location === 'stored').sort(storedSortFn);

        // ================================================================== //
        //    AGRUPAMENTO E ORDENAÇÃO DE CARACTERÍSTICAS                       //
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
        //    ENRIQUECIMENTO DE TEXTO PARA BIOGRAFIA E DESCRIÇÃO DE ITEM
        // ================================================================== //
          // Prepara o campo de biografia, garantindo que funcione mesmo se estiver vazio
          context.enrichedBackstory = await TextEditor.enrichHTML(this.actor.system.details.backstory || "", {
              secrets: this.actor.isOwner,
              async: true
          });

        
        context.survivalBlockWasOpen = this._survivalBlockOpen || false;
        
        return context;
      }

      _prepareCharacterItems(sheetData) {
        const actorData = sheetData.actor;
        const attributes = actorData.system.attributes;

        for (let i of sheetData.actor.items) {
          if (['equipment', 'melee_weapon', 'ranged_weapon', 'armor'].includes(i.type)) {
            // Multiplica a quantidade pelo peso unitário e salva em uma nova variável
            i.system.total_weight = Math.round(((i.system.quantity || 1) * (i.system.weight || 0)) * 100) / 100;
            i.system.total_cost = (i.system.quantity || 1) * (i.system.cost || 0);
          }
        }
        // ETAPA 1: Pré-calcula os valores FINAIS dos atributos, incluindo modificadores temporários.
        for (const attr of ['st', 'dx', 'iq', 'ht', 'vont', 'per']) {
          // Cria uma nova propriedade 'final' para cada atributo. Ex: st.final = st.value + st.temp
          attributes[attr].final = (attributes[attr].value || 0) + (attributes[attr].temp || 0);
        }
        
        // O resto da lógica de cálculo agora usará esses valores 'finais'.
        // ... (A lógica de Carga, RD, etc. continua a mesma, mas é incluída aqui para integridade)
        if (!actorData.system.combat) actorData.system.combat = { dr_mods: {}, attacks: {} };
        const combat = actorData.system.combat;
        
        // --- 1. CÁLCULO DE CARGA (ENCUMBRANCE) - LÓGICA CORRIGIDA ---
        const liftingST = attributes.lifting_st.value || 10;
        const basicLift = (liftingST * liftingST) / 10;
        if (attributes.basic_lift) attributes.basic_lift.value = basicLift;
        else attributes.basic_lift = { value: basicLift };
        
        let totalWeight = 0;
        const ignoreCarried = actorData.system.encumbrance.ignore_carried_weight;

        for (let i of sheetData.actor.items) {
          // Pula para o próximo item se não for um equipamento com peso
          if (!['equipment', 'melee_weapon', 'ranged_weapon', 'armor'].includes(i.type) || !i.system.weight) {
            continue;
          }

          const itemLocation = i.system.location;
          const itemWeight = i.system.weight || 0;
          const itemQuantity = i.system.quantity || 1;

          // Itens 'Em Uso' (equipped) SEMPRE contam para o peso.
          if (itemLocation === 'equipped') {
            totalWeight += itemWeight * itemQuantity;
          } 
          // Itens 'Carregados' (carried) SÓ contam se a caixa NÃO estiver marcada.
          else if (itemLocation === 'carried' && !ignoreCarried) {
            totalWeight += itemWeight * itemQuantity;
          }
        }

        let encumbrance = { level_name: "Nenhuma", level_value: 0, penalty: 0 };
        if (totalWeight > basicLift * 6) { 
          encumbrance = { level_name: "M. Pesada", level_value: 4, penalty: -4 }; 
        } else if (totalWeight > basicLift * 3) { 
          encumbrance = { level_name: "Pesada", level_value: 3, penalty: -3 }; 
        } else if (totalWeight > basicLift * 2) { 
          encumbrance = { level_name: "Média", level_value: 2, penalty: -2 }; 
        } else if (totalWeight > basicLift) { 
          encumbrance = { level_name: "Leve", level_value: 1, penalty: -1 }; 
        }
        
        actorData.system.encumbrance.total_weight = Math.round(totalWeight * 100) / 100;
        actorData.system.encumbrance.level_name = encumbrance.level_name;
        actorData.system.encumbrance.level_value = encumbrance.level_value;
        actorData.system.encumbrance.levels = { none: basicLift.toFixed(2), light: (basicLift * 2).toFixed(2), medium: (basicLift * 3).toFixed(2), heavy: (basicLift * 6).toFixed(2), xheavy: (basicLift * 10).toFixed(2) };

        // --- 2. CÁLCULO DE DEFESAS E MOVIMENTO ---
        const basicSpeed = parseFloat(String(attributes.basic_speed.value).replace(",", ".")) || 0;
        const basicMove = attributes.basic_move.value || 0;
        attributes.final_dodge = Math.max(1, Math.floor(basicSpeed) + 3 + encumbrance.penalty + (combat.dodge_mod || 0));
        attributes.final_move = Math.max(1, Math.floor(basicMove * (1 - (encumbrance.level_value * 0.2)) ));
        
        // ========= CÁLCULO DE RD =============
        const drFromArmor = { head:0, torso:0, vitals:0, groin:0, face:0, eyes:0, neck:0, arms:0, hands:0, legs:0, feet:0 };
          for (let i of sheetData.actor.items) {
           if (i.type === 'armor' && i.system.location === 'equipped') {
          const wornLocs = Array.isArray(i.system.worn_locations) ? i.system.worn_locations : [];
          for (const loc of wornLocs) {
            if (typeof loc !== "string") continue;
            const locLower = loc.toLowerCase();
            if (drFromArmor.hasOwnProperty(locLower)) {
              drFromArmor[locLower] += i.system.dr || 0;
            }
          }

          }
          }
          // Adiciona os modificadores manuais para o total
          const totalDr = {};
          if(!combat.dr_mods) combat.dr_mods = {};
          for (let key in drFromArmor) {
              totalDr[key] = Math.round((drFromArmor[key] || 0) + (combat.dr_mods?.[key] || 0));
          }
          combat.dr_locations = totalDr;
          combat.dr_from_armor = drFromArmor;

        // ETAPA 2: O loop de cálculo de NH agora usa o valor .final dos atributos
        for (let i of sheetData.actor.items) {
          if (['skill', 'spell', 'power'].includes(i.type)) {
            try {
                const defaultAttr = (i.type === 'skill') ? 'dx' : 'iq';
                let baseAttrInput = (i.system.base_attribute || defaultAttr).toLowerCase();
                let baseAttrValue = 10; // valor padrão

                // 1. Verifica se é um atributo conhecido
                if (attributes[baseAttrInput]?.final !== undefined) {
                  baseAttrValue = attributes[baseAttrInput].final;
                }
                // 2. Se não for, tenta converter para número
                else if (!isNaN(Number(baseAttrInput))) {
                  baseAttrValue = Number(baseAttrInput);
                }
                // 3. Senão, mantém o valor padrão (10)
                else {
                    const refSkill = sheetData.actor.items.find(
                      s => s.type === 'skill' && s.name?.toLowerCase() === baseAttrInput
                    );
                    if (refSkill && refSkill.system?.final_nh !== undefined) {
                      baseAttrValue = refSkill.system.final_nh;
                    }
                  }
                i.system.final_nh = baseAttrValue + (i.system.skill_level || 0) + (i.system.other_mods || 0);
            } catch (e) {
                console.error(`GUM | Erro ao calcular NH para o item ${i.name}:`, e);
            }
          }
        }

        // Prepara os dados de níveis de carga para serem facilmente exibidos no HTML
        const levels = actorData.system.encumbrance.levels;
        actorData.system.encumbrance.level_data = [
            { name: 'Nenhuma', max: levels.none },
            { name: 'Leve', max: levels.light },
            { name: 'Média', max: levels.medium },
            { name: 'Pesada', max: levels.heavy },
            { name: 'M. Pesada', max: levels.xheavy }
        ];

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

    /*====== NOSSO MENU DE OPÇÕES =========*/

      activateListeners(html) {
        super.activateListeners(html);
        if (!this.isEditable) return;

// Dentro de: class GurpsActorSheet extends ActorSheet { ...
// Dentro de: activateListeners(html) { ...

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

    const description = await TextEditor.enrichHTML(s.description || "<i>Sem descrição.</i>", { async: true });

    // Estrutura HTML final para o design "Clássico e Compacto"
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
        options: { classes: ["dialog", "gurps-item-preview-dialog"], width: 400, height: "auto" }, // Largura reduzida
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
            // ================================================================== //
            //     Listener para EDITAR a fórmula de dano básico (GdP/GeB)        //
            // ================================================================== //  
            html.on('click', '.edit-basic-damage', ev => {
            ev.preventDefault();
            ev.stopPropagation(); // Impede que o clique também dispare a rolagem de dano
            const button = ev.currentTarget;
            const damageType = button.dataset.damageType; // 'thrust' ou 'swing'
            const currentFormula = this.actor.system.attributes[`${damageType}_damage`];

            new Dialog({
                title: `Editar Dano ${damageType === 'thrust' ? 'GdP' : 'GeB'}`,
                content: `<div class="form-group"><label>Nova Fórmula de Dano:</label><input type="text" name="formula" value="${currentFormula}"/></div>`,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: "Salvar",
                        callback: (html) => {
                            const newFormula = html.find('input[name="formula"]').val();
                            this.actor.update({ [`system.attributes.${damageType}_damage`]: newFormula });
                        }
                    }
                }
            }).render(true);
        });

            // ================================================================== //
            //          LISTENER PARA GRUPOS DE ATAQUE                            //
            // ================================================================== //    
        // Listener para ADICIONAR um novo GRUPO de Ataque (ex: uma arma)
        html.on('click', '.add-attack-group', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Novo Grupo de Ataque",
            content: `<div class="form-group"><label>Nome do Grupo (ex: Espada Longa, Desarmado):</label><input type="text" name="name" placeholder="Nova Arma"/></div>`,
            buttons: { create: { icon: '<i class="fas fa-check"></i>', label: "Criar", callback: (html) => {
              const name = html.find('input[name="name"]').val();
              if (name) {
                const newGroup = { name: name, attacks: {}, sort: Date.now() };
                const newKey = `system.combat.attack_groups.${foundry.utils.randomID()}`;
                this.actor.update({ [newKey]: newGroup });
              }
            }}},
            default: "create"
          }).render(true);
        });

        // Listener para ADICIONAR um novo ATAQUE DENTRO de um grupo
        html.on('click', '.add-attack-to-group', ev => {
            ev.preventDefault();
            const groupId = $(ev.currentTarget).data('group-id');
            if (!groupId) return;

            // DIÁLOGO DE ESCOLHA
            new Dialog({
                title: "Escolha o Tipo de Ataque",
                content: "<p>Qual tipo de ataque você deseja criar?</p>",
                buttons: {
                    melee: {
                        label: "Corpo a Corpo",
                        icon: '<i class="fas fa-khanda"></i>',
                        callback: () => this._openAttackCreationDialog(groupId, "melee")
                    },
                    ranged: {
                        label: "À Distância",
                        icon: '<i class="fas fa-bullseye"></i>',
                        callback: () => this._openAttackCreationDialog(groupId, "ranged")
                    }
                }
            }).render(true);
        });

        // Listener para EDITAR um GRUPO de Ataque
        html.on('click', '.edit-attack-group', ev => {
          ev.preventDefault();
          const groupId = $(ev.currentTarget).closest('.attack-group-card').data('groupId');
          const group = this.actor.system.combat.attack_groups[groupId];
          if (!group) return;

          new Dialog({
              title: `Editar Grupo: ${group.name}`,
              content: `<div class="form-group"><label>Nome do Grupo:</label><input type="text" name="name" value="${group.name}"/></div>`,
              buttons: { save: { icon: '<i class="fas fa-save"></i>', label: "Salvar", callback: (html) => {
                  const newName = html.find('input[name="name"]').val();
                  this.actor.update({ [`system.combat.attack_groups.${groupId}.name`]: newName });
              }}}
          }).render(true);
        });
        
        // Listener para DELETAR um GRUPO de Ataque
        html.on('click', '.delete-attack-group', ev => {
          ev.preventDefault();
          const groupId = $(ev.currentTarget).closest('.attack-group-card').data('groupId');
          const group = this.actor.system.combat.attack_groups[groupId];
          if (!group) return;

          Dialog.confirm({
              title: `Deletar Grupo "${group.name}"`,
              content: `<p>Você tem certeza? Isso irá apagar o grupo e <strong>todos os ataques dentro dele</strong>.</p>`,
              yes: () => this.actor.update({ [`system.combat.attack_groups.-=${groupId}`]: null }),
              no: () => {},
              defaultYes: false
          });
        });

        // Listener para EDITAR um ATAQUE INDIVIDUAL DENTRO de um grupo
        html.on('click', '.edit-grouped-attack', ev => {
          ev.preventDefault();
          const attackId = $(ev.currentTarget).closest('.attack-item').data('attackId');
          const groupId = $(ev.currentTarget).closest('.attack-group-card').data('groupId');
          const attack = this.actor.system.combat.attack_groups[groupId]?.attacks[attackId];
          if (!attack) return;

          // Reutiliza o diálogo de criação, mas com os dados existentes
          this._openAttackCreationDialog(groupId, attack.attack_type, { attackId, attackData: attack });
        });

        // Listener para DELETAR um ATAQUE INDIVIDUAL DENTRO de um grupo
        html.on('click', '.delete-grouped-attack', ev => {
          ev.preventDefault();
          const attackId = $(ev.currentTarget).closest('.attack-item').data('attackId');
          const groupId = $(ev.currentTarget).closest('.attack-group-card').data('groupId');
          const attack = this.actor.system.combat.attack_groups[groupId]?.attacks[attackId];
          if (!attack) return;

          Dialog.confirm({
              title: `Deletar Ataque "${attack.name}"`,
              content: `<p>Você tem certeza que quer deletar este ataque?</p>`,
              yes: () => this.actor.update({ [`system.combat.attack_groups.${groupId}.attacks.-=${attackId}`]: null }),
              no: () => {},
              defaultYes: false
          });
        });

        // ================================================================== //
        //     DRAG & DROP PARA GRUPOS DE ATAQUE                            //
        // ================================================================== //
        html.on('dragstart', '.attack-group-card', ev => {
          const li = ev.currentTarget;
          const dragData = { type: "AttackGroup", id: li.dataset.groupId };
          ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        });

        html.on('drop', '.attack-group-list', async ev => {
          const data = JSON.parse(ev.originalEvent.dataTransfer.getData("text/plain"));
          if (data.type !== "AttackGroup") return;
          
          const draggedId = data.id;
          const groups = Object.entries(this.actor.system.combat.attack_groups || {}).map(([id, group]) => ({...group, id}));
          groups.sort((a,b) => a.sort - b.sort);

          const dropTarget = ev.target.closest('.attack-group-card');
          let newSort = 0;

          if (dropTarget) {
            const targetId = dropTarget.dataset.groupId;
            if (targetId === draggedId) return;
            const targetGroup = groups.find(g => g.id === targetId);
            const targetIndex = groups.findIndex(g => g.id === targetId);
            const targetBoundingRect = dropTarget.getBoundingClientRect();
            const dropInTopHalf = ev.clientY < (targetBoundingRect.top + targetBoundingRect.height / 2);

            if (dropInTopHalf) {
              const prevGroup = groups[targetIndex - 1];
              newSort = (targetGroup.sort + (prevGroup ? prevGroup.sort : 0)) / 2;
            } else {
              const nextGroup = groups[targetIndex + 1];
              newSort = (targetGroup.sort + (nextGroup ? nextGroup.sort : targetGroup.sort + 2000)) / 2;
            }
          } else {
            newSort = (groups.pop()?.sort || 0) + 1000;
          }
          
          await this.actor.update({ [`system.combat.attack_groups.${draggedId}.sort`]: newSort });
        });
        
            // ================================================================== //
            //          LISTENER PARA BLOCOS COLAPSÁVEIS (SOBREVIVÊNCIA)          //
            // ================================================================== //
          html.on('click', '.collapsible-header', ev => {
          const header = $(ev.currentTarget);
          const parentBlock = header.closest('.collapsible-block');

          // Alterna a classe para o efeito visual imediato
          parentBlock.toggleClass('active');

          // MUDANÇA: "Anota" no objeto da ficha se a seção está aberta ou fechada
          this._survivalBlockOpen = parentBlock.hasClass('active');
        });

          // ================================================================== //
          //          LISTENER PARA MARCADORES (SEM REDESENHAR A FICHA)         //
          // ================================================================== //
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

          // O 'await' continua importante, mas removemos o this.render(false) e a lógica jQuery
          await this.actor.update({ [updatePath]: newValue });
        });
        
    // Listener para o botão "Editar Perfil" (SEGUINDO O PADRÃO QUE FUNCIONA)
    html.on('click', '.edit-biography-details', ev => {
        ev.preventDefault();
        const details = this.actor.system.details;

        // O HTML do pop-up continua o mesmo.
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
                    // A callback agora constrói o objeto de dados manualmente, como nos outros pop-ups
                    callback: (html) => {
                        // Cria um novo objeto para os dados atualizados
                        const newData = {
                            gender: html.find('[name="gender"]').val(),
                            age: html.find('[name="age"]').val(),
                            height: html.find('[name="height"]').val(),
                            weight: html.find('[name="weight"]').val(),
                            skin: html.find('[name="skin"]').val(),
                            hair: html.find('[name="hair"]').val(),
                            eyes: html.find('[name="eyes"]').val(),
                            alignment: html.find('[name="alignment"]').val(),
                            belief: html.find('[name="belief"]').val(),
                            // Preserva os outros dados que não estão no pop-up para não serem apagados
                            concept: this.actor.system.details.concept,
                            backstory: this.actor.system.details.backstory
                        };
                        
                        // Substitui o objeto 'details' inteiro pela sua versão completa e atualizada
                        this.actor.update({ "system.details": newData });
                    }
                }
            },
            default: 'save'
        }).render(true);
    });
        // Listener para salvar alterações diretas nos inputs de Reservas de Energia (VERSÃO CORRIGIDA)
        html.on('change', '.reserve-card input[type="number"]', ev => {
            const input = ev.currentTarget;
            const reserveCard = input.closest('.reserve-card'); // Encontra o "card" pai da reserva
            const reserveId = reserveCard.dataset.reserveId;    // Pega o ID da reserva a partir do card
            const property = input.dataset.property;            // Pega a propriedade a ser alterada ('current' or 'max')

            // Uma verificação de segurança
            if (!reserveId || !property) {
                console.error("GUM | Não foi possível salvar a reserva de energia. Atributos faltando.");
                return;
            }

            const value = Number(input.value);
            // Constrói o caminho completo para o dado que será atualizado
            const key = `system.energy_reserves.${reserveId}.${property}`;

            // Atualiza o ator com o caminho e o valor corretos
            this.actor.update({ [key]: value });
        });

    // ================================================================== //
        //    LISTENER UNIFICADO E FINAL PARA TODOS OS BOTÕES DE ORDENAÇÃO    //
        // ================================================================== //
        html.on('click', '.sort-control', ev => {
            ev.preventDefault();
            const button = ev.currentTarget;
            const itemType = button.dataset.itemType;
            const location = button.dataset.location; // Pega a localização, se existir

            if (!itemType) return;

            // Opções de ordenação para cada tipo de item
            const sortOptions = {
                spell: { manual: "Manual", name: "Nome (A-Z)", spell_school: "Escola" },
                power: { manual: "Manual", name: "Nome (A-Z)" },
                equipment: { manual: "Manual", name: "Nome (A-Z)", weight: "Peso", cost: "Custo" },
                skill: { manual: "Manual", name: "Nome (A-Z)", group: "Grupo (A-Z)" },
                characteristic: { manual: "Manual", name: "Nome (A-Z)", points: "Pontos" }
            };

            const options = sortOptions[itemType];
            if (!options) return;

            // Verifica a preferência de ordenação atual, considerando a localização
            const currentSort = location 
                ? this.actor.system.sorting?.[itemType]?.[location] || 'manual'
                : this.actor.system.sorting?.[itemType] || 'manual';

            // Cria o conteúdo do diálogo com botões de rádio
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

            // Cria e renderiza o diálogo
            new Dialog({
                title: "Opções de Ordenação",
                content: content,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: "Aplicar",
                        callback: (html) => {
                            const selectedValue = html.find('input[name="sort-option"]:checked').val();
                            // Salva no caminho correto (com ou sem localização)
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
        //       LÓGICA DE DRAG & DROP PARA A LISTA DE ATAQUES (CUSTOM)      //
        // ================================================================== //

        // Quando começa a arrastar um ATAQUE
        html.on('dragstart', 'li.attack-item', ev => {
          const li = ev.currentTarget;
          // Passamos um tipo customizado e o ID do ataque
          const dragData = {
            type: "AttackObject",
            id: li.dataset.attackId
          };
          ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        });

        // Permite que a lista de ataques receba o drop
        html.on('dragover', '.attacks-list-box .item-list', ev => {
          ev.preventDefault();
        });

        // Quando solta um ATAQUE na lista
        html.on('drop', '.attacks-list-box .item-list', async ev => {
          ev.preventDefault();
          const data = JSON.parse(ev.originalEvent.dataTransfer.getData("text/plain"));
          if (data.type !== "AttackObject") return;

          const draggedId = data.id;
          const attacks = Object.entries(this.actor.system.combat.attacks).map(([id, attack]) => ({...attack, id}));
          attacks.sort((a,b) => a.sort - b.sort);

          const dropTarget = ev.target.closest('.attack-item');
          let newSort = 0;

          if (dropTarget) {
            const targetId = dropTarget.dataset.attackId;
            const targetAttack = attacks.find(a => a.id === targetId);
            const targetIndex = attacks.findIndex(a => a.id === targetId);

            const targetBoundingRect = dropTarget.getBoundingClientRect();
            const dropInTopHalf = ev.clientY < (targetBoundingRect.top + targetBoundingRect.height / 2);

            if (dropInTopHalf) {
              const prevAttack = attacks[targetIndex - 1];
              newSort = (targetAttack.sort + (prevAttack ? prevAttack.sort : 0)) / 2;
            } else {
              const nextAttack = attacks[targetIndex + 1];
              newSort = (targetAttack.sort + (nextAttack ? nextAttack.sort : targetAttack.sort + 2000)) / 2;
            }
          } else {
            newSort = (attacks.pop()?.sort || 0) + 1000;
          }

          // ATUALIZAÇÃO CUSTOMIZADA: Modifica o 'sort' do objeto de ataque específico
          await this.actor.update({
            [`system.combat.attacks.${draggedId}.sort`]: newSort
          });
        });

    // ================================================================== //
    //     LÓGICA DE ARRASTAR E SOLTAR (DRAG & DROP) - VERSÃO FINAL       //
    // ================================================================== //

    // ETAPA 1: Quando você COMEÇA A ARRASTAR um item
    html.on('dragstart', 'li.item[draggable="true"]', ev => {
        const li = ev.currentTarget;
        const dragData = {
        type: "Item",
        actorId: this.actor.id,
        uuid: this.actor.items.get(li.dataset.itemId)?.uuid
        };
        if (!dragData.uuid) return;
        
        // Armazena os dados do item que está sendo arrastado
        ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        console.log("GUM | Drag Start:", dragData); // Para depuração
    });

    // ETAPA 2: O listener que faltava. Permite que a lista seja uma área de "soltura" válida.
    html.on('dragover', '.item-list', ev => {
        ev.preventDefault();
    });

    // ETAPA 3: Quando você SOLTA o item na lista de destino
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
        const skillGroup = dropContainer.closest('.skill-group')?.dataset.groupName; // Pega o nome do grupo da perícia

        // --- LÓGICA PARA ITENS AGRUPADOS POR BLOCO (Perícias e Características) ---
        if (blockContainer) {
        const itemTypesInBlocks = ['skill', 'advantage', 'disadvantage'];
        if (itemTypesInBlocks.includes(draggedItem.type)) {
            const targetBlockId = blockContainer.dataset.blockId;
            siblings = this.actor.items
            .filter(i => itemTypesInBlocks.includes(i.type) && i.system.block_id === targetBlockId)
            .sort((a, b) => a.sort - b.sort);
            updatePayload['system.block_id'] = targetBlockId;
            console.log(`GUM | Target context: Block (${targetBlockId})`);
        }
        }

            // LÓGICA ATUALIZADA PARA PERÍCIAS EM GRUPOS
        else if (skillGroup && draggedItem.type === 'skill') {
            siblings = this.actor.items.filter(i => i.type === 'skill' && (i.system.group || 'Geral') === skillGroup);
            updatePayload['system.group'] = skillGroup;
        }
          
        // --- LÓGICA PARA ITENS AGRUPADOS POR LOCALIZAÇÃO (Equipamentos) ---
        else if (equipmentLocation) {
        const equipmentTypes = ['equipment', 'melee_weapon', 'ranged_weapon', 'armor'];
        if (equipmentTypes.includes(draggedItem.type)) {
            siblings = this.actor.items
                .filter(i => equipmentTypes.includes(i.type) && i.system.location === equipmentLocation)
                .sort((a, b) => a.sort - b.sort);
            updatePayload['system.location'] = equipmentLocation;
            console.log(`GUM | Target context: Equipment Location (${equipmentLocation})`);
        }
        }
        
        // --- NOVA LÓGICA GENÉRICA PARA LISTAS SIMPLES (Magias, Poderes, etc.) ---
        else if (itemType && draggedItem.type === itemType) {
            siblings = this.actor.items
                .filter(i => i.type === itemType)
                .sort((a, b) => a.sort - b.sort);
            console.log(`GUM | Target context: Simple List (${itemType})`);
        }

        // --- CÁLCULO DA NOVA POSIÇÃO (LÓGICA UNIFICADA) ---
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

        // --- Listeners para elementos estáticos (botões de adicionar, etc.) ---
        html.find('.add-combat-meter').click(ev => { const newMeter = { name: "Novo Registro", current: 10, max: 10 }; const newKey = `system.combat.combat_meters.${foundry.utils.randomID()}`; this.actor.update({ [newKey]: newMeter }); });
      
        // Listener para ADICIONAR um ataque Corpo a Corpo
        html.on('click', '.add-melee-attack', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Criar Ataque Corpo a Corpo",
            content: `
              <form>
                <div class="form-group"><label>Nome do Ataque:</label><input type="text" name="name" value="Novo Ataque"/></div>
                <div class="form-group"><label>Perícia:</label><input type="text" name="skill_name" value="Perícia"/></div>
                <div class="form-group"><label>NH:</label><input type="number" name="skill_level" value="10"/></div>
                <div class="form-group"><label>Dano:</label><input type="text" name="damage_formula" value="1d6"/></div>
                <div class="form-group"><label>Tipo:</label><input type="text" name="damage_type" value="cr"/></div>
                <div class="form-group"><label>Alcance:</label><input type="text" name="reach" value="C,1"/></div>
                <div class="form-group"><label>Aparar:</label><input type="number" name="defense" value="8"/></div>
              </form>
            `,
            buttons: { create: { icon: '<i class="fas fa-check"></i>', label: "Criar", callback: (html) => {
                  const form = html.find("form")[0];
                  let formData = new FormDataExtended(form).object;
                  formData.attack_type = "melee"; // Adiciona o tipo ao salvar
                  formData.sort = Date.now();
                  const newKey = `system.combat.attacks.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: formData });
                }
              }
            }
          }).render(true);
        });

        // Listener para ADICIONAR um ataque À Distância
        html.on('click', '.add-ranged-attack', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Criar Ataque à Distância",
            content: `
              <form>
                <div class="form-group"><label>Nome do Ataque:</label><input type="text" name="name" value="Novo Ataque"/></div>
                <div class="form-group"><label>Perícia:</label><input type="text" name="skill_name" value="Perícia"/></div>
                <div class="form-group"><label>NH:</label><input type="number" name="skill_level" value="10"/></div>
                <div class="form-group"><label>Dano:</label><input type="text" name="damage_formula" value="1d6"/></div>
                <div class="form-group"><label>Tipo:</label><input type="text" name="damage_type" value="pi"/></div>
                <div class="form-group"><label>Prec:</label><input type="text" name="accuracy" value="1"/></div>
                <div class="form-group"><label>Alcance:</label><input type="text" name="range" value="100/1500"/></div>
                <div class="form-group"><label>CdT:</label><input type="text" name="rof" value="1"/></div>
                <div class="form-group"><label>Tiros:</label><input type="text" name="shots" value="30 (3)"/></div>
                <div class="form-group"><label>RCO:</label><input type="text" name="rcl" value="2"/></div>
              </form>
            `,
            buttons: { create: { icon: '<i class="fas fa-check"></i>', label: "Criar", callback: (html) => {
                  const form = html.find("form")[0];
                  let formData = new FormDataExtended(form).object;
                  formData.attack_type = "ranged"; // Adiciona o tipo ao salvar
                  formData.sort = Date.now();
                  const newKey = `system.combat.attacks.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: formData });
                }
              }
            }
          }).render(true);
        });

        // Listener para EDITAR um ataque 
    // ============== NOVO LISTENER DE EDIÇÃO DE ATAQUE ================
        html.on('click', '.edit-attack', ev => {
          ev.preventDefault();
          // 1. Pega o ID do ataque a partir do atributo data-attack-id do elemento <li>
          const attackId = $(ev.currentTarget).closest(".attack-item").data("attackId");
          // 2. Pega o objeto de dados completo para esse ataque
          const attack = this.actor.system.combat.attacks[attackId];

          if (!attack) {
            ui.notifications.error("Ataque não encontrado!");
            return;
          }

          let dialogTitle;
          let dialogContent;

          // 3. Verifica o tipo do ataque e monta o formulário HTML apropriado
          if (attack.attack_type === "melee") {
            dialogTitle = "Editar Ataque Corpo a Corpo";
            dialogContent = `
              <form>
                <div class="form-group"><label>Nome:</label><input type="text" name="name" value="${attack.name}"/></div>
                <div class="form-group"><label>Perícia:</label><input type="text" name="skill_name" value="${attack.skill_name}"/></div>
                <div class="form-group"><label>NH:</label><input type="number" name="skill_level" value="${attack.skill_level}"/></div>
                <div class="form-group"><label>Dano:</label><input type="text" name="damage_formula" value="${attack.damage_formula}"/></div>
                <div class="form-group"><label>Tipo:</label><input type="text" name="damage_type" value="${attack.damage_type}"/></div>
                <div class="form-group"><label>Alcance:</label><input type="text" name="reach" value="${attack.reach}"/></div>
                <div class="form-group"><label>Aparar:</label><input type="number" name="defense" value="${attack.defense}"/></div>
                <input type="hidden" name="attack_type" value="melee" />
              </form>
            `;
          } else if (attack.attack_type === "ranged") {
            dialogTitle = "Editar Ataque à Distância";
            dialogContent = `
              <form>
                <div class="form-group"><label>Nome:</label><input type="text" name="name" value="${attack.name}"/></div>
                <div class="form-group"><label>Perícia:</label><input type="text" name="skill_name" value="${attack.skill_name}"/></div>
                <div class="form-group"><label>NH:</label><input type="number" name="skill_level" value="${attack.skill_level}"/></div>
                <div class="form-group"><label>Dano:</label><input type="text" name="damage_formula" value="${attack.damage_formula}"/></div>
                <div class="form-group"><label>Tipo:</label><input type="text" name="damage_type" value="${attack.damage_type}"/></div>
                <div class="form-group"><label>Prec:</label><input type="text" name="accuracy" value="${attack.accuracy}"/></div>
                <div class="form-group"><label>Alcance:</label><input type="text" name="range" value="${attack.range}"/></div>
                <div class="form-group"><label>CdT:</label><input type="text" name="rof" value="${attack.rof}"/></div>
                <div class="form-group"><label>Tiros:</label><input type="text" name="shots" value="${attack.shots || ''}"/></div>
                <div class="form-group"><label>RCO:</label><input type="text" name="rcl" value="${attack.rcl || ''}"/></div>
                <input type="hidden" name="attack_type" value="ranged" />
              </form>
            `;
          } else {
            return; // Sai da função se o tipo for desconhecido
          }
          
          // 4. Cria e renderiza o Dialog com o formulário correto
          new Dialog({
            title: dialogTitle,
            content: dialogContent,
            buttons: {
              save: {
                icon: '<i class="fas fa-save"></i>',
                label: "Salvar",
                callback: (html) => {
                  const form = html.find("form")[0];
                  // 5. Usa FormDataExtended para coletar os dados, mantendo consistência com a função de criar.
                  const formData = new FormDataExtended(form).object;
                  
                  // 6. Constrói o caminho para o update e envia os dados atualizados para o ator.
                  const updateKey = `system.combat.attacks.${attackId}`;
                  this.actor.update({ [updateKey]: formData });
                }
              }
            },
            default: "save"
          }).render(true);
        });
      
        html.on('click', '.delete-attack', ev => { const attackId = $(ev.currentTarget).closest(".attack-item").data("attackId"); Dialog.confirm({ title: "Deletar Ataque", content: "<p>Você tem certeza que quer deletar este ataque?</p>", yes: () => { const deleteKey = `system.combat.attacks.-=${attackId}`; this.actor.update({ [deleteKey]: null }); }, no: () => {}, defaultYes: false }); });


        html.find('.edit-casting-ability').click(ev => { const ability = this.actor.system.casting_ability; new Dialog({ title: "Editar Habilidade de Conjuração", content: `<div class="form-group"><label>Nome:</label><input type="text" name="name" value="${ability.name}"/></div><div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${ability.points}"/></div><div class="form-group"><label>Nível:</label><input type="number" name="level" value="${ability.level}"/></div><div class="form-group"><label>Fonte:</label><input type="text" name="source" value="${ability.source}"/></div><div class="form-group"><label>Descrição:</label><textarea name="description">${ability.description}</textarea></div>`, buttons: { save: { icon: '<i class="fas fa-save"></i>', label: "Salvar", callback: (html) => { const newData = { name: html.find('input[name="name"]').val(), points: parseInt(html.find('input[name="points"]').val()), level: parseInt(html.find('input[name="level"]').val()), source: html.find('input[name="source"]').val(), description: html.find('textarea[name="description"]').val() }; this.actor.update({ "system.casting_ability": newData }); } } }, default: "save" }).render(true); });
        html.find('.edit-power-source').click(ev => { const power = this.actor.system.power_source; new Dialog({ title: "Editar Fonte de Poder", content: `<div class="form-group"><label>Nome:</label><input type="text" name="name" value="${power.name}"/></div><div class="form-group"><label>Nível:</label><input type="number" name="level" value="${power.level}"/></div><div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${power.points}"/></div><div class="form-group"><label>Fonte:</label><input type="text" name="source" value="${power.source}"/></div><div class="form-group"><label>Talento de Poder:</label><input type="number" name="power_talent" value="${power.power_talent}"/></div><div class="form-group"><label>Descrição:</label><textarea name="description">${power.description}</textarea></div>`, buttons: { save: { icon: '<i class="fas fa-save"></i>', label: "Salvar", callback: (html) => { const newData = { name: html.find('input[name="name"]').val(), level: parseInt(html.find('input[name="level"]').val()), points: parseInt(html.find('input[name="points"]').val()), source: html.find('input[name="source"]').val(), power_talent: parseInt(html.find('input[name="power_talent"]').val()), description: html.find('textarea[name="description"]').val() }; this.actor.update({ "system.power_source": newData }); } } }, default: "save" }).render(true); });
        
        html.find('.edit-lifting-st').click(ev => {
        new Dialog({
            title: "Editar ST de Carga",
            // --- MUDANÇA: HTML reestruturado com classes para estilização ---
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
            // --- MUDANÇA: Adicionando uma classe customizada à janela do Dialog ---
            // Isso nos permite estilizar a janela inteira, incluindo título e botões.
            options: {
                classes: ["dialog", "gurps-dialog"],
                width: 350
            }
        }).render(true);
    });

        // --- Listeners para elementos dinâmicos (dentro de listas) ---
        html.on('click', '.item-edit', ev => { const li = $(ev.currentTarget).parents(".item"); const item = this.actor.items.get(li.data("itemId")); item.sheet.render(true); });
        html.on('click', '.item-delete', ev => { const li = $(ev.currentTarget).parents(".item"); this.actor.deleteEmbeddedDocuments("Item", [li.data("itemId")]); });
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
          const entry = this.actor.system.wealth_entries[entryId];
          new Dialog({
            title: `Editar Riqueza: ${entry.wealth_level}`,
            content: `
              <div class="form-group"><label>Nome:</label><input type="text" name="name" value="${entry.name}$"/></div>
              <div class="form-group"><label>Vínculo:</label><input type="text" name="bond_type" value="${entry.bond_type}$"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${entry.points}$"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description" rows="4" value="${entry.description}$"></textarea></div>
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

        // Listener para DELETAR uma entrada de Vínculo
        html.on('click', '.delete-social-entry[data-type="bond"]', ev => {
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
        html.on('click', '.item-move', ev => {
          ev.preventDefault();
          ev.stopPropagation();
          const li = $(ev.currentTarget).closest(".item");
          const itemId = li.data("itemId");
          
          const menuContent = `
            <div class="context-item" data-action="update-location" data-value="equipped"><i class="fas fa-user-shield"></i> Em Uso</div>
            <div class="context-item" data-action="update-location" data-value="carried"><i class="fas fa-shopping-bag"></i> Carregado</div>
            <div class="context-item" data-action="update-location" data-value="stored"><i class="fas fa-archive"></i> Armazenado</div>
          `;
          customMenu.html(menuContent);
          customMenu.data("item-id", itemId);
          customMenu.css({ display: "block", left: ev.clientX + 5 + "px", top: ev.clientY - 10 + "px" });
        });

        // Listener para o ícone de MOVER PERÍCIA
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
        // Cria os sub-itens do menu para mover a perícia
        for (const [blockId, blockData] of Object.entries(skillBlocks)) {
            moveSubmenu += `<div class="context-item" data-action="update-skill-block" data-value="${blockId}"><i class="fas fa-folder"></i> ${blockData.name}</div>`;
        }

        // Monta o menu principal
        const menuContent = `
            <div class="context-item" data-action="edit"><i class="fas fa-edit"></i> Editar Perícia</div>
            <div class="context-item" data-action="delete"><i class="fas fa-trash"></i> Deletar Perícia</div>
            <div class="context-divider"></div>
            <div class="context-submenu">
                <div class="context-item"><i class="fas fa-folder-open"></i> Mover Para</div>
                <div class="submenu-items">${moveSubmenu}</div>
            </div>
        `;

        // Reutiliza e exibe nosso menu de contexto customizado
        const customMenu = this.element.find(".custom-context-menu");
        customMenu.html(menuContent);
        customMenu.data("item-id", itemId); // Armazena o ID do item para uso posterior
        customMenu.css({ display: "block", left: ev.clientX - 210 + "px", top: ev.clientY - 10 + "px" });
    });

    // Listener para as ações DENTRO do menu (este listener precisa ser ATUALIZADO)
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
    });

        // Listener GENÉRICO para os botões DENTRO do nosso menu customizado
        html.on('click', '.custom-context-menu .context-item', async ev => { // Adicionado async
          const button = ev.currentTarget;
          const itemId = customMenu.data("itemId");
          const action = $(button).data("action");
          const value = $(button).data("value");
          
          if (itemId) {
            const item = this.actor.items.get(itemId);
            if (!item) return;

            if (action === 'update-location') {
              await item.update({ "system.location": value });
            } else if (action === 'update-skill-block') {
              await item.update({ "system.block_id": value });
            }
          }
          
          customMenu.hide();
          this.render(false); // MUDANÇA: Força o redesenho da ficha
        });

        // Listener para esconder o menu quando se clica em qualquer outro lugar
        $(document).on('click', (ev) => {
          if (!$(ev.target).closest('.item-move, .item-move-skill, .custom-context-menu').length) {
            customMenu.hide();
          }
        });

        // NOVO: Bloqueador do menu do navegador para os ícones
        html.on('contextmenu', '.item-move, .item-move-skill', ev => {
          ev.preventDefault();
        });
          
        // ============================================================= //
        //    NOVOS LISTENERS PARA RESERVAS DE ENERGIA (SEPARADOS)       //
        // ============================================================= //

        // Listener para ADICIONAR uma reserva
        html.on('click', '.add-energy-reserve', ev => {
            const reserveType = ev.currentTarget.dataset.reserveType; // 'spell' ou 'power'
            if (!reserveType) return;

            const newReserve = { name: "Nova Reserva", source: "Geral", current: 10, max: 10 };
            const newKey = `system.${reserveType}_reserves.${foundry.utils.randomID()}`;
            this.actor.update({ [newKey]: newReserve });
        });

        // Listener para SALVAR alterações diretas nos inputs
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

        // Listener para EDITAR uma reserva via diálogo
        html.on('click', '.edit-energy-reserve', ev => {
            const reserveCard = ev.currentTarget.closest(".reserve-card");
            const reserveType = reserveCard.dataset.reserveType; // 'spell' ou 'power'
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

        // Listener para DELETAR uma reserva
        html.on('click', '.delete-energy-reserve', ev => {
            const reserveCard = ev.currentTarget.closest(".reserve-card");
            const reserveType = reserveCard.dataset.reserveType; // 'spell' ou 'power'
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
          
        
        
          // --- Listeners para Rolagens ---
          html.on('click', 'a.rollable', async (ev) => {
            ev.preventDefault();
            const element = ev.currentTarget;
            const baseTarget = parseInt(element.dataset.rollValue);
            const label = element.dataset.label;

            const performRoll = async (modifier = 0) => {
                const finalTarget = baseTarget + modifier;
                const roll = new Roll("3d6");
                await roll.evaluate({ async: true });
                const margin = finalTarget - roll.total;

                const diceResults = roll.dice[0].results.map(r => r.result);

                let resultText, resultClass, resultIcon;
                if (roll.total <= finalTarget) {
                    resultText = `Sucesso com margem de ${margin}`;
                    resultClass = 'success';
                    resultIcon = 'fas fa-check-circle';
                } else {
                    resultText = `Fracasso por uma margem de ${margin * -1}`;
                    resultClass = 'failure';
                    resultIcon = 'fas fa-times-circle';
                }

                if (roll.total <= 4 || (roll.total <= 6 && margin >= 10)) {
                    resultText = `Sucesso Crítico!`;
                } else if (roll.total === 17 || roll.total === 18 || (roll.total === 16 && margin <= -10)) {
                    resultText = `Falha Crítica!`;
                }
                
                const diceHtml = diceResults.map(die => `<span class="die">${die}</span>`).join('');

                // --- MUDANÇA: Voltando para a estrutura de "pílula" horizontal ---
                const flavor = `
                    <div class="gurps-roll-card">
                        <header class="card-header">
                            <h3>${label}</h3>
                        </header>
                        <div class="card-content">
                            <div class="card-main-flex">
                                <div class="roll-column">
                                    <div class="roll-total-value">${roll.total}</div>
                                    <div class="individual-dice">
                                        ${diceHtml}
                                    </div>
                                </div>

                                <div class="column-separator"></div>

                                <div class="target-column">
                                    <div class="roll-target-value">${finalTarget}</div>
                                    
                                    <div class="roll-breakdown-pill">
                                        <span>Base: ${baseTarget} &nbsp;|&nbsp; Mod: ${modifier > 0 ? '+' : ''}${modifier}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <footer class="card-footer ${resultClass}">
                            <i class="${resultIcon}"></i> <span>${resultText}</span>
                        </footer>
                    </div>
                `;

                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                    content: flavor,
                    rolls: [roll],
                    type: CONST.CHAT_MESSAGE_TYPES.ROLL
                });
            };


            if (ev.shiftKey) {
                new Dialog({
                    title: "Modificador de Rolagem",
                  
                    content: `
                        <div class="modifier-dialog">
                            <p><b>Insira ou clique nos modificadores para o ${label}:</p></b>
                            <input type="number" name="modifier" value="0" style="text-align: center; margin-bottom: 10px;"/>
                            
                            <div class="modifier-grid">
                                <div class="mod-row">
                                    <button type="button" class="mod-button" data-mod="-5">-5</button>
                                    <button type="button" class="mod-button" data-mod="-4">-4</button>
                                    <button type="button" class="mod-button" data-mod="-3">-3</button>
                                    <button type="button" class="mod-button" data-mod="-2">-2</button>
                                    <button type="button" class="mod-button" data-mod="-1">-1</button>
                                </div>
                                <div class="mod-row">
                                    <button type="button" class="mod-button" data-mod="+1">+1</button>
                                    <button type="button" class="mod-button" data-mod="+2">+2</button>
                                    <button type="button" class="mod-button" data-mod="+3">+3</button>
                                    <button type="button" class="mod-button" data-mod="+4">+4</button>
                                    <button type="button" class="mod-button" data-mod="+5">+5</button>
                                </div>
                            </div>

                            <button type="button" class="mod-clear-button" title="Zerar modificador">Limpar Modificador</button>
                        </div>`,
                    buttons: {
                        roll: {
                            icon: '<i class="fas fa-dice-d6"></i>',
                            label: "Rolar",
                            callback: (html) => {
                                const modifier = parseInt(html.find('input[name="modifier"]').val());
                                performRoll(modifier);
                            }
                        }
                    },
                    default: "roll",
                    render: (html) => {
                        const input = html.find('input[name="modifier"]');
                        html.find('.mod-button').click((event) => {
                            const currentMod = parseInt(input.val());
                            const modToAdd = parseInt($(event.currentTarget).data('mod'));
                            input.val(currentMod + modToAdd);
                        });
                        html.find('.mod-clear-button').click(() => {
                            input.val(0);
                        });
                    }
                }).render(true);
            } else {
                performRoll(0);
            }
                  });

    html.on('click', '.rollable-damage', async (ev) => {
        ev.preventDefault();
        const element = ev.currentTarget;
        const baseFormula = element.dataset.rollFormula;
        const damageType = element.dataset.damageType;
        const label = element.dataset.label;

        if (!baseFormula) return;

        const performDamageRoll = async (modifier = 0) => {
            let finalFormula = baseFormula;
            if (modifier > 0) {
                finalFormula += `+${modifier}`;
            } else if (modifier < 0) {
                finalFormula += `${modifier}`;
            }

            const roll = new Roll(finalFormula);
            await roll.evaluate({async: true});

            let allDiceResults = [];
            roll.dice.forEach(d => {
                allDiceResults.push(...d.results.map(r => r.result));
            });

            const diceHtml = allDiceResults.map(die => `<span class="die-damage">${die}</span>`).join('');

            // --- MUDANÇA: Posição da fórmula alterada ---
            const flavor = `
                <div class="gurps-damage-card">
                    <header class="card-header">
                        <h3>${label}</h3>
                    </header>

                    <div class="card-formula-container">
                        <span class="formula-pill">${roll.formula} ${damageType}</span>
                    </div>

                    <div class="card-content">
                        <div class="card-main-flex">
                            <div class="roll-column">
                                <span class="column-label">Dados</span>
                                <div class="individual-dice-damage">
                                    ${diceHtml}
                                </div>
                            </div>

                            <div class="column-separator"></div>

                            <div class="target-column">
                                <span class="column-label">Dano Total</span>
                                <div class="damage-total">
                                    <span class="damage-value">${roll.total}</span>
                                    <span class="damage-type">${damageType}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>
            `;

            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: flavor,
                rolls: [roll],
                type: CONST.CHAT_MESSAGE_TYPES.ROLL
            });
        };
        
        // O diálogo de modificadores permanece o mesmo que já atualizamos.
        if (ev.shiftKey) {
            new Dialog({
                title: "Modificador de Dano",
                content: `
                    <div class="modifier-dialog">
                        <p>Insira ou clique nos modificadores para o dano de ${label}:</p>
                        <input type="number" name="modifier" value="0" style="text-align: center; margin-bottom: 10px;"/>
                        <div class="modifier-grid">
                            <div class="mod-row">
                                <button type="button" class="mod-button" data-mod="-5">-5</button>
                                <button type="button" class="mod-button" data-mod="-4">-4</button>
                                <button type="button" class="mod-button" data-mod="-3">-3</button>
                                <button type="button" class="mod-button" data-mod="-2">-2</button>
                                <button type="button" class="mod-button" data-mod="-1">-1</button>
                            </div>
                            <div class="mod-row">
                                <button type="button" class="mod-button" data-mod="+1">+1</button>
                                <button type="button" class="mod-button" data-mod="+2">+2</button>
                                <button type="button" class="mod-button" data-mod="+3">+3</button>
                                <button type="button" class="mod-button" data-mod="+4">+4</button>
                                <button type="button" class="mod-button" data-mod="+5">+5</button>
                            </div>
                        </div>
                        <button type="button" class="mod-clear-button" title="Zerar modificador">Limpar Modificador</button>
                    </div>`,
                buttons: {
                    roll: {
                        icon: '<i class="fas fa-dice-d6"></i>',
                        label: "Rolar Dano",
                        callback: (html) => {
                            const modifier = parseInt(html.find('input[name="modifier"]').val());
                            performDamageRoll(modifier);
                        }
                    }
                },
                default: "roll",
                render: (html) => {
                    const input = html.find('input[name="modifier"]');
                    html.find('.mod-button').click((event) => {
                        const currentMod = parseInt(input.val());
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


    // ================================================================== //
    //    LISTENER PARA O POP-UP DA TABELA DE LOCAIS DE ACERTO (INTERATIVO) //
    // ================================================================== //
    html.on('click', '.view-hit-locations', async ev => {
        ev.preventDefault();
        const actor = this.actor;
        const sheetData = await this.getData();
        
        let tableRows = '';
        for (const [key, loc] of Object.entries(sheetData.hitLocations)) {
            const armorDR = parseInt(sheetData.actor.system.combat.dr_from_armor[key] || 0);
            const modDR = parseInt(actor.system.combat.dr_mods[key] || 0);
            const totalDR = armorDR + modDR;

            tableRows += `
                <div class="table-row">
                    <div class="loc-label">${loc.label}</div>
                    <div class="loc-rd-armor">${armorDR}</div>
                    <div class="loc-rd-mod">
                        <input type="number" name="${key}" value="${modDR}" data-armor-dr="${armorDR}" />
                    </div>
                    <div class="loc-rd-total"><strong>${totalDR}</strong></div>
                </div>
            `;
        }

        const content = `
            <form>
                <div class="gurps-rd-table">
                    <div class="table-header">
                        <div>Local</div>
                        <div>RD Arm.</div>
                        <div>Outra RD</div>
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
                        actor.update({ "system.combat.dr_mods": formData });
                    }
                }
            },
            default: "save",
            options: {
                classes: ["dialog", "gurps-rd-dialog"],
                width: 450
            },
            // --- MUDANÇA: Funcionalidade interativa adicionada aqui ---
            render: (html) => {
                // Adiciona um listener para qualquer input nos campos de 'Outra RD'
                html.find('.loc-rd-mod input').on('input', (event) => {
                    const input = $(event.currentTarget);
                    const row = input.closest('.table-row'); // Encontra a linha pai do input
                    
                    // Pega o valor da armadura que guardamos no próprio input
                    const armorDR = parseInt(row.find('.loc-rd-armor').text() || 0);
                    
                    // Pega o novo valor do modificador que o usuário digitou
                    const modDR = parseInt(input.val() || 0);
                    
                    // Recalcula o total
                    const newTotal = armorDR + modDR;
                    
                    // Encontra a célula do total na mesma linha e atualiza o valor
                    row.find('.loc-rd-total strong').text(newTotal);
                });

                // O listener para salvar com 'Enter' continua útil
                html.find('input').on('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        html.closest('.dialog').find('.dialog-button.save').trigger('click');
                    }
                });
            }
        }).render(true);
    });

          // ================================================================== //
    //    LISTENER PARA O POP-UP DE GERENCIAMENTO DE REGISTROS DE COMBATE   //
    // ================================================================== //
    html.on('click', '.manage-meters', ev => {
      ev.preventDefault();
      const actor = this.actor;
      const meters = actor.system.combat.combat_meters || {};

      // Monta o corpo da tabela para o diálogo, listando cada registro
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

      // Cria o Diálogo (Pop-up)
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
          // Adiciona os listeners para os botões DENTRO do pop-up

          // Listener para salvar alterações nos inputs
          html.find('.meter-inputs input').change(async ev => {
            const input = ev.currentTarget;
            const key = input.dataset.path;
            const value = Number(input.value);
            await actor.update({ [key]: value });
          });

          // Listener para o botão de editar DENTRO do pop-up
          html.find('.pop-up-edit-meter').click(ev => {
            const meterId = $(ev.currentTarget).closest(".meter-card").data("meterId");
            const meter = actor.system.combat.combat_meters[meterId];
            // Reutiliza a lógica de diálogo que já tínhamos
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

          // Listener para o botão de deletar DENTRO do pop-up
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
    
    }

          // NOVA FUNÇÃO AUXILIAR PARA CRIAR/EDITAR ATAQUES
      _openAttackCreationDialog(groupId, attackType, existingAttack = null) {
        const isEditing = existingAttack !== null;
        const attack = isEditing ? existingAttack.attackData : {};

        let dialogTitle = isEditing ? `Editar Ataque ${attack.name}` : "Criar Novo Ataque";
        let dialogContent = ``;

        // Formulário base com campos comuns
        let baseForm = `
          <div class="form-group"><label>Modo de Uso:</label><input type="text" name="name" value="${attack.name || 'Ataque'}"/></div>
          <div class="form-group"><label>Perícia:</label><input type="text" name="skill_name" value="${attack.skill_name || 'Perícia'}"/></div>
          <div class="form-group"><label>NH:</label><input type="number" name="skill_level" value="${attack.skill_level ?? 10}"/></div>
          <div class="form-group"><label>Dano:</label><input type="text" name="damage_formula" value="${attack.damage_formula || ''}"/></div>
          <div class="form-group"><label>Tipo:</label><input type="text" name="damage_type" value="${attack.damage_type || ''}"/></div>
        `;

        // Campos específicos para cada tipo de ataque
        if (attackType === "melee") {
            dialogContent = `<form>${baseForm}
                <div class="form-group"><label>Alcance:</label><input type="text" name="reach" value="${attack.reach || 'C,1'}"/></div>
                <div class="form-group"><label>Aparar:</label><input type="number" name="defense" value="${attack.defense ?? 8}"/></div>
            </form>`;
        } else { // Ranged
            dialogContent = `<form>${baseForm}
                <div class="form-group"><label>Prec:</label><input type="text" name="accuracy" value="${attack.accuracy || '1'}"/></div>
                <div class="form-group"><label>Alcance:</label><input type="text" name="range" value="${attack.range || '10/100'}"/></div>
                <div class="form-group"><label>CdT:</label><input type="text" name="rof" value="${attack.rof || '1'}"/></div>
                <div class="form-group"><label>Tiros:</label><input type="text" name="shots" value="${attack.shots || '10(3)'}"/></div>
                <div class="form-group"><label>RCO:</label><input type="text" name="rcl" value="${attack.rcl || '1'}"/></div>
            </form>`;
        }

        new Dialog({
            title: dialogTitle,
            content: dialogContent,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: isEditing ? "Salvar" : "Criar",
                    callback: (html) => {
                        const form = html.find("form")[0];
                        let newAttackData = new FormDataExtended(form).object;
                        newAttackData.attack_type = attackType; // Garante que o tipo seja salvo

                        if (isEditing) {
                            // Atualiza um ataque existente
                            const updateKey = `system.combat.attack_groups.${groupId}.attacks.${existingAttack.attackId}`;
                            this.actor.update({ [updateKey]: newAttackData });
                        } else {
                            // Cria um novo ataque
                            const newAttackKey = `system.combat.attack_groups.${groupId}.attacks.${foundry.utils.randomID()}`;
                            this.actor.update({ [newAttackKey]: newAttackData });
                        }
                    }
                }
            },
            default: 'save'
        }).render(true);
      }

      }

// ================================================================== //
//  5. CLASSE DA FICHA DO ITEM (GurpsItemSheet)
// ================================================================== //
      class GurpsItemSheet extends ItemSheet {
          static get defaultOptions() { 
            return foundry.utils.mergeObject(super.defaultOptions, { 
              // Suas classes e tamanho (ajustei a largura como tínhamos planejado)
              classes: ["gum", "sheet", "item"], 
              width: 560,
              height: 400,

              // A linha crucial que eu esqueci de incluir de volta. Ela diz ao Foundry qual arquivo usar.
              template: "systems/gum/templates/items/item-sheet.hbs",

              // A nova configuração de abas que estávamos adicionando.
              tabs: [{ 
                navSelector: ".sheet-tabs",
                contentSelector: ".sheet-body-content",
                initial: "description" // Mudei para 'details' ser a aba inicial, faz mais sentido para edição.
              }]
            }); 
          }
        async getData(options) { 
          const context = await super.getData(options); 
          context.system = this.item.system;  
          context.characteristic_blocks = { 
            "block1": "Traços Raciais", 
            "block2": "Vantagens", 
            "block3": "Desvantagens", 
            "block4": "Constituição Física" }; 
            
              context.descriptionHTML = await TextEditor.enrichHTML(this.item.system.description || "", {
                  secrets: this.item.isOwner,
                  async: true
              });  
            
            return context; 
          }

          activateListeners(html) {
            super.activateListeners(html);
            if (!this.isEditable) return;

            // Ativa os editores de texto enriquecido
            html.find(".editor").each((i, div) => {
              const field = div.dataset.edit;
              const content = getProperty(this.item.system, field);
              TextEditor.create({
                content,
                target: div,
                name: `system.description`, 
                button: true,
                editable: this.options.editable
              });
            });
          }

      }

