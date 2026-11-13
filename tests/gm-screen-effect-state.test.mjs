import test from "node:test";
import assert from "node:assert/strict";

import { getGMScreenEffectState, isGMScreenManagedEffect } from "../module/utils/gm-screen-effect-state.mjs";

const gmEffect = ({ disabled = false, duration = {} } = {}) => ({
    disabled,
    flags: { gum: { source: "GM Screen", duration } }
});

test("efeito ativo do Escudo do Mestre aparece normalmente", () => {
    assert.deepEqual(getGMScreenEffectState(gmEffect()), {
        visible: true,
        pending: false,
        pendingReason: null
    });
});

test("efeito aplicado antes do combate aparece como pendente", () => {
    assert.deepEqual(getGMScreenEffectState(gmEffect({
        disabled: true,
        duration: { pendingCombat: true }
    })), {
        visible: true,
        pending: true,
        pendingReason: "Aguardando combate"
    });
});

test("efeito aguardando o próximo turno também aparece como pendente", () => {
    assert.deepEqual(getGMScreenEffectState(gmEffect({
        disabled: true,
        duration: { pendingStart: true }
    })), {
        visible: true,
        pending: true,
        pendingReason: "Aguardando turno"
    });
});

test("efeito apenas desabilitado não aparece como aplicado", () => {
    assert.equal(getGMScreenEffectState(gmEffect({ disabled: true })).visible, false);
});

test("efeito criado fora do Escudo do Mestre não aparece no card", () => {
    const effect = { disabled: false, flags: { gum: { source: "Ficha" } } };
    assert.equal(getGMScreenEffectState(effect).visible, false);
});

test("manobra aplicada pelo GUM HUD aparece e pode ser gerenciada pelo Escudo", () => {
    const effect = { disabled: false, flags: { gum: { source: "GUM HUD" } } };
    assert.equal(getGMScreenEffectState(effect).visible, true);
    assert.equal(isGMScreenManagedEffect(effect), true);
});
