export const ROLL_PRIVACY_MODES = Object.freeze(["publicroll", "gmroll", "blindroll", "selfroll"]);

const LEGACY_TO_MESSAGE = Object.freeze({
  publicroll: "public",
  gmroll: "gm",
  blindroll: "blind",
  selfroll: "self"
});

const MESSAGE_TO_LEGACY = Object.freeze(Object.fromEntries(
  Object.entries(LEGACY_TO_MESSAGE).map(([legacy, message]) => [message, legacy])
));

export function normalizeRollPrivacyMode(mode, fallback = "publicroll") {
  const value = String(mode || "").trim();
  if (ROLL_PRIVACY_MODES.includes(value)) return value;
  if (MESSAGE_TO_LEGACY[value]) return MESSAGE_TO_LEGACY[value];
  return ROLL_PRIVACY_MODES.includes(fallback) ? fallback : "publicroll";
}

export function getCurrentRollPrivacyMode({ gameRef = globalThis.game } = {}) {
  const settings = gameRef?.settings;
  const hasMessageMode = settings?.settings?.has?.("core.messageMode") === true;
  const settingKey = hasMessageMode ? "messageMode" : "rollMode";
  let value;
  try {
    value = settings?.get?.("core", settingKey);
  } catch (_error) {
    value = null;
  }
  return normalizeRollPrivacyMode(value);
}

export function rollPrivacyOptions(selectedMode, localize = key => key) {
  const selected = normalizeRollPrivacyMode(selectedMode);
  return [
    { mode: "publicroll", icon: "fa-globe", labelKey: "GUM.RollPrivacy.Public" },
    { mode: "gmroll", icon: "fa-user-shield", labelKey: "GUM.RollPrivacy.PrivateGM" },
    { mode: "blindroll", icon: "fa-eye-slash", labelKey: "GUM.RollPrivacy.Blind" },
    { mode: "selfroll", icon: "fa-user", labelKey: "GUM.RollPrivacy.Self" }
  ].map(option => ({ ...option, label: localize(option.labelKey), selected: option.mode === selected }));
}

export function applyRollPrivacy(chatData, mode, {
  chatMessageClass = globalThis.ChatMessage,
  gameRef = globalThis.game,
  constRef = globalThis.CONST
} = {}) {
  const normalized = normalizeRollPrivacyMode(mode ?? getCurrentRollPrivacyMode({ gameRef }));
  const nextData = { ...(chatData || {}) };
  delete nextData.rollMode;

  if (typeof chatMessageClass?.applyMode === "function") {
    return chatMessageClass.applyMode(nextData, LEGACY_TO_MESSAGE[normalized]);
  }
  if (typeof chatMessageClass?.applyRollMode === "function") {
    return chatMessageClass.applyRollMode(nextData, normalized);
  }

  delete nextData.whisper;
  delete nextData.blind;
  const modes = constRef?.DICE_ROLL_MODES || {};
  if (normalized === (modes.PRIVATE || "gmroll") || normalized === "gmroll") {
    nextData.whisper = chatMessageClass?.getWhisperRecipients?.("GM") || [];
  } else if (normalized === (modes.BLIND || "blindroll") || normalized === "blindroll") {
    nextData.whisper = chatMessageClass?.getWhisperRecipients?.("GM") || [];
    nextData.blind = true;
  } else if (normalized === (modes.SELF || "selfroll") || normalized === "selfroll") {
    nextData.whisper = gameRef?.user?.id ? [gameRef.user.id] : [];
  }
  return nextData;
}
