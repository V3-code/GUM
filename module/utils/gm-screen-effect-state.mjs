export const GM_SCREEN_EFFECT_SOURCES = Object.freeze(["GM Screen", "GUM HUD"]);

export function isGMScreenManagedEffect(effect) {
    return GM_SCREEN_EFFECT_SOURCES.includes(effect?.flags?.gum?.source);
}

/**
 * Classifica Active Effects controláveis pelo Escudo do Mestre para exibição
 * nos cards. Efeitos de combate ainda desabilitados são aplicações válidas e
 * permanecem visíveis enquanto aguardam o combate ou o próximo turno.
 */
export function getGMScreenEffectState(effect) {
    const gumFlags = effect?.flags?.gum || {};
    if (!isGMScreenManagedEffect(effect)) return { visible: false, pending: false, pendingReason: null };

    const duration = gumFlags.duration || {};
    const pendingReason = duration.pendingCombat === true
        ? "Aguardando combate"
        : (duration.pendingStart === true ? "Aguardando turno" : null);
    const pending = Boolean(effect?.disabled && pendingReason);

    return {
        visible: effect?.disabled !== true || pending,
        pending,
        pendingReason
    };
}
