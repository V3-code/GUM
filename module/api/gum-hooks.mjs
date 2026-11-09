export const GUM_API_HOOKS = Object.freeze({
  READY: "gum.apiReady",
  STATUS_CONFIGURATION_CHANGED: "gumWorldStatusConfigurationChanged",
  ROLL_COMPLETED: "gum.rollCompleted",
  DAMAGE_ROLLED: "gum.damageRolled",
  DAMAGE_APPLIED: "gum.damageApplied",
  EFFECT_APPLIED: "gum.effectApplied",
  EFFECT_REMOVED: "gum.effectRemoved",
  EFFECT_STATE_CHANGED: "gum.effectStateChanged",
  CONDITION_STATE_CHANGED: "gum.conditionStateChanged",
  STATE_EFFECT_GROUP_CHANGED: "gum.stateEffectGroupChanged",
  ITEM_USE_COMPLETED: "gum.itemUseCompleted"
});

export const GUM_LIFECYCLE_CONTEXT_VERSION = 1;

const createEventId = () => {
  const randomID = globalThis.foundry?.utils?.randomID;
  if (typeof randomID === "function") return randomID();
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `gum-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const normalizeAction = action => Object.freeze({
  type: action?.type ? String(action.type) : null,
  id: action?.id ? String(action.id) : null,
  attackType: action?.attackType ? String(action.attackType) : null,
  label: action?.label ? String(action.label) : null,
  data: action?.data ?? null
});

export function resolveGumSourceToken(actor, canvasRef = globalThis.canvas) {
  if (!actor) return null;
  const controlled = Array.from(canvasRef?.tokens?.controlled ?? [])
    .find(token => token?.actor?.id === actor.id);
  if (controlled) return controlled;
  const synthetic = actor.token?.object ?? actor.token ?? null;
  if (synthetic) return synthetic;
  return actor.getActiveTokens?.(true)?.[0] ?? actor.getActiveTokens?.()?.[0] ?? null;
}

/**
 * Creates the stable envelope shared by all public GUM lifecycle hooks.
 * Foundry documents are intentionally passed by reference; this function does
 * not clone or serialize actors, items, tokens, rolls, or results.
 */
export function createGumLifecycleContext({
  eventId = null,
  userId = globalThis.game?.user?.id ?? null,
  timestamp = Date.now(),
  actor = null,
  sourceToken = null,
  item = null,
  action = null,
  targets = [],
  result = null,
  metadata = null
} = {}) {
  return Object.freeze({
    version: GUM_LIFECYCLE_CONTEXT_VERSION,
    eventId: eventId ? String(eventId) : createEventId(),
    userId: userId ? String(userId) : null,
    timestamp: Number(timestamp) || Date.now(),
    actor,
    sourceToken,
    item,
    action: normalizeAction(action),
    targets: Object.freeze(Array.from(targets ?? []).filter(Boolean)),
    result,
    metadata: Object.freeze({ ...(metadata ?? {}) })
  });
}

/** Emit an informational hook without allowing integration failures to break rules. */
export function emitGumLifecycleHook(hookName, data = {}, {
  hooks = globalThis.Hooks,
  logger = globalThis.console
} = {}) {
  const context = createGumLifecycleContext(data);
  try {
    hooks?.callAll?.(hookName, context);
  } catch (error) {
    logger?.error?.(`GUM | Falha em listener externo do hook "${hookName}".`, error);
  }
  return context;
}
