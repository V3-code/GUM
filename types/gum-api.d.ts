export type GumDocumentReference<T = unknown> = T | string;

export interface GumApiErrorDetails { [key: string]: unknown }
export class GumApiError extends Error {
  readonly code: string;
  readonly details: GumApiErrorDetails;
}

export interface GumLifecycleAction {
  readonly type: string | null;
  readonly id: string | null;
  readonly attackType: string | null;
  readonly label: string | null;
  readonly data: any;
}

export interface GumLifecycleContext<TResult = any> {
  readonly version: 1;
  readonly eventId: string;
  readonly userId: string | null;
  readonly timestamp: number;
  readonly actor: any | null;
  readonly sourceToken: any | null;
  readonly item: any | null;
  readonly action: GumLifecycleAction;
  readonly targets: readonly any[];
  readonly result: TResult;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface GumEffectAppliedResult {
  readonly actionIds: readonly string[];
  readonly actionCount: number;
  readonly persistent: boolean;
  readonly activeEffects: readonly any[];
  readonly activeEffectUuids: readonly string[];
}

export interface GumEffectStateResult {
  readonly active: boolean;
  readonly transition: "enabled" | "disabled" | "removed";
  readonly activeEffect: any;
  readonly targetActor: any;
}

export interface GumApi {
  readonly version: string;
  readonly systemVersion: string | null;
  readonly hooks: {
    readonly READY: "gum.apiReady";
    readonly STATUS_CONFIGURATION_CHANGED: "gumWorldStatusConfigurationChanged";
    readonly ROLL_COMPLETED: "gum.rollCompleted";
    readonly DAMAGE_ROLLED: "gum.damageRolled";
    readonly DAMAGE_APPLIED: "gum.damageApplied";
    readonly EFFECT_APPLIED: "gum.effectApplied";
    readonly EFFECT_REMOVED: "gum.effectRemoved";
    readonly EFFECT_STATE_CHANGED: "gum.effectStateChanged";
    readonly CONDITION_STATE_CHANGED: "gum.conditionStateChanged";
    readonly STATE_EFFECT_GROUP_CHANGED: "gum.stateEffectGroupChanged";
    readonly ITEM_USE_COMPLETED: "gum.itemUseCompleted";
  };
  readonly errors: { readonly GumApiError: typeof GumApiError };
  readonly actors: {
    resolve(reference: GumDocumentReference): Promise<any>;
  };
  readonly items: {
    resolve(reference: GumDocumentReference, options?: { actor?: GumDocumentReference | null }): Promise<any>;
  };
  readonly rolls: {
    perform(actor: GumDocumentReference, rollData?: Record<string, unknown>, options?: Record<string, unknown>): Promise<any>;
    fromHotbar(options?: Record<string, unknown>): Promise<any> | any;
    executeRequest(request: Record<string, unknown>, targetKey: string, options?: Record<string, unknown>): Promise<any> | any;
  };
  readonly effects: {
    actions(effectOrSystem?: any): any[];
    apply(effect: GumDocumentReference, targets: any[], context?: Record<string, unknown>): Promise<any>;
    applyDirect(effect: GumDocumentReference, targets: any[], context?: Record<string, unknown>): Promise<any>;
    applyUseEvent(item: GumDocumentReference, actor: GumDocumentReference, trigger: string, options?: Record<string, unknown>): Promise<any>;
    setGroupActive(item: GumDocumentReference, groupId: string, active: boolean, options?: { actor?: GumDocumentReference | null }): Promise<any>;
    syncItem(item: GumDocumentReference, options?: Record<string, unknown>): Promise<any>;
    getBridge(effect: GumDocumentReference, options?: { actor?: GumDocumentReference | null }): Promise<any>;
  };
  readonly damage: {
    fromHotbar(options?: Record<string, unknown>): Promise<any> | any;
    resolveFormula(actor: any, item: any, attack: any, attackType: string, rollData?: Record<string, unknown>): string;
    resolveProfile(actor: any, item: any, attack: any, attackType: string, options?: Record<string, unknown>): any;
    resolveTargetDefenseModifiers(actor: any, rollContext: any, rollData?: Record<string, unknown>): any;
  };
  readonly content: {
    purposes(): any[];
    getSourceIds(purpose: string): string[];
    resolveSources(purpose: string): any[];
    getDocuments(purpose: string): Promise<{ documents: any[]; invalidSources: any[] }>;
    getIndex(purpose: string, options?: { fields?: string[] }): Promise<{ entries: any[]; invalidSources: any[] }>;
    setSourceIds(purpose: string, ids: string[]): Promise<any>;
    restoreDefaults(purpose: string): Promise<any>;
  };
  readonly status: { list(): any[] };
    readonly imports: {
      gcs(options?: { actor?: GumDocumentReference | null; [key: string]: unknown }): Promise<any>;
      gumJson(options?: Record<string, unknown>): Promise<any>;
    };
  readonly ui: {
    openTestRequest(): any;
    openGmScreen(): any;
    openContentSources(): any;
    openStatusConfiguration(): any;
  };
}

declare global {
  interface Game {
    gum: {
      api: GumApi;
      [key: string]: any;
    };
  }
}
