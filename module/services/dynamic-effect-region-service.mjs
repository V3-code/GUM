import { applySceneEffect, buildRegionEffectEventData } from "../integrations/scene-effect-integration.mjs";

export const GUM_DYNAMIC_EFFECT_REGION_BEHAVIOR = "dynamicEffectAura";
export const GUM_DYNAMIC_EFFECT_REGION_FLAG = "dynamicEffectRegion";
export const DYNAMIC_EFFECT_REGION_VERSION = 1;

const collectionValues = collection => Array.from(collection?.values?.() ?? collection ?? []);
const getProperty = (object, path) => globalThis.foundry?.utils?.getProperty?.(object, path)
  ?? path.split(".").reduce((value, key) => value?.[key], object);

export function normalizeDynamicEffectRegion(config = {}, { defaultRange = 1 } = {}) {
  const range = Number(config?.range);
  const targetMode = ["all", "allies", "enemies"].includes(config?.targetMode)
    ? config.targetMode
    : "all";
  return {
    enabled: config?.enabled === true,
    range: Number.isFinite(range) && range > 0 ? range : Math.max(Number(defaultRange) || 1, 0.01),
    payloadEffectUuid: String(config?.payloadEffectUuid ?? "").trim(),
    targetMode,
    includeSelf: config?.includeSelf === true,
    gridBased: config?.gridBased === true,
    color: /^#[0-9a-f]{6}$/i.test(String(config?.color ?? "")) ? String(config.color) : "#7b61ff"
  };
}

export function isDynamicRegionTarget({ token, sourceToken, targetMode = "all", includeSelf = false } = {}) {
  if (!token?.actor) return false;
  const isSelf = Boolean(sourceToken && (token.uuid === sourceToken.uuid || token.actor === sourceToken.actor));
  if (isSelf) return includeSelf;
  if (targetMode === "all") return true;
  if (!sourceToken) return false;
  const sourceDisposition = Number(sourceToken.disposition ?? sourceToken._source?.disposition ?? 0);
  const targetDisposition = Number(token.disposition ?? token._source?.disposition ?? 0);
  if (targetMode === "allies") return sourceDisposition !== 0 && targetDisposition === sourceDisposition;
  if (targetMode === "enemies") return sourceDisposition * targetDisposition < 0;
  return false;
}

export function buildDynamicRegionData({ controllerEffect, effectItem, token, config, constRef = globalThis.CONST } = {}) {
  const normalized = normalizeDynamicEffectRegion(config);
  const enter = constRef?.REGION_EVENTS?.TOKEN_ENTER ?? "tokenEnter";
  const exit = constRef?.REGION_EVENTS?.TOKEN_EXIT ?? "tokenExit";
  return {
    name: `${effectItem?.name || controllerEffect?.name || "GUM"} — ${token?.name || token?.actor?.name || "Aura"}`,
    color: normalized.color,
    hidden: true,
    locked: true,
    displayMeasurements: false,
    behaviors: [{
      type: GUM_DYNAMIC_EFFECT_REGION_BEHAVIOR,
      system: {
        events: [enter, exit],
        effectUuid: normalized.payloadEffectUuid,
        sourceTokenUuid: token?.uuid ?? "",
        targetMode: normalized.targetMode,
        includeSelf: normalized.includeSelf
      }
    }],
    flags: {
      gum: {
        [GUM_DYNAMIC_EFFECT_REGION_FLAG]: {
          version: DYNAMIC_EFFECT_REGION_VERSION,
          controllerActiveEffectUuid: controllerEffect?.uuid ?? null,
          effectItemUuid: effectItem?.uuid ?? null,
          sourceTokenUuid: token?.uuid ?? null,
          payloadEffectUuid: normalized.payloadEffectUuid,
          signature: JSON.stringify(normalized)
        }
      }
    }
  };
}

async function removeDynamicRegionEffects(actor, { regionUuid, effectUuid } = {}) {
  if (!actor || !regionUuid) return [];
  const ids = collectionValues(actor.effects).filter(effect =>
    getProperty(effect, "flags.gum.sceneTrigger.sourceUuid") === regionUuid
    && (!effectUuid || getProperty(effect, "flags.gum.effectUuid") === effectUuid)
  ).map(effect => effect.id).filter(Boolean);
  if (ids.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", ids, {
      gumExpirationReason: "dynamic-region-exit"
    });
  }
  return ids;
}

export function createGumDynamicEffectRegionBehaviorType({
  foundryRef = globalThis.foundry,
  constRef = globalThis.CONST
} = {}) {
  const Base = foundryRef?.data?.regionBehaviors?.RegionBehaviorType;
  const fields = foundryRef?.data?.fields;
  if (!Base || !fields) return null;
  const events = [constRef?.REGION_EVENTS?.TOKEN_ENTER, constRef?.REGION_EVENTS?.TOKEN_EXIT].filter(Boolean);

  return class GumDynamicEffectRegionBehaviorType extends Base {
    static defineSchema() {
      return {
        events: this._createEventsField({ events, initial: events }),
        effectUuid: new fields.DocumentUUIDField({ type: "Item", nullable: false }),
        sourceTokenUuid: new fields.StringField({ required: true, nullable: false, blank: false }),
        targetMode: new fields.StringField({ required: true, initial: "all", choices: ["all", "allies", "enemies"] }),
        includeSelf: new fields.BooleanField({ initial: false })
      };
    }

    async _handleRegionEvent(event) {
      if (event?.user && event.user.isSelf === false) return;
      const token = event?.data?.token;
      if (!token?.actor || !this.effectUuid) return;
      const exit = constRef?.REGION_EVENTS?.TOKEN_EXIT ?? "tokenExit";
      if (event?.name === exit) {
        return removeDynamicRegionEffects(token.actor, {
          regionUuid: this.region?.uuid,
          effectUuid: this.effectUuid
        });
      }

      const sourceToken = this.sourceTokenUuid
        ? await globalThis.fromUuid?.(this.sourceTokenUuid).catch(() => null)
        : null;
      if (!isDynamicRegionTarget({
        token,
        sourceToken,
        targetMode: this.targetMode,
        includeSelf: this.includeSelf
      })) return;

      try {
        return await applySceneEffect({
          api: globalThis.game?.gum?.api,
          effectReference: this.effectUuid,
          entities: [token],
          context: {
            mode: "dynamic-region",
            source: "dynamic-region",
            eventData: buildRegionEffectEventData(event, this),
            gumFlags: {
              sceneTrigger: {
                source: "dynamic-region",
                sourceUuid: this.region?.uuid ?? null,
                event: event?.name ?? null
              }
            }
          }
        });
      } catch (error) {
        console.error("GUM | Falha ao aplicar efeito de Região Dinâmica:", error);
        globalThis.ui?.notifications?.error?.(globalThis.game?.i18n?.localize?.("GUM.DynamicRegion.ApplyFailed"));
      }
    }
  };
}

export function registerGumDynamicEffectRegionBehavior({
  config = globalThis.CONFIG,
  foundryRef = globalThis.foundry
} = {}) {
  const dataModels = config?.RegionBehavior?.dataModels;
  if (!dataModels || dataModels[GUM_DYNAMIC_EFFECT_REGION_BEHAVIOR]) return false;
  const BehaviorType = createGumDynamicEffectRegionBehaviorType({ foundryRef });
  if (!BehaviorType) return false;
  dataModels[GUM_DYNAMIC_EFFECT_REGION_BEHAVIOR] = BehaviorType;
  if (config.RegionBehavior.typeIcons) {
    config.RegionBehavior.typeIcons[GUM_DYNAMIC_EFFECT_REGION_BEHAVIOR] = "fa-solid fa-bullseye";
  }
  return true;
}

const isPrimaryActiveGM = gameRef => {
  if (!gameRef?.user?.isGM) return false;
  const activeGms = collectionValues(gameRef.users)
    .filter(user => user.active && user.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return !activeGms.length || activeGms[0]?.id === gameRef.user.id;
};

const controllerItemUuid = effect => {
  if (getProperty(effect, "flags.gum.lifecycleCarrier") === false || effect?.disabled) return null;
  return getProperty(effect, "flags.gum.effectUuid") || null;
};

async function collectDesiredRegions(scene) {
  const desired = new Map();
  for (const token of collectionValues(scene?.tokens)) {
    const actor = token.actor;
    if (!actor) continue;
    for (const effect of collectionValues(actor.effects)) {
      const effectUuid = controllerItemUuid(effect);
      if (!effectUuid) continue;
      const effectItem = await globalThis.fromUuid?.(effectUuid).catch(() => null);
      if (effectItem?.type !== "effect") continue;
      const config = normalizeDynamicEffectRegion(effectItem.system?.dynamicRegion, {
        defaultRange: scene?.grid?.distance ?? 1
      });
      if (!config.enabled || !config.payloadEffectUuid || config.payloadEffectUuid === effectItem.uuid) continue;
      const payload = await globalThis.fromUuid?.(config.payloadEffectUuid).catch(() => null);
      if (payload?.type !== "effect") continue;
      const key = `${effect.uuid}::${token.uuid}`;
      desired.set(key, { key, controllerEffect: effect, effectItem, token, config });
    }
  }
  return desired;
}

export async function reconcileDynamicEffectRegions({
  gameRef = globalThis.game,
  scene = null,
  regionClass = globalThis.CONFIG?.Region?.documentClass
} = {}) {
  if (!isPrimaryActiveGM(gameRef) || typeof regionClass?.createTokenEmanation !== "function") return [];
  const scenes = scene ? [scene] : collectionValues(gameRef?.scenes);
  const results = [];
  for (const currentScene of scenes) {
    results.push(...await reconcileDynamicEffectRegionsForScene(currentScene, regionClass));
  }
  return results;
}

async function reconcileDynamicEffectRegionsForScene(scene, regionClass) {
  if (!scene) return [];
  const desired = await collectDesiredRegions(scene);
  const existing = collectionValues(scene.regions).filter(region => getProperty(region, `flags.gum.${GUM_DYNAMIC_EFFECT_REGION_FLAG}`));
  const keptKeys = new Set();
  const results = [];

  for (const region of existing) {
    const flag = getProperty(region, `flags.gum.${GUM_DYNAMIC_EFFECT_REGION_FLAG}`) || {};
    const key = `${flag.controllerActiveEffectUuid}::${flag.sourceTokenUuid}`;
    const entry = desired.get(key);
    const signature = entry ? JSON.stringify(entry.config) : null;
    if (!entry || flag.signature !== signature) {
      results.push(await region.delete({ gumDynamicRegionSync: true }));
    } else keptKeys.add(key);
  }

  for (const entry of desired.values()) {
    if (keptKeys.has(entry.key)) continue;
    const data = buildDynamicRegionData(entry);
    results.push(await regionClass.createTokenEmanation(
      entry.token,
      entry.config.range,
      data,
      { excludeToken: false, gridBased: entry.config.gridBased, createOptions: { gumDynamicRegionSync: true } }
    ));
  }
  return results;
}

let reconcileTimer = null;
export function scheduleDynamicEffectRegionReconciliation(delay = 50) {
  globalThis.clearTimeout?.(reconcileTimer);
  reconcileTimer = globalThis.setTimeout?.(() => {
    reconcileTimer = null;
    reconcileDynamicEffectRegions().catch(error => console.error("GUM | Falha ao sincronizar Regiões Dinâmicas:", error));
  }, delay);
}

export function registerDynamicEffectRegionHooks({ hooks = globalThis.Hooks } = {}) {
  if (!hooks?.on) return false;
  for (const hook of ["createActiveEffect", "deleteActiveEffect", "createToken", "deleteToken", "canvasReady"]) {
    hooks.on(hook, () => scheduleDynamicEffectRegionReconciliation());
  }
  hooks.on("updateActiveEffect", (_effect, changes = {}) => {
    if (Object.hasOwn(changes, "disabled") || changes?.flags?.gum) {
      scheduleDynamicEffectRegionReconciliation();
    }
  });
  hooks.on("updateItem", (item, changes = {}) => {
    if (item?.type === "effect" && changes?.system?.dynamicRegion) {
      scheduleDynamicEffectRegionReconciliation();
    }
  });
  hooks.on("deleteItem", item => {
    if (item?.type === "effect") scheduleDynamicEffectRegionReconciliation();
  });
  hooks.once?.("ready", () => scheduleDynamicEffectRegionReconciliation(0));
  return true;
}
