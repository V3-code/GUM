# Autoria de condições GUM a partir do GCS

## Classificação

- **Condição passiva:** avalia o estado atual do ator (por exemplo, PV <= 0) e pode manter um efeito enquanto a expressão for verdadeira.
- **Condição infligida/event-driven:** reage a um evento pontual enviado pelo sistema (por exemplo, dano). A expressão deve consultar `eventData`.

## Choque (Shock)

Nome em inglês: **Shock**. Nome em português: **Choque**.

O dano envia ao ator um evento com `type: "damage"` e `injury` igual à lesão final, depois de RD e multiplicador de dano. O gatilho manual para a condição é:

```js
eventData?.type === "damage" && Number(eventData?.injury ?? 0) > 0
```

Essa condição é infligida/event-driven, não passiva. Os efeitos existentes modificam `check_dx`, `check_iq`, `skill_dx`, `skill_iq`, `attack_melee` e `attack_ranged` por uma duração de um turno de combate.

Para uma montagem manual com quatro efeitos fixos, use condições mutuamente exclusivas. A expressão abaixo usa o PV máximo efetivo (`hp.final`, com fallback para `hp.max`) e respeita a regra de HP alto:

```js
// Choque −1
eventData?.type === "damage" && (Number(actor?.system?.attributes?.hp?.final ?? actor?.system?.attributes?.hp?.max ?? 0) >= 20 ? Math.floor(Number(eventData?.injury ?? 0) / Math.floor(Number(actor?.system?.attributes?.hp?.final ?? actor?.system?.attributes?.hp?.max ?? 0) / 10)) === 1 : Number(eventData?.injury ?? 0) === 1)

// Choque −2
eventData?.type === "damage" && (Number(actor?.system?.attributes?.hp?.final ?? actor?.system?.attributes?.hp?.max ?? 0) >= 20 ? Math.floor(Number(eventData?.injury ?? 0) / Math.floor(Number(actor?.system?.attributes?.hp?.final ?? actor?.system?.attributes?.hp?.max ?? 0) / 10)) === 2 : Number(eventData?.injury ?? 0) === 2)

// Choque −3
eventData?.type === "damage" && (Number(actor?.system?.attributes?.hp?.final ?? actor?.system?.attributes?.hp?.max ?? 0) >= 20 ? Math.floor(Number(eventData?.injury ?? 0) / Math.floor(Number(actor?.system?.attributes?.hp?.final ?? actor?.system?.attributes?.hp?.max ?? 0) / 10)) === 3 : Number(eventData?.injury ?? 0) === 3)

// Choque −4
eventData?.type === "damage" && (Number(actor?.system?.attributes?.hp?.final ?? actor?.system?.attributes?.hp?.max ?? 0) >= 20 ? Math.floor(Number(eventData?.injury ?? 0) / Math.floor(Number(actor?.system?.attributes?.hp?.final ?? actor?.system?.attributes?.hp?.max ?? 0) / 10)) >= 4 : Number(eventData?.injury ?? 0) >= 4)
```

No compêndio de efeitos GUM, a correspondência observada é: `1FQZ1wEDt0csXdy3` = Choque −1; `HR3rpucNNGRADOUJ` = Choque −2; `MzcSaaIRz8pLQf54` = Choque −3; `kL5va4dCoKKDQfOi` = Choque −4.

Na configuração desses efeitos, a barreira de resistência deve ficar desligada. A duração de combate é de 1 turno, iniciando no próximo turno e terminando no fim desse turno. Os efeitos já trazem os contextos `check_dx,skill_dx,check_iq,skill_iq,attack_melee,attack_ranged`; não é necessário recriá-los.

Choque não pede teste de resistência: a penalidade é aplicada automaticamente. Uma rolagem de HT pertence a outras regras de ferimento, como nocaute/atordoamento por ferimento grave, e não deve ser adicionada ao efeito de Choque.

**High Pain Threshold** ignora completamente a penalidade de Choque. Ele também concede +3 nos testes de HT para evitar nocaute/atordoamento. Isso é diferente da condição contínua de Dor, na qual HPT reduz as penalidades pela metade.

O fluxo de dano e o processador de condições suprimem esses efeitos quando o ator possui uma característica chamada `High Pain Threshold` ou `Limiar Alto de Dor`, com normalização de caixa e acentos. Essa compatibilidade por nome resolve os registros atuais; uma identidade estável de característica continua sendo a evolução preferível para traduções adicionais ou nomes personalizados.

A regra oficial é -1 por PV perdido, limitado a -4, somente no próximo turno; com 20 PV ou mais, usa-se uma fração de PV/10 por ponto de penalidade, ainda com limite -4. O gatilho já enxerga `eventData.injury`, mas os valores dos efeitos vinculados atualmente são avaliados sem `eventData`. Portanto, um valor fixo -4 é apenas um teste provisório; a escala exata exige suporte dinâmico no motor ou condições mutuamente exclusivas por faixa de lesão.

## Procedimento aprendido

1. Importar o arquivo do GCS como Item.
2. Consultar a regra oficial e registrar a fonte na descrição.
3. Classificar como passiva ou infligida/event-driven.
4. Escrever o `system.when` usando somente dados disponíveis no contexto do GUM.
5. Criar ou vincular o efeito e definir duração, contextos e empilhamento.
6. Testar em um mundo separado e revisar o resultado antes de automatizar a criação do arquivo.
