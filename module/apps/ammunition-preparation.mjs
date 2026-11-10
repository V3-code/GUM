import {
    ammunitionAvailableUses,
    ammunitionRollModifier,
    linkedAmmunition,
    normalizeAmmunitionLoadout,
    numericRateOfFire,
    resolveRapidFireMaximum,
    validateAmmunitionLoadout
} from "../utils/ammunition.mjs";

function resolveAttackContext(actor, rollData = {}) {
    const item = rollData.itemUuid
        ? null
        : actor?.items?.get?.(rollData.itemId) || null;
    const sourceItem = item || (rollData.itemUuid ? actor?.items?.find?.(candidate => candidate.uuid === rollData.itemUuid) : null);
    const attack = sourceItem?.system?.ranged_attacks?.[rollData.attackId] || null;
    return { item: sourceItem, attack };
}

function escapeHtml(value) {
    const escape = globalThis.foundry?.utils?.escapeHTML;
    return escape ? escape(String(value ?? "")) : String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
}

function ammunitionDetail(item) {
    const ammunition = item?.system?.ammunition || {};
    const main = ammunition.main || {};
    const damage = [main.formula, main.type].filter(Boolean).join(" ");
    const modifier = ammunitionRollModifier(item);
    return [
        game.i18n.format("GUM.Equipment.Ammunition.Available", { quantity: ammunitionAvailableUses(item) }),
        game.i18n.format("GUM.Equipment.Ammunition.ModifierSummary", { modifier }),
        damage
    ].filter(Boolean).join(" · ");
}

function buildAmmunitionCards(options, selectedId) {
    const standardSelected = !selectedId ? "checked" : "";
    const cards = [`<label class="gum-ammo-choice-card ${standardSelected ? "is-selected" : ""}">
        <input type="radio" name="ammunition" value="" ${standardSelected}>
        <span class="gum-ammo-choice-icon"><i class="fas fa-crosshairs" aria-hidden="true"></i></span>
        <span class="gum-ammo-choice-copy"><strong>${escapeHtml(game.i18n.localize("GUM.Equipment.Ammunition.StandardShort"))}</strong><small>${escapeHtml(game.i18n.localize("GUM.Equipment.Ammunition.StandardHint"))}</small></span>
        <i class="fas fa-check gum-ammo-choice-check" aria-hidden="true"></i>
    </label>`];
    for (const item of options) {
        const available = ammunitionAvailableUses(item);
        const selected = item.id === selectedId;
        cards.push(`<label class="gum-ammo-choice-card ${selected ? "is-selected" : ""} ${available < 1 ? "is-disabled" : ""}">
            <input type="radio" name="ammunition" value="${escapeHtml(item.id)}" data-available="${available}" ${selected ? "checked" : ""} ${available < 1 ? "disabled" : ""}>
            <img class="gum-ammo-choice-image" src="${escapeHtml(item.img || "icons/svg/target.svg")}" alt="">
            <span class="gum-ammo-choice-copy"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(ammunitionDetail(item))}</small></span>
            <i class="fas fa-check gum-ammo-choice-check" aria-hidden="true"></i>
        </label>`);
    }
    return cards.join("");
}

async function showAmmunitionPreparationDialog(actor, item, attack, initialLoadout) {
    const options = linkedAmmunition(actor, attack);
    const optionIds = new Set(options.filter(option => ammunitionAvailableUses(option) > 0).map(option => option.id));
    const selectedId = optionIds.has(initialLoadout.ammunitionId) ? initialLoadout.ammunitionId : "";
    const cadence = numericRateOfFire(attack?.rof);
    const initial = normalizeAmmunitionLoadout({ ...initialLoadout, ammunitionId: selectedId });
    return new Promise(resolve => new Dialog({
        title: game.i18n.localize("GUM.Equipment.Ammunition.Prepare"),
        content: `<form class="gum-ammo-confirm-form gum-ammo-preparation-form">
            <div class="gum-ammo-confirm-metrics">
                <div><span>${escapeHtml(game.i18n.localize("GUM.Equipment.Ammunition.Cadence"))}</span><strong>${escapeHtml(attack.rof || "1")}</strong></div>
                <div><span>${escapeHtml(game.i18n.localize("GUM.RapidFire.Recoil"))}</span><strong>${escapeHtml(attack.rcl || "—")}</strong></div>
            </div>
            <section class="gum-ammo-confirm-card gum-ammo-choice-section">
                <span class="gum-ammo-section-label">${escapeHtml(game.i18n.localize("GUM.Equipment.Ammunition.Choose"))}</span>
                <div class="gum-ammo-choice-list">${buildAmmunitionCards(options, selectedId)}</div>
            </section>
            <section class="gum-ammo-confirm-card gum-ammo-confirm-quantity">
                <label for="gum-ammo-confirm-amount">${escapeHtml(game.i18n.localize("GUM.RapidFire.ShotsFired"))}</label>
                <div class="gum-ammo-quantity-controls"><button type="button" class="gum-ammo-quantity-step" data-step="-1" aria-label="−">−</button><input id="gum-ammo-confirm-amount" type="number" name="amount" min="1" step="1" value="${initial.shots}"><button type="button" class="gum-ammo-quantity-step" data-step="1" aria-label="+">+</button></div>
                <small class="gum-ammo-standard-note">${escapeHtml(game.i18n.localize("GUM.RapidFire.ShotsFiredHint"))}</small>
                ${cadence ? `<label class="gum-ammo-ignore-cadence"><input type="checkbox" name="ignoreCadence" ${initial.ignoreCadence ? "checked" : ""}><span><strong>${escapeHtml(game.i18n.localize("GUM.RapidFire.IgnoreCadence"))}</strong><small>${escapeHtml(game.i18n.localize("GUM.RapidFire.IgnoreCadenceHint"))}</small></span></label>` : ""}
                <label class="gum-ammo-ignore-cadence gum-ammo-lock-preparation"><input type="checkbox" name="locked" ${initial.locked ? "checked" : ""}><span><strong>${escapeHtml(game.i18n.localize("GUM.Equipment.Ammunition.LockPreparation"))}</strong><small>${escapeHtml(game.i18n.localize("GUM.Equipment.Ammunition.LockPreparationHint"))}</small></span></label>
            </section>
        </form>`,
        render: html => {
            const amountInput = html.find('[name="amount"]');
            const update = () => {
                const selected = html.find('[name="ammunition"]:checked');
                const available = selected.val() ? Number(selected.data("available")) : null;
                const maximum = resolveRapidFireMaximum({
                    cadence: cadence || 1,
                    ammunitionAvailable: available,
                    ignoreCadence: html.find('[name="ignoreCadence"]').prop("checked") === true
                });
                if (maximum === null) amountInput.removeAttr("max");
                else amountInput.attr("max", Math.max(1, maximum));
                const current = Math.max(1, Number(amountInput.val()) || 1);
                amountInput.val(maximum === null ? current : Math.min(current, Math.max(1, maximum)));
                html.find(".gum-ammo-choice-card").removeClass("is-selected");
                selected.closest(".gum-ammo-choice-card").addClass("is-selected");
            };
            html.find('[name="ammunition"], [name="ignoreCadence"]').on("change", update);
            html.find(".gum-ammo-quantity-step").on("click", event => {
                const maximum = amountInput.attr("max") ? Number(amountInput.attr("max")) : Infinity;
                const next = (Number(amountInput.val()) || 1) + Number(event.currentTarget.dataset.step);
                amountInput.val(Math.min(maximum, Math.max(1, next)));
            });
            update();
        },
        buttons: {
            fire: {
                label: game.i18n.localize("GUM.Equipment.Ammunition.Continue"),
                callback: html => resolve(normalizeAmmunitionLoadout({
                    ammunitionId: String(html.find('[name="ammunition"]:checked').val() || ""),
                    shots: Number(html.find('[name="amount"]').val()),
                    ignoreCadence: html.find('[name="ignoreCadence"]').prop("checked") === true,
                    locked: html.find('[name="locked"]').prop("checked") === true
                }))
            },
            cancel: { label: game.i18n.localize("GUM.Equipment.Attacks.Cancel"), callback: () => resolve(null) }
        },
        default: "fire",
        close: () => resolve(null)
    }, { classes: ["dialog", "gum", "gum-ammo-confirm-dialog", "gum-ammo-preparation-dialog"], width: 500, height: "auto" }).render(true));
}

async function persistLoadout(item, attackId, loadout) {
    if (!item?.update || !attackId) return;
    await item.update({ [`system.ranged_attacks.${attackId}.ammunition_loadout`]: normalizeAmmunitionLoadout(loadout) });
}

function addPreparationToRollData(rollData, loadout) {
    return {
        ...rollData,
        ammunitionPrepared: true,
        ammunitionId: loadout.ammunitionId || null,
        ammunitionPreparation: {
            ammunitionId: loadout.ammunitionId || "",
            shots: loadout.shots,
            ignoreCadence: loadout.ignoreCadence
        }
    };
}

export async function prepareAmmunitionRollData(actor, rollData = {}, { force = false } = {}) {
    const { item, attack } = resolveAttackContext(actor, rollData);
    if (rollData.type !== "attack" || !item || !attack) return rollData;
    const hasLinks = Array.isArray(attack.ammunition_ids) && attack.ammunition_ids.length > 0;
    const rapidFire = numericRateOfFire(attack.rof) > 1 && game.settings.get("gum", "showRapidFireHitCount") === true;
    if (!hasLinks && !rapidFire) return rollData;
    const stored = normalizeAmmunitionLoadout(attack.ammunition_loadout);
    const validation = validateAmmunitionLoadout(actor, attack, stored);
    if (!force && stored.locked && validation.valid) return addPreparationToRollData(rollData, stored);
    if (!force && stored.locked && !validation.valid) {
        ui.notifications.warn(game.i18n.localize("GUM.Equipment.Ammunition.LockedInvalid"));
    }
    const chosen = await showAmmunitionPreparationDialog(actor, item, attack, stored);
    if (!chosen) return null;
    const chosenValidation = validateAmmunitionLoadout(actor, attack, chosen);
    if (!chosenValidation.valid) {
        ui.notifications.warn(game.i18n.localize("GUM.Equipment.Ammunition.InvalidQuantity"));
        return null;
    }
    await persistLoadout(item, rollData.attackId, chosen);
    return addPreparationToRollData(rollData, chosen);
}

export async function configureAmmunitionLoadout(actor, { itemId, attackId } = {}) {
    const item = actor?.items?.get?.(itemId) || null;
    const attack = item?.system?.ranged_attacks?.[attackId] || null;
    if (!item || !attack) return null;
    const chosen = await showAmmunitionPreparationDialog(actor, item, attack, normalizeAmmunitionLoadout(attack.ammunition_loadout));
    if (!chosen) return null;
    const validation = validateAmmunitionLoadout(actor, attack, chosen);
    if (!validation.valid) {
        ui.notifications.warn(game.i18n.localize("GUM.Equipment.Ammunition.InvalidQuantity"));
        return null;
    }
    await persistLoadout(item, attackId, chosen);
    return chosen;
}

export async function toggleAmmunitionLoadoutLock(actor, { itemId, attackId } = {}) {
    const item = actor?.items?.get?.(itemId) || null;
    const attack = item?.system?.ranged_attacks?.[attackId] || null;
    if (!item || !attack) return null;
    const loadout = normalizeAmmunitionLoadout(attack.ammunition_loadout);
    const next = { ...loadout, locked: !loadout.locked };
    if (next.locked && !validateAmmunitionLoadout(actor, attack, next).valid) {
        ui.notifications.warn(game.i18n.localize("GUM.Equipment.Ammunition.LockedInvalid"));
        return configureAmmunitionLoadout(actor, { itemId, attackId });
    }
    await persistLoadout(item, attackId, next);
    return next;
}
