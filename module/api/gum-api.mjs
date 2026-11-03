/**
 * Public JavaScript API for GURPS GUM.
 *
 * Only members exposed by createGumApi are part of the supported contract.
 * Runtime state stored elsewhere under game.gum is intentionally private.
 */

export const GUM_API_VERSION = "1.0.0";

export const GUM_API_HOOKS = Object.freeze({
  READY: "gum.apiReady",
  STATUS_CONFIGURATION_CHANGED: "gumWorldStatusConfigurationChanged"
});

export class GumApiError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GumApiError";
    this.code = code;
    this.details = details;
  }
}

const freezeNamespace = value => Object.freeze(value);

const requireValue = (value, name) => {
  if (value === undefined || value === null || value === "") {
    throw new GumApiError("INVALID_ARGUMENT", `O parâmetro \"${name}\" é obrigatório.`, { parameter: name });
  }
  return value;
};

const requireFunction = (dependencies, name) => {
  const implementation = dependencies[name];
  if (typeof implementation !== "function") {
    throw new GumApiError("CAPABILITY_UNAVAILABLE", `A capacidade \"${name}\" não está disponível nesta versão do GUM.`, { capability: name });
  }
  return implementation;
};

const collectionGet = (collection, id) => collection?.get?.(id)
  ?? collection?.find?.(entry => entry?.id === id || entry?._id === id)
  ?? null;

const documentName = document => document?.documentName
  ?? document?.constructor?.documentName
  ?? document?.constructor?.metadata?.name
  ?? null;

const asActor = document => {
  if (!document) return null;
  if (documentName(document) === "Actor") return document;
  if (document.actor && documentName(document.actor) === "Actor") return document.actor;
  return null;
};

const asItem = document => documentName(document) === "Item" ? document : null;

function createResolvers({ gameRef, resolveUuid }) {
  const resolveActor = async reference => {
    requireValue(reference, "actor");
    const direct = asActor(reference);
    if (direct) return direct;
    if (typeof reference !== "string") {
      throw new GumApiError("INVALID_DOCUMENT", "A referência informada não é um Actor ou Token válido.", { reference });
    }
    const byId = asActor(collectionGet(gameRef?.actors, reference));
    if (byId) return byId;
    const byUuid = asActor(await resolveUuid(reference).catch(() => null));
    if (byUuid) return byUuid;
    throw new GumApiError("DOCUMENT_NOT_FOUND", `Actor não encontrado: ${reference}`, { reference, documentName: "Actor" });
  };

  const resolveItem = async (reference, { actor = null } = {}) => {
    requireValue(reference, "item");
    const direct = asItem(reference);
    if (direct) return direct;
    if (typeof reference !== "string") {
      throw new GumApiError("INVALID_DOCUMENT", "A referência informada não é um Item válido.", { reference });
    }
    const owner = actor ? await resolveActor(actor) : null;
    const embedded = asItem(collectionGet(owner?.items, reference));
    if (embedded) return embedded;
    const worldItem = asItem(collectionGet(gameRef?.items, reference));
    if (worldItem) return worldItem;
    const byUuid = asItem(await resolveUuid(reference).catch(() => null));
    if (byUuid) return byUuid;
    throw new GumApiError("DOCUMENT_NOT_FOUND", `Item não encontrado: ${reference}`, { reference, documentName: "Item" });
  };

  return { resolveActor, resolveItem };
}

/**
 * Build the public API. Dependencies are injected so this module remains
 * testable outside Foundry and does not create circular imports.
 */
export function createGumApi({
  gameRef = globalThis.game,
  resolveUuid = globalThis.fromUuid,
  dependencies = {}
} = {}) {
  if (!gameRef) throw new GumApiError("FOUNDRY_UNAVAILABLE", "O objeto global game ainda não está disponível.");
  if (typeof resolveUuid !== "function") {
    resolveUuid = async () => null;
  }

  const { resolveActor, resolveItem } = createResolvers({ gameRef, resolveUuid });
  const contentService = dependencies.contentSourceService;
  const contentPurposes = dependencies.contentSourcePurposes ?? {};

  const actors = freezeNamespace({
    resolve: resolveActor
  });

  const items = freezeNamespace({
    resolve: resolveItem
  });

  const rolls = freezeNamespace({
    async perform(actorReference, rollData = {}, options = {}) {
      const actor = await resolveActor(actorReference);
      return requireFunction(dependencies, "performGURPSRoll")(actor, rollData, options);
    },
    fromHotbar(options = {}) {
      return requireFunction(dependencies, "rollFromHotbar")(options);
    },
    executeRequest(request, targetKey, options = {}) {
      requireValue(request, "request");
      requireValue(targetKey, "targetKey");
      return requireFunction(dependencies, "executeRollRequest")(request, targetKey, options);
    }
  });

  const effects = freezeNamespace({
    actions(effectOrSystem = {}) {
      const system = effectOrSystem?.system ?? effectOrSystem;
      return requireFunction(dependencies, "getEffectActions")(system);
    },
    async apply(effectReference, targets, context = {}) {
      if (!Array.isArray(targets) || targets.length === 0) {
        throw new GumApiError("INVALID_ARGUMENT", "effects.apply requer ao menos um alvo.", { parameter: "targets" });
      }
      const effect = await resolveItem(effectReference, { actor: context.actor ?? null });
      return requireFunction(dependencies, "applyEffectWithResistance")(effect, targets, context);
    },
    async applyDirect(effectReference, targets, context = {}) {
      if (!Array.isArray(targets) || targets.length === 0) {
        throw new GumApiError("INVALID_ARGUMENT", "effects.applyDirect requer ao menos um alvo.", { parameter: "targets" });
      }
      const effect = await resolveItem(effectReference, { actor: context.actor ?? null });
      return requireFunction(dependencies, "applySingleEffect")(effect, targets, context);
    },
    async applyUseEvent(itemReference, actorReference, trigger, options = {}) {
      const actor = await resolveActor(actorReference);
      const item = await resolveItem(itemReference, { actor });
      requireValue(trigger, "trigger");
      return requireFunction(dependencies, "applyUseEventEffects")(item, actor, trigger, options);
    },
    async setGroupActive(itemReference, groupId, active, { actor = null } = {}) {
      const item = await resolveItem(itemReference, { actor });
      requireValue(groupId, "groupId");
      return requireFunction(dependencies, "setStateEffectGroupActive")(item, groupId, active === true);
    },
    async syncItem(itemReference, options = {}) {
      const item = await resolveItem(itemReference, { actor: options.actor ?? null });
      return requireFunction(dependencies, "syncItemStateEffects")(item, options);
    }
  });

  const damage = freezeNamespace({
    fromHotbar(options = {}) {
      return requireFunction(dependencies, "damageFromHotbar")(options);
    },
    resolveFormula(actor, item, attack, attackType, rollData = {}) {
      return requireFunction(dependencies, "resolveCombatDamageFormula")(actor, item, attack, attackType, rollData);
    },
    resolveProfile(actor, item, attack, attackType, options = {}) {
      return requireFunction(dependencies, "resolveCombatDamageProfile")(actor, item, attack, attackType, options);
    },
    resolveTargetDefenseModifiers(actor, rollContext, rollData = {}) {
      return requireFunction(dependencies, "resolveTargetCombatDefenseRecalculationModifiers")(actor, rollContext, rollData);
    }
  });

  const requireContentService = method => {
    if (!contentService || typeof contentService[method] !== "function") {
      throw new GumApiError("CAPABILITY_UNAVAILABLE", `O serviço público content.${method} não está disponível.`, { capability: `content.${method}` });
    }
    return contentService[method].bind(contentService);
  };

  const content = freezeNamespace({
    purposes() {
      return Object.values(contentPurposes).map(definition => ({
        ...definition,
        defaults: [...(definition.defaults ?? [])],
        itemTypes: [...(definition.itemTypes ?? [])]
      }));
    },
    getSourceIds(purpose) {
      requireValue(purpose, "purpose");
      return [...requireContentService("getSourceIds")(purpose)];
    },
    resolveSources(purpose) {
      requireValue(purpose, "purpose");
      return requireContentService("resolveSources")(purpose);
    },
    getDocuments(purpose) {
      requireValue(purpose, "purpose");
      return requireContentService("getDocuments")(purpose);
    },
    getIndex(purpose, options = {}) {
      requireValue(purpose, "purpose");
      return requireContentService("getIndex")(purpose, options);
    },
    setSourceIds(purpose, ids) {
      if (!gameRef.user?.isGM) throw new GumApiError("PERMISSION_DENIED", "Somente o Mestre pode alterar fontes de conteúdo.");
      requireValue(purpose, "purpose");
      if (!Array.isArray(ids)) throw new GumApiError("INVALID_ARGUMENT", "content.setSourceIds requer uma lista de IDs.", { parameter: "ids" });
      return requireContentService("setSourceIds")(purpose, ids);
    },
    restoreDefaults(purpose) {
      if (!gameRef.user?.isGM) throw new GumApiError("PERMISSION_DENIED", "Somente o Mestre pode restaurar fontes de conteúdo.");
      requireValue(purpose, "purpose");
      return requireContentService("restoreDefaults")(purpose);
    }
  });

  const status = freezeNamespace({
    list() {
      return (globalThis.CONFIG?.statusEffects ?? []).map(entry => ({ ...entry }));
    }
  });

  const imports = freezeNamespace({
    async gcs(options = {}) {
      const normalized = { ...options };
      if (options.actor) normalized.actor = await resolveActor(options.actor);
      return requireFunction(dependencies, "importFromGCS")(normalized);
    }
  });

  const ui = freezeNamespace({
    openTestRequest() {
      return requireFunction(dependencies, "openTestRequestLauncher")();
    },
    openGmScreen() {
      return requireFunction(dependencies, "openGmScreen")();
    },
    openContentSources() {
      if (!gameRef.user?.isGM) throw new GumApiError("PERMISSION_DENIED", "Somente o Mestre pode configurar fontes de conteúdo.");
      return requireFunction(dependencies, "openContentSourceConfig")();
    },
    openStatusConfiguration() {
      if (!gameRef.user?.isGM) throw new GumApiError("PERMISSION_DENIED", "Somente o Mestre pode configurar os status do mundo.");
      return requireFunction(dependencies, "openWorldStatusConfig")();
    }
  });

  return freezeNamespace({
    version: GUM_API_VERSION,
    systemVersion: gameRef.system?.version ?? null,
    hooks: GUM_API_HOOKS,
    errors: freezeNamespace({ GumApiError }),
    actors,
    items,
    rolls,
    effects,
    damage,
    content,
    status,
    imports,
    ui
  });
}

/** Install the public API and the pre-1.0 compatibility aliases. */
export function installGumApi({ gameRef = globalThis.game, hooks = globalThis.Hooks, dependencies = {}, resolveUuid } = {}) {
  const namespace = gameRef.gum ?? {};
  const api = createGumApi({ gameRef, dependencies, resolveUuid });
  namespace.api = api;

  const legacyAliases = {
    importFromGCS: "importFromGCS",
    rollFromHotbar: "rollFromHotbar",
    damageFromHotbar: "damageFromHotbar",
    applyUseEventEffects: "applyUseEventEffects",
    applySingleEffect: "applySingleEffect",
    getEffectActions: "getEffectActions",
    resolveCombatDamageFormula: "resolveCombatDamageFormula",
    resolveCombatDamageProfile: "resolveCombatDamageProfile",
    resolveTargetCombatDefenseRecalculationModifiers: "resolveTargetCombatDefenseRecalculationModifiers",
    setStateEffectGroupActive: "setStateEffectGroupActive",
    syncItemStateEffects: "syncItemStateEffects"
  };
  for (const [alias, dependency] of Object.entries(legacyAliases)) {
    if (typeof dependencies[dependency] === "function") namespace[alias] = dependencies[dependency];
  }

  gameRef.gum = namespace;
  hooks?.callAll?.(GUM_API_HOOKS.READY, api);
  return api;
}
