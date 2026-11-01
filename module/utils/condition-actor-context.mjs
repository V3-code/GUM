/** Return a stable key for one concrete Actor context. */
export function getActorEvaluationKey(actor) {
  // Synthetic actors reuse the base Actor id, while their UUID includes the
  // Token document and therefore distinguishes separate unlinked Tokens.
  return actor?.uuid || actor?.id || null;
}

/**
 * Return whether an Actor still has a writable document context.
 *
 * Foundry removes an unlinked TokenDocument from its Scene collection before
 * every embedded ActiveEffect hook has necessarily finished. Late hooks must
 * not reconcile effects on that now-orphaned synthetic Actor.
 */
export function isActorContextAvailable(actor) {
  if (!actor) return false;
  // ActiveEffect hooks also run for effects embedded in Items. Those effects
  // are configuration data, not part of an Actor condition/status runtime.
  const ownerDocumentName = actor.documentName ?? actor.constructor?.documentName ?? null;
  if (ownerDocumentName && ownerDocumentName !== "Actor") return false;
  if (!actor.isToken) return true;

  const token = actor.token;
  if (!token || token.deleted === true || token._destroyed === true) return false;
  const scene = token.parent;
  if (!scene) return false;

  if (typeof scene.tokens?.get === "function") return Boolean(scene.tokens.get(token.id));
  if (typeof scene.tokens?.has === "function") return scene.tokens.has(token.id);
  return true;
}

/** Identify Foundry backend failures caused by an unlinked Token Actor whose
 * TokenDocument disappeared while an asynchronous embedded operation ran. */
export function isMissingSyntheticActorContextError(error, actor) {
  if (!actor?.isToken) return false;
  if (!isActorContextAvailable(actor)) return true;
  const message = String(error?.message ?? error ?? "");
  const stack = String(error?.stack ?? "");
  return /id \[[^\]]+\] does not exist in the EmbeddedCollection collection/i.test(message)
    && /Scene\.getEmbeddedDocument/i.test(stack);
}

/** Adapt an Actor to the token-shaped target expected by the effects engine. */
export function buildActorEffectTarget(actor) {
  if (!actor || !isActorContextAvailable(actor)) return null;

  // Preserve the Token only when it is the context which owns this synthetic
  // Actor. Active Tokens of a world Actor must never replace that Actor as the
  // mechanical owner of an automatically evaluated effect.
  if (actor.isToken && actor.token) {
    const token = actor.token.object || actor.token;
    if (token.actor === actor) return token;
  }

  return {
    actor,
    id: null,
    name: actor.name || "Alvo",
    document: {
      uuid: null,
      texture: { src: actor.img || "icons/svg/mystery-man.svg" }
    }
  };
}

export function buildActorEffectTargets(actor) {
  const target = buildActorEffectTarget(actor);
  return target ? [target] : [];
}
