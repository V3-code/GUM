# Changelog

Todas as mudanças relevantes deste projeto serão documentadas neste arquivo.

O formato segue uma adaptação de [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e usa [SemVer](https://semver.org/lang/pt-BR/).

## [1.6.1-beta] - 2026-11-03

### Added

- A correspondência híbrida de Itens ganhou escopos explícitos para desativar a busca, consultar somente as fontes configuradas, incluir os Itens do mundo ou realizar uma pesquisa ampla.
- Fichas exportadas pelo próprio GUM podem ser restauradas por JSON de forma fiel ou com reconciliação híbrida opcional dos Itens.

### Changed

- As fontes de correspondência híbrida agora são independentes dos compêndios de Perícias e respeitam estritamente a ordem configurada antes de consultar fontes adicionais.
- A configuração de fontes foi organizada alfabeticamente, esclareceu o uso de Condições gerais de Itens e preserva a posição da rolagem durante alterações na janela.
- A importação de fichas no diretório de Atores distingue arquivos do GCS da opção concisa `Importar GUM`.
- A limpeza em massa do Escudo do Mestre destaca melhor a diferença entre remover conteúdos e excluir grupos completos.

### Fixed

- A limpeza em massa do Escudo do Mestre exclui corretamente os grupos quando essa modalidade é escolhida.
- Fichas removidas da propriedade de um jogador desaparecem imediatamente do Escudo do Mestre, sem exigir atualização manual da janela.
- A importação híbrida preserva as descrições autorais completa e curta do Item encontrado na biblioteca GUM, mantendo a atualização dos dados mecânicos importados.
- O seletor de escopo híbrido e o diálogo de importação de ficha receberam correções de contraste e tema.
- Importações de status permanecem restritas ao seu formato próprio, evitando que pacotes de outros tipos sejam interpretados incorretamente.

## [1.6.0-beta] - 2026-11-03

### Added

- O Escudo do Mestre recebeu um modo de edição de layout que desativa temporariamente as ações mecânicas e permite reorganizar grupos, conteúdos e abas com segurança.
- Abas do Escudo do Mestre agora podem ser criadas, renomeadas, reordenadas e excluídas, preservando ao menos uma área de trabalho válida.
- Macros e Tabelas de Rolagem do Foundry podem ser adicionadas ao Escudo do Mestre por referência, executadas diretamente e transportadas pela configuração sem duplicar os documentos originais.
- O editor do Escudo do Mestre ganhou limpeza em massa por grupos, aba atual, conjunto de abas ou escudo completo, com opção de manter os grupos e remover somente seus conteúdos.
- Janelas de rolagem de teste e dano agora permitem escolher a privacidade apenas para a rolagem atual, sem alterar o modo padrão do chat do usuário.
- Rolagens de dano de ataques, Magias, Poderes e danos básicos podem ser arrastadas para a hotbar do Foundry; os atalhos resolvem novamente os valores atuais quando executados.
- A confirmação de ataques à distância permite ignorar a cadência da arma somente naquela execução.

### Changed

- Cards de Macro no Escudo do Mestre usam controles mais discretos e indicadores visuais de contexto de alvo.
- Referências indisponíveis de Macros e Tabelas permanecem visíveis e editáveis até que o usuário as remova, com identificação clara do documento ausente.
- O editor de aliases dos Itens foi compactado e tornou-se recolhível para ocupar menos espaço na ficha.
- Janelas e fichas do sistema receberam correções de contraste nos títulos e barras superiores.
- A janela de limpeza do Escudo do Mestre foi reorganizada em opções de escopo mais claras e responsivas.

### Fixed

- A exportação e importação do Escudo do Mestre preservam a quantidade dinâmica de abas e as referências de Macros e Tabelas sem tentar incorporar documentos potencialmente inseguros.
- Atalhos de dano informam quando ator, item ou modo de ataque não existe mais, em vez de executar dados congelados ou inválidos.
- O rótulo da confirmação de ataques à distância passou de `Cadência do modo` para `Cadência da arma`.

## [1.5.2-beta] - 2026-11-01

### Changed

- O editor de Modelos reorganiza os campos de cada bloco, unifica as modalidades de seleção e reutiliza a mesma configuração ao adicionar ou editar itens, atributos, pacotes e Modelos referenciados.
- Blocos de Modelo aceitam instruções breves exibidas separadamente das regras mecânicas durante a aplicação.
- Compras de Modelos agora usam preço monetário unitário explícito, regras estruturadas de fontes aceitas, saldo compatível antecipado e distribuição automática entre fontes de pagamento.
- Opções de Modelo agora aceitam disponibilidade manual, requisitos estruturados do personagem, exibição bloqueada ou oculta e limites mínimo e máximo de quantidade por aplicação.
- O editor consolidou exigências e incompatibilidades na lista estruturada de requisitos, incluindo Pacotes, Modelos e Atributos, com migração transparente das regras antigas.
- A configuração de equipamentos em Modelos agora organiza quantidades, valores unitários, comportamento e destino em uma sequência única, com semântica consistente para quantidades bloqueadas.
- As janelas de configuração de entradas do Modelo agora separam dados, valores, destino e requisitos em seções visuais consistentes e aproveitam melhor a altura disponível da tela.
- Blocos e subgrupos do Modelo agora organizam dados básicos, instruções, destinos e configurações específicas em seções; novos subgrupos começam sem blocos predefinidos.
- Perícias, magias, poderes e vantagens ou desvantagens com níveis agora compartilham nível inicial, mínimo, máximo e fixo; ajustes de atributos seguem a mesma lógica, e PV/PF alteram somente seus valores máximos.
- A ponte `ActiveEffect` do Item Efeito agora ignora corretamente os hooks destinados a Atores e serializa sincronizações concorrentes, evitando avisos e tentativas duplicadas de remoção.
- Modificadores de rolagem de Itens Efeito agora aceitam grupos de composição entre personagem e alvo, com políticas de soma, pior ou melhor resultado, prioridade e uma aplicação por origem.
- As seções internas dos blocos ganharam separadores vermelhos sutis, e as instruções do subgrupo voltaram a usar o mesmo tratamento visual dos demais campos.

### Fixed

- Arrastar itens para blocos de Modelo usa a API namespaced do `TextEditor` e evita o processamento duplicado do mesmo evento de `drop` no Foundry 13 ou superior.
- Fechar sem rolar a janela aberta pelo card de Barreira de Resistência volta a habilitar o botão de teste.

## [1.5.1-beta] - 2026-10-31

### Added

- Itens Efeito agora oferecem a ação instantânea `Rolar Dano`, com dano principal, acompanhamento e fragmentação, fórmulas condicionais, visibilidade configurável e aplicação manual pelo card.
- Itens Efeito podem ser aplicados por Regiões do Foundry, pela ponte de ActiveEffect e pelo Monk's Active Tile Triggers, preservando o ciclo mecânico do GUM.
- Itens usados pela importação híbrida aceitam aliases editáveis, permitindo corresponder nomes equivalentes em idiomas diferentes sem um catálogo central de traduções.
- A referência técnica de Itens Condição e Gatilho documenta caminhos, eventos estruturados e dados úteis para automações e conteúdo produzido por IA.

### Changed

- Eventos de condições derivados de recursos, itens, dano e ActiveEffects carregam dados estruturados mais amplos e aliases compatíveis com gatilhos existentes.
- Cards de dano criados por Efeitos conservam o ator e o token de destino, mas respeitam um alvo marcado manualmente antes da aplicação.
- A importação híbrida normaliza nome, especialização e aliases por tipo de item antes de decidir pela substituição do conteúdo importado.

### Fixed

- Alterações de recursos pertencentes a equipamentos participam corretamente da avaliação de condições e preservam a identidade do recurso de origem.
- A resolução de alvos de dano evita escolhas ambíguas entre múltiplos tokens marcados, vinculados ou controlados.

## [1.5.0-beta] - 2026-10-30

### Added

- Nova janela de configuração mundial de condições passivas, com ordenação, ativação, busca nas fontes configuradas e importação/exportação autocontida.
- Modificadores de habilidades podem selecionar perícias, magias ou poderes por nome, atributo base, fonte, grupo, escola, classe e grupo visual da ficha.
- Magias e poderes agora aceitam grupos visuais criados e reorganizados diretamente na ficha, sem alterar a classificação interna dos itens.
- Contextos especializados de rolagem reconhecem o tipo da habilidade e seu atributo base, permitindo filtros como magias baseadas em DX ou poderes baseados em IQ.

### Changed

- A sincronização de condições passivas passa a usar a lista configurada pelo mundo como fonte autoritativa e preserva a distinção entre condições gerenciadas e condições adicionadas manualmente.
- A configuração de duração do Item Efeito fica sempre visível e novos efeitos usam duração permanente por padrão, com indicações próprias para ações instantâneas.
- Campos de expressões e valores no editor de Efeito podem ser redimensionados manualmente, e os modos de modificador foram reorganizados para facilitar a leitura.
- A ocupação tática do canvas foi ampliada para grades quadradas, tokens de múltiplos espaços e atualização mais eficiente dos marcadores.
- A compatibilidade mínima passa a ser Foundry VTT 13, com verificação no Foundry VTT 14.

### Fixed

- Filtros por grupo visual consultam a organização local do ator, enquanto filtros por classificação continuam usando os dados internos do item; quando combinados, todos os critérios precisam corresponder.
- Configurações passivas exportadas preservam seus itens vinculados e podem ser reimportadas sem perder as referências necessárias.
- Solicitações e modificadores de rolagem preservam corretamente os novos contextos de habilidades durante a preparação e exibição do teste.

## [1.4.9-beta] - 2026-10-27

### Added

- Condições podem executar efeitos em fases específicas — entrada, evento, início do turno ou saída — e escolher se cada vínculo deve ser removido quando a condição terminar.
- Itens Condição aceitam Itens Efeito arrastados diretamente para sua lista de efeitos vinculados.
- Modificadores de equipamento importados do GCS podem conceder bônus de atributo, perícia nominal, reação e situação ao portador, além de propriedades equivalentes de Aparar, Bloqueio e ST efetiva.
- Cards de Magias e Poderes sinalizam quando recebem modificadores em suas rolagens.

### Changed

- Alterações manuais ou automatizadas de recursos do ator agora emitem eventos estruturados para o motor de condições, permitindo detectar cruzamentos de limiares de PV e PF independentemente da origem da mudança.
- O editor de Condição foi ampliado e reorganizado em três colunas; os controles de execução ficam centralizados e empilhados.
- Janelas de importação selecionam `Criar novo compêndio` por padrão quando permitido, e o filtro contextual inicia selecionado mesmo quando o personagem não possui relações contextuais.
- A ficha de fonte monetária abre com uma largura inicial maior.
- O manifesto usa o endereço de download específico da versão publicada, sem depender do marcador `latest` do GitHub.

### Fixed

- Efeitos consumidos ou ativados pela ficha de um ator mundial são aplicados ao próprio ator, sem serem desviados para um token ativo não vinculado.
- Vínculos de efeitos em Condições são normalizados quando o Foundry serializa a coleção como objeto indexado, evitando falhas ao reabrir a ficha.
- Barreiras de resistência distinguem sucesso e falha críticos exatos nas ramificações condicionais.
- A importação do GCS preserva em `gcs_features_unmapped` seletores sem equivalência segura, evitando bônus amplos ou semanticamente incorretos.

## [1.4.8-beta] - 2026-10-26

### Added

- A ficha recebeu uma referência compacta de Proezas Físicas com deslocamentos especiais, saltos sem e com impulso, retenção de respiração, capacidades de carga e calculadora de arremesso com dano.
- As proezas calculadas foram incorporadas aos atributos secundários, com suporte ao modelo padrão de modificadores, valores temporários, substituição manual e valor final.
- A régua do canvas pode usar o deslocamento final do personagem, distinguir trechos disponíveis, excedidos e de impulso, exibir o modificador de distância e reconhecer teletransporte e salto.
- A tabela de RD permite criar regiões manuais e equipamentos podem acrescentar regiões corporais que realmente não existem no perfil do personagem.

### Changed

- As proezas físicas passaram a abrir por um acesso compacto na ficha, enquanto deslocamentos especiais aparecem por ícones na barra lateral e as regras de carga ficam junto ao sumário de carga.
- O consumo de Magias e Poderes reconhece recursos e registros de combate criados por equipamentos, preservando a identidade correta da fonte.
- A busca de perícia vinculada aplica corretamente o nome selecionado e recebeu uma apresentação visual mais clara.
- O indicador de acúmulo da ocupação tática mantém tamanho visual estável ao alterar o zoom do canvas.

### Fixed

- Regiões de RD criadas manualmente podem ser removidas novamente, e a seleção de regiões usa busca textual com nomenclatura coerente para proteções existentes ou acrescentadas.
- Corrigida a resolução de registros fornecidos por equipamento nas diferentes modalidades de custo e consumo.
- Corrigida a integração entre a perícia escolhida na busca e o campo de perícia vinculada.

## [1.4.7-beta] - 2026-10-23

### Added

- O Escudo do Mestre agora identifica de forma sutil os alvos selecionados pelo Mestre e pelos jogadores, usando a cor individual de cada usuário para distinguir seus marcadores.
- Itens Efeito podem controlar o acúmulo também em aplicações diretas: acumular normalmente, manter uma única aplicação ou renovar a aplicação existente, recalculando suas ações persistentes e reiniciando a duração.
- A aba Condições da ficha mostra a quantidade de aplicações acumuladas de uma mesma ação persistente.

### Changed

- A coluna de cards do Escudo do Mestre mantém largura fixa de 290 px, e as defesas passivas distribuem seu conteúdo com espaçamento uniforme.
- O marcador de alvo do Escudo do Mestre foi posicionado no canto superior esquerdo dos cards para não encobrir os valores de PV.
- Aplicações diretas, condições e efeitos administrados pelo sistema usam domínios de acúmulo separados; passivos, concessões de equipamento, grupos de estado e automações de status preservam seus próprios ciclos de sincronização.

### Fixed

- Aplicações simultâneas de efeitos únicos ou renováveis são serializadas para impedir cópias persistentes duplicadas.
- O contexto de acúmulo é preservado quando a aplicação do efeito passa por uma barreira de resistência.
- Condições compartilham corretamente a propriedade de efeitos únicos ou renováveis até que a última condição vinculada seja desligada.

## [1.4.6-beta] - 2026-10-19

### Added

- A aplicação de dano agora emite um evento estruturado para condições passivas, com dano rolado, penetrante e lesão, tipo e natureza do dano, localização atingida, RD, recurso afetado, origem, alvo e contexto de combate.
- Efeitos ativos e condições passivas da aba Condições receberam visualização rápida pelo ícone, nome ou menu, reutilizando os mesmos cards dos demais itens e oferecendo fallback para status sem Item Efeito de origem.
- Testes criados pela ação Mensagem de Texto agora possuem controles de visibilidade para público, alvo e Mestre, somente alvo ou somente Mestre.

### Changed

- Atributos solicitados em testes aceitam aliases em português e inglês, incluindo `ST`, `DX`, `IQ`, `HT`, `Will`, `Per` e os sentidos correspondentes, em fichas, efeitos e Escudo do Mestre.
- Condições passivas podem avaliar os dados concretos da aplicação de dano; gatilhos como Ferimento Grave podem distinguir uma lesão única aplicada a PV de alterações narrativas ou em outros recursos.
- A janela de seleção de fontes de conteúdo ganhou dimensões estáveis e redimensionáveis, tratamento para nomes longos de compêndios, estilo integrado ao GUM e rodapé fixo para salvar.

### Fixed

- Operações assíncronas de status e efeitos ignoram com segurança atores sintéticos cujo token já foi removido, evitando travamentos de ficha, rolagens e erros de `EmbeddedCollection`.
- Vínculos de status nos modos substituir e atualizar não recriam continuamente o mesmo efeito aplicado.
- Cancelar um teste aberto por um card de Mensagem de Texto volta a liberar seu botão de rolagem.
- Modificadores de barreiras de resistência originadas por dano preservam o valor calculado a partir do evento que as criou.

## [1.4.5-beta] - 2026-10-18

### Added

- Exportação e importação autocontidas das configurações do Escudo do Mestre e dos status mundiais, incluindo os Itens Efeito e Modificadores do Mestre utilizados direta ou indiretamente.
- Importações de configuração agora oferecem prévia e os modos acrescentar, mesclar ou substituir; arquivos exportados registram referências não resolvidas e caminhos externos em um diagnóstico de portabilidade.
- Conjunto próprio de ícones distintos para condições, posturas, níveis de cobertura e demais status usados pelas configurações de GURPS.

### Changed

- JSONs de configuração portáteis resolvem referências locais em UUIDs estáveis de compêndio, preservam dependências compartilhadas e participam do rollback da importação; os formatos antigos continuam compatíveis.
- A configuração mundial de status agora persiste uma lista completa e autoritativa; os padrões do sistema servem apenas como referência inicial ou restauração, e `Substituir tudo` aplica exatamente a lista importada.
- Os quatro status de Choque agora usam ícones mais simples e legíveis, com identificação direta das penalidades de −1 a −4.

### Fixed

- Criação automática do compêndio de dependências usa a API namespaced e o esquema nativo do Foundry V13+, e sua janela de destino agora apresenta somente os campos pertinentes à opção selecionada.
- Vínculos de status no modo `refresh` não recriam mais efeitos continuamente em atores sintéticos, evitando travamento de tokens, fichas e rolagens.
- A sincronização de status ignora atores sintéticos órfãos durante a exclusão do token, eliminando erros de documentos incorporados inexistentes.

## [1.4.4-beta] - 2026-10-17

### Added

- Importação de pacotes JSON autocontidos (`gum-item-bundle`) que criam e sincronizam um Item raiz junto de seus Efeitos, Condições, Modificadores comuns e Modificadores de Equipamento, resolvendo referências locais em UUIDs do compêndio, organizando todos os tipos de Item em pastas próprias e revertendo gravações em caso de falha.
- Referências técnicas em português e inglês para geração de pacotes autocontidos por IA.

### Changed

- A prévia de pacotes autocontidos agora inclui pastas existentes, pastas a criar e colisões de IDs de pastas; reimportações preservam nomes, posições e movimentações manuais válidas.

### Fixed

- Validação antecipada de tipos de Item, localização e exclusividade das referências locais em pacotes autocontidos, recuperação de referências para pastas removidas e rollback independente por etapa.

## [1.4.3-beta] - 2026-10-13

### Added

- Ocupação tática de hexes do GURPS, opcional por configuração mundial: identifica tokens visíveis no mesmo hex e elevação, inclusive tokens de múltiplos hexes, com marcador no canvas e painel persistente para controlar, marcar como alvo, abrir a ficha ou configurar cada ocupante.
- Registro vinculado de integridade para equipamentos: PV máximo, PV atual e RD próprios, independente de cargas e disponível na aba Combate e na aplicação de dano.
- Caminho `all`/`todos` para modificadores de RD, aplicável a todas as localizações de proteção do personagem.

### Changed

- Tabela de RD, janela de dano e importação do GCS agora normalizam todos os perfis corporais, removendo localizações remanescentes e exibindo braços e pernas agrupados apenas quando seus valores de RD forem iguais.
- Itens Efeito, seus navegadores de contexto e finalidade, o card de entrada do comando `/gum` e partes complementares do Escudo do Mestre receberam internacionalização em português e inglês.
- A coluna de cards de personagens do Escudo do Mestre recebeu largura fixa um pouco maior, preservando o layout de duas colunas.

### Fixed

- Alternância de perfil corporal, especialmente após importação do GCS, volta corretamente ao conjunto de localizações humanoide padrão sem duplicar pernas, pés ou outras entradas.
- Aplicação de dano prioriza o token marcado como alvo e usa o token selecionado apenas quando não houver alvo.
- Efeitos com múltiplas ações de modificador de rolagem agora são todos considerados nas defesas ativas pelo Escudo do Mestre; o BD de equipamento não é duplicado.
- Cards de chat do GUM usam o hook moderno de renderização do Foundry V13+, removendo o aviso de API depreciada.

## [1.4.2-beta] - 2026-10-12

### Added

- API pública JavaScript `game.gum.api` v1, organizada por domínio, com resolução de documentos, erros estáveis, permissões, compatibilidade com macros antigas, documentação em português e inglês e declarações TypeScript.
- Fluxo nativo de consumo em magias e poderes, com fontes alternativas, confirmação de quantidade, custos por tentativa, sucesso ou falha e suporte a PV, PF, itens, reservas e registros de combate.
- Controles de `+` e `−` na confirmação de consumo e expressões de valor para o Modificador do Mestre.
- Solicitações de teste e barreiras de resistência agora oferecem rerrolagem diretamente no card de chat.

### Changed

- Fichas de magia e poder, consumo de recursos, mensagens de efeito e cartões de teste foram reorganizados e internacionalizados em português e inglês.
- Escudo do Mestre passou a ter um layout responsivo, com coluna de personagens fixa, solicitação de teste dedicada e controles rápidos compactos no rodapé da área principal.
- Seletor de status dos efeitos agora pesquisa os status configurados pelo mundo e privilegia o nome visível em vez do identificador interno.
- Entradas de Modificador do Mestre agora preservam valores como expressões e aceitam fórmulas de dados, JavaScript e a linguagem condicional compartilhada com Itens Efeito.
- Cards de resultado de testes e dano, além da janela de aplicação de dano, agora exibem seus controles e resultados em português ou inglês; a busca de localizações de proteção aceita nomes nos dois idiomas.

### Removed

- Compêndios inerentes do sistema; mesas passam a usar apenas compêndios criados e configurados pelo próprio usuário, preservados nas atualizações.

### Fixed

- Reimportações do GCS agora reconciliam os modos de ataque existentes, sem duplicá-los ao atualizar uma ficha.
- Alternativas de consumo, cartões de favoritos com efeitos de uso, solicitações de teste e cards de resistência receberam correções de contraste, alinhamento e comportamento.
- A rolagem de dano básico pela barra lateral agora inclui os danos secundários configurados; o dano de acompanhamento mantém sua aplicação independente.

## [1.4.1-beta] - 2026-10-10

### Added

- Configuração mundial de status do token, com ordenação refletida no HUD, edição de nome e ícone, vínculos de efeitos, revisão de referências, restauração dos padrões e importação ou exportação em JSON.
- Arrastar e soltar Itens Efeito e Modificadores em fichas de itens, com permissão configurável por nível de usuário.
- Contagem opcional de acertos por tiro rápido conforme margem de sucesso, Rcl e munição disparada, integrada aos cards de ataque e dano.
- Distribuição de pagamentos de modelos entre múltiplas fontes monetárias do personagem.

### Changed

- Aplicação de modelos por dinheiro passou a separar os modos de gasto, aceitar limite vazio como ilimitado e apresentar totais monetários coerentes em todas as etapas.
- Entradas de equipamento em modelos agora separam nível e valor em pontos, podem bloquear alterações de quantidade e preservam escolhas garantidas importadas do GCS.
- Arrastar um Item Modelo para uma ficha de personagem agora inicia diretamente seu fluxo de aplicação.
- Importação de bibliotecas para compêndios recebeu prévia de sincronização, explicação do critério por ID, aviso sobre nomes iguais, textos mais claros e interface internacionalizada.
- Consumo de munição passou a respeitar o modo do equipamento — quantidade ou cargas — inclusive quando a própria arma é sua fonte de munição.
- Cards de equipamentos exibem as cargas restantes em todas as localizações da ficha.

### Removed

- Compêndio legado de Automações de Status, substituído pela configuração mundial de status.

### Fixed

- Avisos de compatibilidade do Foundry v13 ao mover itens para compêndios e ao remover metadados de aplicações de modelos.
- Processamento de arrastar e soltar que encaminhava eventos incompatíveis à API de `DragEvent` do Foundry.
- Contraste, alinhamento e dimensionamento das janelas de status, importação de compêndios, configuração de modelos e seleção de fontes de pagamento.
- Organização dos controles de conflitos e do resumo final na aplicação de modelos.

## [1.4.0-beta] - 2026-10-09

### Added

- Novo fluxo de aplicação de modelos, com etapas configuráveis, escolhas, pacotes, limites de atributos e orçamentos compartilhados de pontos e dinheiro.
- Perfis de munição vinculáveis aos equipamentos, com seleção durante o ataque e aplicação segura das alterações de dano.
- Visualizações separadas para Ações de Combate e Favoritos, agrupamento dos favoritos por tipo de item e filtros por grupo de ataque.
- Expansão mecânica em todos os cards de magias e poderes, incluindo conjuração ou ativação, duração, custo e manutenção sem cortes.

### Changed

- Ficha do personagem recebeu um padrão visual mais compacto e consistente para perícias, características, condições, magias, poderes, aspectos sociais e combate.
- Cards de magias e poderes passaram a aceitar arrastar e soltar, expansão persistente e menus de ações unificados; o mesmo padrão foi aplicado aos favoritos de combate.
- Cabeçalhos, cards, menus e janelas auxiliares das áreas revisadas receberam internacionalização ampliada em português e inglês.
- Aba de combate, tabela de RD, barra lateral e editor de atributos secundários foram reorganizados para melhorar leitura e reduzir ruído visual.
- Reservas de energia e de poder agora aceitam saldos negativos em seus registros.
- Editor de atributos secundários passou a exibir por extenso os nomes das modalidades de dano básico.

### Fixed

- Prévia de arraste de perícias e magias agora representa somente o card selecionado, sem capturar a ficha ou o grupo inteiro.
- Expansão de cards sociais deixou de recolher o grupo ou a aba inteira, e seus menus de opções voltaram a responder corretamente.
- Textos extensos dos cards revisados agora quebram linha ou ficam disponíveis na expansão, evitando perda silenciosa de informações.
- Colisões entre classes visuais legadas e os novos componentes de cards, cabeçalhos e menus foram removidas.

## [1.3.2-beta] - 2026-10-05

### Added

- Modificadores de equipamento com features estruturadas para propriedades, RD localizada, modos de ataque, descritores e efeitos concedidos.
- Reservas de uso/carga de equipamentos, com suporte a registros de combate, poder ou magia e à visibilidade configurável conforme a localização do item.
- Bônus de Defesa (BD) ativável por equipamento: aplica-se a Esquiva, Aparar e Bloqueio, com indicação opcional no chat quando determina um sucesso ou falha.

### Changed

- Fichas de equipamento e modificador de equipamento reorganizadas com campos em cards, tooltips e layout mais compacto.
- Modos de ataque concedidos ou modificados passaram a exibir seus valores e alterações resolvidos na ficha de equipamento.
- Controles de efeitos acionáveis por evento de uso foram separados dos demais controles nos cards de itens.
- Textos das fichas de equipamento e modificador receberam cobertura ampliada em português e inglês.

### Fixed

- Operações de substituição em propriedades de carga agora sobrescrevem corretamente o valor local do equipamento.
- Valores finais de BD preservam outros modificadores de efeito ao atualizar as defesas ativas e as rolagens.

## [1.3.1-beta] - 2026-09-27

### Added

- Acrescentado expressões condicionais para valores de itens efeito

## [1.3.0-beta] - 2026-09-20

### Added

- Serviço central e janela de configuração para escolher, ordenar e validar múltiplas fontes de conteúdo por função do sistema.
- Suporte a fontes configuráveis nos navegadores, solicitações de teste, modificadores de rolagem, condições passivas, vínculos de status e importação híbrida de personagens.
- Migração automática da configuração legada de Vínculos de Status.
- Organização híbrida de perícias e características, com grupos personalizados, ordenação manual e controles integrados à ficha.
- Importação de bibliotecas do GCS com reconstrução da hierarquia de contêineres de equipamentos.

### Changed

- Navegadores e automações deixaram de depender de IDs fixos de compêndios e passaram a preservar a identidade completa das fontes.
- Importação híbrida passou a priorizar Itens do mundo, fontes configuradas e, opcionalmente, outros compêndios.
- Compêndios funcionais do GUM passaram a ser organizados em uma única pasta raiz `GUM`.
- Janela de Fontes de Conteúdo recebeu apresentação visual mais sóbria, compacta e objetiva.
- Cartões e diálogos de perícias, cabeçalhos de características e abas de equipamentos foram reorganizados para melhorar leitura e navegação.
- Importador de compêndios ganhou seleção mais clara, ações revisadas e melhor tratamento de bibliotecas e contêineres do GCS.
- Resultado dos testes de barreira de resistência passou a apresentar as margens de forma mais clara.
- Contêineres de equipamentos passaram a oferecer melhor feedback de carga, ordenação por arraste e movimentação automática de itens.

### Removed

- Compêndios distribuídos de Vantagens, Desvantagens, Equipamentos, Magias e Poderes, agora substituíveis por bibliotecas mundiais configuradas pelo Mestre.

### Fixed

- Colisões de IDs locais entre documentos de compêndios diferentes nos navegadores.
- Inicialização prematura do serviço de fontes antes da disponibilidade de `game`, `game.settings` e `game.packs`.
- Seleção ambígua de perícias com mesmo nome e especializações diferentes durante importações e solicitações.
- Sincronização de Condições Passivas voltou a adicionar regras novas aos personagens existentes, além de atualizar as cópias já vinculadas.
- Cálculo, visibilidade e valores ARIA do progresso de carga dos contêineres de equipamentos.
- Escopo de operações de arrastar e soltar, preservando a ordem de contêineres e evitando movimentações indevidas.
- Contraste dos seletores e disponibilidade das ações na janela de importação de compêndios.

## [1.0.0] - 2026-08-01

Primeira versão pública do GURPS GUM para Foundry VTT.

### Added

- Ficha de personagem com atributos, recursos, cálculos derivados, carga e organização de perícias, vantagens, desvantagens, equipamentos, magias e poderes.
- Tipos de item e fichas próprias para os principais elementos do sistema.
- Motor de efeitos, condições, gatilhos, vínculos de status e regras passivas.
- Aplicação de dano com suporte às principais avaliações usadas pelo GUM.
- Navegadores de modificadores, efeitos, condições, gatilhos, modelos e modificadores de equipamento.
- Escudo do Mestre e ferramentas de apoio à condução da sessão.
- Compêndios públicos e estrutura de conteúdo reutilizável.
- Importação de personagens e modelos do GCS.
- Importação e exportação de compêndios em JSON, com preservação de IDs e sincronização segura.
- Exportação de fichas de personagem em JSON.
- Guia de publicação (`RELEASE.md`) e validação automática do manifesto e da estrutura mínima.

### Changed

- Interface das fichas e itens reorganizada para facilitar leitura e uso durante a sessão.
- Abas de magias e poderes aprimoradas, incluindo habilidade de conjuração e reservas de energia.
- Apresentação de condições, efeitos e ícones de status aprimorada.
- `system.json` preparado para instalação e atualização por Manifest URL.
