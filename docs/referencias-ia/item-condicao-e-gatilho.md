# Referência para IA — Itens Condição e Gatilho do GUM

[English version](./condition-and-trigger-items.md)

> Documento técnico para produzir, revisar e explicar Itens Condição e Gatilho compatíveis com o sistema GUM (Não Oficial).
>
> Mapeamento conferido no GUM `1.5.1-beta`, Foundry VTT mínimo 13 e verificado 14, em 31/10/2026.

## 1. Finalidade e modelo mental

Esta referência descreve a estrutura persistida dos dois Itens e o contrato de avaliação oferecido pelo GUM.

- Um Item **Condição** (`type: "condition"`) contém em `system.when` a expressão realmente avaliada e vincula os Itens Efeito que serão executados.
- Um Item **Gatilho** (`type: "trigger"`) é uma entrada reutilizável de biblioteca. `system.code` armazena uma expressão que a interface pode copiar para `system.when`; o Item Gatilho não escuta eventos nem executa efeitos sozinho.

Portanto, Condição e Gatilho compartilham a mesma linguagem de expressão, mas somente a Condição participa do motor de execução.

Quando Condição e Efeito precisarem viajar no mesmo JSON, consulte também o [formato de pacote autocontido](./pacote-itens-autocontido.md). Dentro de `system.effects`, use `effectRef` no lugar de UUID quando o efeito estiver no mesmo pacote.

## 2. Contrato de saída recomendado para a IA

1. Retorne JSON válido, sem comentários dentro do JSON.
2. Use `type: "condition"` para a regra executável e `type: "trigger"` para um fragmento salvo.
3. Escreva uma única expressão JavaScript em `system.when` ou `system.code`; não inclua `return`, declarações, blocos ou ponto e vírgula.
4. A expressão deve ser de somente leitura e produzir um valor booleano. Não atualize documentos, não publique mensagens e não execute macros dentro do gatilho.
5. Use optional chaining (`?.`) e valores de fallback (`??`) quando um caminho puder não existir.
6. Para eventos pontuais, teste primeiro `eventData?.type` e depois os campos específicos do evento.
7. Não invente UUIDs de Efeitos, IDs de status, Itens, ataques, recursos ou combatentes. Use o identificador fornecido pelo usuário ou deixe a referência para preenchimento/importação.
8. Dê a cada vínculo de efeito um `id` único e estável. Recomenda-se uma sequência alfanumérica de 16 caracteres.
9. Escolha explicitamente a fase de cada efeito vinculado; não dependa de `always` em conteúdo novo quando `enter`, `event`, `turnStart` ou `exit` expressar melhor a intenção.
10. Não gere `_id`, `folder`, `sort`, `ownership` ou `_stats`, salvo exigência do fluxo de importação.
11. Explique fora do JSON qualquer suposição, caminho dependente do mundo ou identificador que precise ser substituído.

## 3. Estruturas mínimas

### 3.1 Item Condição

```json
{
  "name": "Nome da condição",
  "type": "condition",
  "img": "icons/svg/aura.svg",
  "system": {
    "description": "<p>Descrição completa.</p>",
    "chat_description": "<p>Resumo.</p>",
    "ref": "",
    "bindingMode": "conditional",
    "when": "Number(actor.system.attributes.hp?.value ?? 0) <= 0",
    "triggerOnTurnStartWhileActive": false,
    "effects": []
  }
}
```

### 3.2 Item Gatilho

```json
{
  "name": "PV igual ou menor que zero",
  "type": "trigger",
  "img": "icons/svg/clockwork.svg",
  "system": {
    "description": "<p>Permanece verdadeiro enquanto os PV atuais forem zero ou menos.</p>",
    "chat_description": "",
    "ref": "",
    "code": "Number(actor.system.attributes.hp?.value ?? 0) <= 0"
  }
}
```

Campos herdados do modelo-base podem ser omitidos; o modelo do sistema fornece seus padrões.

## 4. Campos do Item Condição

| Caminho | Tipo | Padrão | Uso |
| --- | --- | --- | --- |
| `system.bindingMode` | enum | `conditional` | Use `conditional` para conteúdo novo baseado em expressão. `status-link` é um modo legado reservado à migração de vínculos de status. |
| `system.when` | string | `""` | Expressão avaliada pelo motor. Vazio equivale a verdadeiro. |
| `system.triggerOnTurnStartWhileActive` | boolean | `false` | Reexecuta fases compatíveis no início do turno do próprio ator, enquanto a condição contínua estiver ativa. |
| `system.effects` | array | `[]` | Vínculos com Itens Efeito. |
| `system.description` | HTML/string | `""` | Explicação completa da condição. |
| `system.chat_description` | HTML/string | `""` | Resumo destinado à interface e ao chat. |
| `system.ref` | string | `""` | Referência bibliográfica ou de regra. |

O campo `system.code` é o único campo mecânico específico do Item Gatilho. Descrição, resumo e referência seguem o modelo-base.

## 5. Como a expressão é avaliada

Conceitualmente, o GUM executa:

```js
Function("actor", "game", "eventData", `return (${condition.system.when})`)(actor, game, eventData)
```

Estão disponíveis:

- `actor`: o Actor que possui a Condição;
- `game`: a instância pública do jogo no Foundry;
- `eventData`: o evento estruturado atual ou `null` numa reavaliação comum.

Se a expressão lançar um erro, o resultado é tratado como falso.

### 5.1 Condição contínua

Uma expressão que não referencia `eventData` representa um estado:

```js
Number(actor.system.attributes.fp?.value ?? 0) <= 0
```

O motor registra entrada e saída. Os efeitos persistentes podem ser aplicados ao entrar e removidos quando a expressão deixa de ser verdadeira.

### 5.2 Condição dirigida por evento

Uma expressão que referencia literalmente `eventData` representa um pulso:

```js
eventData?.type === "defense_roll" && eventData?.defenseType === "dodge"
```

Cada evento compatível pode executar a fase `event`. Esse tipo não conserva um estado ligado/desligado entre eventos e não executa uma saída automática.

### 5.3 Estado consultável não é necessariamente reativo

Uma expressão pode ler informações públicas de `game`, cena ou tempo, mas ela somente percebe mudanças quando o motor reavalia a Condição. O GUM emite pulsos próprios para entrada/saída de Regiões, alteração da escuridão ambiente da Cena e mudança do tempo mundial. Outros estados de cenário continuam não reativos até possuírem um emissor específico.

## 6. Vínculos com Itens Efeito

Formato persistido:

```json
{
  "id": "effectlink000001",
  "uuid": "Compendium.world.effects.Item.REAL_ITEM_ID",
  "phase": "enter",
  "removeOnConditionEnd": true
}
```

Em pacote autocontido:

```json
{
  "id": "effectlink000001",
  "effectRef": "local-effect-key",
  "phase": "enter",
  "removeOnConditionEnd": true
}
```

| `phase` | Execução |
| --- | --- |
| `always` | Compatibilidade: executa em entrada, evento ou início de turno, conforme o modo da Condição. Não executa na saída. |
| `enter` | Quando uma condição contínua muda de falsa para verdadeira. |
| `event` | A cada evento compatível de uma condição dirigida por `eventData`. |
| `turnStart` | No início do turno do ator, se a condição contínua estiver ativa. A própria fase habilita a repetição no turno. |
| `exit` | Quando uma condição contínua muda de verdadeira para falsa. |

`removeOnConditionEnd` controla a limpeza de ações persistentes originadas pelo vínculo. Com `false`, o efeito permanece sob seu próprio ciclo de vida. Efeitos de fase `exit` não são removidos como parte da limpeza que precede sua aplicação.

## 7. Caminhos úteis do ator

### 7.1 Atributos e recursos básicos

| Caminho | Significado |
| --- | --- |
| `actor.system.attributes.<chave>.value` | Valor-base ou valor corrente, conforme o atributo. |
| `actor.system.attributes.<chave>.final` | Valor final preparado pelo sistema. |
| `actor.system.attributes.<chave>.max` | Máximo legado, quando existir. |
| `actor.system.attributes.hp.value` | PV atuais. |
| `actor.system.attributes.hp.final` | PV máximos efetivos. |
| `actor.system.attributes.fp.value` | PF atuais. |
| `actor.system.attributes.fp.final` | PF máximos efetivos. |

Chaves comuns de atributo: `st`, `dx`, `iq`, `ht`, `vont`, `per`, `hp`, `fp`, `mt`, `basic_speed`, `basic_move`, `enhanced_move`, `lifting_st`, `dodge`, `vision`, `hearing`, `tastesmell` e `touch`.

### 7.2 Coleções de recursos

| Caminho | Significado |
| --- | --- |
| `actor.system.combat.combat_meters.<id>.current` | Valor atual de um medidor de combate. |
| `actor.system.combat.combat_meters.<id>.max` | Máximo do medidor. |
| `actor.system.spell_reserves.<id>.current` | Valor atual de uma reserva de magia. |
| `actor.system.spell_reserves.<id>.max` | Máximo da reserva de magia. |
| `actor.system.power_reserves.<id>.current` | Valor atual de uma reserva de poder. |
| `actor.system.power_reserves.<id>.max` | Máximo da reserva de poder. |

Entradas antigas podem usar `value` no lugar de `current`. Quando a origem puder variar, use `entry.current ?? entry.value ?? 0`.

### 7.3 Itens, efeitos, status e flags

```js
actor.items.some(item => item.type === "advantage" && item.name === "NOME")
```

```js
Array.from(actor.effects ?? []).some(effect =>
  !effect.disabled && effect.statuses?.has?.("STATUS_ID")
)
```

```js
actor.getFlag("gum", "NOME_DA_FLAG") === true
```

Prefira IDs ou UUIDs quando a identidade exata for importante. Comparações por nome são convenientes, mas dependem do idioma e de renomeações feitas no mundo.

## 8. Envelope comum dos eventos

Os eventos novos e ampliados usam, quando pertinente:

| Campo | Uso |
| --- | --- |
| `version` | Versão do payload daquele evento. |
| `pulse` | `true` para acontecimentos pontuais. |
| `type` | Família compatível usada primeiro no filtro. |
| `eventId` | Identificador usado para impedir processamento duplicado. |

Use filtros específicos:

```js
eventData?.type === "resource_change" && eventData?.resourceKind === "spell-reserve"
```

Não use apenas `Boolean(eventData)`, pois qualquer família de evento poderia satisfazer a expressão.

## 9. Evento `resource_change`

Emitido quando mudam PV, PF, medidores de combate, reservas de magia/poder, reservas vinculadas a equipamento ou integridade de equipamento.

| Campo | Uso |
| --- | --- |
| `resource` | Chave curta do recurso. Para equipamentos, consulte também `path` e `owner`. |
| `resourceKind` | `hp`, `fp`, `combat-meter`, `spell-reserve`, `power-reserve`, `equipment-reserve` ou `equipment-integrity`. |
| `path` | Caminho canônico do recurso alterado. |
| `label` | Nome de apresentação. |
| `before`, `after` | Valores anterior e posterior. |
| `maximum` | Máximo conhecido. |
| `delta` | `after - before`. |
| `direction` | `increase` ou `decrease`. |
| `source.type` | Evento causador, como `damage`, `actor_update` ou `item_update`. |
| `source.eventId` | ID do evento causador, quando existir. |
| `owner` | Presente para recurso armazenado em Item: `type`, `id`, `uuid` e `name`. |

Aliases de PV: `appliedToHP`, `hpBefore`, `hpAfter`, `hpMaximum`.

Aliases de PF: `appliedToFP`, `fpBefore`, `fpAfter`, `fpMaximum`.

Uma única aplicação de dano aos PV pode produzir dois pulsos diferentes: `damage`, com os detalhes do ferimento, e `resource_change`, com a travessia do valor. Filtre a família desejada.

## 10. Evento `damage` — versão 2

Emitido quando uma lesão positiva é efetivamente aplicada pela janela de dano. Cura e aplicações somente de efeitos não produzem esse evento, embora alterações de PV/PF ainda possam produzir `resource_change`.

### 10.1 Campos principais

| Caminho | Uso |
| --- | --- |
| `eventData.type` | `"damage"`. |
| `eventData.reason` | `"damageApplication"`. |
| `eventData.applicationId` | Identificador da janela/aplicação. |
| `eventData.damage.injury` | Lesão final aplicada. |
| `eventData.damage.rolled` | Dano rolado. |
| `eventData.damage.modified` | Dano após modificações anteriores à penetração. |
| `eventData.damage.penetrating` | Dano penetrante após RD. |
| `eventData.damage.type` | Tipo de dano. |
| `eventData.damage.nature` | ID da natureza, quando configurada. |
| `eventData.damage.armorDivisor` | Divisor de armadura. |
| `eventData.damage.woundingModifier` | Multiplicador de ferimento. |
| `eventData.damage.component` | Componente do dano, como principal, follow-up ou fragmentação. |
| `eventData.damage.shockPenalty` | Penalidade de choque calculada para PV. |
| `eventData.targetPool.kind` | `hp`, `fp`, `combat-meter`, `spell-reserve`, `power-reserve`, `equipment-reserve`, `equipment-integrity` ou `other`. |
| `eventData.targetPool.path` | Caminho do recurso atingido. |
| `eventData.targetPool.before`, `.after` | Valores antes e depois. |
| `eventData.targetPool.applied` | Quantidade aplicada ao recurso. |
| `eventData.targetPool.maximum` | Máximo conhecido ou `null`. |
| `eventData.hitLocation.key` | ID da localização atingida. |
| `eventData.hitLocation.label` | Nome da localização. |
| `eventData.protection.rawDR` | RD antes do divisor. |
| `eventData.protection.effectiveDR` | RD efetiva. |
| `eventData.protection.ignored` | Se a RD foi ignorada. |
| `eventData.source.*` | UUIDs do ator, token, item e ID/tipo do ataque de origem. |
| `eventData.target.*` | UUIDs do ator e token alvo. |
| `eventData.combat.*` | ID, rodada e turno, quando em combate. |

Aliases curtos: `injury`, `damageType`, `poolPath`, `hitLocationKey`, `appliedToHP`, `hpBefore`, `hpAfter` e `hpMaximum`.

## 11. Evento `defense_roll`

Mantém os seletores históricos e acrescenta o resultado completo da defesa.

| Caminho | Uso |
| --- | --- |
| `eventData.type` | `"defense_roll"`. |
| `eventData.family` | `"roll"`. |
| `eventData.category` | `"defense"`. |
| `eventData.defenseType` | `dodge`, `parry` ou `block`. |
| `eventData.context` | Contexto normalizado, como `defense_parry`. |
| `eventData.inCombat` | Se havia combate ativo. |
| `eventData.outcome` | `success`, `failure`, `critical-success` ou `critical-failure`. |
| `eventData.success`, `.isSuccess` | Resultado booleano. |
| `eventData.criticalSuccess`, `.isCriticalSuccess` | Sucesso crítico. |
| `eventData.criticalFailure`, `.isCriticalFailure` | Falha crítica. |
| `eventData.total` | Total rolado. |
| `eventData.target`, `.effectiveLevel` | Número-alvo efetivo. |
| `eventData.margin` | Margem absoluta informada pelo resultado do GUM. |
| `eventData.modifier` | Modificador total. |
| `eventData.baseValue` | Valor-base antes dos modificadores. |
| `eventData.purposeIds` | Finalidades associadas ao teste. |
| `eventData.source.*` | Ator, token, Item e ataque de origem. |
| `eventData.targetActor.*` | Ator/token selecionado como contraparte, quando houver exatamente um. |
| `eventData.combat.*` | ID, rodada e turno. |

## 12. Evento `combat`

| Caminho | Uso |
| --- | --- |
| `eventData.type` | `"combat"`. |
| `eventData.phase` | `combat_start`, `round_start`, `turn_start`, `turn_end`, `round_end` ou `combat_end`. |
| `eventData.reason` | Mantém `turnStart` no início do turno; nas demais fases acompanha o nome da fase. |
| `eventData.combatId` | Alias do ID do combate. |
| `eventData.combat.id`, `.round`, `.turn`, `.started` | Estado atual do combate. |
| `eventData.combatant.*` | ID do combatente, Actor e Token relacionados à avaliação. |
| `eventData.previous.*` | Rodada, turno e combatente anteriores, quando disponíveis. |

Eventos de início/final de combate e rodada são entregues às Condições de cada combatente. `turn_start` e `turn_end` são entregues ao ator do combatente correspondente. A execução é coordenada pelo Mestre ativo primário para evitar duplicação.

## 13. Evento `active_effect_change`

Emitido quando um ActiveEffect do ator é criado, atualizado ou removido. Condições contínuas que consultam `actor.effects` são reavaliadas imediatamente.

| Caminho | Uso |
| --- | --- |
| `eventData.operation` | `create`, `update` ou `delete`. |
| `eventData.effect.id`, `.uuid`, `.name` | Identidade do ActiveEffect. |
| `eventData.effect.disabled` | Estado habilitado/desabilitado. |
| `eventData.effect.statusIds` | IDs de status presentes no efeito. |
| `eventData.effect.origin` | Origem do ActiveEffect, quando conhecida. |
| `eventData.changedFields` | Campos de primeiro nível recebidos numa atualização. |

### 13.1 Evento `region`

Emitido para o Actor do Token quando ele entra ou sai de uma Região durante movimento e quando um Token é criado já dentro de uma Região. Não exige um Comportamento GUM na Região.

| Caminho | Uso |
| --- | --- |
| `eventData.type` | `"region"`. |
| `eventData.phase` | `enter` ou `exit`. |
| `eventData.path` / `.event` | `region.enter` ou `region.exit`. |
| `eventData.regionId`, `.regionUuid`, `.regionName` | Identidade da Região. |
| `eventData.sceneId`, `.sceneUuid` | Cena que contém a Região. |
| `eventData.token.*` | Token e Actor relacionados. |
| `eventData.movement.method`, `.action` | Método e ação final do movimento. |
| `eventData.movement.origin`, `.destination` | Posição, elevação e nível antes/depois. |
| `eventData.movement.teleport`, `.forced` | Indicadores de teleporte e deslocamento forçado. |

### 13.2 Evento de escuridão da Cena

Emitido aos Actors representados por Tokens na Cena quando `environment.darknessLevel` muda.

| Caminho | Uso |
| --- | --- |
| `eventData.type` | `"scene"`. |
| `eventData.category` | `"darkness"`. |
| `eventData.path` | `scene.darkness.change`. |
| `eventData.before`, `.after`, `.delta` | Escuridão anterior, atual e diferença. |
| `eventData.direction` | `darken`, `brighten` ou `none`. |
| `eventData.sceneId`, `.sceneUuid`, `.sceneName` | Identidade da Cena. |

### 13.3 Evento `world_time`

Emitido quando o relógio mundial do Foundry muda. A avaliação alcança Actors mundiais e Actors sintéticos presentes em Cenas.

| Caminho | Uso |
| --- | --- |
| `eventData.type` | `"world_time"`. |
| `eventData.phase` | `advance`, `rewind` ou `change`. |
| `eventData.path` | `world.time.advance`, `world.time.rewind` ou `world.time.change`. |
| `eventData.worldTime`, `.previousWorldTime` | Tempo mundial atual e anterior, em segundos. |
| `eventData.delta` | Variação em segundos. |
| `eventData.components` | Componentes de calendário fornecidos pelo Foundry. |

## 14. Gatilhos úteis completos

As expressões desta seção são exemplos neutros da estrutura do sistema. Substitua apenas IDs e parâmetros indicados.

### 14.1 PV iguais ou menores que zero

```js
Number(actor.system.attributes.hp?.value ?? 0) <= 0
```

Permanece verdadeiro enquanto os PV atuais forem zero ou menos.

### 14.2 PF iguais ou menores que zero

```js
Number(actor.system.attributes.fp?.value ?? 0) <= 0
```

Permanece verdadeiro enquanto os PF atuais forem zero ou menos.

### 14.3 PV abaixo de um terço do máximo

```js
Number(actor.system.attributes.hp?.value ?? 0) < (Math.max(1, Number(actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) / 3)
```

Compara os PV atuais com um terço do máximo efetivo.

### 14.4 PF abaixo de um terço do máximo

```js
Number(actor.system.attributes.fp?.value ?? 0) < (Math.max(1, Number(actor.system.attributes.fp?.final ?? actor.system.attributes.fp?.max ?? 0)) / 3)
```

Compara os PF atuais com um terço do máximo efetivo.

### 14.5 PV iguais ou menores que −5 vezes o máximo

```js
Number(actor.system.attributes.hp?.value ?? 0) <= -5 * Math.max(1, Number(actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0))
```

Estado contínuo baseado em um múltiplo negativo dos PV máximos.

### 14.6 PF iguais ou menores que −1 vez o máximo

```js
Number(actor.system.attributes.fp?.value ?? 0) <= -1 * Math.max(1, Number(actor.system.attributes.fp?.final ?? actor.system.attributes.fp?.max ?? 0))
```

Estado contínuo baseado no negativo dos PF máximos.

### 14.7 Cruzar −1×PV numa redução

```js
eventData?.type === "resource_change" && eventData?.resource === "hp" && Number(eventData?.before) > -1 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) <= -1 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) > -5 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0))
```

Dispara apenas na travessia descendente do limiar, independentemente de a mudança vir de dano, edição, macro ou efeito.

### 14.8 Cruzar −2×PV numa redução

```js
eventData?.type === "resource_change" && eventData?.resource === "hp" && Number(eventData?.before) > -2 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) <= -2 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) > -5 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0))
```

### 14.9 Cruzar −3×PV numa redução

```js
eventData?.type === "resource_change" && eventData?.resource === "hp" && Number(eventData?.before) > -3 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) <= -3 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) > -5 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0))
```

### 14.10 Cruzar −4×PV numa redução

```js
eventData?.type === "resource_change" && eventData?.resource === "hp" && Number(eventData?.before) > -4 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) <= -4 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) > -5 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0))
```

Uma única redução pode cruzar vários limiares e produzir uma correspondência para cada expressão pertinente.

### 14.11 Uma única lesão aos PV maior que metade do máximo

```js
eventData?.type === "damage" && eventData?.appliedToHP === true && Number(eventData?.injury ?? 0) > (Number(eventData?.hpMaximum ?? Math.max(1, Number(actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0))) / 2)
```

Usa a lesão da aplicação atual; não equivale a simplesmente estar com menos da metade dos PV.

### 14.12 Uma rolagem de Esquiva em combate

```js
eventData?.inCombat && eventData?.type === "defense_roll" && eventData?.defenseType === "dodge"
```

### 14.13 Uma rolagem de Aparar em combate

```js
eventData?.inCombat && eventData?.type === "defense_roll" && eventData?.defenseType === "parry"
```

### 14.14 Uma rolagem de Bloqueio em combate

```js
eventData?.inCombat && eventData?.type === "defense_roll" && eventData?.defenseType === "block"
```

Essas três expressões representam a ocorrência da rolagem, não necessariamente seu sucesso. Acrescente `&& eventData?.success === true` quando o resultado também importar.

### 14.15 Entrar numa Região específica

```js
eventData?.type === "region" && eventData?.phase === "enter" && eventData?.regionUuid === "Scene.CENA.Region.REGIAO"
```

### 14.16 Escuridão da Cena atingiu pelo menos 70%

```js
eventData?.type === "scene" && eventData?.category === "darkness" && Number(eventData?.after ?? 0) >= 0.7
```

### 14.17 O tempo mundial avançou pelo menos uma hora

```js
eventData?.type === "world_time" && eventData?.phase === "advance" && Number(eventData?.delta ?? 0) >= 3600
```

## 15. Estruturas adicionais com os eventos atuais

### Falha crítica numa defesa

```js
eventData?.type === "defense_roll" && eventData?.criticalFailure === true
```

### Início do próprio turno

```js
eventData?.type === "combat" && eventData?.phase === "turn_start"
```

### Início de uma rodada

```js
eventData?.type === "combat" && eventData?.phase === "round_start"
```

### Entrada de um status específico

```js
eventData?.type === "active_effect_change" && eventData?.operation === "create" && eventData?.effect?.statusIds?.includes("STATUS_ID")
```

### Uma reserva de magia diminuiu

```js
eventData?.type === "resource_change" && eventData?.resourceKind === "spell-reserve" && eventData?.direction === "decrease"
```

### Integridade de um equipamento chegou a zero

```js
eventData?.type === "resource_change" && eventData?.resourceKind === "equipment-integrity" && Number(eventData?.before) > 0 && Number(eventData?.after) <= 0
```

## 16. Exemplo completo de Condição contínua

```json
{
  "name": "Exemplo de limiar de recurso",
  "type": "condition",
  "img": "icons/svg/down.svg",
  "system": {
    "description": "<p>Ativa enquanto o recurso estiver abaixo do limiar.</p>",
    "chat_description": "",
    "ref": "",
    "bindingMode": "conditional",
    "when": "Number(actor.system.attributes.fp?.value ?? 0) < (Math.max(1, Number(actor.system.attributes.fp?.final ?? actor.system.attributes.fp?.max ?? 0)) / 3)",
    "triggerOnTurnStartWhileActive": false,
    "effects": [
      {
        "id": "effectlink000001",
        "uuid": "Compendium.world.effects.Item.REAL_ITEM_ID",
        "phase": "enter",
        "removeOnConditionEnd": true
      }
    ]
  }
}
```

## 17. Exemplo completo de Condição dirigida por evento

```json
{
  "name": "Exemplo de evento de defesa",
  "type": "condition",
  "img": "icons/svg/shield.svg",
  "system": {
    "description": "<p>Reage a uma falha crítica numa defesa.</p>",
    "chat_description": "",
    "ref": "",
    "bindingMode": "conditional",
    "when": "eventData?.type === \"defense_roll\" && eventData?.criticalFailure === true",
    "triggerOnTurnStartWhileActive": false,
    "effects": [
      {
        "id": "effectlink000002",
        "uuid": "Compendium.world.effects.Item.REAL_ITEM_ID",
        "phase": "event",
        "removeOnConditionEnd": false
      }
    ]
  }
}
```

## 18. Limitações e segurança

- `system.when` é JavaScript avaliado no cliente. Considere conteúdo importado como código e revise-o antes de usar.
- O gatilho deve apenas decidir verdadeiro/falso. Toda mutação deve ficar nos Itens Efeito e mecanismos próprios do sistema.
- Objetos do Foundry podem mudar entre versões. Prefira os caminhos e payloads normalizados documentados aqui.
- Eventos globais são deduplicados e, no combate, coordenados pelo Mestre ativo primário; não tente implementar autoridade dentro da expressão.
- Uma Condição incorporada num Actor mundial afeta esse Actor. Não use estado local de interface, seleção do usuário ou `canvas` como base de uma regra persistente.
- Movimento, Regiões, cena e tempo ainda não possuem contrato reativo neste documento.

## 19. Checklist para a IA

- [ ] O tipo do Item é `condition` ou `trigger` conforme a finalidade.
- [ ] A expressão é única, booleana, de somente leitura e não contém `return`.
- [ ] Todo gatilho pontual filtra `eventData.type`.
- [ ] Caminhos opcionais usam `?.` e `??`.
- [ ] Condição contínua usa `enter`, `turnStart` ou `exit` conscientemente.
- [ ] Condição dirigida por evento usa `phase: "event"`.
- [ ] `removeOnConditionEnd` corresponde ao ciclo de vida desejado.
- [ ] UUIDs e IDs foram fornecidos, deixados como placeholders explícitos ou convertidos em referências locais de pacote.
- [ ] A descrição explica o significado sem esconder suposições mecânicas.

## 20. Fontes técnicas do sistema

- `template.json`: modelos de Item Condição e Gatilho.
- `scripts/main.js`: emissão e processamento dos eventos.
- `module/utils/condition-event-data.mjs`: eventos de defesa, combate e ActiveEffect.
- `module/utils/actor-resource-change.mjs`: mudanças de recursos do ator.
- `module/utils/item-resource-change.mjs`: recursos e integridade pertencentes a equipamento.
- `module/utils/damage-application-event.mjs`: payload estruturado de dano.
- `module/utils/condition-effect-link.mjs`: fases e normalização dos vínculos.
