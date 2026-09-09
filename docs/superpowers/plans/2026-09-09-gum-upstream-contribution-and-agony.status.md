| Task | Status | Owner | Evidence | Gate result | Next action |
|---|---|---|---|---|---|
| 1 | COMPLETE | main | User instructions captured in plan | passed | keep contribution commits independently reviewable |
| 2 | COMPLETE | main | GCS source, condition/effect schema, B428 rule and reusable Deitado effect verified | passed | preserve source notes for the future importer |
| 3 | COMPLETE | main | V3 migration converts Agonia to `condition`, links incapacity and Deitado, and creates/updates the reusable effect | passed | validate in the test world |
| 4 | COMPLETE | main | Foundry restarted; Agonia sheet shows official PT-BR description and both linked effects; activation created two ActiveEffects on the active synthetic token | passed | user can restart/refresh and playtest |
| 5 | PENDING | main | Contribution scope defined, but upstream commits are intentionally deferred until Agonia playtest is accepted | pending | prepare original GCS, translation, SVGs, importer update and issue report as separate commits |

Playtest note: the actor sidebar opens the base Actor document, while Foundry applies condition effects to the active Token Actor. The test logs confirmed the Agonia and Deitado ActiveEffects were created on that synthetic actor.
