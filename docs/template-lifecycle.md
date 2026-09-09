# Aplicação e remoção de modelos

Modelos novos registram suas próprias contribuições em `system.applied_models` com `schemaVersion: 2`. A escolha de blocos permanece igual; antes de aplicar, a ficha valida todas as entradas selecionadas e mostra uma confirmação com os campos que serão modificados. Cancelar qualquer diálogo não grava itens, atributos ou histórico.

PV/PF concedidos por um modelo alteram o máximo, preservando os valores atuais. O recálculo vinculado continua opcional. Sua remoção usa contribuições por campo: não recalcula toda a ficha nem restaura um ator inteiro. Modificações manuais identificadas em secundários permanecem; deltas explícitos são subtraídos do valor atual. Itens editados permanecem e perdem apenas o vínculo ao modelo. Registros anteriores sem prova de integridade preservam itens e secundários, com aviso; seus deltas de PV/PF seguem o caminho antigo do recurso atual.

Um modelo A e um modelo B podem ser removidos em qualquer ordem. Campos numéricos conservam as diferenças efetivamente aplicadas; dano usa uma cadeia de substituições, evitando que a remoção posterior de B traga de volta um valor de A já removido. Isso não é um recálculo universal de fórmulas: arredondamentos podem diferir de reconstruir a ficha do zero.

Se uma escrita falhar, a biografia mostra a operação pendente e o botão **Retomar**. Enquanto existir pendência, novas aplicações e remoções de modelos ficam bloqueadas. Retomar verifica o estado persistido antes de repetir etapas. A remoção só termina depois de desvincular os itens preservados. Uma resposta perdida após persistência não deve causar nova subtração ou compensação.

Se um item foi criado mas não há confirmação persistida da criação e de seus hooks, Retomar desfaz a aplicação conservadoramente, preservando itens editados identificáveis. Não considera efeitos incompletos como aplicação concluída e não os reaplica às cegas. Planos persistidos são validados novamente antes das operações: caminhos externos aos atributos previstos, tipos inválidos e proveniência inconsistente bloqueiam a retomada antes de novas alterações.

Operações de itens iniciadas por modelos aguardam os três hooks diretos GUM de criar/editar/excluir. Desvinculação registrada, contendo exclusivamente flags de proveniência, não recria efeitos passivos. Caso a exclusão do item tenha persistido e a limpeza de efeitos falhe, a retomada apaga somente efeitos com `originItemId` do item autorizado já ausente. Outros efeitos permanecem. Não há restauração de snapshots de ActiveEffects.

## Limites

- O bloqueio é local ao cliente e há revalidação de dados. Não oferece exclusão mútua distribuída entre duas sessões editando o mesmo ator simultaneamente.
- São aguardados os hooks diretos instrumentados. Macros, módulos externos e hooks transitivos podem ter efeitos que não são transacionais.
- Uma sobra de pontos já utilizada é preservada com aviso se retirá-la produzir saldo negativo. Não há reconciliação automática do orçamento global.
- Durante pendências, alterações fora de modelos continuam possíveis. Valores divergentes são preservados conservadoramente; uma operação com estrutura inválida requer inspeção, não restauração global.

## Verificação

`node --test tests/template-lifecycle-plan.test.mjs tests/template-lifecycle-service.test.mjs tests/template-lifecycle-view.test.mjs tests/template-operation-tracker.test.mjs`

Os testes exercitam planners e serviço reais com portas de persistência em memória e falhas antes/depois de commit. Incluem A/B, PV/PF, edições posteriores, histórico legado, escaping, resposta perdida, rollback parcial, unlink e retomada sem dupla subtração. No Foundry, verificar cancelar; aplicar/remover dois modelos; editar um secundário e um item antes de remover; reabrir uma operação pendente e Retomar; e criar/excluir imediatamente um item com efeito passivo. Conferir tanto os documentos persistidos quanto a ficha.
