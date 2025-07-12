export default class DamageApplicationWindow extends Application {
    
    constructor(damageData, attackerActor, targetActor, options = {}) {
        super(options);
        this.damageData = damageData;
        this.attackerActor = attackerActor;
        this.targetActor = targetActor;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: `Aplicar Dano em ${this.object?.target?.name || "Alvo"}`,
            template: "systems/gum/templates/apps/damage-application.hbs",
            classes: ["dialog", "gurps", "damage-application-dialog"],
            width: 650,
            height: "auto",
            resizable: true,
            // ✅ NOVO: Adicionamos um botão "Aplicar" no rodapé da janela ✅
            buttons: {
                apply: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Aplicar Lesão",
                    callback: (html) => this._onApplyDamage(html.find('form')[0])
                }
            }
        });
    }

   async getData() {
    const context = await super.getData();
    context.damage = this.damageData;
    context.attacker = this.attackerActor;
    context.target = this.targetActor;

    // Tabela base de locais de acerto com RD inicial 0
    const locationsData = {
        "head":     { label: "Crânio",      roll: "3-4",       dr: 0 },
        "face":     { label: "Rosto",       roll: "5",         dr: 0 },
        "leg":      { label: "Perna",       roll: "6-7, 13-14",dr: 0 },
        "arm":      { label: "Braço",       roll: "8, 12",     dr: 0 },
        "torso":    { label: "Torso",       roll: "9-11",      dr: 0 },
        "groin":    { label: "Virilha",     roll: "11",        dr: 0 },
        "vitals":   { label: "Órg. Vitais", roll: "--",        dr: 0 },
        "hand":     { label: "Mão",         roll: "15",        dr: 0 },
        "foot":     { label: "Pé",          roll: "16",        dr: 0 },
        "neck":     { label: "Pescoço",     roll: "17-18",     dr: 0 },
        "eyes":     { label: "Olhos",       roll: "--",        dr: 0 }
    };

    // --- ✅ NOVA LÓGICA DE CÁLCULO DE RD AUTOSSUFICIENTE ✅ ---

    // 1. Pega os modificadores de RD manuais do alvo.
    const manualDRMods = this.targetActor.system.combat.dr_mods || {};
    for (const [key, mod] of Object.entries(manualDRMods)) {
        if (locationsData[key]) {
            locationsData[key].dr += parseInt(mod) || 0;
        }
    }

    // 2. Itera sobre os itens de armadura EQUIPADOS do alvo.
    const equippedArmor = this.targetActor.items.filter(i => i.type === 'armor' && i.system.location === 'equipped');
    for (const armor of equippedArmor) {
        const armorDR = parseInt(armor.system.dr) || 0;
        // Para cada local que a armadura protege, soma a sua RD.
        if (armor.system.worn_locations) {
            for (const locationKey of armor.system.worn_locations) {
                if (locationsData[locationKey]) {
                    locationsData[locationKey].dr += armorDR;
                }
            }
        }
    }
    
    // Transforma o objeto em um array para o template
    context.locations = Object.entries(locationsData).map(([key, data]) => {
        data.key = key;
        data.totalDR = data.dr; // O valor final calculado
        return data;
    });

    // Ordena os locais de acerto pela rolagem de dado
    context.locations.sort((a, b) => {
        const firstRollA = parseInt(a.roll.split(/[,-]/)[0]);
        const firstRollB = parseInt(b.roll.split(/[,-]/)[0]);
        if (isNaN(firstRollA)) return 1; // Joga itens sem rolagem (--) para o final
        if (isNaN(firstRollB)) return -1;
        return firstRollA - firstRollB;
    });

    return context;
}

    /**
     * ✅ MÉTODO ATUALIZADO: Adicionamos a lógica de cliques e cálculos.
     */
    activateListeners(html) {
        super.activateListeners(html);
        const form = html[0]; 

        // Listener para os cliques nas linhas de local de acerto
        form.querySelectorAll('.location-row').forEach(row => {
            row.addEventListener('click', ev => {
                form.querySelectorAll('.location-row.active').forEach(r => r.classList.remove('active'));
                ev.currentTarget.classList.add('active');
                
                const targetDR = ev.currentTarget.dataset.dr;
                form.querySelector('[name="target_dr"]').value = targetDR;
                
                this._updateDamageCalculation(form);
            });
        });

        // Listener para qualquer mudança nos campos de cálculo
        form.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', () => this._updateDamageCalculation(form));
        });
        
    // --- LÓGICA PARA PRÉ-SELECIONAR O TORSO ---
    // Encontra a linha do Torso e a "clica" programaticamente para iniciar os cálculos.
    const torsoRow = form.querySelector('.location-row[data-location-key="torso"]');
    if (torsoRow) {
        torsoRow.click();
    } else {
        // Se o torso não for encontrado, apenas inicia o cálculo com os valores padrão.
        this._updateDamageCalculation(form);
    }

        html.find('button[data-action="applyAndPublish"]').on('click', () => this._onApplyDamage(form, true, true));
        html.find('button[data-action="applyAndClose"]').on('click', () => this._onApplyDamage(form, true, false));
        html.find('button[data-action="applyAndKeepOpen"]').on('click', () => this._onApplyDamage(form, false, false));
       


    }

    /**
     * ✅ NOVO MÉTODO: Centraliza toda a lógica de cálculo de dano.
     */
    _updateDamageCalculation(form) {
        // Pega os valores atuais da janela
        const damageRolled = parseInt(form.querySelector('[name="damage_rolled"]').value) || 0;
        const targetDR = parseInt(form.querySelector('[name="target_dr"]').value) || 0;
        const damageType = form.querySelector('[name="damage_type"]').value || '';
        const armorDivisor = parseFloat(this.damageData.main.armorDivisor) || 1;
        const ignoreDR = form.querySelector('[name="ignore_dr"]').checked;
        const isLargeArea = form.querySelector('[name="large_area_injury"]').checked;

        // Calcula a RD efetiva
        const effectiveDR = ignoreDR ? 0 : (armorDivisor > 0 ? Math.floor(targetDR / armorDivisor) : targetDR);
        
        // Calcula o dano penetrante
        const penetratingDamage = Math.max(0, damageRolled - effectiveDR);
        
        // --- ✅ LÓGICA DO MULTIPLICADOR DE FERIMENTO ✅ ---
        const woundingModifiers = {
            'pi-': 0.5, 'pi': 1, 'pi+': 1.5, 'pi++': 2,
            'cort': 1.5, 'cor': 1, 'cr': 1, 'exp': 1,
            'fad': 1, 'tox': 1, 'que': 1, 'kb': 1
        };
        let woundingMod = woundingModifiers[damageType] || 1;

        // Regra de Lesão em Larga Escala (limita o multiplicador em 1x)
        if (isLargeArea && woundingMod > 1) {
            woundingMod = 1;
        }
        
        // Calcula a lesão final
        const finalInjury = Math.floor(penetratingDamage * woundingMod);

        // Atualiza os campos "readonly" na janela
        form.querySelector('[name="penetrating_damage"]').value = penetratingDamage;
        form.querySelector('[name="wounding_mod"]').value = `x${woundingMod}`;
        form.querySelector('[name="final_injury"]').value = finalInjury;
    }

    /**
     * ✅ NOVO MÉTODO: Executado ao clicar no botão "Aplicar Lesão".
     */
    async _onApplyDamage(form) {
        const finalInjury = parseInt(form.querySelector('[name="final_injury"]').value) || 0;
        if (finalInjury > 0) {
            const currentHP = this.targetActor.system.attributes.hp.value;
            await this.targetActor.update({ 'system.attributes.hp.value': currentHP - finalInjury });
            ui.notifications.info(`${this.targetActor.name} sofreu ${finalInjury} pontos de lesão!`);
            // Futuramente, poderíamos adicionar lógicas para danos extras aqui
        } else {
            ui.notifications.info(`O ataque não causou lesão em ${this.targetActor.name}.`);
        }
        this.close(); // Fecha a janela após aplicar
    }


    // Sobrescreve o método de submissão do formulário para usar nossa lógica
    async _updateObject(event, formData) {
        await this._onApplyDamage(this.form);
    }
}