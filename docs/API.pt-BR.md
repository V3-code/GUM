# API pública do GUM

A API pública permite que macros, módulos e integrações usem o GUM sem depender de detalhes internos da interface. Ela está disponível durante o hook `gum.apiReady` e, depois dele, em `game.gum.api`.

```js
Hooks.once("gum.apiReady", api => {
  console.log(`API GUM ${api.version} / sistema ${api.systemVersion}`);
});
```

## Compatibilidade

A versão da API é independente da versão do sistema. Dentro da série `1.x`, nomes e assinaturas públicas serão mantidos de forma retrocompatível. Uma futura alteração incompatível incrementará a versão principal da API.

Somente os membros abaixo de `game.gum.api` são o contrato público. Outros valores de `game.gum`, como janelas abertas e estados transitórios, são internos. Os acessos históricos (`game.gum.rollFromHotbar`, `game.gum.applySingleEffect` etc.) continuam funcionando, mas código novo deve preferir a API versionada.

## Referências de documentos

Os métodos de resolução aceitam o próprio documento, seu ID no mundo ou UUID. Itens incorporados também podem ser localizados pelo ID quando um ator é informado.

```js
const actor = await game.gum.api.actors.resolve("Actor.a1b2c3");
const item = await game.gum.api.items.resolve("itemId", { actor });
```

Falhas da API lançam `GumApiError`, com `code` estável e `details` para diagnóstico:

```js
try {
  await game.gum.api.actors.resolve("Actor.inexistente");
} catch (error) {
  if (error instanceof game.gum.api.errors.GumApiError) {
    console.error(error.code, error.details);
  }
}
```

Os códigos iniciais são `INVALID_ARGUMENT`, `INVALID_DOCUMENT`, `DOCUMENT_NOT_FOUND`, `PERMISSION_DENIED`, `CAPABILITY_UNAVAILABLE` e `FOUNDRY_UNAVAILABLE`.

## Rolagens

```js
const result = await game.gum.api.rolls.perform(actor, {
  label: "Teste de HT",
  value: actor.system.attributes.ht.final,
  type: "attribute",
  attributeKey: "ht"
});

await game.gum.api.rolls.fromHotbar({ actorUuid: actor.uuid, rollData });
await game.gum.api.rolls.executeRequest(request, targetKey, { prompt: true });
```

`rolls.perform` executa o fluxo normal do GUM, incluindo modificadores, confirmação e consumos associados. `fromHotbar` preserva o comportamento dos atalhos. `executeRequest` atende solicitações estruturadas de teste e respeita as permissões do alvo.

## Efeitos e estados de itens

```js
await game.gum.api.effects.apply(effectUuid, [token], {
  actor: sourceActor,
  origin: sourceItem
});

await game.gum.api.effects.applyUseEvent(item, actor, "activate");
await game.gum.api.effects.setGroupActive(item, "grupo-id", true);
await game.gum.api.effects.syncItem(item);
const actions = game.gum.api.effects.actions(effectItem);
```

`effects.apply` mantém a barreira de resistência configurada no efeito. `effects.applyDirect` ignora deliberadamente essa barreira e deve ser reservado a integrações que já tenham resolvido a resistência.

## Dano de combate

```js
const profile = game.gum.api.damage.resolveProfile(actor, item, attack, "ranged", {
  includeTargeted: true,
  rollData
});
const formula = game.gum.api.damage.resolveFormula(actor, item, attack, "ranged", rollData);
await game.gum.api.damage.fromHotbar({ actorUuid: actor.uuid, damageData });
```

`damage.fromHotbar` executa um atalho de dano resolvendo novamente o ator, o item e o modo de ataque. Também está disponível `damage.resolveTargetDefenseModifiers(actor, rollContext, rollData)`.

## Fontes de conteúdo

```js
const purposes = game.gum.api.content.purposes();
const sourceIds = game.gum.api.content.getSourceIds("skills");
const { entries, invalidSources } = await game.gum.api.content.getIndex("skills", {
  fields: ["system.specialization"]
});
const { documents } = await game.gum.api.content.getDocuments("effects");
```

Também existem `resolveSources`, `setSourceIds` e `restoreDefaults`. Os dois últimos alteram configurações do mundo e exigem usuário Mestre.

## Importação, status e interface

```js
await game.gum.api.imports.gcs({ actor });
await game.gum.api.imports.gumJson(); // abre o importador de ficha JSON do GUM
const statuses = game.gum.api.status.list();

game.gum.api.ui.openTestRequest();
game.gum.api.ui.openGmScreen();
game.gum.api.ui.openContentSources();       // somente Mestre
game.gum.api.ui.openStatusConfiguration(); // somente Mestre
```

`status.list()` reflete a configuração atual do mundo, não uma lista fixa do sistema.

## Hooks públicos

Os nomes também estão disponíveis em `game.gum.api.hooks`:

- `gum.apiReady`: a API foi instalada e já pode ser usada.
- `gumWorldStatusConfigurationChanged`: a configuração de status do mundo mudou; recebe `{ configuration, rows }`.

As declarações TypeScript estão em [`types/gum-api.d.ts`](../types/gum-api.d.ts).
