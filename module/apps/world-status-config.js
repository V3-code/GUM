import { GUM } from "../config.js";
import { EffectBrowser } from "./effect-browser.js";
import { contentSourceService } from "../services/content-source-service.mjs";
import {
  buildConfigurationBundle,
  combineConfigurationImport,
  parseConfigurationBundle
} from "../utils/configuration-bundle-json.mjs";
import { chooseConfigurationImportMode, importConfigurationBundle } from "./configuration-bundle-import.js";
import {
  WORLD_STATUS_SCHEMA_VERSION,
  WORLD_STATUS_SETTING,
  buildWorldStatusCleanupPlan,
  buildWorldStatusConfiguration,
  collectWorldStatusActors,
  collectInvalidWorldStatusReferences,
  collectWorldStatusDependencies,
  localizeBaseStatuses,
  materializeWorldStatusConfiguration,
  normalizeWorldStatusConfiguration,
  normalizeWorldStatusId,
  resolveWorldStatusRows
} from "../utils/world-status-config.mjs";

const EXPORT_FORMAT = "gum-world-status-configuration";

export class WorldStatusConfig extends FormApplication {
  constructor(...args) {
    super(...args);
    this.rows = null;
    this.configuration = null;
    this.loadedLegacyBindings = false;
    this.pendingCleanupIds = new Set();
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "gum-world-status-config",
      title: "GUM.WorldStatus.Title",
      template: "systems/gum/templates/apps/world-status-config.hbs",
      classes: ["gum", "world-status-config", "theme-dark"],
      width: 940,
      height: 720,
      resizable: true,
      closeOnSubmit: true,
      scrollY: [".world-status-list"]
    });
  }

  get baseStatuses() {
    return localizeBaseStatuses(GUM.statusEffects, key => game.i18n.localize(key));
  }

  async getData() {
    const context = await super.getData();
    if (!this.rows) await this._loadRows();
    const preparedRows = await Promise.all(this.rows.map(async (row, index) => ({
      ...row,
      index: index + 1,
      canMoveUp: index > 0,
      canMoveDown: index < this.rows.length - 1,
      linkedEffects: await Promise.all(row.effectUuids.map(async uuid => {
        const effect = await fromUuid(uuid).catch(() => null);
        return {
          uuid,
          name: effect?.name || game.i18n.localize("GUM.WorldStatus.MissingEffect"),
          img: effect?.img || "icons/svg/hazard.svg",
          missing: !effect
        };
      }))
    })));
    return {
      ...context,
      statuses: preparedRows,
      loadedLegacyBindings: this.loadedLegacyBindings
    };
  }

  async _loadRows() {
    this.configuration = materializeWorldStatusConfiguration(
      this.baseStatuses,
      game.settings.get("gum", WORLD_STATUS_SETTING)
    );
    this.rows = resolveWorldStatusRows(this.baseStatuses, this.configuration);
    if (!this.configuration.bindingsMigrated) await this._loadLegacyBindings();
  }

  async _loadLegacyBindings() {
    const { documents, invalidSources } = await contentSourceService.getDocuments("statusBindings");
    if (invalidSources.length) console.warn("GUM | Legacy status binding sources unavailable:", invalidSources);
    const rules = documents.filter(document => document.system?.bindingMode === "status-link");
    if (!rules.length) return;

    for (const rule of rules) {
      const binding = rule.system?.statusBinding || {};
      const statusId = normalizeWorldStatusId(binding.statusId);
      if (!statusId || binding.enabled === false) continue;
      let row = this.rows.find(candidate => candidate.id === statusId);
      if (!row) {
        row = {
          id: statusId,
          name: rule.name || statusId,
          img: (CONFIG.statusEffects || []).find(status => status.id === statusId)?.img || rule.img || "icons/svg/aura.svg",
          effectUuids: [],
          legacyRuleUuids: [],
          stackMode: "refresh",
          stackLimit: 1,
          removeOnStatusOff: true,
          custom: true,
          enabled: true
        };
        this.rows.push(row);
      }
      row.effectUuids = [...new Set([
        ...row.effectUuids,
        ...(Array.isArray(rule.system?.effects) ? rule.system.effects.map(link => link?.uuid).filter(Boolean) : [])
      ])];
      row.legacyRuleUuids = [...new Set([...(row.legacyRuleUuids || []), rule.uuid].filter(Boolean))];
      row.stackMode = binding.stackMode || row.stackMode;
      row.stackLimit = Math.max(1, Number(binding.stackLimit) || row.stackLimit);
      row.removeOnStatusOff = binding.removeOnStatusOff !== false;
    }
    this.loadedLegacyBindings = true;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='add-status']").on("click", event => this._addStatus(event));
    html.find("[data-action='remove-status']").on("click", event => this._removeStatus(event));
    html.find("[data-action='inspect-status']").on("click", event => this._inspectStatus(event));
    html.find("[data-action='move-up']").on("click", event => this._moveStatus(event, -1));
    html.find("[data-action='move-down']").on("click", event => this._moveStatus(event, 1));
    html.find("[data-action='choose-icon']").on("click", event => this._chooseIcon(event));
    html.find("[data-action='choose-effect']").on("click", event => this._chooseEffects(event));
    html.find("[data-action='remove-effect']").on("click", event => this._removeEffect(event));
    html.find("[data-action='import']").on("click", event => this._importConfiguration(event));
    html.find("[data-action='export']").on("click", event => this._exportConfiguration(event));
    html.find("[data-action='review-references']").on("click", event => this._reviewInvalidReferences(event));
    html.find("[data-action='restore-defaults']").on("click", event => this._restoreDefaults(event));
    html.find("[data-action='cancel']").on("click", event => { event.preventDefault(); this.close(); });
    html.find("[name='status-search']").on("input", event => this._filterRows(event));
  }

  _syncRowsFromForm() {
    if (!this.form) return;
    for (const element of this.form.querySelectorAll("[data-status-id]")) {
      const row = this.rows.find(candidate => candidate.id === element.dataset.statusId);
      if (!row) continue;
      const name = String(element.querySelector("[data-field='name']")?.value || row.name).trim() || row.id;
      if (name !== row.name) row.nameKey = "";
      row.name = name;
      row.img = String(element.querySelector("[data-field='img']")?.value || row.img).trim() || "icons/svg/aura.svg";
      const stackMode = element.querySelector("[data-field='stackMode']")?.value;
      row.stackMode = ["refresh", "replace", "stack"].includes(stackMode) ? stackMode : "refresh";
      row.stackLimit = Math.max(1, Number(element.querySelector("[data-field='stackLimit']")?.value) || 1);
      row.removeOnStatusOff = element.querySelector("[data-field='removeOnStatusOff']")?.checked !== false;
    }
  }

  _rowIdFromEvent(event) {
    return event.currentTarget.closest("[data-status-id]")?.dataset.statusId;
  }

  _addStatus(event) {
    event.preventDefault();
    this._syncRowsFromForm();
    let id;
    do id = `world_${foundry.utils.randomID().toLowerCase()}`;
    while (this.rows.some(row => row.id === id));
    this.rows.push({
      id,
      name: game.i18n.localize("GUM.WorldStatus.NewStatus"),
      img: "icons/svg/aura.svg",
      effectUuids: [],
      legacyRuleUuids: [],
      stackMode: "refresh",
      stackLimit: 1,
      removeOnStatusOff: true,
      custom: true,
      enabled: true
    });
    this.render();
  }

  async _removeStatus(event) {
    event.preventDefault();
    this._syncRowsFromForm();
    const id = this._rowIdFromEvent(event);
    const row = this.rows.find(candidate => candidate.id === id);
    if (!row) return;
    const dependencies = await this._collectStatusDependencies(id);
    const choice = await new Promise(resolve => new Dialog({
      title: game.i18n.format("GUM.WorldStatus.DeleteTitle", { name: row.name }),
      content: `<div class="world-status-delete-summary"><p>${game.i18n.format("GUM.WorldStatus.DeleteConfirm", {
        effects: row.effectUuids.length,
        active: dependencies.activeEffects.length,
        references: dependencies.referencingItems.length + dependencies.referencingRules.length
      })}</p><p>${game.i18n.localize("GUM.WorldStatus.DeleteChoiceHint")}</p></div>`,
      buttons: {
        keep: {
          icon: '<i class="fas fa-eye-slash"></i>',
          label: game.i18n.localize("GUM.WorldStatus.DeleteKeepEffects"),
          callback: () => resolve("keep")
        },
        cleanup: {
          icon: '<i class="fas fa-broom"></i>',
          label: game.i18n.localize("GUM.WorldStatus.DeleteAndCleanup"),
          callback: () => resolve("cleanup")
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("GUM.WorldStatus.Cancel"),
          callback: () => resolve(null)
        }
      },
      default: "cancel",
      close: () => resolve(null)
    }, {
      classes: ["dialog", "gum", "gum-sheet-edit-dialog", "world-status-delete-dialog"],
      width: 600
    }).render(true));
    if (!choice) return;
    if (choice === "cleanup") this.pendingCleanupIds.add(id);
    else this.pendingCleanupIds.delete(id);
    this.rows = this.rows.filter(row => row.id !== id);
    this.render();
  }

  async _collectStatusDependencies(statusId) {
    const row = this.rows.find(candidate => candidate.id === statusId);
    const [effectSources, bindingSources] = await Promise.all([
      contentSourceService.getDocuments("effects").catch(error => ({ documents: [], invalidSources: [{ error }] })),
      contentSourceService.getDocuments("statusBindings").catch(error => ({ documents: [], invalidSources: [{ error }] }))
    ]);
    const legacyRules = await Promise.all((row?.legacyRuleUuids || []).map(uuid => fromUuid(uuid).catch(() => null)));
    const actors = this._statusActors();
    const items = [
      ...Array.from(game.items || []),
      ...actors.flatMap(actor => Array.from(actor.items || [])),
      ...effectSources.documents
    ];
    return collectWorldStatusDependencies(statusId, {
      actors,
      items,
      bindingRules: [...bindingSources.documents, ...legacyRules.filter(Boolean)]
    });
  }

  async _collectInvalidReferences() {
    const [effectSources, bindingSources] = await Promise.all([
      contentSourceService.getDocuments("effects").catch(() => ({ documents: [] })),
      contentSourceService.getDocuments("statusBindings").catch(() => ({ documents: [] }))
    ]);
    const actors = this._statusActors();
    const items = [
      ...Array.from(game.items || []),
      ...actors.flatMap(actor => Array.from(actor.items || [])),
      ...effectSources.documents
    ];
    return collectInvalidWorldStatusReferences(this.rows.map(row => row.id), {
      actors,
      items,
      bindingRules: bindingSources.documents
    });
  }

  _statusActors() {
    return collectWorldStatusActors({
      worldActors: game.actors,
      scenes: game.scenes,
      canvasTokens: globalThis.canvas?.tokens?.placeables
    });
  }

  async _inspectStatus(event) {
    event.preventDefault();
    this._syncRowsFromForm();
    const id = this._rowIdFromEvent(event);
    const row = this.rows.find(candidate => candidate.id === id);
    if (!row) return;
    const dependencies = await this._collectStatusDependencies(id);
    const escape = value => foundry.utils.escapeHTML(String(value || ""));
    const list = (entries, getLabel, getUuid, emptyKey) => entries.length
      ? `<ul>${entries.map(entry => {
        const uuid = getUuid(entry);
        const openButton = uuid ? `<button type="button" data-action="open-dependency" data-uuid="${escape(uuid)}" title="${game.i18n.localize("GUM.WorldStatus.OpenDependency")}"><i class="fas fa-arrow-up-right-from-square"></i></button>` : "";
        return `<li><span>${escape(getLabel(entry))}</span>${openButton}</li>`;
      }).join("")}</ul>`
      : `<p class="notes">${game.i18n.localize(emptyKey)}</p>`;
    const linkedEffects = await Promise.all(row.effectUuids.map(uuid => fromUuid(uuid).catch(() => null)));
    const content = `<div class="world-status-dependency-report">
      <section><h3>${game.i18n.localize("GUM.WorldStatus.LinkedEffects")}</h3>${list(
        row.effectUuids.map((uuid, index) => ({ uuid, document: linkedEffects[index] })),
        entry => entry.document?.name || entry.uuid,
        entry => entry.document?.uuid,
        "GUM.WorldStatus.NoEffects"
      )}</section>
      <section><h3>${game.i18n.localize("GUM.WorldStatus.ActiveUsages")}</h3>${list(
        dependencies.activeEffects,
        entry => `${entry.actor?.name || "?"} — ${entry.effect?.name || entry.effect?.id || "?"}`,
        entry => entry.effect?.uuid || entry.actor?.uuid,
        "GUM.WorldStatus.NoActiveUsages"
      )}</section>
      <section><h3>${game.i18n.localize("GUM.WorldStatus.ItemReferences")}</h3>${list(
        dependencies.referencingItems,
        item => `${item.name || item.id} (${item.uuid || item.type || "Item"})`,
        item => item.uuid,
        "GUM.WorldStatus.NoItemReferences"
      )}</section>
      <section><h3>${game.i18n.localize("GUM.WorldStatus.LegacyReferences")}</h3>${list(
        dependencies.referencingRules,
        rule => rule.name || rule.uuid || rule.id,
        rule => rule.uuid,
        "GUM.WorldStatus.NoLegacyReferences"
      )}</section>
    </div>`;
    new Dialog({
      title: game.i18n.format("GUM.WorldStatus.DependenciesTitle", { name: row.name }),
      content,
      buttons: { close: { label: game.i18n.localize("GUM.WorldStatus.Close") } },
      default: "close",
      render: html => html.find("[data-action='open-dependency']").on("click", event => this._openDependency(event))
    }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "world-status-dependency-dialog"], width: 640 }).render(true);
  }

  async _openDependency(event) {
    event.preventDefault();
    const uuid = event.currentTarget.dataset.uuid;
    const document = uuid ? await fromUuid(uuid).catch(() => null) : null;
    const sheet = document?.sheet || document?.parent?.sheet;
    if (!sheet) {
      ui.notifications.warn(game.i18n.localize("GUM.WorldStatus.DependencyNotFound"));
      return;
    }
    sheet.render(true);
  }

  async _reviewInvalidReferences(event) {
    event.preventDefault();
    this._syncRowsFromForm();
    const report = await this._collectInvalidReferences();
    const escape = value => foundry.utils.escapeHTML(String(value || ""));
    const line = (label, uuid, statuses) => `<li><span>${escape(label)} <small>${escape(statuses.join(", "))}</small></span>${uuid
      ? `<button type="button" data-action="open-dependency" data-uuid="${escape(uuid)}" title="${game.i18n.localize("GUM.WorldStatus.OpenDependency")}"><i class="fas fa-arrow-up-right-from-square"></i></button>`
      : ""}</li>`;
    const list = (entries, emptyKey) => entries.length
      ? `<ul>${entries.join("")}</ul>`
      : `<p class="notes">${game.i18n.localize(emptyKey)}</p>`;
    const content = `<div class="world-status-dependency-report world-status-invalid-report">
      <p class="world-status-report-intro">${game.i18n.localize("GUM.WorldStatus.InvalidReferencesHint")}</p>
      <section><h3>${game.i18n.localize("GUM.WorldStatus.ActiveUsages")}</h3>${list(
        report.activeEffects.map(entry => line(`${entry.actor?.name || "?"} — ${entry.effect?.name || entry.effect?.id || "?"}`, entry.effect?.uuid || entry.actor?.uuid, entry.statusIds)),
        "GUM.WorldStatus.NoInvalidActiveUsages"
      )}</section>
      <section><h3>${game.i18n.localize("GUM.WorldStatus.ItemReferences")}</h3>${list(
        report.itemReferences.map(entry => line(entry.item?.name || entry.item?.uuid || "Item", entry.item?.uuid, [...new Set(entry.references.map(reference => reference.statusId))])),
        "GUM.WorldStatus.NoInvalidItemReferences"
      )}</section>
      <section><h3>${game.i18n.localize("GUM.WorldStatus.LegacyReferences")}</h3>${list(
        report.legacyRules.map(entry => line(entry.rule?.name || entry.rule?.uuid || "Item", entry.rule?.uuid, [entry.statusId])),
        "GUM.WorldStatus.NoInvalidLegacyReferences"
      )}</section>
    </div>`;
    new Dialog({
      title: game.i18n.localize("GUM.WorldStatus.InvalidReferencesTitle"),
      content,
      buttons: { close: { label: game.i18n.localize("GUM.WorldStatus.Close") } },
      default: "close",
      render: html => html.find("[data-action='open-dependency']").on("click", openEvent => this._openDependency(openEvent))
    }, {
      classes: ["dialog", "gum", "gum-sheet-edit-dialog", "world-status-dependency-dialog", "world-status-invalid-references-dialog"],
      width: 680
    }).render(true);
  }

  async _cleanupStatusReferences(statusId) {
    let updated = 0;
    let deleted = 0;
    for (const actor of this._statusActors()) {
      const plan = buildWorldStatusCleanupPlan(actor, statusId);
      if (plan.updates.length) {
        await actor.updateEmbeddedDocuments("ActiveEffect", plan.updates);
        updated += plan.updates.length;
      }
      if (plan.deletes.length) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", plan.deletes);
        deleted += plan.deletes.length;
      }
    }
    return { updated, deleted };
  }

  _moveStatus(event, direction) {
    event.preventDefault();
    this._syncRowsFromForm();
    const id = this._rowIdFromEvent(event);
    const index = this.rows.findIndex(row => row.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= this.rows.length) return;
    [this.rows[index], this.rows[target]] = [this.rows[target], this.rows[index]];
    this.render();
  }

  _chooseIcon(event) {
    event.preventDefault();
    this._syncRowsFromForm();
    const row = this.rows.find(candidate => candidate.id === this._rowIdFromEvent(event));
    if (!row) return;
    const FilePickerImpl = foundry?.applications?.apps?.FilePicker?.implementation ?? FilePicker;
    return new FilePickerImpl({
      type: "image",
      current: row.img,
      callback: path => {
        if (!path) return;
        row.img = path;
        this.render();
      }
    }).render(true);
  }

  _chooseEffects(event) {
    event.preventDefault();
    this._syncRowsFromForm();
    const row = this.rows.find(candidate => candidate.id === this._rowIdFromEvent(event));
    if (!row) return;
    new EffectBrowser(null, {
      onSelect: async selectedEffects => {
        row.effectUuids = [...new Set([...row.effectUuids, ...selectedEffects.map(effect => effect.uuid).filter(Boolean)])];
        this.render();
      }
    }).render(true);
  }

  _removeEffect(event) {
    event.preventDefault();
    this._syncRowsFromForm();
    const row = this.rows.find(candidate => candidate.id === this._rowIdFromEvent(event));
    if (!row) return;
    row.effectUuids = row.effectUuids.filter(uuid => uuid !== event.currentTarget.dataset.effectUuid);
    this.render();
  }

  _filterRows(event) {
    const query = String(event.currentTarget.value || "").trim().toLocaleLowerCase(game.i18n.lang);
    for (const row of this.form.querySelectorAll("[data-status-id]")) {
      row.hidden = Boolean(query) && !String(row.dataset.searchText || "").toLocaleLowerCase(game.i18n.lang).includes(query);
    }
  }

  async _importConfiguration(event) {
    event.preventDefault();
    this._syncRowsFromForm();
    const currentConfiguration = buildWorldStatusConfiguration(this.baseStatuses, this.rows, { bindingsMigrated: true });
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async changeEvent => {
      const file = changeEvent.target.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const bundle = parseConfigurationBundle(parsed);
        if (bundle) {
          const result = await importConfigurationBundle(bundle, {
            expectedKind: "world-statuses",
            getCurrentConfiguration: () => currentConfiguration,
            normalizeConfiguration: configuration => materializeWorldStatusConfiguration(this.baseStatuses, configuration),
            applyConfiguration: async configuration => {
              const normalized = materializeWorldStatusConfiguration(this.baseStatuses, configuration);
              await game.settings.set("gum", WORLD_STATUS_SETTING, normalized);
              this.configuration = normalized;
              this.rows = resolveWorldStatusRows(this.baseStatuses, normalized);
              this.loadedLegacyBindings = false;
              this.pendingCleanupIds.clear();
            }
          });
          if (result) this.render();
          return;
        }
        if (parsed?.format && parsed.format !== EXPORT_FORMAT) throw new Error(game.i18n.localize("GUM.WorldStatus.InvalidFile"));
        if (Number(parsed?.version || WORLD_STATUS_SCHEMA_VERSION) > WORLD_STATUS_SCHEMA_VERSION) {
          throw new Error(game.i18n.localize("GUM.WorldStatus.UnsupportedVersion"));
        }
        const incomingConfiguration = materializeWorldStatusConfiguration(
          this.baseStatuses,
          parsed?.configuration ?? parsed
        );
        const mode = await chooseConfigurationImportMode(
          "world-statuses",
          currentConfiguration,
          incomingConfiguration
        );
        if (!mode) return;
        this.configuration = normalizeWorldStatusConfiguration(combineConfigurationImport(
          "world-statuses",
          currentConfiguration,
          incomingConfiguration,
          mode
        ));
        this.rows = resolveWorldStatusRows(this.baseStatuses, this.configuration);
        this.loadedLegacyBindings = false;
        this.pendingCleanupIds.clear();
        this.render();
      } catch (error) {
        ui.notifications.error(game.i18n.format("GUM.WorldStatus.ImportFailed", { error: error.message }));
      }
    };
    input.click();
  }

  async _exportConfiguration(event) {
    event.preventDefault();
    this._syncRowsFromForm();
    const configuration = buildWorldStatusConfiguration(this.baseStatuses, this.rows, { bindingsMigrated: true });
    const bundle = await buildConfigurationBundle({
      id: `${game.world?.id || "world"}-world-statuses`,
      name: `${game.world?.title || "GUM"} — ${game.i18n.localize("GUM.WorldStatus.Title")}`,
      kind: "world-statuses",
      configuration,
      resolveUuid: uuid => fromUuid(uuid).catch(() => null),
      systemVersion: game.system?.version,
      foundryVersion: game.version
    });
    if (!bundle.portability.complete) {
      ui.notifications.warn(game.i18n.format("GUM.ConfigurationBundle.PortabilityWarning", {
        references: bundle.portability.unresolvedReferences.length + bundle.portability.unsupportedReferences.length,
        assets: bundle.portability.externalAssets.length
      }));
    }
    const data = JSON.stringify(bundle, null, 2);
    saveDataToFile(data, "application/json", "gum-world-statuses.json");
  }

  _restoreDefaults(event) {
    event.preventDefault();
    this.configuration = materializeWorldStatusConfiguration(this.baseStatuses, {});
    this.rows = resolveWorldStatusRows(this.baseStatuses, this.configuration);
    this.loadedLegacyBindings = false;
    this.pendingCleanupIds.clear();
    this.render();
  }

  async _updateObject() {
    this._syncRowsFromForm();
    const configuration = buildWorldStatusConfiguration(this.baseStatuses, this.rows, { bindingsMigrated: true });
    await game.settings.set("gum", WORLD_STATUS_SETTING, configuration);
    await contentSourceService.setSourceIds("statusBindings", []);
    let cleaned = 0;
    for (const statusId of this.pendingCleanupIds) {
      const result = await this._cleanupStatusReferences(statusId);
      cleaned += result.updated + result.deleted;
    }
    this.pendingCleanupIds.clear();
    ui.notifications.info(game.i18n.localize("GUM.WorldStatus.Saved"));
    if (cleaned) ui.notifications.info(game.i18n.format("GUM.WorldStatus.CleanupComplete", { count: cleaned }));
  }
}
