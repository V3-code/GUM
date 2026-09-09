# Importar conteúdo do GCS

Na aba **Itens**, o Mestre pode usar **Importar do GCS** e selecionar vários arquivos. A ferramenta analisa sem gravar, mostra itens e pendências e só grava após **Importar válidos**. Cancelar não cria itens nem pastas. O atalho nas configurações abre a mesma ferramenta. A importação de personagens na aba **Atores** permanece separada.

## Formatos

Suporta JSON GCS versão 5: `.gct` (Modelos), `.adq` (vantagens/desvantagens), `.skl` (perícias/técnicas), `.spl` (magias), `.eqp` (equipamentos), `.adm` e `.eqm` (modificadores). `.json` é aceito quando sua estrutura identifica a família. Fichas `.gcs`, inclusive renomeadas, são recusadas com orientação para Atores. Arquivos de notas, calendários e definições corporais não têm conversão para um Item. Limites: 100 arquivos por operação, 16 MB por arquivo, 30 níveis de dados, 100 mil nós e 10 mil itens por arquivo.

Os itens entram em pastas por arquivo. O Mestre pode editar e organizar compêndios pelos recursos normais do Foundry. Modelos contêm seus componentes incorporados; não dependem de UUIDs de itens mundiais. Meta-Traits dentro de bibliotecas de características também preservam o agregado como Modelo. Outros grupos preservam caminho e metadados nos componentes.

## Custos e revisão

Características usam o custo calculado armazenado pelo GCS quando disponível. Quando ausente, custos simples são calculados a partir de base, níveis e modificadores habilitados. Casos não representáveis recebem aviso de custo provisório. Níveis e modificadores permanecem descritos/editáveis na descrição e preservados nos dados de origem; não são reaplicados ao custo final como modificadores ativos do GUM. Importar não cria efeitos automáticos de regras ainda não implementadas.

Blocos preservam grupos e escolhas. O GUM permite **até** a quantidade/orçamento configurado. Quando GCS exige **exatamente**, a prévia e a descrição do Modelo registram que o Mestre deve conferir a quantidade exata. Comparações diferentes de `is`/`at_most` são recusadas. Pacotes com escolhas internas dentro de orçamento por pontos são recusados porque seu custo variável não pode ser convertido fielmente. Referências, pré-requisitos, recursos e regras sem representação ficam legíveis na descrição, com avisos relevantes.

## Reimportação e falhas

A origem e a assinatura canônica identificam importações idênticas, independentemente do nome do arquivo. Reimportar pula itens já importados, mesmo editados pelo Mestre. Conteúdo diferente cria variante; nunca sobrescreve. Uma falha de resposta é conciliada com a coleção antes de tentar novamente. Se a coleção também ficar indisponível, a importação para e informa a incerteza. A operação não é uma transação entre dois GMs simultâneos.

Conteúdo comercial é lido dos arquivos locais escolhidos pelo Mestre, não distribuído com o sistema. Nenhuma atualização do GCS é necessária.
