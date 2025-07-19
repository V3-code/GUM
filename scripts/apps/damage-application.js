export default class DamageApplicationWindow extends Application {
    
    constructor(damageData, attackerActor, targetActor, options = {}) {
        super(options);
        this.damageData = damageData;
        this.attackerActor = attackerActor;
        this.targetActor = targetActor;
        this.state = {
            finalInjury: 0,
            targetDR: 0,
            activeDamageKey: 'main' // Começa com o dano principal selecionado
        };
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: `Aplicar Dano em ${this.object?.target?.name || "Alvo"}`,
            template: "systems/gum/templates/apps/damage-application.hbs",
            classes: ["dialog", "gurps", "damage-application-dialog"],
            width: 760,
            height: "auto",
            resizable: true,
            // ✅ NOVO: Adicionamos um botão "Aplicar" no rodapé da janela ✅
            buttons: { }
        });
    }

   async getData() {
    const context = await super.getData();
    context.damage = this.damageData;
    context.attacker = this.attackerActor;
    context.target = this.targetActor;

     const damageablePools = [];

    // Adiciona os padrões: Pontos de Vida e Pontos de Fadiga
    damageablePools.push({
        path: 'system.attributes.hp.value',
        label: `Pontos de Vida (PV)`
    });
    damageablePools.push({
        path: 'system.attributes.fp.value',
        label: `Pontos de Fadiga (PF)`
    });

    // Adiciona os "Registros de Combate" customizados
    const combatMeters = this.targetActor.system.combat.combat_meters || {};
    for (const [key, meter] of Object.entries(combatMeters)) {
        damageablePools.push({
            path: `system.combat.combat_meters.${key}.value`,
            label: meter.name
        });
    }
    
        // 3. ✅ NOVO: Adiciona as "Reservas de Magia" ✅
    const spellReserves = this.targetActor.system.spell_reserves || {};
    for (const [key, reserve] of Object.entries(spellReserves)) {
        damageablePools.push({
            path: `system.spell_reserves.${key}.value`,
            label: `RM:${reserve.name}`
        });
    }

    // 4. ✅ NOVO: Adiciona as "Reservas de Poder" ✅
    const powerReserves = this.targetActor.system.power_reserves || {};
    for (const [key, reserve] of Object.entries(powerReserves)) {
        damageablePools.push({
            path: `system.power_reserves.${key}.value`,
            label: `RP:${reserve.name}`
        });
    }
    
    // Passa a lista final de "piscinas de dano" para o template
    context.damageablePools = damageablePools;

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
    locationsData["custom"] = {
    label: "Outro",
    roll: "--",
    dr: 0,
    custom: true
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

        // --- ✅ NOVA LÓGICA PARA A TABELA DE MODIFICADORES ✅ ---
    const mainDamageType = this.damageData.main?.type?.toLowerCase() || ''; // 'cr' é o padrão x1
    const woundingModifiersList = [
        { type: "Queimadura", abrev: "qmd", mult: 1 }, { type: "Corrosão", abrev: "cor", mult: 1 },
        { type: "Toxina", abrev: "tox", mult: 1 }, { type: "Contusão", abrev: "cont", mult: 1 },
        { type: "Corte", abrev: "cort", mult: 1.5 }, { type: "Perfuração", abrev: "perf", mult: 2 },
        { type: "Perfurante", abrev: "pi", mult: 1 }, { type: "Pouco Perfurante", abrev: "pi-", mult: 0.5 },
        { type: "Muito Perfurante", abrev: "pi+", mult: 1.5 }, { type: "Ext. Perfurante", abrev: "pi++", mult: 2 }
    ];

    // Verifica qual modificador deve vir pré-selecionado
    let defaultModFound = false;
    context.woundingModifiers = woundingModifiersList.map(mod => {
        mod.checked = (mod.abrev === mainDamageType);
        if (mod.checked) defaultModFound = true;
        return mod;
    });


    // Se nenhum modificador corresponder, a opção "Sem Modificador" será a padrão
    context.noModChecked = !defaultModFound;

    return context;

}

    /**
     * ✅ MÉTODO ATUALIZADO: Adicionamos a lógica de cliques e cálculos.
     */
    activateListeners(html) {
        super.activateListeners(html);
        const form = html[0]; 

        form.querySelectorAll('.damage-card').forEach(card => {
            card.addEventListener('click', ev => {
                // Remove 'active' de todos os cards
                form.querySelectorAll('.damage-card.active').forEach(c => c.classList.remove('active'));
                // Adiciona 'active' ao card clicado
                ev.currentTarget.classList.add('active');
                // Atualiza o campo ativo (não é necessário pois _updateDamageCalculation já busca)
                this._updateDamageCalculation(form);

const damageType = ev.currentTarget.querySelector('.damage-label')?.textContent?.match(/[a-zA-Z+]+/)?.[0];

// Se houver tipo de dano identificado
if (damageType) {
    const allRadios = form.querySelectorAll('input[name="wounding_mod_type"]');
    let matched = false;
    allRadios.forEach(r => {
        const label = r.closest('.wounding-row')?.textContent;
        if (label?.toLowerCase().includes(damageType.toLowerCase())) {
            r.checked = true;
            matched = true;
        }
    });

    // Se não encontrou nenhum modificador compatível
    if (!matched) {
        const noModRadio = form.querySelector('input[name="wounding_mod_type"][value="1"]');
        if (noModRadio) noModRadio.checked = true;
    }
} else {
    // Força a seleção do campo "Sem Modificador" (o que tem value="1" e label "Sem Modificador")
    const allRadios = form.querySelectorAll('input[name="wounding_mod_type"]');
    for (let r of allRadios) {
        const label = r.closest('.wounding-row')?.textContent?.toLowerCase() || '';
        if (r.value === '1' && label.includes("sem modificador")) {
            r.checked = true;
            break;
        }
    }
}

                

const newDamage = this.damageData[ev.currentTarget.dataset.damageKey];
const damageInput = form.querySelector('[name="damage_rolled"]');
const armorInput = form.querySelector('[name="armor_divisor"]');
if (damageInput) damageInput.value = newDamage.total || 0;
if (armorInput) armorInput.value = newDamage.armorDivisor || 1;

this._updateDamageCalculation(form);
            });
        });

        // Listener para os cliques nas linhas de local de acerto
form.querySelectorAll('.location-row').forEach(row => {
    row.addEventListener('click', ev => {
        // Marca o local clicado como ativo
        form.querySelectorAll('.location-row.active').forEach(r => r.classList.remove('active'));
        ev.currentTarget.classList.add('active');

        // Atualiza o campo de RD selecionado
        const targetDR = ev.currentTarget.dataset.dr;
        form.querySelector('[name="target_dr"]').value = targetDR;

        // ✅ NOVO: Atualiza os modificadores de dano com base no local
        const locationKey = ev.currentTarget.dataset.locationKey;
        const newMods = this._getAdjustedWoundingModifiers(locationKey);

        // Redesenha a tabela de modificadores com os valores ajustados
        const modTable = form.querySelector('.wounding-table');
        if (modTable) {
            const selectedRadio = form.querySelector('input[name="wounding_mod_type"]:checked');
                let selectedAbrev = '';

                if (selectedRadio) {
                const labelSpan = selectedRadio.closest('.wounding-row')?.querySelector('.type');
                selectedAbrev = labelSpan?.textContent?.match(/\(([^)]+)\)/)?.[1] || '';
                }

            const html = newMods.map(mod => `
                <div class="wounding-row mod-group-${mod.group || 'x'}">
                  <label class="custom-radio">
                    <input type="radio" name="wounding_mod_type" value="${mod.mult}" ${mod.abrev === selectedAbrev ? 'checked' : ''}
/>
                    <span class="type">${mod.type} (${mod.abrev})</span>
                    <span class="dots"></span>
                    <span class="mult">x${mod.mult}</span>
                  </label>
                </div>
            `).join('');

            // Adiciona também as opções padrão (sem mod e custom)
            modTable.innerHTML = html + `
                <hr>
                <div class="wounding-row">
                  <label class="custom-radio">
                    <input type="radio" name="wounding_mod_type" value="1"/>
                    <span>Sem Modificador</span>
                    <span class="dots"></span>
                    <span class="mult">x1</span>
                  </label>
                </div>
                <div class="wounding-row">
                  <label class="custom-radio">
                    <input type="radio" name="wounding_mod_type" value="custom"/>
                    <span>Outros:</span>
                    <input type="number" name="custom_wounding_mod" value="1" step="0.5" class="custom-mod-input"/>
                  </label>
                </div>
            `;
            // Reaplica os listeners dos novos inputs de modificadores
form.querySelectorAll('input[name="wounding_mod_type"]').forEach(input => {
    input.addEventListener('change', () => this._updateDamageCalculation(form));
});

// Listener para o campo customizado também
const customModInput = form.querySelector('input[name="custom_wounding_mod"]');
if (customModInput) {
    customModInput.addEventListener('input', () => this._updateDamageCalculation(form));
}
        }

        // Atualiza os cálculos com os novos modificadores
        this._updateDamageCalculation(form);
    });
});


form.querySelectorAll('input[name="custom_dr"]').forEach(input => {
    input.addEventListener('input', () => {
        const customRow = form.querySelector('.location-row[data-location-key="custom"]');
        if (customRow.classList.contains('active')) {
            // Atualiza o atributo escondido
            form.querySelector('[name="target_dr"]').value = parseInt(input.value) || 0;
            this._updateDamageCalculation(form);
        }
    });
});

        // Listener para qualquer mudança nos campos de cálculo
        form.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', () => this._updateDamageCalculation(form));
        });
        const toleranceSelect = form.querySelector('[name="tolerance_type"]');
if (toleranceSelect) {
    toleranceSelect.addEventListener('change', () => this._updateDamageCalculation(form));
    toleranceSelect.addEventListener('change', () => {
    const activeRow = form.querySelector('.location-row.active');
    const locationKey = activeRow?.dataset.locationKey || "torso";
    const newMods = this._getAdjustedWoundingModifiers(locationKey);

    // Atualiza a tabela como já fazemos
    const modTable = form.querySelector('.wounding-table');
    if (modTable) {
      const selectedRadio = form.querySelector('input[name="wounding_mod_type"]:checked');
      let selectedAbrev = '';
      if (selectedRadio) {
        const labelSpan = selectedRadio.closest('.wounding-row')?.querySelector('.type');
        selectedAbrev = labelSpan?.textContent?.match(/\(([^)]+)\)/)?.[1] || '';
      }

      const html = newMods.map(mod => `
        <div class="wounding-row mod-group-${mod.group || 'x'}">
          <label class="custom-radio">
            <input type="radio" name="wounding_mod_type" value="${mod.mult}" ${mod.abrev === selectedAbrev ? 'checked' : ''}/>
            <span class="type">${mod.type} (${mod.abrev})</span>
            <span class="dots"></span>
            <span class="mult">x${mod.mult}</span>
          </label>
        </div>
      `).join('');

      modTable.innerHTML = html + `
        <hr>
        <div class="wounding-row">
          <label class="custom-radio">
            <input type="radio" name="wounding_mod_type" value="1"/>
            <span>Sem Modificador</span>
            <span class="dots"></span>
            <span class="mult">x1</span>
          </label>
        </div>
        <div class="wounding-row">
          <label class="custom-radio">
            <input type="radio" name="wounding_mod_type" value="custom"/>
            <span>Outros:</span>
            <input type="number" name="custom_wounding_mod" value="1" step="0.5" class="custom-mod-input"/>
          </label>
        </div>
      `;

      form.querySelectorAll('input[name="wounding_mod_type"]').forEach(input => {
        input.addEventListener('change', () => this._updateDamageCalculation(form));
      });

      const customModInput = form.querySelector('input[name="custom_wounding_mod"]');
      if (customModInput) {
        customModInput.addEventListener('input', () => this._updateDamageCalculation(form));
      }

      this._updateDamageCalculation(form);
    }
});

    }

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
 * ✅ MÉTODO DE CÁLCULO CORRIGIDO PARA ATUALIZAR O NOVO LAYOUT DO RODAPÉ ✅
 */
_updateDamageCalculation(form) {
  const activeCard = form.querySelector('.damage-card.active');
  const activeDamageKey = activeCard ? activeCard.dataset.damageKey : 'main';
  const activeDamage = this.damageData[activeDamageKey] || this.damageData.main;

  const damageRolledInput = form.querySelector('[name="damage_rolled"]');
  const armorDivisorInput = form.querySelector('[name="armor_divisor"]');
  let damageRolled = parseFloat(damageRolledInput?.value);
  let armorDivisor = parseFloat(armorDivisorInput?.value);

  const halfDamageChecked = form.querySelector('[name="special_half_damage"]')?.checked;
  const explosionChecked = form.querySelector('[name="special_explosion"]')?.checked;
  const explosionDistance = parseInt(form.querySelector('[name="special_explosion_distance"]')?.value) || 0;
  const toleranceType = form.querySelector('[name="tolerance_type"]')?.value || null;

  // Corrige valores inválidos
  if (isNaN(damageRolled)) {
    damageRolled = activeDamage.total;
    if (damageRolledInput) damageRolledInput.value = damageRolled;
  }
  if (!armorDivisor || armorDivisor <= 0) {
    armorDivisor = activeDamage.armorDivisor || 1;
    if (armorDivisorInput) armorDivisorInput.value = armorDivisor;
  }

  // Aplica modificadores no Dano Básico (antes da RD)
// Inicia a lista de efeitos visuais
const effects = [];

let originalBase = damageRolled;
let modifiedBase = damageRolled;

// Aplica metade do dano (acima de 1/2D)
if (halfDamageChecked) {
  modifiedBase = Math.floor(modifiedBase / 2);
  effects.push(`🟡 Dano reduzido pela metade (1/2D): ${originalBase} ➜ ${modifiedBase}`);
  originalBase = modifiedBase;
}

// Aplica explosão antes da RD
if (explosionChecked && explosionDistance > 0) {
  const divisor = Math.max(1, 3 * explosionDistance);
  const preExplosion = modifiedBase;
  modifiedBase = Math.floor(modifiedBase / divisor);
  effects.push(`🔴 Explosão: ${preExplosion} ➜ ${modifiedBase} (÷${divisor})`);
}

// Agora damageRolled recebe o valor final modificado
damageRolled = modifiedBase;

  // Captura RD do local
  let selectedLocationDR = 0;
  const activeRow = form.querySelector('.location-row.active');
  if (activeRow) {
    if (activeRow.dataset.locationKey === 'custom') {
      const customInput = activeRow.querySelector('input[name="custom_dr"]');
      selectedLocationDR = parseInt(customInput?.value || 0);
    } else {
      selectedLocationDR = parseInt(activeRow.dataset.dr || 0);
    }
  }

  const ignoreDR = form.querySelector('[name="ignore_dr"]')?.checked;
  const isLargeArea = form.querySelector('[name="large_area_injury"]')?.checked;

  // Cálculo da RD e dano penetrante
  const effectiveDR = ignoreDR ? 0 : Math.floor(selectedLocationDR / armorDivisor);
  let penetratingDamage = Math.max(0, damageRolled - effectiveDR);


  // Modificador de Ferimento
  let selectedModRadio = form.querySelector('input[name="wounding_mod_type"]:checked');
  let woundingMod = 1;
  if (selectedModRadio) {
    if (selectedModRadio.value === 'custom') {
      woundingMod = parseFloat(form.querySelector('[name="custom_wounding_mod"]')?.value) || 1;
    } else {
      woundingMod = parseFloat(selectedModRadio.value) || 1;
    }
  }

  const damageAbrev = selectedModRadio?.closest('.wounding-row')?.querySelector('.type')?.textContent?.match(/\(([^)]+)\)/)?.[1]?.toLowerCase() || '';

  // Aplica tolerância a ferimentos
  if (toleranceType === "nao-vivo") {
    const table = { "perf": 1, "pi": 1 / 3, "pi-": 0.2, "pi+": 0.5, "pi++": 1 };
    if (table[damageAbrev] !== undefined) {
      woundingMod = table[damageAbrev];
      effects.push("⚙️ Tolerância: Não Vivo (mod. ajustado)");
    }
  }
  if (toleranceType === "homogeneo") {
    const table = { "perf": 0.5, "pi": 0.2, "pi-": 0.1, "pi+": 1 / 3, "pi++": 0.5 };
    if (table[damageAbrev] !== undefined) {
      woundingMod = table[damageAbrev];
      effects.push("⚙️ Tolerância: Homogêneo (mod. ajustado)");
    }
  }
  if (toleranceType === "difuso") {
    woundingMod = 1;
    effects.push("⚙️ Tolerância: Difuso (lesão máx. = 1)");
  }

  // Cálculo final
  let finalInjury = Math.floor(penetratingDamage * woundingMod);
  if (toleranceType === "difuso") finalInjury = Math.min(1, finalInjury);

  // Atualização visual
  const selectedLocationLabel = form.querySelector('.location-row.active .label')?.textContent || '(Selecione)';
  const drDisplay = (armorDivisor && armorDivisor !== 1)
    ? `${selectedLocationDR} ÷ ${armorDivisor} = ${effectiveDR}`
    : `${selectedLocationDR}`;
  const modName = selectedModRadio?.closest('.wounding-row')?.querySelector('.type')?.textContent?.match(/\(([^)]+)\)/)?.[1] || 'x1';

  const field = (sel) => form.querySelector(`[data-field="${sel}"]`);
  if (field("base_damage_note")) {
  if (halfDamageChecked && explosionChecked && explosionDistance > 0) {
    field("base_damage_note").textContent = `÷ 2 ÷ ${3 * explosionDistance} = ${modifiedBase}`;
  } else if (halfDamageChecked) {
    field("base_damage_note").textContent = `÷ 2 = ${modifiedBase}`;
  } else if (explosionChecked && explosionDistance > 0) {
    field("base_damage_note").textContent = `÷ ${3 * explosionDistance} = ${modifiedBase}`;
  } else {
    field("base_damage_note").textContent ='';
  }
}

  if (field("damage_rolled")) field("damage_rolled").textContent = damageRolled;
  if (field("target_dr")) field("target_dr").textContent = `${drDisplay} (${selectedLocationLabel})`;
  if (field("armor_divisor")) field("armor_divisor").textContent = armorDivisor;
  if (field("penetrating_damage")) field("penetrating_damage").textContent = penetratingDamage;
  if (field("wounding_mod")) field("wounding_mod").textContent = `x${woundingMod} (${modName})`;
  if (field("final_injury")) field("final_injury").textContent = finalInjury;

  const effectsList = form.querySelector(".effects-list");
  if (effectsList) {
    effectsList.innerHTML = "";
    for (let effect of effects) {
      effectsList.innerHTML += `<li>${effect}</li>`;
    }
  }

  this.finalInjury = finalInjury;
}




        _onLocationClick(event, form) {
        // Remove a classe 'active' de todas as outras linhas
        form.querySelectorAll('.location-row.active').forEach(r => r.classList.remove('active'));
        // Adiciona a classe 'active' na linha clicada (o CSS vai cuidar do destaque)
        event.currentTarget.classList.add('active');
        // Pega a RD do atributo data-dr que definimos no HBS
        const targetDR = event.currentTarget.dataset.dr;
        // Atualiza o valor no campo de input
        form.querySelector('[name="target_dr"]').value = targetDR;
        // Chama a função de recálculo
        this._updateDamageCalculation(form);
    }
/**
 * ✅ LÓGICA DE APLICAR O DANO OU CURA FINAL E FUNCIONAL ✅
 */
async _onApplyDamage(form, shouldClose, shouldPublish) {
    if (!form) return;

    // 1. Pega o caminho do atributo a ser danificado (ex: "system.attributes.hp.value")
    let selectedPoolPath = form.querySelector('[name="damage_target_pool"]').value;
    if (!selectedPoolPath) {
        return ui.notifications.error("Nenhum alvo para o dano foi selecionado.");
    }

    // 2. Pega o valor atual desse atributo no ator alvo
    let currentPoolValue = foundry.utils.getProperty(this.targetActor, selectedPoolPath);

    // Corrige o caminho se for um registro de combate
    if (selectedPoolPath.includes("combat_meters") && currentPoolValue === undefined) {
        // Verifica se é um antigo caminho .value (inválido), e troca para .current
        const correctedPath = selectedPoolPath.replace(".value", ".current");
        currentPoolValue = foundry.utils.getProperty(this.targetActor, correctedPath);
        selectedPoolPath = correctedPath;
    }

    // 3. Pega o valor final da lesão que já calculamos
    const finalInjury = this.finalInjury || 0;

    // ⚙️ Verifica se está em modo cura
    const applyAsHeal = form.querySelector('[name="special_apply_as_heal"]')?.checked;
    const sign = applyAsHeal ? 1 : -1;

    // 4. Aplica o efeito no valor
    const newPoolValue = currentPoolValue + (sign * finalInjury);

    // 5. Atualiza o ator
    if (selectedPoolPath.includes("combat_meters")) {
        const meterMatch = selectedPoolPath.match(/combat_meters\.([^.]+)\.current/);
        if (meterMatch) {
            const meterKey = meterMatch[1];
            await this.targetActor.update({
                [`system.combat.combat_meters.${meterKey}.current`]: newPoolValue
            });
        }
    } else {
        // Para todos os outros caminhos (PV, PF, reservas, etc)
        await this.targetActor.update({ [selectedPoolPath]: newPoolValue });
    }

    // 6. Notificação
    if (shouldPublish) {
        const poolLabel = form.querySelector('[name="damage_target_pool"] option:checked').textContent;
        const message = applyAsHeal
            ? `<strong>${this.targetActor.name}</strong> recuperou <strong>${finalInjury}</strong> em <strong>${poolLabel.trim()}</strong>!`
            : `<strong>${this.targetActor.name}</strong> sofreu <strong>${finalInjury}</strong> de lesão em <strong>${poolLabel.trim()}</strong> do ataque de <strong>${this.attackerActor.name}</strong>!`;
        ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.attackerActor }), content: message });
    } else {
        const msg = applyAsHeal
            ? `${this.targetActor.name} recuperou ${finalInjury} pontos!`
            : `${this.targetActor.name} sofreu ${finalInjury} pontos de lesão!`;
        ui.notifications.info(msg);
    }

    // 7. Fecha a janela se necessário
    if (shouldClose) {
        this.close();
    }
}


    // Sobrescreve o método de submissão do formulário para usar nossa lógica
    async _updateObject(event, formData) {
        await this._onApplyDamage(this.form);
    }

    _getAdjustedWoundingModifiers(locationKey) {
const baseMods = [
  { group: 1, type: "Corte", abrev: "cort", mult: 1.5 },
  { group: 1, type: "Perfuração", abrev: "perf", mult: 2 },
  { group: 1, type: "Contusão", abrev: "cont", mult: 1 },

  { group: 2, type: "Queimadura", abrev: "qmd", mult: 1 },
  { group: 2, type: "Corrosão", abrev: "cor", mult: 1 },
  { group: 2, type: "Toxina", abrev: "tox", mult: 1 },

  { group: 3, type: "Perfurante", abrev: "pi", mult: 1 },
  { group: 3, type: "Pouco Perfurante", abrev: "pi-", mult: 0.5 },
  { group: 3, type: "Muito Perfurante", abrev: "pi+", mult: 1.5 },
  { group: 3, type: "Ext. Perfurante", abrev: "pi++", mult: 2 },
];


  // 1. Crânio ou Olhos → tudo x4 (exceto tox)
  if (["head", "eyes"].includes(locationKey)) {
    return baseMods.map(mod => ({
      ...mod,
      mult: mod.abrev === "tox" ? 1 : 4
    }));
  }

  // 2. Rosto → corrosão = 1.5
  if (locationKey === "face") {
    return baseMods.map(mod => ({
      ...mod,
      mult: mod.abrev === "cor" ? 1.5 : mod.mult
    }));
  }

  // 3. Braço, Perna, Mão, Pé → perfurantes = x1
  if (["arm", "leg", "hand", "foot"].includes(locationKey)) {
    return baseMods.map(mod => {
      if (["perf", "pi+", "pi++"].includes(mod.abrev)) return { ...mod, mult: 1 };
      return mod;
    });
  }

  // 4. Pescoço → corrosão e contusão = 1.5, corte = 2
  if (locationKey === "neck") {
    return baseMods.map(mod => {
      if (mod.abrev === "cor" || mod.abrev === "cont") return { ...mod, mult: 1.5 };
      if (mod.abrev === "cort") return { ...mod, mult: 2 };
      return mod;
    });
  }

  // 5. Órgãos Vitais → todos perfurantes = x3
  if (locationKey === "vitals") {
    return baseMods.map(mod => {
      if (["perf", "pi", "pi-", "pi+", "pi++"].includes(mod.abrev)) return { ...mod, mult: 3 };
      return mod;
    });
  }

  // Padrão (tronco)
  return baseMods;
}
}