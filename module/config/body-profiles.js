// systems/gum/module/config/body-profiles.js

export const BODY_PROFILES = {
  humanoid: {
    id: "humanoid",
    label: "Humanoide (padrão)",
    locations: {
      head:   { label: "Crânio (-7)", roll: "3-4",  penalty: -7 },
      face:   { label: "Rosto (-5)",  roll: "5",    penalty: -5 },
      neck:   { label: "Pescoço (-5)", roll: "6",   penalty: -5 },
      torso:  { label: "Torso (0)",   roll: "9-11", penalty: 0 },
      vitals: { label: "Órg. Vitais (-3)", roll: "--", penalty: -3 },
      groin:  { label: "Virilha (-3)", roll: "11",  penalty: -3 },
      arm_r:  { label: "Braço D (-2)", roll: "8",   penalty: -2 },
      arm_l:  { label: "Braço E (-2)", roll: "12",  penalty: -2 },
      hand_r: { label: "Mão D (-4)",  roll: "15",   penalty: -4 },
      hand_l: { label: "Mão E (-4)",  roll: "--",   penalty: -4 },
      leg_r:  { label: "Perna D (-2)", roll: "6-7", penalty: -2 },
      leg_l:  { label: "Perna E (-2)", roll: "13-14", penalty: -2 },
      foot_r: { label: "Pé D (-4)",   roll: "16",   penalty: -4 },
      foot_l: { label: "Pé E (-4)",   roll: "--",   penalty: -4 },
      eyes:   { label: "Olhos (-9)",  roll: "--",   penalty: -9 }
    }
  }
};

export function getBodyProfile(profileId) {
  return BODY_PROFILES[profileId] ?? BODY_PROFILES.humanoid;
}

export function listBodyProfiles() {
  return Object.values(BODY_PROFILES).map(p => ({ id: p.id, label: p.label }));
}
