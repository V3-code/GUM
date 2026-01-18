import { GMModifierBrowser } from "./gm-modifier-browser.js";
import { performGURPSRoll } from "../../scripts/main.js";

export class GumGMScreen extends Application {
    
    constructor(options = {}) {
        super(options);
        // Mapa central de seleção (UUID -> Objeto)
        this.selectedModifiers = new Map();
        
        // Cache para os inputs manuais não resetarem ao renderizar
        this.manualCache = { name: "GM.MOD", value: 0 };
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "gum-gm-screen",
            title: "Escudo do Mestre (GUM)",
            template: "systems/gum/templates/apps/gm-screen.hbs",
            width: 1200, 
            height: 750,
            resizable: true,
            classes: ["gum", "gm-screen"],
            tabs: [{ navSelector: ".screen-tabs", contentSelector: ".screen-body", initial: "modifiers" },
                { navSelector: ".monitor-tabs", contentSelector: ".monitor-body", initial: "characters" }
            ],
            dragDrop: [{ dragSelector: ".palette-mod", dropSelector: ".group-content-area" }]
        });
    }

async getData() {
        // 1. DADOS DO POOL (Personagens de Jogadores)
        // Busca apenas atores de jogadores
        const actors = game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner);
        const monitorData = actors.map(actor => this._prepareActorData(actor));
        monitorData.sort((a, b) => a.name.localeCompare(b.name));

        // 2. DADOS DO COMBATE (Iniciativa)
        let combatData = [];
        const combat = game.combat;
        
        if (combat && combat.combatants.size > 0) {
            combatData = combat.turns.map(c => {
                let actor = c.actor;
                
                // --- CORREÇÃO DE SINCRONIA VISUAL ---
                // Se o ator não for um token sintético (ou seja, é um PJ Linkado),
                // forçamos o uso da instância global do game.actors.
                // Isso garante que os modificadores aplicados na aba 'PJs' apareçam aqui instantaneamente.
                if (actor && !actor.isToken) {
                    actor = game.actors.get(actor.id) || actor;
                }

                if (!actor) return null; 
                
                // Prepara os dados base (Lê HP, FP e Modificadores do ator correto)
                const data = this._prepareActorData(actor);
                
                // Adiciona dados específicos do combate
                data.combatantId = c.id;
                data.tokenId = c.tokenId; // Essencial para identificar o token na cena
                
                // --- AJUSTE DE INICIATIVA (5 CASAS DECIMAIS) ---
                if (c.initiative !== null && c.initiative !== undefined) {
                    // toFixed(5) fixa 5 casas. Number() remove zeros extras à direita.
                    // Ex: 14.20000 vira 14.2
                    data.initiative = Number(c.initiative.toFixed(5));
                } else {
                    data.initiative = "-";
                }

                data.isTurn = combat.combatant?.id === c.id; 
                data.isHidden = c.hidden;
                data.isDefeated = c.isDefeated;
                
                return data;
            }).filter(c => c !== null);
        }

        // 3. DASHBOARD (Direita) - Configuração
        const config = game.settings.get("gum", "gmScreenConfig");
        for (const col of config.columns) {
            for (const group of col.groups) {
                group.enrichedItems = [];
                for (const itemUuid of group.items) {
                    try {
                        const item = await fromUuid(itemUuid);
                        if (item) {
                            const itemData = item.toObject();
                            itemData.uuid = itemUuid;
                            itemData.isSelected = this.selectedModifiers.has(itemUuid);
                            group.enrichedItems.push(itemData);
                        }
                    } catch (e) {}
                }
            }
        }

        return {
            actors: monitorData,
            combatants: combatData,
            hasCombat: !!combat, 
            columns: config.columns,
            isManualActive: this.selectedModifiers.has("manual"),
            manualCache: this.manualCache
        };
    }

    /**
     * Helper para extrair dados vitais de um ator (Reuso de código)
     */
    _prepareActorData(actor) {
        const attr = actor.system.attributes;
        return {
            id: actor.id,
            name: actor.name,
            img: actor.img,
            hp: { value: attr.hp.value, max: attr.hp.max, percent: Math.min(100, Math.max(0, (attr.hp.value / attr.hp.max) * 100)) },
            fp: { value: attr.fp.value, max: attr.fp.max, percent: Math.min(100, Math.max(0, (attr.fp.value / attr.fp.max) * 100)) },
            defenses: {
                dodge: attr.dodge.final,
                parry: this._getBestDefense(actor, 'parry'),
                block: this._getBestDefense(actor, 'block')
            },
            activeGMMods: actor.getFlag("gum", "gm_modifiers") || []
        };
    }
activateListeners(html) {
        super.activateListeners(html);
        
        // Atualiza display do rolador assim que abre
        this._updateQRDisplay(html);

        // ===========================================================
        // 1. APLICAÇÃO DE MODIFICADOR (CLIQUE NO CARD)
        // ===========================================================
        html.find('.monitor-card').click(async ev => {
            // Ignora cliques em botões internos (remover, link, etc)
            if ($(ev.target).closest('.remove-mod, .actor-identity').length) return;
            
            // Se nada selecionado, não faz nada
            if (this.selectedModifiers.size === 0) return;

            const card = $(ev.currentTarget);
            const actorId = card.data('actor-id');
            const tokenId = card.data('token-id'); // IMPORTANTE: Pega o Token ID se existir

            // --- BUSCA INTELIGENTE (Token > Ator) ---
            let actor;

            // 1. Tenta pegar pelo Token na Cena Atual (Prioridade para Monstros/Combate)
            if (tokenId) {
                const token = canvas.tokens.get(tokenId);
                if (token) actor = token.actor;
            }

            // 2. Se falhou (token em outra cena ou aba PJs), pega pelo ID do Ator Global
            if (!actor && actorId) {
                actor = game.actors.get(actorId);
            }

            // 3. Aplica
            if (actor) {
                // Atualiza cache do manual se necessário (caso tenha digitado e não ativado)
                if (this.selectedModifiers.has("manual")) {
                    this.selectedModifiers.set("manual", { 
                        name: this.manualCache.name, 
                        value: this.manualCache.value 
                    });
                }

                await this._applyModifiersToActor(actor);
                
                // Feedback visual (Piscar Verde)
                card.addClass('flash-success');
                setTimeout(() => card.removeClass('flash-success'), 500);
            } else {
                ui.notifications.warn("Ator não encontrado na cena atual.");
            }
        });

        // ===========================================================
        // 2. REMOÇÃO DE MODIFICADOR (CLIQUE NO X DA TAG)
        // ===========================================================
        html.find('.remove-mod').click(async ev => {
            ev.stopPropagation(); // Não ativa o clique do card
            
            const tag = $(ev.currentTarget).closest('.active-mod-tag');
            const index = tag.data('index');
            
            // Busca o card pai para pegar os IDs
            const card = tag.closest('.monitor-card');
            const actorId = card.data('actor-id');
            const tokenId = card.data('token-id'); 

            // --- BUSCA INTELIGENTE (Mesma lógica do Apply) ---
            let actor;
            
            if (tokenId) {
                const token = canvas.tokens.get(tokenId);
                if (token) actor = token.actor;
            }
            if (!actor && actorId) {
                actor = game.actors.get(actorId);
            }

            if (actor) {
                // Remove o item do array de flags
                const mods = actor.getFlag("gum", "gm_modifiers") || [];
                mods.splice(index, 1);
                
                // Salva de volta
                await actor.setFlag("gum", "gm_modifiers", mods);
                
                // O Hook 'updateActor' no main.js vai cuidar de renderizar a tela
            } else {
                ui.notifications.warn("Não foi possível encontrar o ator para remover o modificador.");
            }
        });

        // ===========================================================
        // 3. SELEÇÃO NA PALETA E MANUAL
        // ===========================================================

// Seleção na Paleta (Toggle)
        html.find('.palette-mod').click(ev => {
            ev.preventDefault();
            if ($(ev.target).closest('.mod-hover-controls').length) return;

            const btn = $(ev.currentTarget);
            const modUuid = btn.data('uuid');
            const modValue = btn.data('value');
            const modCap = btn.data('cap'); // ✅ LÊ O TETO DO HTML
            const modName = btn.find('.mod-name').text().trim();

            this.selectedModifiers.delete("manual");

            if (this.selectedModifiers.has(modUuid)) {
                this.selectedModifiers.delete(modUuid);
            } else {
                // ✅ SALVA O TETO NO MAPA DE SELEÇÃO
                this.selectedModifiers.set(modUuid, { 
                    name: modName, 
                    value: modValue,
                    cap: modCap 
                });
            }
            this.render(false);
        });

        // Ativar Manual
        html.find('.activate-manual-btn').click(ev => {
            ev.preventDefault();
            if (this.selectedModifiers.has("manual")) {
                this.selectedModifiers.delete("manual");
            } else {
                this.selectedModifiers.clear(); // Limpa paleta
                this.selectedModifiers.set("manual", { 
                    name: this.manualCache.name, 
                    value: this.manualCache.value,
                    isManual: true
                });
            }
            this.render(false);
        });

        // Inputs Manuais (Nome/Valor)
        html.find('.manual-name').on('input', ev => {
            this.manualCache.name = ev.target.value;
            if (this.selectedModifiers.has("manual")) this.selectedModifiers.get("manual").name = ev.target.value;
        });
        
        html.find('.manual-value').on('input', ev => { 
            this.manualCache.value = parseInt(ev.target.value) || 0; 
            if (this.selectedModifiers.has("manual")) this.selectedModifiers.get("manual").value = this.manualCache.value; 
            this._updateQRDisplay(html); 
        });

        // Botões de Passo (+/-)
        html.find('.step-btn').click(ev => {
            ev.preventDefault();
            const action = $(ev.currentTarget).data('action');
            let current = parseInt(this.manualCache.value) || 0;
            if (action === 'inc') current += 1;
            if (action === 'dec') current -= 1;
            
            this.manualCache.value = current;
            html.find('.manual-value').val(current);
            if (this.selectedModifiers.has("manual")) this.selectedModifiers.get("manual").value = current;
            this._updateQRDisplay(html);
        });

        // Botões de Preset (-6, +4...)
        html.find('.preset-btn').click(ev => {
            ev.preventDefault();
            const val = parseInt($(ev.currentTarget).data('val'));
            this.manualCache.value = val;
            html.find('.manual-value').val(val);
            
            this.selectedModifiers.clear();
            this.selectedModifiers.set("manual", { 
                name: this.manualCache.name, 
                value: val, 
                isManual: true 
            });
            this.render(false);
        });

        // Limpar Seleção
        html.find('.clear-selection-btn').click(ev => {
            ev.preventDefault();
            this.selectedModifiers.clear();
            this.render(false);
        });

        // Busca (Filtro)
        html.find('.mod-search').on('keyup', ev => {
            const query = ev.target.value.toLowerCase();
            const items = html.find('.palette-mod');
            items.each((i, el) => {
                const name = $(el).find('.mod-name').text().toLowerCase();
                if (name.includes(query)) $(el).show();
                else $(el).hide();
            });
        });

        // ===========================================================
        // 4. GESTÃO DE GRUPOS (CRUD)
        // ===========================================================
        
        html.find('.mod-quick-view').click(async ev => {
            ev.stopPropagation(); ev.preventDefault();
            const uuid = $(ev.currentTarget).closest('.palette-mod').data('uuid');
            const item = await fromUuid(uuid);
            if (item) this._showQuickView(item);
        });
        
        html.find('.add-group-btn').click(async ev => {
            const colId = $(ev.currentTarget).data('col');
            new Dialog({
                title: "Novo Grupo", content: `<div class="form-group"><label>Nome:</label><input type="text" id="group-name" autofocus/></div>`,
                buttons: { create: { label: "Criar", callback: async (html) => { const name = html.find('#group-name').val(); if(name) await this._addGroup(colId, name); } } }, default: "create"
            }).render(true);
        });
        
        html.find('.delete-group-btn').click(async ev => {
            const groupId = $(ev.currentTarget).data('group-id');
            const colId = $(ev.currentTarget).closest('.modular-column').data('col-id');
            Dialog.confirm({ title: "Excluir Grupo", content: "<p>Tem certeza?</p>", yes: () => this._removeGroup(colId, groupId) });
        });
        
        html.find('.add-mod-to-group-btn').click(ev => {
            const groupId = $(ev.currentTarget).data('group-id');
            const colId = $(ev.currentTarget).closest('.modular-column').data('col-id');
            new GMModifierBrowser({ onSelect: async (items) => { await this._addItemsToGroup(colId, groupId, items); } }).render(true);
        });
        
        html.find('.delete-mod-btn').click(async ev => {
            ev.stopPropagation();
            const uuid = $(ev.currentTarget).closest('.palette-mod').data('uuid');
            const groupId = $(ev.currentTarget).closest('.modifier-group').data('group-id');
            const colId = $(ev.currentTarget).closest('.modular-column').data('col-id');
            await this._removeItemFromGroup(colId, groupId, uuid);
        });

        // ===========================================================
        // 5. CONTROLES DE COMBATE
        // ===========================================================
        
        html.find('.next-turn').click(async ev => {
            ev.preventDefault();
            if (game.combat) await game.combat.nextTurn();
        });

        html.find('.prev-turn').click(async ev => {
            ev.preventDefault();
            if (game.combat) await game.combat.previousTurn();
        });

        html.find('.end-combat').click(async ev => {
            ev.preventDefault();
            if (game.combat) {
                Dialog.confirm({
                    title: "Encerrar Combate",
                    content: "<p>Deseja realmente encerrar este encontro?</p>",
                    yes: () => game.combat.endCombat()
                });
            }
        });

        // ===========================================================
        // 6. ROLADOR RÁPIDO
        // ===========================================================

        html.find('.qr-toggle-mode').click(ev => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            btn.toggleClass('active');
            const icon = btn.find('i');
            if (btn.hasClass('active')) {
                icon.removeClass('fa-eye').addClass('fa-eye-slash');
                btn.attr('title', 'Modo Privado (Apenas Local)');
            } else {
                icon.removeClass('fa-eye-slash').addClass('fa-eye');
                btn.attr('title', 'Modo Público (Enviar ao Chat)');
            }
        });

        html.find('.roll-test').click(async ev => {
            ev.preventDefault();
            const nhBase = parseInt(html.find('.qr-nh').val()) || 10;
            const activeModsTotal = this._getTotalActiveModifier(); 
            const isPrivate = html.find('.qr-toggle-mode').hasClass('active');
            
            const roll = new Roll("3d6");
            await roll.evaluate();
            const total = roll.total;
            const effectiveLevel = nhBase + activeModsTotal;
            const isSuccess = total <= effectiveLevel;
            const margin = Math.abs(effectiveLevel - total);
            
            if (isPrivate) {
                const resultBox = html.find('.qr-result-display');
                const colorClass = isSuccess ? "success" : "failure";
                const text = isSuccess ? "Sucesso" : "Falha";
                const resultHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><span><i class="fas fa-dice"></i> <strong>${total}</strong></span><span>vs <strong>${effectiveLevel}</strong> <small>(${activeModsTotal >= 0 ? '+' : ''}${activeModsTotal})</small></span><span class="${colorClass}" style="text-transform:uppercase; font-weight:bold;">${text} (${margin})</span></div>`;
                resultBox.removeClass("success failure").addClass(colorClass).html(resultHTML).slideDown(100);
            } else {
                const gmActor = { name: "Mestre", img: "icons/svg/mystery-man.svg", id: null };
                performGURPSRoll(gmActor, {
                    label: "Teste Rápido (EM)",
                    value: effectiveLevel, 
                    originalValue: nhBase,
                    modifier: activeModsTotal,
                    img: "icons/svg/d20.svg"
                });
            }
        });

        html.find('.roll-damage').click(async ev => {
            ev.preventDefault();
            const formula = html.find('.qr-formula').val();
            const type = html.find('.qr-type').val() || ""; 
            if (!formula) return;

            const roll = new Roll(formula);
            await roll.evaluate();
            const diceHtml = roll.dice.flatMap(d => d.results).map(r => `<span class="die-face" style="font-size:0.8em; width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #ccc; border-radius:2px; margin:0 1px;">${r.result}</span>`).join('');
            
            const content = `<div class="gurps-damage-card"><header class="card-header"><h3>Dano Rápido</h3></header><div class="card-formula-container"><span class="formula-pill">${formula} ${type}</span></div><div class="card-content"><div class="card-main-flex"><div class="roll-column"><span class="column-label">Dados</span><div class="individual-dice-damage">${diceHtml}</div></div><div class="column-separator"></div><div class="target-column"><span class="column-label">Total</span><div class="damage-total"><span class="damage-value">${roll.total}</span><span class="damage-type" style="font-size:0.5em; vertical-align:middle;">${type}</span></div></div></div></div><footer class="card-actions"><button type="button" class="apply-damage-button" data-damage='${JSON.stringify({attackerId: null, sourceName: "Dano Rápido", main: { total: roll.total, type: type, armorDivisor: 1 }, onDamageEffects: {}, generalConditions: {}})}'><i class="fas fa-crosshairs"></i> Aplicar</button></footer></div>`;

            ChatMessage.create({ user: game.user.id, speaker: { alias: "Mestre" }, content: content, rolls: [roll] });
        });
    
        // ===========================================================
        // MENU DE CONTEXTO (CLIQUE DIREITO)
        // ===========================================================
        html.find('.monitor-card').contextmenu(async ev => {
            ev.preventDefault();
            ev.stopPropagation();

            // Remove menus antigos se existirem
            $('.gum-ctx-menu').remove();

            const card = $(ev.currentTarget);
            const actorId = card.data('actor-id');
            const tokenId = card.data('token-id');

            // Busca Inteligente (Mesma do Apply)
            let actor;
            if (tokenId) {
                const token = canvas.tokens.get(tokenId);
                if (token) actor = token.actor;
            }
            if (!actor && actorId) actor = game.actors.get(actorId);

            if (actor) {
                this._createContextMenu(actor, ev.clientX, ev.clientY);
            }
        });

        // Fechar menu ao clicar em qualquer lugar
        $(document).on('click.gum-ctx', (e) => {
            if (!$(e.target).closest('.gum-ctx-menu').length) {
                $('.gum-ctx-menu').remove();
            }
        });
    
    }

/**
     * Helper: Resolve fórmulas como "GdP+1" para "1d6-1" usando os dados do ator
     */
    _resolveDamageFormula(actor, rawFormula) {
        if (!rawFormula) return null;
        
        const formulaStr = String(rawFormula).toLowerCase();
        const attrs = actor.system.attributes || {};
        const thrust = (attrs.thrust_damage || "0").toLowerCase(); // GdP
        const swing = (attrs.swing_damage || "0").toLowerCase();   // GdB (GeB)

        // Substitui (gdp ou thr) e (gdb ou sw ou geb)
        let resolved = formulaStr
            .replace(/gdp|thr/g, `(${thrust})`)
            .replace(/gdb|sw|geb/g, `(${swing})`);
            
        // (Opcional) Poderíamos usar Roll.replaceFormulaData se tivéssemos dados complexos,
        // mas a substituição de string simples resolve 99% dos casos do GURPS.
        return resolved;
    }

/**
     * Constrói e exibe o menu de contexto flutuante (OTIMIZADO EM GRADE)
     */
    _createContextMenu(actor, x, y) {
        const system = actor.system || {};
        const attr = system.attributes || {};
        const itemsArray = actor.items.contents || (Array.isArray(actor.items) ? actor.items : []);

        let html = `<div class="gum-ctx-menu" style="top:${y}px; left:${x}px;">`;
        html += `<div class="gum-ctx-header">${actor.name}</div>`;
        
        // ---------------------------------------------------------
        // 1. ATRIBUTOS (GRADE COMPACTA)
        // ---------------------------------------------------------
        
        // Helper seguro para valor
        const getVal = (obj) => {
            if (!obj) return 10;
            return (obj.final !== undefined && obj.final !== null) ? obj.final : (obj.value !== undefined ? obj.value : 10);
        };

        // --- LINHA 1: PRINCIPAIS (ST, DX, IQ, HT) ---
        html += `<div class="gum-ctx-stats-grid">`;
        ['st', 'dx', 'iq', 'ht'].forEach(key => {
            const obj = attr[key] || attr[key.toUpperCase()];
            // Mesmo se não achar, mostra 10 para manter o grid alinhado
            const val = obj ? getVal(obj) : 10; 
            html += `<div class="gum-ctx-stat-box roll-attr" data-attr="${key.toUpperCase()}" data-val="${val}">
                        <span class="stat-label">${key.toUpperCase()}</span>
                        <span class="stat-value">${val}</span>
                     </div>`;
        });
        html += `</div>`;

        // --- LINHA 2: SECUNDÁRIOS (Per, Vont, Esq) ---
        // Busca robusta por Percepção e Vontade
        const perObj = attr.per || attr.Per || attr.PER || attr.perception;
        const willObj = attr.will || attr.Will || attr.WILL || attr.willpower;
        const dodgeObj = attr.dodge;

        const perVal = perObj ? getVal(perObj) : 10;
        const willVal = willObj ? getVal(willObj) : 10;
        const dodgeVal = dodgeObj ? getVal(dodgeObj) : 0;

        html += `<div class="gum-ctx-stats-grid secondary">`;
        
        // Percepção
        html += `<div class="gum-ctx-stat-box roll-attr" data-attr="Percepção" data-val="${perVal}">
                    <span class="stat-label">PER</span>
                    <span class="stat-value">${perVal}</span>
                 </div>`;
        
        // Vontade
        html += `<div class="gum-ctx-stat-box roll-attr" data-attr="Vontade" data-val="${willVal}">
                    <span class="stat-label">VONT</span>
                    <span class="stat-value">${willVal}</span>
                 </div>`;
                 
        // Esquiva
        html += `<div class="gum-ctx-stat-box roll-def" data-def="Esquiva" data-val="${dodgeVal}">
                    <span class="stat-label">ESQ</span>
                    <span class="stat-value">${dodgeVal}</span>
                 </div>`;
        html += `</div>`;

        // ---------------------------------------------------------
        // 2. ATAQUES (AGRUPADOS)
        // ---------------------------------------------------------
        const attackGroups = {};

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

        const processAttack = (item, atk) => {
            if (!atk || !atk.mode) return;
            if (!attackGroups[item.id]) attackGroups[item.id] = { name: item.name, modes: [] };
            
            const nh = atk.final_nh !== undefined ? atk.final_nh : atk.level;
            const rawDmg = atk.damage || atk.damage_formula || "";
            const resolvedDmg = this._resolveDamageFormula(actor, rawDmg);
            const defaultDefense = calculateDefaultDefense(nh);
            const parryValue = atk.parry_default && defaultDefense !== null ? defaultDefense : atk.parry;
            const blockValue = atk.block_default && defaultDefense !== null ? defaultDefense : atk.block;
            const parry = normalizeDefenseValue(parryValue);
            const block = normalizeDefenseValue(blockValue);

            attackGroups[item.id].modes.push({
                label: atk.mode,
                nh: nh,
                damage: resolvedDmg,
                damageDisplay: rawDmg,
                type: atk.damage_type || "",
                parry: parry,
                block: block,
                fullLabel: `${item.name} (${atk.mode})`
            });
        };

        itemsArray.forEach(item => {
            if (item.system.melee_attacks) Object.values(item.system.melee_attacks).forEach(atk => processAttack(item, atk));
            if (item.system.ranged_attacks) Object.values(item.system.ranged_attacks).forEach(atk => processAttack(item, atk));
        });

        if (Object.keys(attackGroups).length > 0) {
            html += `<div class="gum-ctx-group"><div class="gum-ctx-group-title"><i class="fas fa-swords"></i> Ataques</div>`;
            for (const [itemId, group] of Object.entries(attackGroups)) {
                html += `
                <div class="gum-ctx-item has-submenu">
                    <span>${group.name}</span> <i class="fas fa-caret-right gum-ctx-caret"></i>
                    <div class="gum-ctx-submenu">
                        ${group.modes.map(mode => `
                            <div class="gum-ctx-item" style="cursor:default;">
                                <div class="gum-ctx-attack-row">
                                    <div class="attack-roll-btn roll-attack-ctx" style="cursor:pointer;" data-label="${mode.fullLabel}" data-nh="${mode.nh}">
                                        <span>${mode.label}</span> <span class="gum-ctx-val skill">${mode.nh}</span>
                                    </div>
                                    <div class="ctx-actions-right">
                                        ${mode.damage ? `<div class="damage-roll-btn roll-damage-ctx" data-damage="${mode.damage}" data-type="${mode.type}" data-label="${mode.fullLabel}" title="Dano: ${mode.damageDisplay}"><i class="fas fa-skull"></i> ${mode.damageDisplay}</div>` : ''}
                                        ${mode.parry ? `<div class="def-roll-btn-ctx roll-def" data-def="Aparar" data-val="${mode.parry}" title="Aparar"><i class="fas fa-swords"></i> ${mode.parry}</div>` : ''}
                                        ${mode.block ? `<div class="def-roll-btn-ctx roll-def" data-def="Bloqueio" data-val="${mode.block}" title="Bloqueio"><i class="fas fa-shield-alt"></i> ${mode.block}</div>` : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            }
            html += `</div>`;
        }

        // ---------------------------------------------------------
        // 3. PODERES & MAGIAS
        // ---------------------------------------------------------
        const renderPowerSpell = (item) => {
            const level = item.system.level || item.system.skill_level || item.system.points || 0;
            if (!level) return "";
            
            const dmgData = item.system.damage || {};
            const rawDmg = dmgData.formula || "";
            const resolvedDmg = this._resolveDamageFormula(actor, rawDmg);
            const dmgType = dmgData.type || "";

            return `
                <div class="gum-ctx-item">
                    <div class="gum-ctx-attack-row">
                        <div class="attack-roll-btn roll-attack-ctx" style="cursor:pointer;" data-label="${item.name}" data-nh="${level}">
                            <span>${item.name}</span> <span class="gum-ctx-val skill">${level}</span>
                        </div>
                        <div class="ctx-actions-right">
                            ${resolvedDmg ? `<div class="damage-roll-btn roll-damage-ctx" data-damage="${resolvedDmg}" data-type="${dmgType}" data-label="${item.name}" title="Dano"><i class="fas fa-bolt"></i> ${rawDmg}</div>` : ''}
                        </div>
                    </div>
                </div>`;
        };

        const powers = itemsArray.filter(i => i.type === 'power');
        if(powers.length > 0) {
             html += `<div class="gum-ctx-group"><div class="gum-ctx-group-title"><i class="fas fa-bolt"></i> Poderes</div>`;
             powers.forEach(p => html += renderPowerSpell(p));
             html += `</div>`;
        }

        const spells = itemsArray.filter(i => i.type === 'spell');
        if (spells.length > 0) {
            html += `<div class="gum-ctx-group"><div class="gum-ctx-group-title"><i class="fas fa-magic"></i> Magias</div>`;
            spells.sort((a,b) => a.name.localeCompare(b.name)).slice(0, 15).forEach(s => html += renderPowerSpell(s));
            if (spells.length > 15) html += `<div style="text-align:center; color:#666; font-size:0.8em;">...mais ${spells.length - 15}</div>`;
            html += `</div>`;
        }

        html += `</div>`; // Fim

        $('body').append(html);
        const menu = $('.gum-ctx-menu');
        
        // --- LISTENERS ---
        
        menu.find('.roll-attr').click(ev => {
            const el = $(ev.currentTarget);
            this._performContextRoll(actor, el.data('attr'), parseInt(el.data('val')));
            menu.remove();
        });

        menu.find('.roll-def').click(ev => {
            ev.stopPropagation();
            const el = $(ev.currentTarget);
            this._performContextRoll(actor, el.data('def'), parseInt(el.data('val')));
            menu.remove();
        });

        menu.find('.roll-attack-ctx').click(ev => {
            ev.stopPropagation();
            const el = $(ev.currentTarget);
            this._performContextRoll(actor, el.data('label'), parseInt(el.data('nh')));
            menu.remove();
        });

        menu.find('.roll-damage-ctx').click(async ev => {
            ev.stopPropagation();
            const el = $(ev.currentTarget);
            const dmgFormula = el.data('damage');
            const dmgType = el.data('type');
            const label = el.data('label');
            
            const roll = new Roll(dmgFormula);
            await roll.evaluate();
            
            const diceHtml = roll.dice.flatMap(d => d.results).map(r => `<span class="die-damage">${r.result}</span>`).join('');
            const content = `<div class="gurps-damage-card"><header class="card-header"><h3>Dano: ${label}</h3></header><div class="card-formula-container"><span class="formula-pill">${dmgFormula} ${dmgType}</span></div><div class="card-content"><div class="card-main-flex"><div class="roll-column"><span class="column-label">Dados</span><div class="individual-dice-damage">${diceHtml}</div></div><div class="column-separator"></div><div class="target-column"><span class="column-label">Total</span><div class="damage-total"><span class="damage-value">${roll.total}</span><span class="damage-type">${dmgType}</span></div></div></div></div><footer class="card-actions"><button type="button" class="apply-damage-button" data-damage='${JSON.stringify({attackerId: actor.id, sourceName: label, main: { total: roll.total, type: dmgType, armorDivisor: 1 }, onDamageEffects: {}, generalConditions: {}})}'><i class="fas fa-crosshairs"></i> Aplicar</button></footer></div>`;

            ChatMessage.create({ user: game.user.id, speaker: { alias: actor.name }, content: content, rolls: [roll] });
            menu.remove();
        });
    }

/**
     * Executa a rolagem do menu somando Modificadores E aplicando Tetos (Caps)
     */
    _performContextRoll(actor, label, targetValue) {
        
        let totalMod = 0;
        let lowestCap = Infinity; // Começa infinito (sem teto)

        // 1. Processa Modificadores da TELA (Selecionados agora)
        this.selectedModifiers.forEach(mod => {
            totalMod += (parseInt(mod.value) || 0);
            
            // Verifica se tem teto e se é menor que o atual
            if (mod.cap !== undefined && mod.cap !== null && mod.cap !== "") {
                const capVal = parseInt(mod.cap);
                if (!isNaN(capVal) && capVal < lowestCap) lowestCap = capVal;
            }
        });

        // 2. Processa Modificadores do ATOR (Flags já aplicadas)
        const actorFlags = actor.getFlag("gum", "gm_modifiers") || [];
        actorFlags.forEach(mod => {
            totalMod += (parseInt(mod.value) || 0);
            
            // Verifica teto nas flags
            if (mod.cap !== undefined && mod.cap !== null && mod.cap !== "") {
                const capVal = parseInt(mod.cap);
                if (!isNaN(capVal) && capVal < lowestCap) lowestCap = capVal;
            }
        });

        // 3. Calcula NH Efetivo Preliminar
        let effectiveLevel = targetValue + totalMod;

        // 4. Aplica a Regra do Teto (Cap)
        // Se houver um teto definido e o NH for maior que ele, reduz para o teto.
        if (lowestCap !== Infinity && effectiveLevel > lowestCap) {
            effectiveLevel = lowestCap;
            // Opcional: Avisar no chat que o teto foi aplicado?
            // Por enquanto, o sistema de rolagem mostra o valor final.
        }
        
        // 5. Rola
        performGURPSRoll(actor, {
            label: label + " (EM)",
            value: effectiveLevel,      // NH Final (com Teto aplicado)
            originalValue: targetValue, // NH Base
            modifier: totalMod,         // Soma dos modificadores (para exibir no detalhe)
            img: actor.img || "icons/svg/d20.svg"
        });
    }
    /**
     * Atualiza o visual do mostrador de modificadores no rodapé
     */
    _updateQRDisplay(html) {
        // Usa o html passado ou o elemento da janela
        const root = html || this.element;
        const total = this._getTotalActiveModifier();
        const display = root.find('.qr-mod-display');
        
        // Formata o texto (+2, -5, 0)
        const sign = total > 0 ? '+' : '';
        display.text(`${sign}${total}`);
        
        // Remove classes antigas
        display.removeClass('pos neg');
        
        // Adiciona cor
        if (total > 0) display.addClass('pos');
        if (total < 0) display.addClass('neg');
    }
    /**
     * Helper: Soma todos os modificadores atualmente selecionados no EM
     */
    _getTotalActiveModifier() {
        let total = 0;
        
        // 1. Modificador Manual
        if (this.selectedModifiers.has("manual")) {
            total += parseInt(this.manualCache.value) || 0;
        }

        // 2. Modificadores da Paleta
        this.selectedModifiers.forEach((mod, key) => {
            if (key !== "manual") {
                total += parseInt(mod.value) || 0;
            }
        });

        return total;
    }
    
    // --- LÓGICA DE APLICAÇÃO ---
async _applyModifiersToActor(actor) {
        const currentMods = actor.getFlag("gum", "gm_modifiers") || [];
        let count = 0;

        this.selectedModifiers.forEach(mod => {
            currentMods.push({
                name: mod.name,
                value: mod.value,
                cap: mod.cap, // ✅ AGORA SALVAMOS O TETO NA FLAG DO ATOR
                id: foundry.utils.randomID(),
                source: "GM Screen"
            });
            count++;
        });

        await actor.setFlag("gum", "gm_modifiers", currentMods);
        ui.notifications.info(`Aplicado(s) ${count} modificador(es) em ${actor.name}.`);
    }
    
        async _showQuickView(item) {
        const s = item.system;
        const createTag = (label, value) => {
             if (value !== null && value !== undefined && value !== "") 
                return `<div class="property-tag"><label>${label}</label><span>${value}</span></div>`;
             return '';
        };
        let tagsHtml = '';
        const modSign = s.modifier > 0 ? '+' : '';
        tagsHtml += createTag('Valor', `${modSign}${s.modifier}`);
        const catLabels = { location: "Localização", maneuver: "Manobra", situation: "Situação", attack_opt: "Opção Atq.", defense_opt: "Opção Def.", posture: "Postura", range: "Distância", time: "Tempo", effort: "Esforço", lighting: "Iluminação", cover: "Cobertura", difficulty: "Dificuldade" };
        tagsHtml += createTag('Categoria', catLabels[s.ui_category] || "Outros");
        if (s.nh_cap) tagsHtml += createTag('Teto (Cap)', s.nh_cap);
        if (s.duration) tagsHtml += createTag('Duração', s.duration);
        const description = await TextEditor.enrichHTML(s.description || "<i>Sem descrição.</i>", { async: true });
        const content = `
            <div class="gurps-dialog-canvas">
                <div class="gurps-item-preview-card" style="border:none; box-shadow:none;">
                    <header class="preview-header">
                        <h3>${item.name}</h3>
                        <div class="header-controls"><span class="preview-item-type">Modificador</span><a class="send-to-chat" title="Enviar para o Chat"><i class="fas fa-comment"></i></a></div>
                    </header>
                    <div class="preview-content">
                        <div class="preview-properties">${tagsHtml}</div>
                        <hr class="preview-divider">
                        <div class="preview-description">${description}</div>
                    </div>
                </div>
            </div>`;
        new Dialog({
            title: `Detalhes: ${item.name}`, content: content, buttons: { close: { icon: '<i class="fas fa-times"></i>', label: "Fechar" } }, default: "close", options: { classes: ["dialog", "gurps-item-preview-dialog"], width: 400, height: "auto" },
            render: (dlgHtml) => {
                dlgHtml.on('click', '.send-to-chat', (e) => {
                    e.preventDefault();
                    let cardHTML = $(e.currentTarget).closest('.gurps-item-preview-card').html();
                    cardHTML = cardHTML.replace(/<div class="header-controls">.*?<\/div>/s, `<span class="preview-item-type" style="float:right;">Modificador</span>`);
                    ChatMessage.create({ content: `<div class="gurps-item-preview-card chat-card">${cardHTML}</div>`, user: game.user.id, speaker: { alias: "Escudo do Mestre" } });
                    ui.notifications.info("Regra enviada para o chat.");
                });
            }
        }).render(true);
    }
    
    // Métodos de Persistência
    async _saveConfig(newConfig) { await game.settings.set("gum", "gmScreenConfig", newConfig); this.render(false); }
    async _addGroup(colId, name) { 
        const config = game.settings.get("gum", "gmScreenConfig");
        const col = config.columns.find(c => c.id === colId);
        if (col) { col.groups.push({ id: foundry.utils.randomID(), name: name, items: [] }); await this._saveConfig(config); }
    }
    async _removeGroup(colId, groupId) { 
        const config = game.settings.get("gum", "gmScreenConfig");
        const col = config.columns.find(c => c.id === colId);
        if (col) { col.groups = col.groups.filter(g => g.id !== groupId); await this._saveConfig(config); }
    }
    async _addItemsToGroup(colId, groupId, items) { 
        const config = game.settings.get("gum", "gmScreenConfig");
        const col = config.columns.find(c => c.id === colId);
        const group = col?.groups.find(g => g.id === groupId);
        if (group) { items.forEach(item => { if (!group.items.includes(item.uuid)) group.items.push(item.uuid); }); await this._saveConfig(config); }
    }
    async _removeItemFromGroup(colId, groupId, itemUuid) { 
        const config = game.settings.get("gum", "gmScreenConfig");
        const col = config.columns.find(c => c.id === colId);
        const group = col?.groups.find(g => g.id === groupId);
        if (group) { group.items = group.items.filter(u => u !== itemUuid); await this._saveConfig(config); }
    }
    async _onDrop(event) { 
        const data = TextEditor.getDragEventData(event);
        if (data.type !== "Item") return;
        const dropTarget = event.target.closest(".group-content-area");
        if (!dropTarget) return;
        const groupId = $(dropTarget).closest('.modifier-group').data('group-id');
        const colId = $(dropTarget).closest('.modular-column').data('col-id');
        const item = await fromUuid(data.uuid);
        if (!item || item.type !== "gm_modifier") return ui.notifications.warn("Apenas Modificadores.");
        await this._addItemsToGroup(colId, groupId, [item]);
    }
    _getBestDefense(actor, type) { 
        let best = 0;
        actor.items.filter(i => i.system.equipped).forEach(i => {
            if (i.system.melee_attacks) { Object.values(i.system.melee_attacks).forEach(atk => { const val = type === 'parry' ? atk.final_parry : atk.final_block; if (Number(val) > best) best = Number(val); }); }
        });
        return best || "-"; 
    }
/**
     * Adiciona botões ao cabeçalho da janela (Ao lado do X)
     */
    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        
        // Botão Exportar
        buttons.unshift({
            label: "Exportar Layout",
            class: "export-config",
            icon: "fas fa-download",
            onclick: () => this._exportConfig()
        });

        // Botão Importar
        buttons.unshift({
            label: "Importar Layout",
            class: "import-config",
            icon: "fas fa-upload",
            onclick: () => this._importConfig()
        });

        return buttons;
    }
    /**
     * Exporta a configuração atual para um arquivo JSON
     */
    async _exportConfig() {
        const config = game.settings.get("gum", "gmScreenConfig");
        const filename = `gum-gm-screen-config.json`;
        saveDataToFile(JSON.stringify(config, null, 2), "text/json", filename);
    }

    /**
     * Importa um arquivo JSON e substitui a configuração
     */
    async _importConfig() {
        new Dialog({
            title: "Importar Layout do Escudo",
            content: `
                <div class="form-group">
                    <p class="notes">Isso substituirá todo o layout atual do seu escudo.</p>
                    <label>Arquivo JSON:</label>
                    <input type="file" name="import-file" accept=".json">
                </div>
            `,
            buttons: {
                import: {
                    label: "Importar",
                    icon: "<i class='fas fa-file-import'></i>",
                    callback: async (html) => {
                        const input = html.find('[name="import-file"]')[0];
                        if (!input.files[0]) return ui.notifications.warn("Selecione um arquivo.");
                        
                        const file = input.files[0];
                        const text = await file.text();
                        
                        try {
                            const json = JSON.parse(text);
                            // Validação simples
                            if (!json.columns || !Array.isArray(json.columns)) {
                                throw new Error("Formato inválido.");
                            }
                            
                            await game.settings.set("gum", "gmScreenConfig", json);
                            this.render(true);
                            ui.notifications.info("Layout do Escudo importado com sucesso!");
                        } catch (err) {
                            console.error(err);
                            ui.notifications.error("Erro ao ler o arquivo JSON.");
                        }
                    }
                }
            },
            default: "import"
        }).render(true);
    }
}