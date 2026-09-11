# Importar conteúdo do GCS

Na aba **Itens**, o Mestre pode usar **Importar do GCS** e selecionar vários arquivos. A ferramenta analisa sem gravar, mostra itens e pendências e só grava após **Importar válidos**. Cancelar não cria itens nem pastas. O atalho nas configurações abre a mesma ferramenta. A importação de personagens na aba **Atores** permanece separada.

## Formatos

Suporta JSON GCS versão 5: `.gct` (Modelos), `.adq` (vantagens/desvantagens), `.skl` (perícias/técnicas), `.spl` (magias), `.eqp` (equipamentos), `.adm` e `.eqm` (modificadores). `.json` é aceito quando sua estrutura identifica a família. Fichas `.gcs`, inclusive renomeadas, são recusadas com orientação para Atores. Arquivos de notas, calendários e definições corporais não têm conversão para um Item. Limites: 100 arquivos por operação, 16 MB por arquivo, 30 níveis de dados, 100 mil nós e 10 mil itens por arquivo.

Os itens entram diretamente na raiz da aba Itens, tanto na importação de um arquivo quanto na seleção de vários. O importador não cria pastas nem altera pastas existentes. O Mestre pode editar e organizar pastas e compêndios pelos recursos normais do Foundry. Modelos contêm seus componentes incorporados; não dependem de UUIDs de itens mundiais. Meta-Traits dentro de bibliotecas de características também preservam o agregado como Modelo. Outros grupos preservam caminho e metadados nos componentes.

O mesmo botão está disponível dentro de um **compêndio de Itens desbloqueado**, para Mestres com permissão de edição. Nesse caso, a prévia e o resultado identificam o compêndio escolhido e os documentos são criados diretamente nele, sem itens ou pastas intermediários no mundo. O destino fica fixo desde a abertura: fechar, remover, substituir ou bloquear o compêndio não redireciona a importação para o mundo. Fechar apenas a janela mantém o destino; alterações de disponibilidade ou permissão interrompem a gravação e preservam o relatório dos itens já criados.

Um Meta-Trait na raiz do arquivo vira diretamente um bloco com seu nome e características individuais. Grupos e escolhas internos continuam preservados. A revisão 2 dessa estrutura entra na assinatura apenas dos modelos afetados: reimportar um modelo antigo cria a versão corrigida sem sobrescrever edições; repetir a nova importação pula o modelo já convertido. Bibliotecas e modelos sem essa estrutura mantêm sua identificação anterior.

## Custos e revisão

Características usam o custo calculado armazenado pelo GCS quando disponível. Quando ausente, custos simples são calculados a partir de base, níveis e modificadores habilitados. Casos não representáveis recebem aviso de custo provisório. Níveis e modificadores permanecem descritos/editáveis na descrição e preservados nos dados de origem; não são reaplicados ao custo final como modificadores ativos do GUM. Importar não cria efeitos automáticos de regras ainda não implementadas.

Blocos preservam grupos e escolhas. O GUM permite **até** a quantidade/orçamento configurado. Quando GCS exige **exatamente**, a prévia e a descrição do Modelo registram que o Mestre deve conferir a quantidade exata. Comparações diferentes de `is`/`at_most` são recusadas. Pacotes com escolhas internas dentro de orçamento por pontos são recusados porque seu custo variável não pode ser convertido fielmente. Referências, pré-requisitos, recursos e regras sem representação ficam legíveis na descrição, com avisos relevantes.

## Reimportação e falhas

A origem e a assinatura canônica identificam importações idênticas, independentemente do nome do arquivo. Reimportar pula itens já importados, mesmo editados pelo Mestre. Conteúdo diferente cria variante; nunca sobrescreve. Uma falha de resposta é conciliada com a coleção antes de tentar novamente. Se a coleção também ficar indisponível, a importação para e informa a incerteza. A operação não é uma transação entre dois GMs simultâneos.

A identificação e a conciliação consultam somente os documentos do destino escolhido. O mesmo conteúdo pode ser importado para o mundo e para compêndios diferentes sem que um destino impeça a importação no outro.

Conteúdo comercial é lido dos arquivos locais escolhidos pelo Mestre, não distribuído com o sistema. Nenhuma atualização do GCS é necessária.
