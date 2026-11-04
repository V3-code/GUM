# Referência para IA — Item Equipamento do GUM

[English version](./equipment-item.md)

> Documento técnico para produzir dados de um Item Equipamento compatível com o sistema GUM (Não Oficial).
>
> Mapeamento conferido no GUM `1.4.3-beta`, Foundry VTT mínimo 12 e verificado 14, em 14/10/2026.

## 1. Finalidade deste documento

Use esta referência quando uma IA precisar criar, revisar ou explicar um Item Equipamento. O resultado recomendado é um objeto JSON de Item do Foundry com `type: "equipment"`.

Quando o equipamento depender de Efeitos, Condições ou Modificadores que devem ser importados junto com ele, use o [formato de pacote autocontido](./pacote-itens-autocontido.md). Ele substitui UUIDs previamente conhecidos por referências locais seguras durante a importação.

Um equipamento pode combinar:

- dados econômicos, físicos, tecnológicos e de integridade;
- quantidade ou consumo por cargas;
- contêiner e localização no inventário;
- proteção geral e DR por localização corporal;
- múltiplos ataques corpo a corpo e à distância;
- um perfil de munição;
- múltiplos Modificadores de Equipamento anexados;
- vínculos com Itens Efeito e Itens Condição.

## 2. Contrato de saída recomendado para a IA

1. Retorne JSON válido, sem comentários dentro do JSON.
2. Use sempre `type: "equipment"`.
3. Registre ataques e modificadores como objetos indexados por ID; a chave deve coincidir com o `id` quando a entrada possuir esse campo.
4. Use IDs únicos e estáveis dentro do item. Recomenda-se uma sequência alfanumérica de 16 caracteres para ataques e vínculos.
5. Trate `cost`, `weight` e demais propriedades editáveis como valores-base. Não grave os resultados calculados dos modificadores sobre eles.
6. Não grave `equipmentResolution`, valores finais, trilhas de cálculo, avisos nem ataques criados pelo resolvedor; são dados derivados em tempo de execução.
7. Não invente UUIDs de Efeitos/Condições, IDs de localizações corporais, IDs de munições ou de contêineres.
8. Em item de biblioteca/compêndio, deixe referências dependentes de um ator — `parent_container_id` e `ammunition_ids` — vazias.
9. Não gere `_id`, `folder`, `sort`, `ownership` ou `_stats`, salvo exigência do fluxo de importação.
10. Explique fora do JSON qualquer hipótese, seletor amplo ou referência que precise ser preenchida depois.

## 3. Estrutura-base recomendada

```json
{
  "name": "Nome do equipamento",
  "type": "equipment",
  "img": "icons/svg/item-bag.svg",
  "system": {
    "description": "<p>Descrição completa.</p>",
    "chat_description": "",
    "favorite_in_combat": false,
    "ref": "",
    "quantity": 1,
    "level": "",
    "points": 0,
    "cost": 0,
    "weight": 0,
    "location": "carried",
    "is_container": false,
    "container": {
      "max_weight": 0,
      "dimensions_cm": {
        "width": 0,
        "height": 0,
        "depth": 0
      }
    },
    "parent_container_id": "",
    "tech_level": "3",
    "tech_sm": 0,
    "legality_class": "4",
    "material": "",
    "quality": "",
    "item_hp": 0,
    "item_hp_current": 0,
    "item_ht": 12,
    "item_dr": 0,
    "integrity_record_enabled": false,
    "holdout": 0,
    "defense_bonus": 0,
    "defense_bonus_active": false,
    "equip_time": 1,
    "max_uses": 0,
    "current_uses": 0,
    "uses_mode": "quantity",
    "charge_reserve_type": "",
    "charge_reserve_name": "",
    "charge_reserve_scope": "any",
    "consume_quantity_when_empty": false,
    "descriptors": [],
    "dr_locations": {},
    "melee_attacks": {},
    "ranged_attacks": {},
    "ammunition": {
      "enabled": false,
      "attack_modifier": 0,
      "low_warning": 0,
      "main": {
        "formula": "",
        "operation": "replace",
        "type": "",
        "nature": "",
        "armor_divisor": "",
        "divisor_operation": "replace"
      },
      "follow_up": {
        "formula": "",
        "operation": "replace",
        "type": "",
        "nature": "",
        "armor_divisor": "",
        "divisor_operation": "replace"
      },
      "fragmentation": {
        "formula": "",
        "operation": "replace",
        "type": "",
        "nature": "",
        "armor_divisor": "",
        "divisor_operation": "replace"
      }
    },
    "eqp_modifiers": {},
    "activationEffects": {
      "success": {},
      "failure": {}
    },
    "onDamageEffects": {},
    "generalConditions": {},
    "passiveEffects": {},
    "useEventEffects": {},
    "stateEffectGroups": {}
  }
}
```

Coleções vazias podem ser omitidas quando o modelo do sistema for aplicado automaticamente. Para JSON portátil e autodescritivo, a estrutura acima é preferível.

## 4. Campos gerais e físicos

| Caminho | Tipo | Padrão | Uso |
| --- | --- | --- | --- |
| `name` | string | — | Nome visível. |
| `type` | string | `equipment` | Tipo obrigatório. |
| `img` | string | ícone | Imagem do item. |
| `system.description` | HTML/string | `""` | Descrição completa. |
| `system.chat_description` | HTML/string | `""` | Resumo para o chat. |
| `system.favorite_in_combat` | boolean | `false` | Destaca o item nas interfaces de combate. |
| `system.ref` | string | `""` | Referência bibliográfica/regra; aceita múltiplos códigos separados por vírgula na interface. |
| `system.quantity` | number | `1` | Quantidade de unidades. Use valor não negativo. |
| `system.level` | string/number | `""` | Nível informativo do equipamento. |
| `system.points` | number | `0` | Valor informativo em pontos. |
| `system.cost` | number | `0` | Custo-base por unidade. |
| `system.weight` | number | `0` | Peso-base por unidade, em kg. |
| `system.tech_level` | string | `"3"` | Nível tecnológico. |
| `system.tech_sm` | number | `0` | Modificador de tamanho tecnológico. |
| `system.legality_class` | string/number | `"4"` | Classe de legalidade. |
| `system.material` | string | `""` | Material-base. |
| `system.quality` | string | `""` | Qualidade-base. |
| `system.holdout` | number | `0` | Ocultabilidade. |
| `system.equip_time` | number | `1` | Tempo para equipar. |

`cost`, `weight`, propriedades, ataques, munição e DR podem ser alterados por `eqp_modifiers`. O resolvedor produz uma visão final sem modificar estes valores-base.

### Descritores-base

`system.descriptors` é um array opcional de descritores narrativos. Conteúdo moderno pode usar objetos como:

```json
{
  "descriptors": [
    {
      "id": "base-finish",
      "kind": "appearance",
      "value": "Acabamento negro",
      "sourceName": "Equipamento-base"
    }
  ]
}
```

`kind` segue `appearance`, `craftsmanship`, `material`, `origin`, `tag` ou `note`. Strings simples ainda são aceitas e normalizadas como `tag`, mas objetos explícitos são preferíveis. Modificadores podem acrescentar outros descritores à visão resolvida sem alterar este array-base.

## 5. Localização e contêineres

### Localização canônica

`system.location` aceita:

| Valor | Significado |
| --- | --- |
| `equipped` | Equipado/vestido. |
| `carried` | Carregado, mas não equipado. |
| `stored` | Guardado; não conta como carregado ou munição disponível. |

Campos antigos `equipped` e `stored` ainda podem aparecer em dados importados, mas conteúdo novo deve preferir `location`.

### Contêiner

```json
{
  "is_container": true,
  "container": {
    "max_weight": 20,
    "dimensions_cm": {
      "width": 30,
      "height": 50,
      "depth": 20
    }
  },
  "parent_container_id": ""
}
```

- `is_container`: indica que o item pode conter outros itens.
- `container.max_weight`: capacidade de peso; número ≥ 0.
- dimensões são em centímetros; números ≥ 0.
- `parent_container_id`: ID do Item Equipamento contêiner no mesmo ator.

Não invente `parent_container_id`: IDs de documentos só existem após a criação no ator. Para itens de biblioteca, deixe `""`. O sistema propaga a localização do contêiner para seus filhos quando eles são movidos.

Contêineres são de primeiro nível: o fluxo normal não permite colocar um contêiner dentro de outro contêiner.

## 6. Integridade e defesa

| Campo | Tipo | Uso |
| --- | --- | --- |
| `item_hp` | number | HP máximo/base do objeto. |
| `item_hp_current` | number | HP atual persistido. |
| `item_ht` | number | HT do objeto. |
| `item_dr` | number | DR geral do objeto. |
| `integrity_record_enabled` | boolean | Expõe HP/DR do item como registro de integridade na ficha do ator. |
| `defense_bonus` | number | Bônus de defesa concedido. |
| `defense_bonus_active` | boolean | Ativa o bônus quando o item estiver equipado. |

O registro de integridade só aparece quando habilitado, `quantity > 0` e o HP máximo resolvido é maior que zero. O HP atual é limitado entre zero e o máximo resolvido. Alterar a integridade não consome cargas.

O bônus de defesa exige simultaneamente equipamento `equipped`, `defense_bonus_active: true` e bônus final diferente de zero.

## 7. Consumo, cargas e reservas

```json
{
  "quantity": 3,
  "uses_mode": "charges",
  "max_uses": 6,
  "current_uses": 2,
  "consume_quantity_when_empty": true,
  "charge_reserve_type": "power",
  "charge_reserve_name": "Bateria",
  "charge_reserve_scope": "carried"
}
```

| Campo | Valores | Semântica |
| --- | --- | --- |
| `uses_mode` | `quantity`, `charges` | Consome unidades ou cargas. |
| `max_uses` | inteiro ≥ 0 | Capacidade de cargas por unidade. |
| `current_uses` | inteiro ≥ 0 | **Cargas já gastas**, não cargas restantes. |
| `consume_quantity_when_empty` | boolean | Ao esgotar uma unidade, reduz `quantity` e inicia a próxima. |
| `charge_reserve_type` | `""`, `combat`, `power`, `spell` | Mostra as cargas como reserva vinculada. |
| `charge_reserve_name` | string | Nome da reserva; vazio usa o nome do item. |
| `charge_reserve_scope` | `any`, `carried`, `equipped`, `stored`, `active` | Quando a reserva aparece. |

Em modo `quantity`, cada uso reduz `quantity`. Em modo `charges`, cargas restantes são `max_uses - current_uses`. Sem `consume_quantity_when_empty`, zerar cargas não reduz a pilha. Com ele, o consumo pode atravessar várias unidades da pilha.

`active` considera `system.active === true` ou `system.switched_on === true`. Esses estados podem ser administrados por outras partes do sistema e não precisam ser incluídos num item de biblioteca comum.

## 8. DR por localização

`dr_locations` é um objeto indexado pelo ID real da localização corporal. `all` representa proteção geral para todas as localizações.

```json
{
  "dr_locations": {
    "all": {
      "base": 2
    },
    "torso": {
      "base": 5,
      "cort": 2,
      "perf": -1
    }
  }
}
```

Regra crucial: `base` é DR absoluta, mas cada chave de tipo de dano guarda um **modificador relativo à base**. No exemplo, o torso exibe DR 7 contra corte e DR 4 contra perfuração.

A ficha aceita texto como `5, 7 cort, 4 perf` e persiste `{ "base": 5, "cort": 2, "perf": -1 }`.

Aliases traduzidos pelo editor incluem:

| Entrada | Chave persistida |
| --- | --- |
| `cr` | `cont` |
| `cut` | `cort` |
| `imp` | `perf` |
| `pi`, `pi-`, `pi+`, `pi++` | `pa`, `pa-`, `pa+`, `pa++` |
| `burn` | `qmd` |
| `corr` | `cor` |
| `tox` | `tox` |

IDs de localização dependem do perfil corporal do mundo. Não presuma que `torso` exista; confirme-o ou use `all` quando essa for realmente a intenção.

## 9. Coleções de ataques

`melee_attacks` e `ranged_attacks` são objetos indexados por IDs únicos:

```json
{
  "melee_attacks": {
    "slash01": {
      "id": "slash01",
      "mode": "Golpe",
      "skill_name": "Espadas de Lâmina Larga"
    }
  },
  "ranged_attacks": {}
}
```

O editor normalmente gera IDs aleatórios de 16 caracteres. Um ataque persistido pode funcionar sem o `id` interno em dados antigos, mas conteúdo novo deve manter chave e `id` iguais.

Campos comuns:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `mode` | string | Nome do modo. |
| `skill_name` | string | Perícia usada; deve corresponder ao nome no ator. |
| `skill_level_mod` | number | Modificador do NH. |
| `damage_formula` | string | Fórmula do dano principal. |
| `damage_type` | string | Tipo de dano. |
| `damage_nature` | string | Natureza especial, por exemplo `FOG`. |
| `damage_scaling` | string | Progressão informativa/editável, por exemplo `+1d6/point`. |
| `armor_divisor` | number | Divisor de armadura; normalmente `1`. |
| `min_strength` | string/number | ST mínima. |
| `groups` | string CSV | Grupos usados por filtros e modificadores. |
| `unbalanced` | boolean | Arma desbalanceada. |
| `fencing` | boolean | Arma de esgrima. |
| `follow_up_damage` | object | Dano subsequente. |
| `fragmentation_damage` | object | Fragmentação. |
| `onDamageEffects` | object | Efeitos específicos deste ataque. |

`groups` é uma string separada por vírgulas, não um array. As fórmulas básicas reconhecem aliases como `GdP`/`thr` e `GdB`/`sw`, além de fórmulas de dados como `2d+1`.

## 10. Ataque corpo a corpo

```json
{
  "id": "bladeSlash01",
  "mode": "Golpe de espada",
  "skill_name": "Espadas de Lâmina Larga",
  "skill_level_mod": 0,
  "damage_formula": "GdB+1",
  "damage_type": "cort",
  "damage_nature": "",
  "damage_scaling": "",
  "armor_divisor": 1,
  "reach": "1",
  "parry": "0",
  "block": "",
  "parry_default": true,
  "block_default": true,
  "min_strength": 10,
  "groups": "espada, lâmina",
  "unbalanced": false,
  "fencing": false,
  "follow_up_damage": {
    "formula": "",
    "type": "",
    "nature": "",
    "scaling": "",
    "armor_divisor": 1
  },
  "fragmentation_damage": {
    "formula": "",
    "type": "",
    "nature": "",
    "scaling": "",
    "armor_divisor": 1
  },
  "onDamageEffects": {}
}
```

Campos exclusivos: `reach`, `parry`, `block`, `parry_default`, `block_default`. Quando um campo `*_default` é `true`, a defesa pode ser calculada a partir da perícia do ator; use `false` para preservar um valor fixo informado.

## 11. Ataque à distância

```json
{
  "id": "rifleShot01",
  "mode": "Tiro",
  "skill_name": "Armas de Fogo (Fuzil)",
  "skill_level_mod": 0,
  "damage_formula": "5d",
  "damage_type": "pa",
  "damage_nature": "",
  "damage_scaling": "",
  "armor_divisor": 1,
  "accuracy": "5",
  "range": "500/3000",
  "rof": "3",
  "shots": "30(3)",
  "rcl": "2",
  "mag": "1",
  "min_strength": 10,
  "groups": "fuzil, balístico",
  "ammunition_ids": [],
  "unbalanced": false,
  "fencing": false,
  "follow_up_damage": {
    "formula": "",
    "type": "",
    "nature": "",
    "scaling": "",
    "armor_divisor": 1
  },
  "fragmentation_damage": {
    "formula": "",
    "type": "",
    "nature": "",
    "scaling": "",
    "armor_divisor": 1
  },
  "onDamageEffects": {}
}
```

Campos exclusivos: `accuracy`, `range`, `rof`, `shots`, `rcl`, `mag` e `ammunition_ids`. Muitos são strings porque aceitam notação GURPS, não apenas números.

`ammunition_ids` é um array de IDs de outros Itens Equipamento no mesmo ator, cada um com `system.ammunition.enabled: true`. Munição guardada, sem quantidade ou sem usos disponíveis é ignorada. Não coloque UUIDs nessa lista e não invente IDs em conteúdo de compêndio.

## 12. Danos secundários e efeitos ao causar dano

`follow_up_damage` e `fragmentation_damage` possuem:

```json
{
  "formula": "1d-1",
  "type": "qmd",
  "nature": "FOG",
  "scaling": "",
  "armor_divisor": 2
}
```

Fórmula vazia desativa o componente. `scaling` preserva uma progressão importada/editável; não substitui `formula`.

Cada ataque pode vincular efeitos próprios:

```json
{
  "onDamageEffects": {
    "burnEffect01": {
      "id": "burnEffect01",
      "effectUuid": "Compendium.world.effects.Item.REAL_ITEM_ID",
      "name": "Em chamas",
      "img": "icons/svg/fire.svg",
      "minInjury": 1,
      "requiredDamageType": "qmd",
      "activationChance": 100
    }
  }
}
```

`minInjury` é não negativo; `activationChance` vai de 0 a 100; `requiredDamageType` vazio aceita qualquer tipo. `effectUuid` deve apontar para um Item Efeito real.

## 13. Perfil de munição

Um Item Equipamento pode representar uma munição aplicável a ataques de outro equipamento:

```json
{
  "ammunition": {
    "enabled": true,
    "attack_modifier": 1,
    "low_warning": 5,
    "main": {
      "formula": "+1",
      "operation": "add",
      "type": "pa+",
      "nature": "",
      "armor_divisor": 2,
      "divisor_operation": "replace"
    },
    "follow_up": {
      "formula": "1d",
      "operation": "replace",
      "type": "qmd",
      "nature": "",
      "armor_divisor": 1,
      "divisor_operation": "replace"
    },
    "fragmentation": {
      "formula": "",
      "operation": "replace",
      "type": "",
      "nature": "",
      "armor_divisor": "",
      "divisor_operation": "replace"
    }
  }
}
```

- `enabled`: torna o item selecionável como munição.
- `attack_modifier`: bônus/penalidade na rolagem de ataque.
- `low_warning`: limiar não negativo para alerta de estoque.
- Componentes: `main`, `follow_up`, `fragmentation`.
- `operation` e `divisor_operation`: `replace`, `add`, `multiply`.
- `type` e `nature` não possuem operação própria; texto não vazio substitui o valor do ataque.
- `armor_divisor` deve ser vazio ou número maior que zero.

Fórmulas `add`/`multiply` são combinadas com a fórmula do ataque. O perfil efetivo também pode ser alterado por Modificadores de Equipamento sem sobrescrever o perfil-base.

## 14. Modificadores anexados

`eqp_modifiers` é um objeto de snapshots de Itens `eqp_modifier`. Consulte a [referência completa do Modificador de Equipamento](./item-modificador-equipamento.md).

```json
{
  "eqp_modifiers": {
    "fineMod01": {
      "id": "fineMod01",
      "name": "Qualidade Superior",
      "enabled": true,
      "level": 1,
      "adjustment_schema": 1,
      "cost_adjustment": "+3 CF",
      "cost_factor": 3,
      "weight_mod": "-10%",
      "cost_adjustment_data": {
        "expression": "+3 CF",
        "stage": "base",
        "per_level": false,
        "per_weight": false,
        "per_weight_unit": "kg"
      },
      "weight_adjustment_data": {
        "expression": "-10%",
        "stage": "original",
        "per_level": false
      },
      "features_data": {},
      "gcs_features_unmapped": [],
      "tech_level": "",
      "group": "Qualidade",
      "ref": "",
      "source_uuid": "Compendium.world.eqp-modifiers.Item.REAL_ITEM_ID"
    }
  }
}
```

Cada entrada é uma cópia independente: mudanças posteriores no item-fonte não são automaticamente aplicadas à cópia. `source_uuid` registra a origem e deve ser real. Se a IA produzir um equipamento autocontido sem fonte externa, pode omiti-lo, mas deve manter todo o snapshot necessário.

O resolvedor calcula custo/peso finais, propriedades, DR, ataques, munição, descritores, usos e efeitos concedidos sem mutar os dados-base. Não persista seus campos derivados.

## 15. Vínculos gerais com Itens Efeito e Condição

Consulte a [referência do Item Efeito](./item-efeito.md). Todas as coleções abaixo são objetos indexados; nunca invente UUIDs.

Entrada-base de efeito:

```json
{
  "id": "effectLink01",
  "effectUuid": "Compendium.world.effects.Item.REAL_ITEM_ID",
  "recipient": "self",
  "name": "Nome informativo",
  "img": "icons/svg/aura.svg"
}
```

`name` e `img` são metadados; o sistema tenta resolver o documento original. `recipient` aceita `self` ou `target` onde aplicável.

| Coleção | Momento/caráter |
| --- | --- |
| `activationEffects.success` | Após ativação bem-sucedida. |
| `activationEffects.failure` | Após falha na ativação. |
| `onDamageEffects` | Ao causar dano; aceita os filtros da seção 12. |
| `passiveEffects` | Efeito automático/passivo. |
| `useEventEffects` | Ao consumir ou ativar o item. |
| `stateEffectGroups` | Efeitos controlados por estado do item. |
| `generalConditions` | Vínculos com Itens Condição, não Itens Efeito. |

Para `useEventEffects`, acrescente `useEventTrigger: "consume"` ou `"activate"`.

Uma condição geral usa `uuid`, não `effectUuid`:

```json
{
  "id": "conditionLink01",
  "uuid": "Compendium.world.conditions.Item.REAL_ITEM_ID",
  "name": "Condição vinculada",
  "img": "icons/svg/daze.svg"
}
```

## 16. Grupos de efeitos de estado

```json
{
  "stateEffectGroups": {
    "poweredState01": {
      "id": "poweredState01",
      "name": "Campo ligado",
      "mode": "equipped_manual",
      "active": false,
      "exclusiveSet": "modo-do-campo",
      "effects": {
        "effectLink01": {
          "id": "effectLink01",
          "effectUuid": "Compendium.world.effects.Item.REAL_ITEM_ID",
          "recipient": "self",
          "name": "Campo defensivo",
          "img": "icons/svg/shield.svg"
        }
      }
    }
  }
}
```

Modos:

| `mode` | Ativação |
| --- | --- |
| `manual` | Depende de `active`. |
| `equipped` | Automática enquanto equipado. |
| `carried` | Automática enquanto carregado ou equipado. |
| `present` | Enquanto o item existir no ator. |
| `equipped_manual` | Exige equipado e `active: true`. |

`exclusiveSet` é texto livre. Grupos manuais ativos com o mesmo valor formam um conjunto exclusivo: ativar um desativa os demais. Não grave `runtimeActive`; é estado derivado de apresentação.

## 17. Exemplo completo

```json
{
  "name": "Espada Longa de Qualidade",
  "type": "equipment",
  "img": "icons/weapons/swords/sword-guard-steel.webp",
  "system": {
    "description": "<p>Uma espada longa bem equilibrada.</p>",
    "chat_description": "<p>Espada longa.</p>",
    "favorite_in_combat": true,
    "ref": "MB271",
    "quantity": 1,
    "level": "",
    "points": 0,
    "cost": 700,
    "weight": 1.5,
    "location": "carried",
    "is_container": false,
    "container": {
      "max_weight": 0,
      "dimensions_cm": {
        "width": 0,
        "height": 0,
        "depth": 0
      }
    },
    "parent_container_id": "",
    "tech_level": "3",
    "tech_sm": 0,
    "legality_class": "4",
    "material": "Aço",
    "quality": "Boa",
    "item_hp": 12,
    "item_hp_current": 12,
    "item_ht": 12,
    "item_dr": 6,
    "integrity_record_enabled": true,
    "holdout": -3,
    "defense_bonus": 0,
    "defense_bonus_active": false,
    "equip_time": 1,
    "max_uses": 0,
    "current_uses": 0,
    "uses_mode": "quantity",
    "charge_reserve_type": "",
    "charge_reserve_name": "",
    "charge_reserve_scope": "any",
    "consume_quantity_when_empty": false,
    "descriptors": [],
    "dr_locations": {},
    "melee_attacks": {
      "swordSlash01": {
        "id": "swordSlash01",
        "mode": "Golpe",
        "skill_name": "Espadas de Lâmina Larga",
        "skill_level_mod": 0,
        "damage_formula": "GdB+1",
        "damage_type": "cort",
        "damage_nature": "",
        "damage_scaling": "",
        "armor_divisor": 1,
        "reach": "1",
        "parry": "0",
        "block": "",
        "parry_default": true,
        "block_default": true,
        "min_strength": 10,
        "groups": "espada, lâmina",
        "unbalanced": false,
        "fencing": false,
        "follow_up_damage": {
          "formula": "",
          "type": "",
          "nature": "",
          "scaling": "",
          "armor_divisor": 1
        },
        "fragmentation_damage": {
          "formula": "",
          "type": "",
          "nature": "",
          "scaling": "",
          "armor_divisor": 1
        },
        "onDamageEffects": {}
      }
    },
    "ranged_attacks": {},
    "ammunition": {
      "enabled": false,
      "attack_modifier": 0,
      "low_warning": 0,
      "main": {
        "formula": "",
        "operation": "replace",
        "type": "",
        "nature": "",
        "armor_divisor": "",
        "divisor_operation": "replace"
      },
      "follow_up": {
        "formula": "",
        "operation": "replace",
        "type": "",
        "nature": "",
        "armor_divisor": "",
        "divisor_operation": "replace"
      },
      "fragmentation": {
        "formula": "",
        "operation": "replace",
        "type": "",
        "nature": "",
        "armor_divisor": "",
        "divisor_operation": "replace"
      }
    },
    "eqp_modifiers": {},
    "activationEffects": {
      "success": {},
      "failure": {}
    },
    "onDamageEffects": {},
    "generalConditions": {},
    "passiveEffects": {},
    "useEventEffects": {},
    "stateEffectGroups": {}
  }
}
```

## 18. Validação antes de entregar

- [ ] `type` é exatamente `equipment`.
- [ ] `cost` e `weight` são valores-base por unidade.
- [ ] `location` é `equipped`, `carried` ou `stored`.
- [ ] `current_uses` representa cargas gastas.
- [ ] Reserva de cargas só foi configurada de propósito.
- [ ] `parent_container_id` e `ammunition_ids` referenciam IDs reais do mesmo ator ou estão vazios.
- [ ] `dr_locations` usa IDs reais e modificadores relativos à DR-base.
- [ ] Chaves e IDs dos ataques são únicos e coincidem.
- [ ] Campos notacionais de ataque permanecem strings quando necessário.
- [ ] `groups` é CSV; `ammunition_ids` é array.
- [ ] Divisores de armadura são vazios ou maiores que zero.
- [ ] `eqp_modifiers` contém snapshots completos e não resultados calculados.
- [ ] UUIDs de Efeitos/Condições existem e usam `effectUuid`/`uuid` corretamente.
- [ ] Nenhum campo derivado (`equipmentResolution`, custo final, ataques resolvidos, avisos) foi persistido.
- [ ] O JSON é sintaticamente válido e não contém comentários.

## 19. Resumo operacional para outra IA

> Gere um Item Foundry com `type: "equipment"`. Grave apenas dados-base editáveis. Use objetos indexados para ataques, modificadores e vínculos; mantenha chaves e IDs únicos. Preserve notação GURPS em strings de ataque, trate `current_uses` como cargas gastas e represente DR específica como diferença em relação a `base`. Não invente IDs/UUIDs dependentes do mundo ou ator. Não persista resultados do resolvedor. Para modificadores e efeitos, siga também as referências especializadas desta pasta.
