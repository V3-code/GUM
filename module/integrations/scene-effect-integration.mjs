// System subtypes are registered without a package prefix. Module subtypes use one.
export const GUM_REGION_EFFECT_BEHAVIOR = "applyEffect";
export const GUM_MATT_EFFECT_ACTION = "gum-apply-effect";

const documentName = document => document?.documentName
  ?? document?.constructor?.documentName
  ?? document?.constructor?.metadata?.name
  ?? null;

const localize = (gameRef, key, fallback) => {
  const translated = gameRef?.i18n?.localize?.(key);
  return translated && translated !== key ? translated : fallback;
};

const notifyError = (gameRef, error) => {
  console.error("GUM | Falha na integração de Efeitos com a cena:", error);
  const message = localize(
    gameRef,
    "GUM.SceneEffects.ApplyFailed",
    "Não foi possível aplicar o Item Efeito GUM. Consulte o console para mais detalhes."
  );
  globalThis.ui?.notifications?.error?.(message);
};

/**
 * Convert a Token, TokenDocument, or Actor into the target shape consumed by
 * the GUM effect engine while preserving a concrete Token context when one is
 * available.
 */
export function buildSceneEffectTarget(entity) {
  if (!entity) return null;

  const tokenDocument = documentName(entity) === "Token"
    ? entity
    : documentName(entity?.document) === "Token"
      ? entity.document
      : null;
  const actor = entity.actor ?? tokenDocument?.actor
    ?? (documentName(entity) === "Actor" ? entity : null);
  if (!actor) return null;

  if (tokenDocument) {
    const tokenObject = tokenDocument.object;
    if (tokenObject?.actor) return tokenObject;
    return {
      actor,
      id: tokenDocument.id ?? null,
      name: tokenDocument.name ?? actor.name ?? "Alvo",
      document: tokenDocument
    };
  }

  return {
    actor,
    id: null,
    name: actor.name ?? "Alvo",
    document: {
      uuid: actor.uuid ?? null,
      texture: { src: actor.img ?? "icons/svg/mystery-man.svg" }
    }
  };
}

export function buildSceneEffectTargets(entities = []) {
  const targets = [];
  const seen = new Set();
  for (const entity of entities ?? []) {
    const target = buildSceneEffectTarget(entity);
    if (!target) continue;
    const key = target.document?.uuid ?? target.actor?.uuid ?? target.actor?.id;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    targets.push(target);
  }
  return targets;
}

/** Apply one Item Effect through the public GUM API. */
export async function applySceneEffect({ api, effectReference, entities, context = {} } = {}) {
  if (!api?.items?.resolve || !api?.effects?.apply) {
    throw new Error("A API pública de Efeitos do GUM não está disponível.");
  }

  const effect = await api.items.resolve(effectReference);
  if (effect?.type !== "effect") {
    throw new Error(`O Item selecionado não é um Item Efeito GUM: ${effect?.name ?? effectReference}`);
  }

  const targets = buildSceneEffectTargets(entities);
  if (!targets.length) return { effect, targets, result: null };

  // The effect engine treats `origin` as a mechanical source Item (including
  // level scaling). Scene documents belong in eventData/gumFlags instead.
  const mechanicalOrigin = documentName(context.origin) === "Item" ? context.origin : effect;
  const applicationContext = { ...context, origin: mechanicalOrigin };
  const result = await api.effects.apply(effect, targets, applicationContext);
  return { effect, targets, result };
}

const pointData = point => point && typeof point === "object" ? {
  x: Number.isFinite(Number(point.x)) ? Number(point.x) : null,
  y: Number.isFinite(Number(point.y)) ? Number(point.y) : null,
  elevation: Number.isFinite(Number(point.elevation)) ? Number(point.elevation) : null
} : null;

export function buildRegionEffectEventData(event, behavior) {
  const token = event?.data?.token ?? null;
  const region = behavior?.region ?? behavior?.parent?.parent ?? null;
  return {
    type: event?.name ?? null,
    source: "region",
    regionUuid: region?.uuid ?? null,
    sceneUuid: region?.parent?.uuid ?? token?.parent?.uuid ?? null,
    tokenUuid: token?.uuid ?? null,
    actorUuid: token?.actor?.uuid ?? null,
    origin: pointData(event?.data?.origin),
    destination: pointData(event?.data?.destination),
    movementMethod: event?.data?.movement?.method ?? null,
    forced: event?.data?.forced === true,
    teleport: event?.data?.teleport === true
  };
}

const supportedRegionEffectEvents = constRef => {
  const events = constRef?.REGION_EVENTS ?? {};
  return [
    events.TOKEN_ENTER,
    events.TOKEN_EXIT,
    events.TOKEN_MOVE_IN,
    events.TOKEN_MOVE_OUT,
    events.TOKEN_TURN_START,
    events.TOKEN_TURN_END,
    events.TOKEN_ROUND_START,
    events.TOKEN_ROUND_END
  ].filter(Boolean);
};

export function createGumEffectRegionBehaviorType({
  foundryRef = globalThis.foundry,
  constRef = globalThis.CONST
} = {}) {
  const Base = foundryRef?.data?.regionBehaviors?.RegionBehaviorType;
  if (!Base) return null;

  return class GumEffectRegionBehaviorType extends Base {
    static defineSchema() {
      return {
        events: this._createEventsField({ events: supportedRegionEffectEvents(constRef) }),
        effectUuid: new foundryRef.data.fields.DocumentUUIDField({
          type: "Item",
          label: "GUM.SceneEffects.Region.EffectLabel",
          hint: "GUM.SceneEffects.Region.EffectHint"
        })
      };
    }

    async _handleRegionEvent(event) {
      if (event?.user && event.user.isSelf === false) return;
      const token = event?.data?.token;
      if (!this.effectUuid || !token?.actor) return;

      const gameRef = globalThis.game;
      try {
        return await applySceneEffect({
          api: gameRef?.gum?.api,
          effectReference: this.effectUuid,
          entities: [token],
          context: {
            mode: "region",
            source: "region",
            eventData: buildRegionEffectEventData(event, this),
            gumFlags: {
              sceneTrigger: {
                source: "region",
                sourceUuid: this.region?.uuid ?? null,
                event: event?.name ?? null
              }
            }
          }
        });
      } catch (error) {
        notifyError(gameRef, error);
      }
    }
  };
}

export function registerGumRegionEffectBehavior({
  config = globalThis.CONFIG,
  foundryRef = globalThis.foundry
} = {}) {
  const dataModels = config?.RegionBehavior?.dataModels;
  if (!dataModels || dataModels[GUM_REGION_EFFECT_BEHAVIOR]) return false;

  const BehaviorType = createGumEffectRegionBehaviorType({ foundryRef });
  if (!BehaviorType) return false;
  dataModels[GUM_REGION_EFFECT_BEHAVIOR] = BehaviorType;
  if (config.RegionBehavior.typeIcons) {
    config.RegionBehavior.typeIcons[GUM_REGION_EFFECT_BEHAVIOR] = "fa-solid fa-wand-magic-sparkles";
  }
  return true;
}

const isTokenPlaceable = (entity, foundryRef) => {
  const TokenClass = foundryRef?.canvas?.placeables?.Token;
  return TokenClass ? entity instanceof TokenClass : documentName(entity?.document) === "Token";
};

const isEffectItem = entity => documentName(entity) === "Item" && entity?.type === "effect";

/** Register an optional native action in Monk's Active Tile Triggers. */
export function registerMonksActiveTilesEffectAction({
  hooks = globalThis.Hooks,
  getGame = () => globalThis.game,
  foundryRef = globalThis.foundry
} = {}) {
  if (!hooks?.on) return false;

  hooks.on("setupTileActions", app => {
    const gameRef = getGame();
    if (!app?.registerTileGroup || !app?.registerTileAction) return;

    if (!app.triggerGroups?.gum) app.registerTileGroup("gum", "GUM");
    app.registerTileAction("monks-active-tiles", GUM_MATT_EFFECT_ACTION, {
      name: "GUM.SceneEffects.MATT.ActionName",
      group: "gum",
      ctrls: [
        {
          id: "entity",
          name: "GUM.SceneEffects.MATT.TargetLabel",
          type: "select",
          subtype: "entity",
          options: { show: ["token", "within", "players", "previous", "tagger"] },
          restrict: entity => isTokenPlaceable(entity, foundryRef),
          required: true
        },
        {
          id: "effect",
          name: "GUM.SceneEffects.MATT.EffectLabel",
          type: "select",
          subtype: "entity",
          options: { show: ["previous"] },
          restrict: isEffectItem,
          required: true,
          placeholder: localize(gameRef, "GUM.SceneEffects.MATT.EffectPlaceholder", "Selecione um Item Efeito"),
          defaultType: "items"
        }
      ],
      fn: async (args = {}) => {
        const matt = getGame()?.MonksActiveTiles;
        try {
          const entities = await matt?.getEntities?.(args) ?? [];
          const effects = await matt?.getEntities?.(args, "items", args.action?.data?.effect) ?? [];
          const effect = effects.find(isEffectItem);
          if (!effect || !entities.length) return { tokens: entities, entities, items: effects };

          await applySceneEffect({
            api: getGame()?.gum?.api,
            effectReference: effect,
            entities,
            context: {
              mode: "monks-active-tiles",
              source: "monks-active-tiles",
              eventData: {
                type: args.method ?? "tileTrigger",
                source: "monks-active-tiles",
                tileUuid: args.tile?.uuid ?? null,
                userId: args.userId ?? null
              },
              gumFlags: {
                sceneTrigger: {
                  source: "monks-active-tiles",
                  sourceUuid: args.tile?.uuid ?? null,
                  event: args.method ?? "tileTrigger"
                }
              }
            }
          });
          return { tokens: entities, entities, items: effects };
        } catch (error) {
          notifyError(getGame(), error);
          return { tokens: [], entities: [], items: [] };
        }
      },
      content: async (trigger, action) => {
        const matt = getGame()?.MonksActiveTiles;
        const targetName = await matt?.entityName?.(action.data?.entity ?? "previous");
        const effectName = await matt?.entityName?.(action.data?.effect ?? "previous", "items");
        return `<span class="action-style">${localize(gameRef, "GUM.SceneEffects.MATT.ActionName", "Aplicar Item Efeito GUM")}</span> <span class="details-style">${effectName?.name ?? effectName ?? "—"}</span> → <span class="entity-style">${targetName ?? "—"}</span>`;
      }
    });
  });
  return true;
}
