import assert from "node:assert/strict";
import test from "node:test";

const loadSubject = async () => import("../module/utils/condition-migration.mjs").catch(() => ({}));

const makeSourceItem = ({ parent = null, pack = null, deleteItem = async () => {} } = {}) => ({
    uuid: "Actor.hero.Item.source",
    type: "advantage",
    pack,
    parent,
    flags: { gum: { gcsImport: { source: { id: "source-id" } } } },
    toObject: () => ({
        _id: "source",
        name: "Agonia",
        type: "advantage",
        system: { description: "origem" },
        flags: { gum: { gcsImport: { source: { id: "source-id" } } } }
    }),
    delete: deleteItem
});

test("recria uma condição embutida no mesmo ator e expande paths de update", async () => {
    const { replaceWithConditionItem } = await loadSubject();
    assert.equal(typeof replaceWithConditionItem, "function");

    const created = [];
    const parent = {
        documentName: "Actor",
        async createEmbeddedDocuments(documentName, payloads, options) {
            created.push({ documentName, payloads, options });
            return [{ uuid: "Actor.hero.Item.replacement", type: "condition" }];
        }
    };
    const source = makeSourceItem({ parent });

    await replaceWithConditionItem(source, {
        type: "condition",
        "system.description": "migrada",
        "system.effects": [{ uuid: "Compendium.gum.efeitos.Item.effect" }]
    });

    assert.equal(created.length, 1);
    assert.equal(created[0].documentName, "Item");
    assert.deepEqual(created[0].options, { renderSheet: false });
    assert.equal(created[0].payloads[0].system.description, "migrada");
    assert.deepEqual(created[0].payloads[0].system.effects, [{ uuid: "Compendium.gum.efeitos.Item.effect" }]);
    assert.equal(created[0].payloads[0]["system.description"], undefined);
    assert.equal(created[0].payloads[0].flags.gum.conditionMigrationSourceUuid, source.uuid);
});

test("retoma uma substituição existente sem criar uma segunda condição", async () => {
    const { replaceWithConditionItem } = await loadSubject();
    assert.equal(typeof replaceWithConditionItem, "function");

    let deleted = false;
    const source = makeSourceItem({ deleteItem: async () => { deleted = true; } });
    const replacement = {
        uuid: "Item.replacement",
        type: "condition",
        flags: { gum: { conditionMigrationSourceUuid: source.uuid } }
    };
    let creates = 0;
    const ItemClass = { create: async () => { creates += 1; } };

    const result = await replaceWithConditionItem(source, { type: "condition" }, [source, replacement], { ItemClass });

    assert.equal(result, replacement);
    assert.equal(creates, 0);
    assert.equal(deleted, true);
});

test("preserva o destino de compêndio ao substituir a origem", async () => {
    const { replaceWithConditionItem } = await loadSubject();
    assert.equal(typeof replaceWithConditionItem, "function");

    const source = makeSourceItem({ pack: "gum.conditions" });
    let createOptions;
    const ItemClass = {
        async create(_data, options) {
            createOptions = options;
            return { uuid: "Compendium.gum.conditions.Item.replacement", type: "condition" };
        }
    };

    await replaceWithConditionItem(source, { type: "condition" }, [], { ItemClass });

    assert.deepEqual(createOptions, { pack: "gum.conditions", renderSheet: false });
});

test("desbloqueia um compêndio somente durante a migração e restaura o lock após falha", async () => {
    const { withUnlockedPack } = await loadSubject();
    assert.equal(typeof withUnlockedPack, "function");

    const transitions = [];
    const pack = {
        locked: true,
        async configure({ locked }) {
            transitions.push(locked);
            this.locked = locked;
        }
    };

    await assert.rejects(
        withUnlockedPack(pack, async () => {
            assert.equal(pack.locked, false);
            throw new Error("falha simulada");
        }),
        /falha simulada/
    );
    assert.deepEqual(transitions, [false, true]);
    assert.equal(pack.locked, true);
});
