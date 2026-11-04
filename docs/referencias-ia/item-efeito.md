# Referência para IA — Item Efeito do GUM

[English version](./effect-item.md)

> Documento técnico para produzir dados de um Item Efeito compatível com o sistema GUM (Não Oficial).
>
> Mapeamento conferido no GUM `1.4.3-beta`, Foundry VTT mínimo 12 e verificado 14, em 14/10/2026.

## 1. Finalidade deste documento

Use esta referência quando uma IA precisar criar, revisar ou explicar um Item Efeito. O resultado recomendado é um objeto JSON de Item do Foundry com `type: "effect"` e uma lista canônica em `system.actions`.

Quando o efeito precisar viajar no mesmo JSON que um equipamento ou modificador que o utiliza, consulte também o [formato de pacote autocontido](./pacote-itens-autocontido.md). Nesse formato, os vínculos usam chaves locais e o importador gera os UUIDs reais.

Este documento descreve o formato persistido atual (`schemaVersion: 2`). Campos de ação antigos ainda existem na raiz de `system` por compatibilidade, mas não devem ser usados como fonte principal em conteúdo novo.

## 2. Contrato de saída recomendado para a IA

Quando for solicitada a criação de um efeito:

1. Retorne JSON válido, sem comentários dentro do JSON.
2. Use sempre `type: "effect"`.
3. Use `system.schemaVersion: 2`.
4. Registre todas as ações em `system.actions`, mesmo quando houver apenas uma.
5. Dê a cada ação um `id` não vazio e único dentro do item. Recomenda-se uma sequência alfanumérica de 16 caracteres.
6. Inclua somente campos pertinentes ao tipo da ação, além de `id`, `label` e `type`.
7. Não invente IDs de status, IDs/UUIDs de perícias, equipamentos, ataques ou macros. Quando o usuário não os fornecer, deixe o campo vazio ou peça o identificador.
8. Não gere `_id`, `folder`, `sort`, `ownership` ou `_stats`, exceto se o fluxo de importação exigir esses metadados do Foundry.
9. Preserve números e fórmulas como texto nos campos de expressão. Exemplo: `"-2"`, `"1d6"`, `"se(possui(\"Item\"), 2, 0)"`.
10. Explique separadamente qualquer suposição que não esteja codificada no JSON.

## 3. Estrutura mínima do item

```json
{
  "name": "Nome do efeito",
  "type": "effect",
  "img": "icons/svg/aura.svg",
  "system": {
    "description": "<p>Descrição completa.</p>",
    "chat_description": "<p>Resumo para o chat.</p>",
    "ref": "",
    "schemaVersion": 2,
    "conditionStackingMode": "stack",
    "tokenIconPolicy": "auto",
    "duration": {
      "value": 1,
      "unit": "rounds",
      "inCombat": true,
      "isPermanent": false,
      "startMode": "apply",
      "endMode": "turnEnd"
    },
    "resistanceRoll": {
      "isResisted": false,
      "attribute": "ht",
      "modifier": "0",
      "applyOn": "failure",
      "margin": "",
      "mode": "simple",
      "branches": [],
      "chatText": "",
      "skipPromptCard": false,
      "chatVisibility": "owners",
      "requestedPurposeIds": []
    },
    "actions": []
  }
}
```

Os campos herdados do modelo-base (`activationEffects`, `onDamageEffects`, `generalConditions`, `passiveEffects`, `useEventEffects` e `stateEffectGroups`) não são configurações internas do Item Efeito. Podem ser omitidos ao gerar um efeito; o modelo do sistema fornece seus padrões.

## 4. Campos gerais

| Caminho | Tipo | Padrão | Uso |
| --- | --- | --- | --- |
| `name` | string | — | Nome visível do Item Efeito. |
| `type` | string | `effect` | Tipo obrigatório do documento. |
| `img` | string | ícone do Foundry | Imagem usada no item, efeito ativo e possivelmente no token. |
| `system.description` | HTML/string | `""` | Descrição completa. |
| `system.chat_description` | HTML/string | `""` | Resumo exibido em cartões/mensagens. |
| `system.ref` | string | `""` | Referência bibliográfica ou de regra. |
| `system.schemaVersion` | number | `2` | Versão da estrutura de ações. |
| `system.actions` | array | `[]` | Ações executadas pelo efeito. |
| `system.conditionStackingMode` | enum | `stack` | Regra de acúmulo das aplicações do efeito. O nome do campo é mantido por compatibilidade. |
| `system.tokenIconPolicy` | enum | `auto` | Política de ícone no token. |
| `system.duration` | object | — | Duração das ações persistentes. |
| `system.resistanceRoll` | object | — | Barreira opcional antes da aplicação. |

### `conditionStackingMode`

| Valor | Significado |
| --- | --- |
| `stack` | Acumula normalmente. |
| `unique` | Mantém somente uma cópia de cada ação persistente do mesmo Item Efeito no mesmo domínio de aplicação. A cópia e a duração atuais são preservadas. |
| `refresh` | Mantém somente uma cópia, mas recalcula as ações persistentes e reinicia a duração a cada nova aplicação. |

As ações pontuais (`resource_change`, `resource_create`, `damage_roll`, `macro` e `chat`) sempre são executadas. Aplicações diretas e aplicações por Condição são domínios separados e não removem nem reaproveitam cópias umas das outras. Dentro do domínio de Condição, `unique` e `refresh` conservam a lista de condições proprietárias até a última delas ser desligada.

Efeitos administrados pelo sistema — passivos de Item, concessões de equipamento, grupos de estado e automações de status — mantêm o ciclo de vida de seus próprios mecanismos e não participam da deduplicação genérica.

### `tokenIconPolicy`

| Valor | Significado |
| --- | --- |
| `auto` | Efeito temporário mostra ícone; efeito permanente o oculta. |
| `always` | Sempre mostra no token. |
| `never` | Nunca mostra no token. |

## 5. Ações: visão geral

Cada elemento de `system.actions` possui esta base:

```json
{
  "id": "a1B2c3D4e5F6g7H8",
  "label": "Nome desta ação",
  "type": "attribute"
}
```

`label` identifica a ação na ficha, nos detalhes do efeito e na seleção de ações da barreira condicional. Não precisa repetir o nome do item.

Tipos aceitos:

| `type` | Nome funcional | Natureza |
| --- | --- | --- |
| `attribute` | Modificador de atributo/caminho | Persistente |
| `status` | Status do Foundry/GUM | Persistente |
| `resource_change` | Alteração de recurso existente | Instantânea |
| `resource_create` | Criação/atualização de recurso | Instantânea |
| `damage_roll` | Rolagem de dano em card | Instantânea |
| `roll_modifier` | Modificador genérico de rolagem | Persistente |
| `skill_modifier` | Modificador de perícias | Persistente |
| `combat_modifier` | Modificador de modo de combate | Persistente |
| `chat` | Mensagem, opcionalmente com teste | Instantânea |
| `macro` | Execução de macro por nome | Instantânea |
| `flag` | Flag mecânica `flags.gum` | Persistente |

A duração aplica-se às ações persistentes. As ações instantâneas são executadas quando o efeito é aplicado e não ficam repetindo enquanto durar o ActiveEffect.

### Ação instantânea `damage_roll`

Cria um card de dano para cada alvo que receber o efeito. O card conserva o UUID do alvo e oferece a aplicação manual normal do dano; a ação não reduz PV automaticamente. Dano de acompanhamento e fragmentação são opcionais.

```json
{
  "id": "damage0000000001",
  "label": "Armadilha de espinhos",
  "type": "damage_roll",
  "damage_formula": "2d6+1",
  "damage_type": "perf",
  "damage_nature": "",
  "damage_armor_divisor": 1,
  "damage_follow_up_formula": "1d6",
  "damage_follow_up_type": "tox",
  "damage_follow_up_nature": "",
  "damage_follow_up_armor_divisor": 1,
  "damage_fragmentation_formula": "",
  "damage_fragmentation_type": "",
  "damage_fragmentation_nature": "",
  "damage_fragmentation_armor_divisor": 1,
  "damage_show_prompt": false,
  "roll_visibility": "owners"
}
```

`damage_formula` é obrigatória. As fórmulas aceitam os mesmos dados usados pelo dano comum, inclusive `GdP`/`GdB` e expressões condicionais do efeito. Um componente secundário só é rolado quando sua fórmula estiver preenchida. `damage_show_prompt: true` abre a janela de ajustes antes da rolagem. `roll_visibility` aceita `public`, `owners`, `target` ou `gm`.

## 6. Múltiplas seleções e coleções

O sistema usa três formatos diferentes. Não os misture.

### Arrays reais

- `system.actions`: várias ações no mesmo Item Efeito.
- `roll_modifier_entries`: várias entradas dentro de uma ação `roll_modifier`.
- `combat_damage_changes`: várias alterações de dano dentro de uma ação `combat_modifier`.
- `requestedPurposeIds`: várias finalidades de teste.
- `resistanceRoll.branches`: vários resultados condicionais.
- `branches[].actionIds`: vários IDs de ações disparadas por um resultado.

### Strings CSV

Os campos abaixo são strings com valores separados por vírgula. Espaços são permitidos e duplicatas são normalizadas:

- `roll_modifier_entries[].contexts`
- `roll_modifier_entries[].roll_tags`
- `roll_modifier_entries[].target_values`
- `roll_modifier_entries[].source_item_ids`
- `roll_modifier_entries[].source_attack_ids`
- `skill_targets`
- `combat_source_item_ids`
- `combat_source_attack_ids`

Exemplo:

```json
{
  "contexts": "attack_melee, defense_parry",
  "roll_tags": "source.magic, resistance.magic",
  "target_values": "Espadas, Machado de Duas Mãos"
}
```

### Seleção única

`statusId`, `category`, `skill_attribute`, `application_side`, `operation`, `value_mode` e os demais campos enumerados aceitam um único valor.

## 7. Ação `attribute`

Modifica um caminho numérico ou uma fórmula suportada no ator.

```json
{
  "id": "attr000000000001",
  "label": "Penalidade de DX",
  "type": "attribute",
  "path": "system.attributes.dx.temp",
  "operation": "ADD",
  "value": "-2",
  "value_mode": "fixed",
  "attribute_chat_visibility": "public"
}
```

| Campo | Valores/forma | Uso |
| --- | --- | --- |
| `path` | string | Caminho de dados alterado. Obrigatório. |
| `operation` | `ADD`, `OVERRIDE` | Soma/subtrai ou substitui o valor. |
| `value` | número ou expressão em string | Valor avaliado quando o efeito é aplicado. |
| `value_mode` | `fixed`, `per_origin_level` | Valor fixo ou multiplicado pelo nível do item de origem. |
| `attribute_chat_visibility` | `public`, `owners`, `gm`, `none` | Quem vê o valor aplicado no chat. |

Visibilidade:

- `public`: todos.
- `owners`: donos do ator e Mestre.
- `gm`: somente Mestres, em modo cego.
- `none`: não publica o valor.

### Caminhos de atributo suportados pela interface

Para cada chave abaixo existem três camadas:

- `system.attributes.<chave>.passive` com `ADD`: bônus passivo.
- `system.attributes.<chave>.temp` com `ADD`: bônus temporário.
- `system.attributes.<chave>.override` com `OVERRIDE`: definição/substituição.

Chaves disponíveis:

- Primários: `st`, `dx`, `iq`, `ht`.
- Secundários: `vont`, `per`, `hp`, `fp`, `mt`.
- Movimento/defesa: `basic_speed`, `basic_move`, `enhanced_move`, `lifting_st`, `dodge`.
- Sentidos: `vision`, `hearing`, `tastesmell`, `touch`.
- Dano básico: `thrust_damage`, `swing_damage`, `thrust_damage_alt`, `swing_damage_alt`.

Nos caminhos de dano básico, `OVERRIDE` preserva a fórmula para a futura rolagem de dano em vez de rolar dados na aplicação.

### Resistência a Dano por localização

Formato:

```text
system.combat.dr_<camada>.<localização>.<natureza>
```

Camadas:

- `passive_mods`: `ADD` em efeito permanente.
- `temp_mods`: `ADD` em efeito temporário de combate.
- `overrides`: `OVERRIDE`.

Naturezas aceitas pelo seletor: `base`, `cont`, `cort`, `perf`, `pi`, `pi-`, `pi+`, `pi++`, `qmd`, `cor`, `tox`.

As localizações dependem do perfil corporal configurado. `all` representa todas; para uma localização específica, use o ID real fornecido pelo mundo/sistema.

## 8. Ação `status`

Aplica um status configurado no mundo.

```json
{
  "id": "status0000000001",
  "label": "Atordoado",
  "type": "status",
  "statusId": "stunned"
}
```

`statusId` deve ser o ID técnico presente em `CONFIG.statusEffects`, não apenas o nome visível. O catálogo é dinâmico e pode ser personalizado pelo mundo; portanto, uma IA não deve presumir que um nome traduzido seja um ID válido. Referência ausente não é aplicada e gera aviso.

## 9. Ação `resource_change`

Altera um recurso já existente. O valor é somado ao valor atual; use negativo para gasto/dano e positivo para recuperação.

```json
{
  "id": "resourcechange01",
  "label": "Perda de fadiga",
  "type": "resource_change",
  "category": "fp",
  "name": "",
  "value": "-2",
  "chat_notice": true,
  "confirm_prompt": false,
  "variable_value": false
}
```

| `category` | Alvo | Uso de `name` |
| --- | --- | --- |
| `hp` | PV do ator | Ignorado. |
| `fp` | PF do ator | Ignorado. |
| `energy_reserve` | Reserva de magia/poder | Nome exato da reserva. |
| `combat_tracker` | Registro/medidor de combate | Nome exato do medidor. |
| `item_quantity` | Quantidade de equipamento | Nome exato do item. |

Outros campos:

- `chat_notice`: publica a alteração no chat.
- `confirm_prompt`: pede confirmação antes de executar.
- `variable_value`: abre uma entrada para o usuário substituir o valor no momento da aplicação.

O valor aceita expressões. Fórmulas comuns são avaliadas uma vez e compartilhadas pelos alvos; expressões condicionais dependentes do ator são avaliadas separadamente para cada alvo.

## 10. Ação `resource_create`

Cria ou atualiza uma reserva/medidor nomeado.

```json
{
  "id": "resourcecreate01",
  "label": "Criar reserva",
  "type": "resource_create",
  "category": "spell_reserve",
  "name": "Mana Temporária",
  "value": "5",
  "max": "5",
  "source": "Efeito mágico",
  "exists_policy": "ignore",
  "chat_notice": true
}
```

Categorias:

- `spell_reserve`: reserva de magia.
- `power_reserve`: reserva de poder.
- `combat_tracker`: registro/medidor de combate.

`name` é obrigatório. `value` é o valor inicial, `max` é o máximo e `source` identifica a origem nas reservas de magia/poder.

Políticas quando já existe um recurso com o mesmo nome:

| Valor | Comportamento |
| --- | --- |
| `ignore` | Mantém o recurso existente. |
| `update_max` | Substitui apenas o máximo. |
| `sum_max` | Soma `max` ao máximo atual. |
| `replace` | Substitui os dados pelo novo recurso. |
| `restore` | Restaura o valor atual ao máximo existente. |

## 11. Ação `roll_modifier`

É o modo mais flexível para modificar rolagens. Uma ação contém uma ou mais entradas em `roll_modifier_entries`.

```json
{
  "id": "rollmodifier0001",
  "label": "Modificadores circunstanciais",
  "type": "roll_modifier",
  "roll_modifier_entries": [
    {
      "label": "Penalidade em ataques corpo a corpo",
      "value": "-2",
      "value_mode": "fixed",
      "cap": "",
      "contexts": "attack_melee",
      "application_side": "self",
      "target_kind": "any",
      "target_mode": "all",
      "target_values": "",
      "source_item_ids": "",
      "source_attack_ids": "",
      "roll_tags": "",
      "roll_tag_match": "any",
      "nh_display_mode": "roll_only"
    }
  ]
}
```

### Campos da entrada

| Campo | Forma/padrão | Uso |
| --- | --- | --- |
| `label` | string | Texto do modificador na janela de rolagem. |
| `value` | número/fórmula/expressão | Avaliado em cada rolagem compatível. |
| `value_mode` | `fixed`, `per_origin_level` | Escalonamento pela origem. |
| `cap` | string vazia ou número | Limite de NH/valor quando aplicável. |
| `contexts` | CSV, padrão `all` | Contextos de rolagem aceitos. |
| `application_side` | `self`, `vs_targeter` | Aplica ao portador ou a quem o seleciona como alvo. |
| `target_kind` | string, padrão `any` | Campo interno/compatível; mantenha `any` salvo regra específica conhecida. |
| `target_mode` | string, padrão `all` | Campo interno/compatível; mantenha `all` salvo regra específica conhecida. |
| `target_values` | CSV | Nomes/IDs/UUIDs de perícias/alvos específicos, conforme o contexto. |
| `source_item_ids` | CSV | IDs/UUIDs de itens de origem permitidos. |
| `source_attack_ids` | CSV | IDs de modos de ataque permitidos. |
| `roll_tags` | CSV | Tags semânticas que filtram a finalidade da rolagem. |
| `roll_tag_match` | `any`, `all` | Exige ao menos uma tag ou todas. |
| `nh_display_mode` | `roll_only`, `include_in_nh` | Exibe apenas na rolagem ou incorpora ao NH preparado. |

Se `roll_tags` não estiver vazio, o sistema força `nh_display_mode: "roll_only"`. Modificadores direcionados (`vs_targeter`) ou com fórmula de dados também devem permanecer apenas na rolagem.

### Contextos aceitos

`all`, `attack`, `attack_melee`, `attack_ranged`, `defense`, `defense_dodge`, `defense_parry`, `defense_block`, `skill`, `spell`, `power`, `sense_vision`, `sense_hearing`, `sense_tastesmell`, `sense_touch`, `check_st`, `skill_st`, `check_dx`, `skill_dx`, `check_iq`, `skill_iq`, `check_ht`, `skill_ht`, `check_per`, `skill_per`, `check_vont`, `skill_vont`.

Use CSV para aceitar mais de um. `all` sozinho significa qualquer contexto.

### Tags aceitas

O catálogo atual contém:

- Gerais: `test.resistance`, `test.survival`, `test.sense`.
- Ferimentos/sobrevivência: `injury.knockdown_stun`, `injury.knockdown`, `injury.stun.physical`, `recovery.stun.physical`, `injury.stay_conscious`, `recovery.consciousness`, `injury.avoid_death`, `injury.bleeding`, `recovery.natural`, `recovery.crippling`, `resistance.pain`, `resistance.torture`.
- Resistências físicas: `resistance.physical`, `resistance.metabolic`, `resistance.poison`, `resistance.disease`, `resistance.infection`, `resistance.addiction`, `resistance.alcohol`, `resistance.paralysis`, `resistance.incapacitation`, `resistance.unconsciousness`, `resistance.nausea`, `resistance.seizure`.
- Mentais: `resistance.mental`, `resistance.fear`, `mental.fright_check`, `resistance.intimidation`, `mental.stun.avoid`, `mental.stun.recover`, `mental.self_control`, `resistance.mental_influence`, `resistance.possession`, `mental.concentration`, `resistance.confusion`, `mental.memory`, `mental.memory.memorize`, `mental.memory.recall`, `mental.task.prolonged`, `mental.creativity`.
- Movimento: `movement.balance`, `movement.avoid_fall`, `movement.controlled_fall`, `movement.takedown`, `movement.knockback_fall`, `movement.mounted`, `movement.break_free`.
- Ambiente: `resistance.environmental`, `environment.suffocation`, `environment.exertion`, `environment.heat`, `environment.cold`, `environment.altitude`, `environment.pressure`, `environment.vacuum`, `environment.radiation`, `environment.acceleration`, `environment.sleep_deprivation`, `environment.sleep_rest`, `environment.aging`.
- Sentidos: `sense.general`, `sense.vision`, `sense.hearing`, `sense.smell_taste`, `sense.smell`, `sense.taste`, `sense.touch`, `sense.detection`.
- Sobrenatural/fontes: `resistance.supernatural`, `resistance.magic`, `resistance.psionic`, `resistance.telepathy`, `resistance.power`, `source.supernatural`, `source.magic`, `source.psionic`, `source.telepathic`, `source.power`.
- Social: `social.reaction`, `social.influence`, `social.resist_deception`, `social.resist_interrogation`, `communication.be_heard`, `social.appear_honest`, `social.fashion`, `social.healthy_appearance`.
- Vetores: `vector.sensory`, `vector.sensory.vision`, `vector.sensory.hearing`, `vector.sensory.smell_taste`, `vector.sensory.smell`, `vector.sensory.taste`, `vector.sensory.touch`, `vector.inhaled`.
- Circunstâncias: `risk.unnecessary`.

Algumas tags possuem hierarquia: uma rolagem com tag específica também pode satisfazer filtros de seus ancestrais. Prefira a tag mais específica que descreva o caso.

## 12. Ação `skill_modifier`

Atalho estruturado para perícias.

```json
{
  "id": "skillmodifier001",
  "label": "Treinamento especializado",
  "type": "skill_modifier",
  "skill_scope": "specific",
  "skill_targets": "Espadas, Sabre",
  "skill_attribute": "dx",
  "modifier_value": "1",
  "modifier_value_mode": "fixed",
  "modifier_cap": "",
  "modifier_application_side": "self",
  "modifier_nh_display_mode": "include_in_nh"
}
```

| Campo | Valores | Uso |
| --- | --- | --- |
| `skill_scope` | `all`, `specific`, `attribute` | Todas, lista específica ou perícias baseadas em um atributo. |
| `skill_targets` | CSV | Usado somente com `specific`; aceita referências reconhecidas por nome, nome com especialização, ID ou UUID. |
| `skill_attribute` | `st`, `dx`, `iq`, `ht`, `per`, `vont` | Usado somente com `attribute`. |
| `modifier_value` | expressão | Bônus/penalidade. |
| `modifier_value_mode` | `fixed`, `per_origin_level` | Escalonamento. |
| `modifier_cap` | string/número | Limite opcional. |
| `modifier_application_side` | `self`, `vs_targeter` | Lado da aplicação. |
| `modifier_nh_display_mode` | `roll_only`, `include_in_nh` | Apenas rolagem ou NH exibido. |

`all` afeta rolagens de itens Perícia, não testes diretos genéricos do mesmo atributo.

## 13. Ação `combat_modifier`

Modifica ataque, Aparar, Bloqueio e/ou dano de modos de combate.

```json
{
  "id": "combatmodifier01",
  "label": "Arma energizada",
  "type": "combat_modifier",
  "combat_scope": "specific",
  "combat_source_item_ids": "Item.abc123",
  "combat_source_attack_ids": "swing-01",
  "modifier_application_side": "self",
  "modifier_nh_display_mode": "roll_only",
  "combat_attack_enabled": true,
  "combat_attack_value": "1",
  "combat_attack_value_mode": "fixed",
  "combat_parry_enabled": false,
  "combat_parry_value": "0",
  "combat_parry_value_mode": "fixed",
  "combat_block_enabled": false,
  "combat_block_value": "0",
  "combat_block_value_mode": "fixed",
  "combat_recalculate_parry": false,
  "combat_recalculate_block": false,
  "combat_damage_enabled": true,
  "combat_damage_changes": [
    {
      "component": "main",
      "operation": "extra_dice",
      "value": "1d6",
      "value_mode": "fixed",
      "cap": "",
      "replace_armor_divisor": "",
      "replace_type": "qmd",
      "replace_nature": ""
    }
  ]
}
```

### Escopo

| `combat_scope` | Uso |
| --- | --- |
| `all` | Todos os modos de combate. |
| `melee` | Somente corpo a corpo. |
| `ranged` | Somente à distância. |
| `specific` | Filtra pelos CSVs `combat_source_item_ids` e/ou `combat_source_attack_ids`. |

Filtros preservados são ignorados enquanto o escopo não for `specific`.

### Ataque e defesas

- `combat_attack_enabled`, `combat_parry_enabled`, `combat_block_enabled`: ligam cada componente.
- Cada componente usa `<componente>_value` e `<componente>_value_mode`.
- `combat_recalculate_parry` e `combat_recalculate_block`: recalculam a defesa a partir do NH de ataque modificado, em vez de apenas somar o valor diretamente.
- `modifier_application_side` e `modifier_nh_display_mode` têm os mesmos valores da ação de perícia.

### Alterações de dano

`combat_damage_changes` é um array. Cada entrada possui:

| Campo | Valores | Uso |
| --- | --- | --- |
| `component` | `main`, `follow_up`, `fragmentation` | Dano principal, subsequente ou fragmentação. |
| `operation` | `fixed`, `per_die`, `extra_dice`, `override` | Bônus fixo, por dado, dados extras ou troca da fórmula. |
| `value` | número/fórmula/expressão | Valor da alteração. |
| `value_mode` | `fixed`, `per_origin_level` | Escalonamento. |
| `cap` | string/número | Bônus máximo opcional. |
| `replace_armor_divisor` | string | Novo divisor; vazio mantém o atual. |
| `replace_type` | string | Novo tipo de dano; vazio mantém o atual. |
| `replace_nature` | string | Nova natureza; vazio mantém a atual. |

Não use o antigo campo `property` em conteúdo novo. As três substituições possuem campos próprios.

## 14. Ação `chat`

Publica uma mensagem para cada alvo. `{actor.name}` no texto é substituído pelo nome do ator-alvo.

```json
{
  "id": "chat000000000001",
  "label": "Teste de recuperação",
  "type": "chat",
  "chat_text": "<p>{actor.name} deve testar HT.</p>",
  "has_roll": true,
  "roll_label": "Teste de HT",
  "roll_attribute": "ht",
  "roll_modifier": "0",
  "requestedPurposeIds": ["recover_physical_stun"],
  "whisperMode": "public"
}
```

Campos:

- `chat_text`: HTML/texto publicado.
- `has_roll`: inclui uma solicitação de teste.
- `roll_label`: título do teste.
- `roll_attribute`: atributo ou chave de teste. Valores conhecidos: `st`, `dx`, `iq`, `ht`, `per`, `vont`, `vision`, `hearing`, `tastesmell`, `touch`, `dodge`; nomes de perícia também podem ser resolvidos pelo fluxo de teste.
- `roll_modifier`: modificador fixo ou fórmula.
- `requestedPurposeIds`: array de IDs do catálogo de finalidades.
- `whisperMode`: `public`, `gm` ou `blind`. A ficha atual não expõe este campo diretamente, mas o motor o respeita.

## 15. Ação `macro`

```json
{
  "id": "macro00000000001",
  "label": "Executar automação",
  "type": "macro",
  "value": "Nome exato da Macro"
}
```

`value` é o nome exato de uma macro do mundo. A macro recebe `{ actor, origin, targets }`. Como macros são conteúdo externo e podem executar código, uma IA nunca deve inventar ou criar uma macro silenciosamente.

## 16. Ação `flag`

Cria uma propriedade em `flags.gum.<key>` no ActiveEffect.

```json
{
  "id": "flag000000000001",
  "label": "Ignorar choque",
  "type": "flag",
  "key": "ignoreShock",
  "flag_value": "true"
}
```

`flag_value` converte exatamente as strings `"true"` e `"false"` em booleanos. Outros valores permanecem strings. A chave precisa ser reconhecida pelo código consumidor; não invente uma flag esperando que produza mecânica.

## 17. Valores e expressões

Campos numéricos de ações aceitam valores fixos, fórmulas do Foundry, JavaScript numérico e a linguagem condicional do GUM.

### Escalonamento

- `fixed`: usa o valor informado.
- `per_origin_level`: multiplica o valor pelo `system.level` do item que originou a aplicação. Nível ausente, inválido ou menor que 1 é tratado como 1.

### Condicional

```text
se(CONDIÇÃO, VALOR_SE_VERDADEIRO, VALOR_SE_FALSO)
```

Consultas:

- Itens: `possui`, `naopossui`/`nãopossui`, `possuiAlgum`, `possuiTodos`, `equipado`, `nivel`, `quantidade`.
- Ator: `atributo`, `condicaoAtiva`, `status`.
- Lógica: `todos`, `algum`, `nao`/`não`.
- Comparações: `=`, `==`, `!=`, `>`, `>=`, `<`, `<=`.

Exemplos:

```text
se(possui("Treinado por um Mestre"), -2, -4)
se(nivel("Talento Marcial") >= 2, 2, 1)
se(todos(equipado("Espada"), nao(status("stunned"))), 1, 0)
```

Referências de item podem ser nome, ID, UUID ou `sourceId`. Nomes ignoram caixa e acentuação; use ID/UUID quando houver homônimos.

JavaScript numérico disponibiliza `actor`, `game`, `rollData` e `Math`:

```text
Math.floor(actor.system.attributes.dx.final / 2)
```

Uma expressão inválida ou não numérica é neutralizada como `0` e gera aviso no console. Fórmulas com dados e modificadores direcionados devem ser avaliados no momento da rolagem, não incorporados permanentemente ao NH.

## 18. Duração

A duração só é exibida/útil quando existe ao menos uma ação persistente (`attribute`, `flag`, `roll_modifier`, `skill_modifier`, `combat_modifier` ou `status`).

### Permanente

```json
{
  "value": 1,
  "unit": "rounds",
  "inCombat": false,
  "isPermanent": true,
  "startMode": "apply",
  "endMode": "turnEnd"
}
```

### Temporário em combate

```json
{
  "value": 3,
  "unit": "rounds",
  "inCombat": true,
  "isPermanent": false,
  "startMode": "apply",
  "endMode": "turnEnd"
}
```

| Campo | Valores | Uso |
| --- | --- | --- |
| `value` | inteiro >= 1 | Quantidade de rodadas/turnos contados pelo sistema. |
| `unit` | normalmente `rounds` | Unidade persistida; a ficha atual trabalha com duração de combate em rodadas/segundos. |
| `inCombat` | boolean | Conta no combate. |
| `isPermanent` | boolean | Sem expiração automática. Quando `true`, use `inCombat: false`. |
| `startMode` | `apply`, `nextTurnStart` | Começa na aplicação ou no início do próximo turno do alvo. |
| `endMode` | `turnStart`, `turnEnd` | Expira no início ou final do turno final. |

O campo de interface `_uiMode` não precisa ser persistido; ele é derivado. Se for incluído, use `permanent` ou `combat` de modo coerente com os booleanos.

## 19. Barreira de resistência

A barreira solicita um teste antes de aplicar o efeito.

### Modo simples

```json
{
  "isResisted": true,
  "attribute": "ht",
  "modifier": "-2",
  "applyOn": "failure",
  "margin": "0",
  "mode": "simple",
  "branches": [],
  "chatText": "Resista ao veneno.",
  "skipPromptCard": false,
  "chatVisibility": "owners",
  "requestedPurposeIds": ["resist_poison"]
}
```

- `applyOn`: `failure` ou `success`.
- `margin`: margem mínima, número não negativo; vazio equivale a 0.
- `modifier`: modificador fixo ou fórmula do teste.
- `chatVisibility`: `public` (todos), `owners` (alvo e Mestre) ou `target` (somente alvo; se não houver destinatário válido, recai nos Mestres).
- `skipPromptCard`: pula o cartão preliminar quando `true`.
- `requestedPurposeIds`: array de IDs, não CSV.

### Modo condicional

O modo `conditional` seleciona subconjuntos de ações conforme o resultado. Todas as ramificações `outcome` que coincidirem são agregadas; se nenhuma coincidir, usa no máximo uma ramificação `otherwise`.

```json
{
  "isResisted": true,
  "attribute": "ht",
  "modifier": "0",
  "applyOn": "failure",
  "margin": "",
  "mode": "conditional",
  "branches": [
    {
      "id": "branchFailure001",
      "label": "Falha comum",
      "condition": {
        "type": "outcome",
        "outcome": "failure",
        "minimumMargin": 0,
        "maximumMargin": 4
      },
      "actionIds": ["attr000000000001"]
    },
    {
      "id": "branchBadFail01",
      "label": "Falha por 5 ou mais",
      "condition": {
        "type": "outcome",
        "outcome": "failure",
        "minimumMargin": 5,
        "maximumMargin": null
      },
      "actionIds": ["attr000000000001", "status0000000001"]
    },
    {
      "id": "branchOtherwise1",
      "label": "Sem consequência",
      "condition": {
        "type": "otherwise",
        "outcome": "failure",
        "minimumMargin": 0,
        "maximumMargin": null
      },
      "actionIds": []
    }
  ],
  "chatText": "Faça o teste de resistência.",
  "skipPromptCard": false,
  "chatVisibility": "owners",
  "requestedPurposeIds": []
}
```

Regras:

- `condition.type`: `outcome` ou `otherwise`.
- `condition.outcome`: `success` ou `failure`; é ignorado em `otherwise`.
- `minimumMargin`: número não negativo.
- `maximumMargin`: `null` para sem limite; caso seja menor que o mínimo, o normalizador eleva ao mínimo.
- `actionIds`: array de IDs existentes em `system.actions`.
- Apenas uma ramificação `otherwise` é mantida e ela é ordenada por último.
- Ao remover uma ação pela ficha, seu ID é retirado das ramificações.

## 20. Finalidades de teste (`requestedPurposeIds`)

As finalidades são IDs semânticos usados nos testes da ação `chat` e da barreira de resistência. Podem ser combinadas em array; normalmente usa-se uma finalidade primária e, quando necessário, qualificadores de fonte/vetor/circunstância.

Catálogo atual por grupo:

- Geral: `general`.
- Sobrevivência: `knockdown_stun`, `recover_physical_stun`, `consciousness`, `regain_consciousness`, `death`, `resist_bleeding`, `natural_recovery`, `crippling_recovery`, `pain`, `resist_torture`.
- Resistências: `resist_metabolic_hazard`, `resist_poison`, `resist_disease`, `resist_infection`, `resist_paralysis`, `resist_incapacitation`, `resist_unconsciousness`, `resist_nausea`, `resist_seizure`, `resist_addiction`, `resist_alcohol`.
- Mental: `fright_check`, `resist_fear`, `resist_intimidation`, `avoid_mental_stun`, `recover_mental_stun`, `self_control`, `resist_mental_influence`, `resist_possession`, `maintain_concentration`, `resist_confusion`, `memorize`, `recall_information`, `prolonged_mental_task`, `creativity`.
- Movimento: `maintain_balance`, `avoid_fall`, `controlled_fall`, `resist_takedown`, `resist_knockback_fall`, `stay_mounted`, `break_free`.
- Ambiente: `resist_suffocation`, `resist_exertion`, `resist_heat`, `resist_cold`, `resist_altitude`, `resist_pressure`, `resist_vacuum`, `resist_radiation`, `resist_acceleration`, `resist_sleep_deprivation`, `sleep_rest`, `aging_check`.
- Sentidos: `sense_general`, `sense_vision`, `sense_hearing`, `sense_taste_smell`, `sense_smell`, `sense_taste`, `sense_touch`, `sense_detection`.
- Fonte (qualificadores): `resist_magic`, `resist_psionic`, `resist_supernatural_power`, `resist_power`, `resist_telepathy`.
- Vetor (qualificadores): `sensory_vector_vision`, `sensory_vector_hearing`, `sensory_vector_smell`, `sensory_vector_taste`, `sensory_vector_touch`, `sensory_vector_smell_taste`, `inhaled_agent`.
- Social: `reaction_roll`, `influence_roll`, `resist_deception`, `resist_interrogation`, `be_heard`, `appear_honest`, `fashion_context`, `healthy_appearance`.
- Circunstância: `unnecessary_risk`.

Exemplo de combinação:

```json
{
  "requestedPurposeIds": ["resist_mental_influence", "resist_telepathy"]
}
```

Não coloque tags (`resistance.telepathy`) em `requestedPurposeIds`; finalidades e tags são catálogos distintos.

## 21. Exemplo completo com várias ações

```json
{
  "name": "Veneno Debilitante",
  "type": "effect",
  "img": "icons/consumables/potions/bottle-bulb-corked-green.webp",
  "system": {
    "description": "<p>Um veneno que reduz HT e causa náusea quando a resistência falha.</p>",
    "chat_description": "<p>Teste HT para resistir.</p>",
    "ref": "",
    "schemaVersion": 2,
    "conditionStackingMode": "stack",
    "tokenIconPolicy": "auto",
    "duration": {
      "value": 3,
      "unit": "rounds",
      "inCombat": true,
      "isPermanent": false,
      "startMode": "apply",
      "endMode": "turnEnd"
    },
    "resistanceRoll": {
      "isResisted": true,
      "attribute": "ht",
      "modifier": "0",
      "applyOn": "failure",
      "margin": "0",
      "mode": "simple",
      "branches": [],
      "chatText": "Resista ao veneno.",
      "skipPromptCard": false,
      "chatVisibility": "owners",
      "requestedPurposeIds": ["resist_poison"]
    },
    "actions": [
      {
        "id": "PoisonHtPenalty1",
        "label": "Redução de HT",
        "type": "attribute",
        "path": "system.attributes.ht.temp",
        "operation": "ADD",
        "value": "-2",
        "value_mode": "fixed",
        "attribute_chat_visibility": "public"
      },
      {
        "id": "PoisonNausea001",
        "label": "Náusea",
        "type": "status",
        "statusId": "nausea"
      },
      {
        "id": "PoisonChat00001",
        "label": "Aviso",
        "type": "chat",
        "chat_text": "<p>{actor.name} foi afetado pelo veneno.</p>",
        "has_roll": false
      }
    ]
  }
}
```

Observação: `nausea` é apenas ilustrativo; confirme o `statusId` real do mundo antes de usar.

## 22. Validação antes de entregar um JSON

Uma IA deve verificar:

- [ ] `type` é `effect`.
- [ ] `system.schemaVersion` é `2`.
- [ ] `system.actions` é array.
- [ ] Todo `action.id` é único e não vazio.
- [ ] Todo `action.type` pertence ao catálogo de dez tipos.
- [ ] Arrays e CSVs estão nos campos corretos.
- [ ] `value_mode` usa somente `fixed` ou `per_origin_level`.
- [ ] IDs de status, ações, itens, ataques, macros e finalidades não foram inventados.
- [ ] `branches[].actionIds` aponta para ações existentes.
- [ ] Há no máximo uma ramificação `otherwise`.
- [ ] Efeito permanente usa `isPermanent: true` e `inCombat: false`.
- [ ] Ações instantâneas não dependem da duração para se repetir.
- [ ] `include_in_nh` não é usado com dados, tags ou aplicação `vs_targeter`.
- [ ] Fórmulas e HTML estão corretamente escapados como JSON.

## 23. Campos legados e de compatibilidade

O modelo ainda espelha a primeira ação em campos raiz como `system.type`, `system.path`, `system.operation`, `system.value`, `system.roll_modifier_*`, `system.category` e outros. Isso permite abrir conteúdo antigo, mas a lista `system.actions` é a fonte canônica atual.

Também existem aliases históricos dentro de ações, por exemplo campos singulares de modificador de rolagem e o antigo `combat_damage_changes[].property`. O normalizador consegue migrar alguns deles, porém conteúdo gerado por IA deve usar:

- `system.actions` em vez de uma ação na raiz;
- `roll_modifier_entries[]` em vez dos campos singulares `roll_modifier_value`, `roll_modifier_context` etc.;
- `combat_damage_changes[]` com `replace_armor_divisor`, `replace_type` e `replace_nature` em vez de `property`.

## 24. Limites desta referência

- Status são configuráveis por mundo e precisam ser consultados no ambiente de destino.
- Macros, IDs/UUIDs de itens, especializações, ataques e localizações corporais também dependem do mundo/ator.
- O documento descreve a estrutura aceita pelo sistema, mas não cria uma API de importação. A implementação futura deverá decidir se o JSON será colado, importado, recebido por macro ou enviado por uma API.
- Catálogos podem mudar em versões posteriores; atualize a versão no topo quando o modelo, ficha ou motor de efeitos mudar.

## 25. Fontes técnicas usadas no mapeamento

- `template.json`: modelo e valores padrão do Item Efeito.
- `templates/items/effect-sheet.hbs`: todos os controles visíveis e valores das opções.
- `scripts/apps/effect-sheet.js`: normalização, persistência, arrays, CSVs e compatibilidade.
- `scripts/effects-engine.js`: execução das dez ações, duração e criação do ActiveEffect.
- `module/apps/effect-path-picker.mjs`: caminhos suportados e RD localizada.
- `module/utils/effect-value-expression.mjs`: linguagem condicional.
- `module/utils/effect-value-scaling.mjs`: escalonamento por nível.
- `module/utils/roll-request-data.mjs`: barreira e ramificações condicionais.
- `module/utils/roll-purposes.mjs`: catálogo de finalidades.
- `module/utils/roll-tags.mjs`: catálogo e hierarquia de tags.
- `module/utils/requested-attributes.mjs`: atributos de teste conhecidos.
- `module/utils/effect-chat-visibility.mjs`: privacidade de mensagens.
- `docs/effect-value-expressions.md`: guia existente de expressões.
- Testes automatizados de efeitos em `tests/`.
