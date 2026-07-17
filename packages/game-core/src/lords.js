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
