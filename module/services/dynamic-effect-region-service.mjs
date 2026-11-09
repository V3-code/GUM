import {
  GUM_REGION_EFFECT_BEHAVIOR,
  isDynamicRegionTarget,
  removeRegionAppliedEffects
} from "../integrations/scene-effect-integration.mjs";

export const GUM_DYNAMIC_EFFECT_REGION_BEHAVIOR = GUM_REGION_EFFECT_BEHAVIOR;
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
    shape: config?.shape === "emanation" ? "emanation" : "circle",
    range: Number.isFinite(range) && range > 0 ? range : Math.max(Number(defaultRange) || 1, 0.01),
    actionIds: [...new Set((Array.isArray(config?.actionIds) ? config.actionIds : String(config?.actionIds ?? "").split(","))
      .map(id => String(id).trim()).filter(Boolean))],
    targetMode,
    includeSelf: config?.includeSelf === true,
    gridBased: config?.gridBased === true,
    showColor: config?.showColor !== false,
    color: /^#[0-9a-f]{6}$/i.test(String(config?.color ?? "")) ? String(config.color) : "#7b61ff"
  };
}

export { isDynamicRegionTarget };

export function buildDynamicRegionData({ controllerEffect, effectItem, token, config, constRef = globalThis.CONST } = {}) {
  const normalized = normalizeDynamicEffectRegion(config);
  const enter = constRef?.REGION_EVENTS?.TOKEN_ENTER ?? "tokenEnter";
  const exit = constRef?.REGION_EVENTS?.TOKEN_EXIT ?? "tokenExit";
  return {
    name: `${effectItem?.name || controllerEffect?.name || "GUM"} — ${token?.name || token?.actor?.name || "Aura"}`,
    color: normalized.color,
    hidden: !normalized.showColor,
    locked: true,
    visibility: normalized.showColor
      ? (constRef?.REGION_VISIBILITY?.ALWAYS ?? 2)
      : (constRef?.REGION_VISIBILITY?.LAYER ?? 0),
    displayMeasurements: false,
    behaviors: [{
      type: GUM_DYNAMIC_EFFECT_REGION_BEHAVIOR,
      system: {
        events: [enter, exit],
        effectUuid: effectItem?.uuid ?? "",
        actionIds: normalized.actionIds,
        sourceTokenUuid: token?.uuid ?? "",
        targetMode: normalized.targetMode,
        includeSelf: normalized.includeSelf,
        removeOnExit: true
      }
    }],
    flags: {
      gum: {
        [GUM_DYNAMIC_EFFECT_REGION_FLAG]: {
          version: DYNAMIC_EFFECT_REGION_VERSION,
          controllerActiveEffectUuid: controllerEffect?.uuid ?? null,
          effectItemUuid: effectItem?.uuid ?? null,
          sourceTokenUuid: token?.uuid ?? null,
          signature: JSON.stringify(normalized)
        }
      }
    }
  };
}

const isPrimaryActiveGM = gameRef => {
  if (!gameRef?.user?.isGM) return false;
  const activeGms = collectionValues(gameRef.users)
    .filter(user => user.active && user.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return !activeGms.length || activeGms[0]?.id === gameRef.user.id;
};

const controllerItemUuid = effect => {
  if (effect?.disabled || getProperty(effect, "flags.gum.dynamicRegionController") !== true) return null;
  if (getProperty(effect, "flags.gum.dynamicRegionGrant")) return null;
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
      if (!config.actionIds.length) {
        config.actionIds = (Array.isArray(effectItem.system?.actions) ? effectItem.system.actions : [])
          .filter(action => action?.delivery === "dynamic_region")
          .map(action => String(action.id || "").trim())
          .filter(Boolean);
      }
      if (!config.enabled || !config.actionIds.length) continue;
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
  if (!isPrimaryActiveGM(gameRef) || typeof regionClass?.create !== "function") return [];
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
      const actors = [...new Set(collectionValues(scene.tokens).map(token => token.actor).filter(Boolean))];
      for (const actor of actors) {
        await removeRegionAppliedEffects(actor, {
          regionUuid: region.uuid,
          effectUuid: flag.effectItemUuid
        });
      }
      results.push(await region.delete({ gumDynamicRegionSync: true }));
    } else keptKeys.add(key);
  }

  for (const entry of desired.values()) {
    if (keptKeys.has(entry.key)) continue;
    const data = buildDynamicRegionData(entry);
    results.push(await createDynamicEffectRegion(regionClass, entry, data));
  }
  return results;
}

async function createDynamicEffectRegion(regionClass, entry, data) {
  const { token, config } = entry;
  if (config.shape === "emanation") {
    return regionClass.createTokenEmanation(token, config.range, data, {
      excludeToken: false,
      gridBased: config.gridBased,
      createOptions: { gumDynamicRegionSync: true }
    });
  }

  const scene = token.parent;
  const gridDistance = Number(scene?.grid?.distance) || Number(scene?.dimensions?.distance) || 1;
  const gridSize = Number(scene?.grid?.size) || Number(scene?.dimensions?.size) || 100;
  const distancePixels = Number(scene?.dimensions?.distancePixels) || (gridSize / gridDistance);
  const source = token._source || token;
  const center = token.getCenterPoint?.()
    || token.object?.center
    || {
      x: Number(source.x || 0) + ((Number(source.width) || 1) * gridSize / 2),
      y: Number(source.y || 0) + ((Number(source.height) || 1) * gridSize / 2)
    };
  const elevation = Number(source.elevation) || 0;
  const depth = Number(source.depth) || Math.min(Number(source.width) || 1, Number(source.height) || 1);
  return regionClass.create({
    ...data,
    shapes: [{
      type: "circle",
      x: center.x,
      y: center.y,
      radius: config.range * distancePixels,
      gridBased: config.gridBased
    }],
    elevation: {
      bottom: elevation - config.range,
      top: elevation + (depth * gridDistance) + config.range
    },
    attachment: { token: token.id },
    levels: source.level ? [source.level] : []
  }, { parent: scene, gumDynamicRegionSync: true });
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
    if (item?.type === "effect" && (changes?.system?.dynamicRegion || changes?.system?.actions)) {
      scheduleDynamicEffectRegionReconciliation();
    }
  });
  hooks.on("deleteItem", item => {
    if (item?.type === "effect") scheduleDynamicEffectRegionReconciliation();
  });
  hooks.once?.("ready", () => scheduleDynamicEffectRegionReconciliation(0));
  return true;
}
