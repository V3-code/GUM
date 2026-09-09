# Ícone de Bêbado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Bêbado condition icon with a recognizable medieval beer mug.

**Architecture:** Keep the existing condition reference and migration unchanged. Replace only the SVG asset used by `Bêbado`, preserving the module's black-and-white 512×512 icon style.

**Tech Stack:** SVG, Node.js XML parsing, Git.

---

### Task 1: Create and validate the Bêbado icon

**Files:**
- Modify: `icons/svg/state.svg/drunk.svg`
- Test: SVG XML parsing and `git diff --check`

- [ ] **Step 1: Replace the asset** with a side-view medieval tankard tilted to one side, visible handle, irregular foam, and three beer droplets; use only black and white fills and no text.
- [ ] **Step 2: Validate the asset** with Node's XML parser and run `git diff --check`.
- [ ] **Step 3: Commit** with `fix: atualiza icone de bebado`.
