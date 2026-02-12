# Changelog

Todas as mudanças relevantes deste projeto serão documentadas neste arquivo.

O formato segue uma adaptação de [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e usa [SemVer](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2026-02-12

### Added
- Estrutura de changelog oficial para acompanhamento de releases.
- Guia de release (`RELEASE.md`) com padrão de empacotamento e publicação.
- Workflow de validação (`.github/workflows/validate.yml`) para manifesto e estrutura mínima.

### Changed
- `system.json` atualizado para:
  - usar URLs `raw.githubusercontent.com` em `manifest` e `readme`;
  - adicionar `download` para atualização automática por release zip;
  - adicionar `changelog`;
  - padronizar compatibilidade mínima para Foundry v12.
- `README.md` reescrito com:
  - instalação por manifest URL;
  - instalação manual;
  - troubleshooting;
  - política de versionamento e links de suporte.