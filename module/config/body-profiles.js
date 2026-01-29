// systems/gum/module/config/body-profiles.js

const LOCATION_GROUPS = {
  arm: { label: "Braço", plural: "Braços" },
  hand: { label: "Mão", plural: "Mãos" },
  leg: { label: "Perna", plural: "Pernas" },
  foot: { label: "Pé", plural: "Pés" },
  wing: { label: "Asa", plural: "Asas" },
  tail: { label: "Cauda", plural: "Caudas" },
  tentacle: { label: "Tentáculo", plural: "Tentáculos" },
  pincer: { label: "Pinça", plural: "Pinças" },
  fin: { label: "Nadadeira", plural: "Nadadeiras" },
  paw: { label: "Pata", plural: "Patas" }
};

const location = (name, { groupKey = null, roll = null } = {}) => ({
  name,
  label: name,
  roll,
  groupKey,
  groupLabel: groupKey ? LOCATION_GROUPS[groupKey]?.label : null,
  groupPlural: groupKey ? LOCATION_GROUPS[groupKey]?.plural : null
});

export const EXTRA_BODY_LOCATIONS = {
  shoulder_1: location("Ombro 1"),
  shoulder_2: location("Ombro 2"),
  chest_1: location("Peito 1"),
  chest_2: location("Peito 2"),
  abdomen_1: location("Abdômen 1"),
  abdomen_2: location("Abdômen 2"),
  joint_1: location("Articulação 1"),
  joint_2: location("Articulação 2"),
  joint_3: location("Articulação 3"),
  spine_1: location("Coluna 1"),
  spine_2: location("Coluna 2"),
  artery_1: location("Artéria 1"),
  artery_2: location("Artéria 2"),
  jaw_1: location("Mandíbula 1"),
  jaw_2: location("Mandíbula 2"),
  wing_1: location("ex-Asa 1", { groupKey: "wing" }),
  wing_2: location("ex-Asa 2", { groupKey: "wing" }),
  wing_3: location("ex-Asa 3", { groupKey: "wing" }),
  wing_4: location("ex-Asa 4", { groupKey: "wing" }),
  tail_1: location("ex-Cauda 1", { groupKey: "tail" }),
  tail_2: location("ex-Cauda 2", { groupKey: "tail" }),
  fin_1: location("ex-Nadadeira 1", { groupKey: "fin" }),
  fin_2: location("ex-Nadadeira 2", { groupKey: "fin" }),
  horn_1: location("Chifre 1"),
  horn_2: location("Chifre 2"),
  horn_3: location("Chifre 3"),
  horn_4: location("Chifre 4"),
  arm_1: location("ex-Braço 1", { groupKey: "arm" }),
  arm_2: location("ex-Braço 2", { groupKey: "arm" }),
  arm_3: location("ex-Braço 3", { groupKey: "arm" }),
  arm_4: location("ex-Braço 4", { groupKey: "arm" }),
  leg_1: location("ex-Perna 1", { groupKey: "leg" }),
  leg_2: location("ex-Perna 2", { groupKey: "leg" }),
  leg_3: location("ex-Perna 3", { groupKey: "leg" }),
  leg_4: location("ex-Perna 4", { groupKey: "leg" }),
  hand_1: location("ex-Mão 1", { groupKey: "hand" }),
  hand_2: location("ex-Mão 2", { groupKey: "hand" }),
  hand_3: location("ex-Mão 3", { groupKey: "hand" }),
  hand_4: location("ex-Mão 4", { groupKey: "hand" }),
  foot_1: location("ex-Pé 1", { groupKey: "foot" }),
  foot_2: location("ex-Pé 2", { groupKey: "foot" }),
  foot_3: location("ex-Pé 3", { groupKey: "foot" }),
  foot_4: location("ex-Pé 4", { groupKey: "foot" }),
  nose_1: location("Nariz 1"),
  nose_2: location("Nariz 2"),
  ear_1: location("Orelha 1"),
  ear_2: location("Orelha 2")
};

export const BODY_PROFILES = {
  humanoid: {
    id: "humanoid",
    label: "Humanoide (padrão)",
    order: [
      "head", "eyes", "face", "neck",
      "torso", "vitals", "groin",
      "arm_l", "arm_r", "hand_l", "hand_r",
      "leg_l", "leg_r", "foot_l", "foot_r"
    ],
    locations: {
      head:   location("Crânio", { roll: "3-4" }),
      eyes:   location("Olhos", { roll: "--" }),
      face:   location("Rosto", { roll: "5" }),
      neck:   location("Pescoço", { roll: "6" }),
      torso:  location("Tronco", { roll: "9-11" }),
      vitals: location("Órg. Vitais", { roll: "--" }),
      groin:  location("Virilha", { roll: "11" }),
      arm_l:  location("Braço E1", { groupKey: "arm", roll: "12" }),
      arm_r:  location("Braço D1", { groupKey: "arm", roll: "8" }),
      hand_l: location("Mão E1", { groupKey: "hand", roll: "--" }),
      hand_r: location("Mão D1", { groupKey: "hand", roll: "15" }),
      leg_l:  location("Perna E1", { groupKey: "leg", roll: "13-14" }),
      leg_r:  location("Perna D1", { groupKey: "leg", roll: "6-7" }),
      foot_l: location("Pé E1", { groupKey: "foot", roll: "--" }),
      foot_r: location("Pé D1", { groupKey: "foot", roll: "16" })
    }
  },
  quadruped: {
    id: "quadruped",
    label: "Quadrúpede",
    order: [
      "head", "eyes", "face", "neck",
      "torso", "vitals", "groin",
      "leg_l_1", "leg_r_1", "leg_l_2", "leg_r_2",
      "foot_l_1", "foot_r_1", "foot_l_2", "foot_r_2",
      "tail_1"
    ],
    locations: {
      head: location("Crânio"),
      eyes: location("Olhos"),
      face: location("Rosto"),
      neck: location("Pescoço"),
      torso: location("Tronco"),
      vitals: location("Órg. Vitais"),
      groin: location("Virilha"),
      leg_l_1: location("Perna E1", { groupKey: "leg" }),
      leg_r_1: location("Perna D1", { groupKey: "leg" }),
      leg_l_2: location("Perna E2", { groupKey: "leg" }),
      leg_r_2: location("Perna D2", { groupKey: "leg" }),
      foot_l_1: location("Pé E1", { groupKey: "foot" }),
      foot_r_1: location("Pé D1", { groupKey: "foot" }),
      foot_l_2: location("Pé E2", { groupKey: "foot" }),
      foot_r_2: location("Pé D2", { groupKey: "foot" }),
      tail_1: location("Cauda 1", { groupKey: "tail" })
    }
  },
  hexapod: {
    id: "hexapod",
    label: "Hexápode",
    order: [
      "head", "eyes", "face", "neck",
      "torso", "vitals", "groin",
      "leg_l_1", "leg_r_1", "leg_l_2", "leg_r_2", "leg_l_3", "leg_r_3",
      "foot_l_1", "foot_r_1", "foot_l_2", "foot_r_2", "foot_l_3", "foot_r_3"
    ],
    locations: {
      head: location("Crânio"),
      eyes: location("Olhos"),
      face: location("Rosto"),
      neck: location("Pescoço"),
      torso: location("Tronco"),
      vitals: location("Órg. Vitais"),
      groin: location("Virilha"),
      leg_l_1: location("Perna E1", { groupKey: "leg" }),
      leg_r_1: location("Perna D1", { groupKey: "leg" }),
      leg_l_2: location("Perna E2", { groupKey: "leg" }),
      leg_r_2: location("Perna D2", { groupKey: "leg" }),
      leg_l_3: location("Perna E3", { groupKey: "leg" }),
      leg_r_3: location("Perna D3", { groupKey: "leg" }),
      foot_l_1: location("Pé E1", { groupKey: "foot" }),
      foot_r_1: location("Pé D1", { groupKey: "foot" }),
      foot_l_2: location("Pé E2", { groupKey: "foot" }),
      foot_r_2: location("Pé D2", { groupKey: "foot" }),
      foot_l_3: location("Pé E3", { groupKey: "foot" }),
      foot_r_3: location("Pé D3", { groupKey: "foot" })
    }
  },
  centauroid: {
    id: "centauroid",
    label: "Humano-quadrúpede",
    order: [
      "head", "eyes", "face", "neck",
      "torso_1", "torso_2", "vitals", "groin",
      "arm_l", "arm_r", "hand_l", "hand_r",
      "leg_l_1", "leg_r_1", "leg_l_2", "leg_r_2",
      "foot_l_1", "foot_r_1", "foot_l_2", "foot_r_2",
      "tail_1"
    ],
    locations: {
      head: location("Crânio"),
      eyes: location("Olhos"),
      face: location("Rosto"),
      neck: location("Pescoço"),
      torso_1: location("Tronco 1"),
      torso_2: location("Tronco 2"),
      vitals: location("Órg. Vitais"),
      groin: location("Virilha"),
      arm_l: location("Braço E1", { groupKey: "arm" }),
      arm_r: location("Braço D1", { groupKey: "arm" }),
      hand_l: location("Mão E1", { groupKey: "hand" }),
      hand_r: location("Mão D1", { groupKey: "hand" }),
      leg_l_1: location("Perna E1", { groupKey: "leg" }),
      leg_r_1: location("Perna D1", { groupKey: "leg" }),
      leg_l_2: location("Perna E2", { groupKey: "leg" }),
      leg_r_2: location("Perna D2", { groupKey: "leg" }),
      foot_l_1: location("Pé E1", { groupKey: "foot" }),
      foot_r_1: location("Pé D1", { groupKey: "foot" }),
      foot_l_2: location("Pé E2", { groupKey: "foot" }),
      foot_r_2: location("Pé D2", { groupKey: "foot" }),
      tail_1: location("Cauda 1", { groupKey: "tail" })
    }
  },
  avian: {
    id: "avian",
    label: "Aviário",
    order: [
      "head", "eyes", "face", "neck",
      "torso", "vitals", "groin",
      "wing_l_1", "wing_r_1",
      "leg_l", "leg_r", "foot_l", "foot_r",
      "tail_1"
    ],
    locations: {
      head: location("Crânio"),
      eyes: location("Olhos"),
      face: location("Rosto"),
      neck: location("Pescoço"),
      torso: location("Tronco"),
      vitals: location("Órg. Vitais"),
      groin: location("Virilha"),
      wing_l_1: location("Asa E1", { groupKey: "wing" }),
      wing_r_1: location("Asa D1", { groupKey: "wing" }),
      leg_l: location("Perna E1", { groupKey: "leg" }),
      leg_r: location("Perna D1", { groupKey: "leg" }),
      foot_l: location("Pé E1", { groupKey: "foot" }),
      foot_r: location("Pé D1", { groupKey: "foot" }),
      tail_1: location("Cauda 1", { groupKey: "tail" })
    }
  },
  vermiform: {
    id: "vermiform",
    label: "Vermiforme",
    order: ["head", "eyes", "face", "neck", "torso", "vitals"],
    locations: {
      head: location("Crânio"),
      eyes: location("Olhos"),
      face: location("Rosto"),
      neck: location("Pescoço"),
      torso: location("Tronco"),
      vitals: location("Órg. Vitais")
    }
  },
  octopod: {
    id: "octopod",
    label: "Octópode",
    order: [
      "head", "eyes", "face", "neck",
      "torso", "vitals",
      "tentacle_l_1", "tentacle_r_1", "tentacle_l_2", "tentacle_r_2",
      "tentacle_l_3", "tentacle_r_3", "tentacle_l_4", "tentacle_r_4"
    ],
    locations: {
      head: location("Crânio"),
      eyes: location("Olhos"),
      face: location("Rosto"),
      neck: location("Pescoço"),
      torso: location("Tronco"),
      vitals: location("Órg. Vitais"),
      tentacle_l_1: location("Tentáculo E1", { groupKey: "tentacle" }),
      tentacle_r_1: location("Tentáculo D1", { groupKey: "tentacle" }),
      tentacle_l_2: location("Tentáculo E2", { groupKey: "tentacle" }),
      tentacle_r_2: location("Tentáculo D2", { groupKey: "tentacle" }),
      tentacle_l_3: location("Tentáculo E3", { groupKey: "tentacle" }),
      tentacle_r_3: location("Tentáculo D3", { groupKey: "tentacle" }),
      tentacle_l_4: location("Tentáculo E4", { groupKey: "tentacle" }),
      tentacle_r_4: location("Tentáculo D4", { groupKey: "tentacle" })
    }
  },
  cancroid: {
    id: "cancroid",
    label: "Cancroide",
    order: [
      "head", "eyes", "face",
      "torso", "vitals",
      "arm_l", "arm_r", "pincer_l_1", "pincer_r_1",
      "leg_l_1", "leg_r_1", "leg_l_2", "leg_r_2"
    ],
    locations: {
      head: location("Crânio"),
      eyes: location("Olhos"),
      face: location("Rosto"),
      torso: location("Tronco"),
      vitals: location("Órg. Vitais"),
      arm_l: location("Braço E1", { groupKey: "arm" }),
      arm_r: location("Braço D1", { groupKey: "arm" }),
      pincer_l_1: location("Pinça E1", { groupKey: "pincer" }),
      pincer_r_1: location("Pinça D1", { groupKey: "pincer" }),
      leg_l_1: location("Perna E1", { groupKey: "leg" }),
      leg_r_1: location("Perna D1", { groupKey: "leg" }),
      leg_l_2: location("Perna E2", { groupKey: "leg" }),
      leg_r_2: location("Perna D2", { groupKey: "leg" })
    }
  },
  ichthyoid: {
    id: "ichthyoid",
    label: "Ictioide",
    order: ["head", "eyes", "face", "torso", "vitals", "fin_l_1", "fin_r_1", "tail_1"],
    locations: {
      head: location("Crânio"),
      eyes: location("Olhos"),
      face: location("Rosto"),
      torso: location("Tronco"),
      vitals: location("Órg. Vitais"),
      fin_l_1: location("Nadadeira E1", { groupKey: "fin" }),
      fin_r_1: location("Nadadeira D1", { groupKey: "fin" }),
      tail_1: location("Cauda 1", { groupKey: "tail" })
    }
  },
  arachnid: {
    id: "arachnid",
    label: "Aracnídeo",
    order: [
      "head", "eyes", "face", "neck",
      "torso", "vitals", "groin",
      "paw_l_1", "paw_r_1", "paw_l_2", "paw_r_2", "paw_l_3", "paw_r_3", "paw_l_4", "paw_r_4"
    ],
    locations: {
      head: location("Crânio"),
      eyes: location("Olhos"),
      face: location("Rosto"),
      neck: location("Pescoço"),
      torso: location("Tronco"),
      vitals: location("Órg. Vitais"),
      groin: location("Virilha"),
      paw_l_1: location("Pata E1", { groupKey: "paw" }),
      paw_r_1: location("Pata D1", { groupKey: "paw" }),
      paw_l_2: location("Pata E2", { groupKey: "paw" }),
      paw_r_2: location("Pata D2", { groupKey: "paw" }),
      paw_l_3: location("Pata E3", { groupKey: "paw" }),
      paw_r_3: location("Pata D3", { groupKey: "paw" }),
      paw_l_4: location("Pata E4", { groupKey: "paw" }),
      paw_r_4: location("Pata D4", { groupKey: "paw" })
    }
  },
  amorphous: {
    id: "amorphous",
    label: "Amorfo",
    order: ["body"],
    locations: {
      body: location("Corpo")
    }
  }
};

const LOCATION_INDEX = (() => {
  const index = {};

  for (const profile of Object.values(BODY_PROFILES)) {
    for (const [id, loc] of Object.entries(profile.locations || {})) {
      index[id] = loc;
    }
  }

  for (const [id, loc] of Object.entries(EXTRA_BODY_LOCATIONS)) {
    index[id] = loc;
  }

  return index;
})();

export function getBodyProfile(profileId) {
  const profile = BODY_PROFILES[profileId] ?? BODY_PROFILES.humanoid;
  return {
    ...profile,
    order: profile.order ?? Object.keys(profile.locations || {})
  };
}

export function getBodyLocationDefinition(locationId) {
  return LOCATION_INDEX[locationId];
}

export function listBodyProfiles() {
  return Object.values(BODY_PROFILES).map(p => ({ id: p.id, label: p.label }));
}

export function listBodyLocations(profileId) {
  const profiles = profileId ? [getBodyProfile(profileId)] : Object.values(BODY_PROFILES);
  const seen = new Set();
  const locations = [];

  for (const profile of profiles) {
    for (const id of profile.order ?? Object.keys(profile.locations || {})) {
      const loc = profile.locations?.[id];
      if (!loc) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      locations.push({
        id,
        name: loc.name ?? loc.label ?? id,
        label: loc.label ?? loc.name ?? id
      });
    }
  }

  for (const [id, loc] of Object.entries(EXTRA_BODY_LOCATIONS)) {
    if (seen.has(id)) continue;
    seen.add(id);
    locations.push({
      id,
      name: loc.name ?? loc.label ?? id,
      label: loc.label ?? loc.name ?? id
    });
  }

  return locations;
}