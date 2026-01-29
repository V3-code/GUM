// systems/gum/module/config/body-profiles.js

export const BODY_PROFILES = {
  humanoid: {
    id: "humanoid",
    label: "Humanoide (padrão)",
    locations: {
      head:   { name: "Crânio", label: "Crânio (-7)", roll: "3-4",  penalty: -7 },
      face:   { name: "Rosto", label: "Rosto (-5)",  roll: "5",    penalty: -5 },
      neck:   { name: "Pescoço", label: "Pescoço (-5)", roll: "6",   penalty: -5 },
      torso:  { name: "Torso", label: "Torso (0)",   roll: "9-11", penalty: 0 },
      vitals: { name: "Órg. Vitais", label: "Órg. Vitais (-3)", roll: "--", penalty: -3 },
      groin:  { name: "Virilha", label: "Virilha (-3)", roll: "11",  penalty: -3 },
      arm_r:  { name: "Braço D", label: "Braço D (-2)", roll: "8",   penalty: -2 },
      arm_l:  { name: "Braço E", label: "Braço E (-2)", roll: "12",  penalty: -2 },
      hand_r: { name: "Mão D", label: "Mão D (-4)",  roll: "15",   penalty: -4 },
      hand_l: { name: "Mão E", label: "Mão E (-4)",  roll: "--",   penalty: -4 },
      leg_r:  { name: "Perna D", label: "Perna D (-2)", roll: "6-7", penalty: -2 },
      leg_l:  { name: "Perna E", label: "Perna E (-2)", roll: "13-14", penalty: -2 },
      foot_r: { name: "Pé D", label: "Pé D (-4)",   roll: "16",   penalty: -4 },
      foot_l: { name: "Pé E", label: "Pé E (-4)",   roll: "--",   penalty: -4 },
      eyes:   { name: "Olhos", label: "Olhos (-9)",  roll: "--",   penalty: -9 }
    }
  }
};

export function getBodyProfile(profileId) {
  return BODY_PROFILES[profileId] ?? BODY_PROFILES.humanoid;
}

export function listBodyProfiles() {
  return Object.values(BODY_PROFILES).map(p => ({ id: p.id, label: p.label }));
}

export function listBodyLocations(profileId) {
  const profiles = profileId ? [getBodyProfile(profileId)] : Object.values(BODY_PROFILES);
  const seen = new Set();
  const locations = [];

  for (const profile of profiles) {
    for (const [id, loc] of Object.entries(profile.locations || {})) {
      if (seen.has(id)) continue;
      seen.add(id);
      locations.push({
        id,
        name: loc.name ?? loc.label ?? id,
        label: loc.label ?? loc.name ?? id
      });
    }
  }

  return locations;
}
