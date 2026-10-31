export function resolveDamageApplicationTarget({ targetedTokens = [], preferredTokens = [], controlledTokens = [] } = {}) {
  const targets = Array.from(targetedTokens || []).filter(token => token?.actor);
  if (targets.length === 1) return { token: targets[0], source: "target", reason: null };
  if (targets.length > 1) return { token: null, source: null, reason: "multiple-targets" };

  const preferred = Array.from(preferredTokens || []).filter(token => token?.actor);
  if (preferred.length === 1) return { token: preferred[0], source: "preferred", reason: null };
  if (preferred.length > 1) return { token: null, source: null, reason: "multiple-preferred" };

  const controlled = Array.from(controlledTokens || []).filter(token => token?.actor);
  if (controlled.length === 1) return { token: controlled[0], source: "controlled", reason: null };
  return {
    token: null,
    source: null,
    reason: controlled.length > 1 ? "multiple-controlled" : "missing-target"
  };
}
