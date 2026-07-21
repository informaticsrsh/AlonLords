export const empireLords = Object.freeze([
  {
    id: 'empire_lord_henrik',
    name: 'Генріх Щасливий',
    description: 'Примножує Віру за перемоги й послаблює її втрату від смертей союзників.',
    level: 1,
    leadership: 12,
    tactics: 2,
    battlePower: 3,
    vitality: 2,
    crystalVolume: 60,
    crystalRegenSpeed: 10
  },
  {
    id: 'empire_lord_arthur',
    name: 'Артур Милосердний',
    description: 'Здорові союзники сильніше вражають поранених ворогів і можуть добити їх Ударом милосердя.',
    level: 1,
    leadership: 12,
    tactics: 2,
    battlePower: 4,
    vitality: 3,
    crystalVolume: 55,
    crystalRegenSpeed: 8
  }
]);

export const LORD_SKILL_POINTS_PER_LEVEL = 3;
export const LORD_ATTRIBUTE_UPGRADES = Object.freeze({
  leadership: { amount: 1 },
  tactics: { amount: 1 },
  battlePower: { amount: 1 },
  vitality: { amount: 1 },
  crystalVolume: { amount: 5 },
  crystalRegenSpeed: { amount: 1 }
});

export function experienceToNextLordLevel(level = 1) {
  return 50 + Math.max(0, level - 1) * 25;
}

export function createLordProgress() {
  return {
    level: 1,
    experience: 0,
    skillPoints: 0,
    attributes: Object.fromEntries(Object.keys(LORD_ATTRIBUTE_UPGRADES).map((attribute) => [attribute, 0]))
  };
}

export function normalizeLordProgress(progress) {
  const defaults = createLordProgress();
  const attributes = Object.fromEntries(Object.keys(LORD_ATTRIBUTE_UPGRADES).map((attribute) => [
    attribute,
    Math.max(0, Number(progress?.attributes?.[attribute] ?? 0) || 0)
  ]));
  // Refund ranks spent in the short-lived signature-skill version of progression.
  // That skill is now correctly driven only by the lord level.
  const legacyRefund = Math.max(0, Number(progress?.skillRank ?? 1) - 1) || 0;
  return {
    level: Math.max(1, Number(progress?.level ?? defaults.level)),
    experience: Math.max(0, Number(progress?.experience ?? defaults.experience)),
    skillPoints: Math.max(0, Number(progress?.skillPoints ?? defaults.skillPoints)) + legacyRefund,
    attributes
  };
}

export function addLordExperience(progress, amount = 0) {
  const next = normalizeLordProgress(progress);
  next.experience += Math.max(0, Number(amount) || 0);
  while (next.experience >= experienceToNextLordLevel(next.level)) {
    next.experience -= experienceToNextLordLevel(next.level);
    next.level += 1;
    next.skillPoints += LORD_SKILL_POINTS_PER_LEVEL;
  }
  return next;
}

export function getLordSkillEffects(lord) {
  const level = Math.max(1, Number(lord?.level ?? 1));
  if (lord?.id === 'empire_lord_arthur') {
    return {
      level,
      healthyAllyThreshold: Math.max(0.5, (90 - 2 * level) / 100),
      woundedTargetThreshold: Math.min(0.49, (18 + 1.6 * level) / 100),
      mercyDamageMultiplier: (15 + 2 * level) / 100,
      executeThreshold: Math.min(0.19, (6 + 0.7 * level) / 100)
    };
  }
  return {
    level,
    faithGainMultiplier: Math.min(1.3 + 0.03 * level, 2),
    faithLossMultiplier: Math.max(0.5, 1 - 0.02 * level),
    highFaithSpeedMultiplier: Math.min(1.5, 1.2 + 0.015 * level),
    highFaithResistanceBonus: 0.005 * level,
    highFaithCritBonus: 0.003 * level,
    lowFaithSpeedMultiplier: Math.min(1, 0.8 + 0.01 * level)
  };
}

export function getEmpireLord(id) {
  return empireLords.find((lord) => lord.id === id) ?? null;
}

export function getBattleLordStats(lord) {
  if (lord.id !== 'empire_lord_henrik') return lord;
  const presence = Math.min(0.7 + 0.015 * ((lord.level ?? 1) - 1), 0.9);
  return {
    ...lord,
    battlePower: lord.battlePower * presence,
    vitality: lord.vitality * presence,
    crystalRegenSpeed: lord.crystalRegenSpeed * presence
  };
}
