import assert from "node:assert/strict";
import test from "node:test";

import { hasActorOwnershipChange, shouldRefreshGMScreenForActor } from "../module/utils/gm-screen-refresh.mjs";

test("detecta concessão e remoção de propriedade do ator", () => {
    assert.equal(hasActorOwnershipChange({ ownership: { player: 3 } }), true);
    assert.equal(hasActorOwnershipChange({ "ownership.player": 3 }), true);
    assert.equal(hasActorOwnershipChange({ "ownership.-=player": null }), true);
    assert.equal(hasActorOwnershipChange({ name: "Novo nome" }), false);
});

test("atualiza o Escudo quando o último proprietário é removido", () => {
    const actorWithoutPlayerOwner = { hasPlayerOwner: false };

    assert.equal(shouldRefreshGMScreenForActor(actorWithoutPlayerOwner, {
        ownership: { default: 0 }
    }), true);
    assert.equal(shouldRefreshGMScreenForActor(actorWithoutPlayerOwner, {
        "ownership.-=player": null
    }), true);
    assert.equal(shouldRefreshGMScreenForActor(actorWithoutPlayerOwner, { name: "Sem alteração de acesso" }), false);
});

test("mantém atualizações de PJs e combatentes existentes", () => {
    assert.equal(shouldRefreshGMScreenForActor({ hasPlayerOwner: true }, { name: "PJ" }), true);
    assert.equal(shouldRefreshGMScreenForActor({ hasPlayerOwner: false }, { name: "NPC" }, { combatActive: true }), true);
});
