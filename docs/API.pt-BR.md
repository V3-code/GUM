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
- `gum.rollCompleted`: uma rolagem do GUM foi concluída, incluindo seu resultado final.
- `gum.damageRolled`: um pacote de dano foi rolado e está disponível para aplicação.
- `gum.damageApplied`: dano foi efetivamente aplicado a um ator ou recurso.
- `gum.effectApplied`: um Item Efeito terminou de processar suas ações nos alvos.
- `gum.effectRemoved`: um Active Effect gerenciado pelo GUM foi removido.
- `gum.effectStateChanged`: um Active Effect foi ativado ou desativado.
- `gum.conditionStateChanged`: uma Condição contínua mudou entre ativa e inativa.
- `gum.stateEffectGroupChanged`: um grupo manual de Efeitos de Estado foi ativado ou desativado e sincronizado.
- `gum.itemUseCompleted`: o uso de um item foi concluído; é disparado após rolagens originadas em item (`activate`) e após consumo de recurso (`consume`), mesmo sem efeitos de Evento de Uso configurados.

Os hooks de ciclo de vida são informativos e não cancelam a operação. Todos recebem um único contexto de versão `1`:

```js
Hooks.on(game.gum.api.hooks.ROLL_COMPLETED, context => {
  if (context.action.type !== "attack") return;
  console.log(context.actor, context.sourceToken, context.targets, context.result);
});
```

O envelope comum contém `{ version, eventId, userId, timestamp, actor, sourceToken, item, action, targets, result, metadata }`. A propriedade `action` contém `{ type, id, attackType, label, data }`. Documentos do Foundry são passados por referência, sem clonagem ou transmissão de rede pelo hook. `eventId` identifica uma ocorrência, enquanto `userId` identifica o usuário que a originou.

Resultados específicos:

- `rollCompleted`: `result` é o resultado estruturado da rolagem, com `isSuccess`, `margin`, `outcome` e demais valores calculados.
- `damageRolled`: `result` contém `{ damage, rolls, message }`.
- `damageApplied`: `result` contém `{ event, targetActor, injury }`; `event` é o pulso serializável de aplicação de dano.
- `effectApplied`: `result` contém os IDs e a quantidade de ações processadas, além de `{ persistent, activeEffects, activeEffectUuids }`. `metadata` identifica `source`, `sourceUuid`, `mode`, `originUuid`, `applicationId` e `eventData`, permitindo distinguir ficha, Região, Escudo do Mestre e outras integrações.
- `effectRemoved`: `result` contém `{ active: false, transition: "removed", activeEffect, targetActor }`.
- `effectStateChanged`: `result` contém `{ active, transition, activeEffect, targetActor }`; `transition` é `enabled` ou `disabled`, e `metadata.previousActive` informa o estado anterior.

Quando um Item Efeito gera vários ActiveEffects persistentes, somente um recebe `flags.gum.lifecycleCarrier: true`. Flags de integrações externas configuradas na ponte ActiveEffect nativa do Item Efeito são copiadas para esse portador. Isso oferece um único ciclo visual para módulos como o Automated Animations: criação/ativação inicia o efeito persistente; desativação/remoção encerra-o. Os demais ActiveEffects mecânicos recebem `lifecycleCarrier: false`, evitando animações duplicadas.
- `conditionStateChanged`: `result` contém `{ active }`; `metadata.previousActive` e `metadata.reason` descrevem a transição.
- `stateEffectGroupChanged`: `result` contém `{ active, synchronized, report }`. Este hook cobre mudanças explícitas de grupos manuais via API ou ficha.
- `itemUseCompleted`: `result` contém `{ trigger, effectCount, appliedEffectUuids, pendingResistanceCount }`; `metadata` inclui o resultado da rolagem quando houver um.

Listeners externos devem tratar esses objetos como somente leitura. Exceções lançadas por listeners são isoladas para não interromper as regras do GUM.

As declarações TypeScript estão em [`types/gum-api.d.ts`](../types/gum-api.d.ts).
