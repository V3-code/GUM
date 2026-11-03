export type GumDocumentReference<T = unknown> = T | string;

export interface GumApiErrorDetails { [key: string]: unknown }
export class GumApiError extends Error {
  readonly code: string;
  readonly details: GumApiErrorDetails;
}

export interface GumApi {
  readonly version: string;
  readonly systemVersion: string | null;
  readonly hooks: {
    readonly READY: "gum.apiReady";
    readonly STATUS_CONFIGURATION_CHANGED: "gumWorldStatusConfigurationChanged";
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
  readonly imports: { gcs(options?: { actor?: GumDocumentReference | null; [key: string]: unknown }): Promise<any> };
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
