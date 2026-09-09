# GUM Upstream Contribution and Agonia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the validated GCS imports, Portuguese condition data, passive pain conditions, SVG assets, and importer improvements into reviewable upstream contributions, while first making Agonia a rules-faithful playable GUM condition.

**Architecture:** Keep GCS source files as provenance inputs, represent playable conditions as GUM `condition` Items linked to reusable `effect` Items, and apply existing world/compendium records through an idempotent migration. Separate upstream commits by concern so the maintainer can review importer code, condition content, assets, and reported limitations independently.

**Tech Stack:** Foundry VTT document API, GUM JavaScript modules, LevelDB compendium packs, GCS `.adq` files, SVG assets, Node syntax checks, Git.

---

## User Requirements Captured as Specification

- Preserve the original GCS file and the Portuguese translation:
  - `C:/Users/User/GCS/Master Library/Basic Set/Conditions.adq`
  - `C:/Users/User/GCS/Master Library/Basic Set/Conditions_pt_br.adq`
- Prepare SVGs for the remaining condition icons and include the passive pain conditions.
- Include the GCS importer update and document the problems found during testing.
- Use separate commits by concern so a human reviewer can inspect each change.
- First finish and test the Portuguese `Agonia` condition using official GURPS rules.
- Use existing GUM effects whenever they represent the rule; create a new effect only when no existing effect is suitable.
- Use a migration so the user can restart Foundry and inspect the result without manually reconstructing the item.
- Do not update the GCS application or its source files.

## Current Facts

- The importer maps `.adq` content to `advantage` by default in `module/utils/gcs-item-import-conversion.mjs`; an imported GCS condition therefore requires conversion to a GUM `condition` Item before it can participate in condition automation.
- GUM condition Items use `system.bindingMode`, `system.when`, `system.effects`, and `system.statusBinding`; the condition sheet is implemented in `scripts/apps/condition-sheet.js` and `templates/items/condition-sheet.hbs`.
- The live `gum.conditions` pack contains a Portuguese `Agonia` imported as an `advantage` (`c38FgJzgBXA0hoC8`) and an English `Agony` source record. The user-created Choque conditions use event-driven `when` expressions and link the existing Choque effects.
- The existing effect pack contains reusable effects for pain and incapacity, including `Fazer Nada` and `Deitado`; the migration must verify exact UUIDs before linking them.
- Direct edits to the LevelDB pack while Foundry is running are unsafe. The migration must execute through the loaded GUM system after restart.

## Task List

### Task 1: Freeze the contribution specification

**Files:**
- Create: `docs/superpowers/plans/2026-09-09-gum-upstream-contribution-and-agony.md`
- Create: `docs/superpowers/plans/2026-09-09-gum-upstream-contribution-and-agony.status.md`

- [ ] Record the source paths, contribution boundaries, commit split, and Agonia acceptance criteria in the plan.
- [ ] Keep the GCS files read-only and treat their contents as data.

### Task 2: Analyze Agonia source and reusable effects

**Files:**
- Read: `C:/Users/User/GCS/Master Library/Basic Set/Conditions.adq`
- Read: `C:/Users/User/GCS/Master Library/Basic Set/Conditions_pt_br.adq`
- Read: `scripts/apps/condition-sheet.js`
- Read: `templates/items/condition-sheet.hbs`
- Read: `packs/conditions`
- Read: `packs/efeitos`

- [ ] Confirm the Portuguese source text, reference `B428`, and GCS provenance fields.
- [ ] Confirm Agonia's playable behavior: conscious but unable to take voluntary actions except moaning/screaming; fall if standing or sitting; lose 1 FP per minute or fraction while agony lasts; after recovery, threat of renewed pain grants +3 to Interrogation and Intimidation, doubled by Low Pain Threshold.
- [ ] Confirm High Pain Threshold behavior from the source/rules and avoid silently inventing a resistance roll.
- [ ] Identify the exact reusable effect UUIDs for incapacity and falling; if either does not model the rule, define a narrowly scoped new effect.

### Task 3: Implement Agonia migration

**Files:**
- Modify: `scripts/main.js`
- Modify: `module/settings.js`
- Test: `node --check scripts/main.js`

- [ ] Add a GM-only, idempotent migration keyed by a new world setting.
- [ ] Locate the Portuguese imported Agonia by stable GCS provenance when available, with a name fallback limited to `Agonia`.
- [ ] Convert the target Item to `type: "condition"` and populate only the condition fields required by the sheet and engine.
- [ ] Link existing reusable effects and preserve the original GCS text/provenance in the description and flags.
- [ ] Do not create a damage trigger for Agonia unless the official rule and GUM event model provide a reliable trigger; Agonia is manually inflicted by the GM in this first implementation.
- [ ] Ensure the migration can be rerun safely after a failed update and records success only after all writes succeed.

### Task 4: Validate the Agonia result in Foundry

**Files:**
- Read: live Foundry `gum.conditions` and `gum.efeitos` documents after restart.
- Modify: none unless validation exposes a defect.

- [ ] Restart the Foundry world as GM after the migration is installed.
- [ ] Verify the Item appears under conditions, opens in the condition sheet, shows the intended icon, and lists the linked effects.
- [ ] Verify applying/removing Agonia adds/removes only the intended effects.
- [ ] Verify no HT resistance roll is introduced.
- [ ] Record any limitation that cannot be automated faithfully, especially per-minute FP loss and the post-recovery social bonus.

### Task 5: Prepare upstream contribution commits

**Files:**
- Modify: importer files already changed on `codex/templates-safe-lifecycle`.
- Add: original and translated GCS source files in a clearly documented contribution area, if the maintainer accepts source data in-repo.
- Modify: `packs/conditions` and `packs/efeitos` through a safe Foundry export/pack update workflow.
- Add: condition SVG assets under `icons/svg`.
- Modify: docs describing importer behavior and known conversion limitations.

- [ ] Commit importer changes separately from content changes.
- [ ] Commit condition/effect data separately from SVG assets.
- [ ] Commit GCS source files and translation separately, preserving attribution and provenance.
- [ ] Add a human-readable issue report covering `[object Object]` prerequisites, translation identity, and any remaining automation gaps.
- [ ] Test a clean install/world before proposing a pull request to `V3-code/GURPS-GUM`.

## Acceptance Criteria for Agonia

- The imported Portuguese Agonia is a GUM `condition` Item, not an `advantage`.
- The condition can be manually applied by the GM and removed cleanly.
- The condition links reusable effects for incapacitation and falling when those effects match the rule.
- The description retains the official GCS rule text and reference `B428`.
- No resistance barrier or automatic HT roll is configured.
- Migration is idempotent, GM-only, and safe to retry.
- `node --check scripts/main.js` and `git diff --check` pass after implementation.

## Risk and Rollback

| Risk | Mitigation | Rollback |
|---|---|---|
| Updating a LevelDB pack while Foundry is open corrupts data | Apply changes through migration after restart | Restore the pack/world backup and remove the migration flag |
| Changing an Item from `advantage` to `condition` drops system fields | Build the condition payload from the existing document and preserve provenance | Revert the migration commit and restore the prior Item export |
| Existing effect UUID differs between worlds | Resolve by UUID, verify by name, and fail without partial success | Remove the condition links and rerun after correcting the mapping |
| GCS source license or upstream policy disallows redistribution | Ask V3-Code before publishing source files or a modified release | Keep files in a private review branch only |
