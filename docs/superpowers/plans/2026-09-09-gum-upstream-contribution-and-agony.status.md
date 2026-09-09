| Task | Status | Owner | Evidence | Gate result | Next action |
|---|---|---|---|---|---|
| 1 | COMPLETE | main | User instructions captured in plan | passed | keep contribution commits independently reviewable |
| 2 | COMPLETE | main | GCS source, condition/effect schema, B428 rule and reusable Deitado effect verified | passed | preserve source notes for the future importer |
| 3 | COMPLETE | main | V3 migration converts Agonia to `condition`, links incapacity and Deitado, and creates/updates the reusable effect | passed | validate in the test world |
| 4 | COMPLETE | main | Foundry restarted; Agonia sheet shows official PT-BR description and both linked effects; activation created two ActiveEffects on the active synthetic token | passed | user can restart/refresh and playtest |
| 5 | COMPLETE | main | `633ebf5` condições/motor, `83de6fb` SVGs, `c55ff66` documentação, `5c24f17` retomada testada, `ccf6be0` autocontrole na Agonia e `08562e4` migração V4 | passed | revisão humana; sem push |

Playtest note: the actor sidebar opens the base Actor document, while Foundry applies condition effects to the active Token Actor. The test logs confirmed the Agonia and Deitado ActiveEffects were created on that synthetic actor.

Os arquivos GCS e os artefatos LevelDB de `packs/conditions` foram deliberadamente excluídos. A contribuição usa apenas a proveniência já armazenada nos Itens e não modifica a biblioteca do GCS.

Validação adicional: o sistema foi sincronizado com a instalação local do Foundry, o mundo `teste` foi recarregado e a migração mostrou as oito condições incapacitantes com SVGs dedicados. Asfixia exibiu os vínculos `Condição — Asfixia` e `Deitado`; Agonia exibiu `Agonia — Incapacitação`, `Deitado` e a entrada de autocontrole em `check_dx,skill_dx,check_iq,skill_iq,self_control`.
