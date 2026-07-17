import { empireUnits, getEmpireUnit } from './catalog.js';
import { getEmpireLord } from './lords.js';

const enemyProfiles = {
  safe: { leadership: 4, growth: 1, maxUnits: 2, label: 'Легкий загін' },
  rich: { leadership: 8, growth: 2, maxUnits: 4, label: 'Середній загін' },
  risky: { leadership: 12, growth: 3, maxUnits: 6, label: 'Важкий загін' }
};

function createEnemyRng(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function fitsEnemyPlacement(occupied, footprint, position) {
  if (position.row + footprint.rows > 3 || position.column + footprint.columns > 5) return false;
  for (let row = position.row; row < position.row + footprint.rows; row += 1) {
    for (let column = position.column; column < position.column + footprint.columns; column += 1) {
      if (occupied.has(`${row}:${column}`)) return false;
    }
  }
  return true;
}

function placeEnemyUnit(unit, occupied) {
  const footprint = unit.gridFootprint ?? { rows: 1, columns: 1 };
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const position = { row, column };
      if (!fitsEnemyPlacement(occupied, footprint, position)) continue;
      for (let occupiedRow = row; occupiedRow < row + footprint.rows; occupiedRow += 1) {
        for (let occupiedColumn = column; occupiedColumn < column + footprint.columns; occupiedColumn += 1) occupied.add(`${occupiedRow}:${occupiedColumn}`);
      }
      return position;
    }
  }
  return null;
}

/** Створює армію Імперії без бонусів лорда для одного зі шляхів. */
export function generateEnemyArmy({ pathId, difficulty = 1, seed = 1 }) {
  const profile = enemyProfiles[pathId] ?? enemyProfiles.safe;
  const leadershipBudget = profile.leadership + (difficulty - 1) * profile.growth;
  const maxTier = difficulty >= 7 ? 3 : difficulty >= 3 ? 2 : 1;
  const rng = createEnemyRng(seed);
  const candidates = Array.from({ length: maxTier }, (_, index) => index + 1)
    .flatMap((tier) => {
      const units = getEmpireUnitsByTier(tier);
      return units;
    });
  const army = [];
  let usedLeadership = 0;
  let attempts = 0;
  while (army.length < profile.maxUnits && attempts < 100) {
    attempts += 1;
    const score = (unit) => unit.combat.leadershipCost * unit.tier;
    const minScore = Math.min(...candidates.map(score));
    const slotsAfterPick = profile.maxUnits - army.length - 1;
    const affordable = candidates.filter((unit) => usedLeadership + score(unit) + minScore * slotsAfterPick <= leadershipBudget);
    if (!affordable.length) break;
    const unit = affordable[Math.floor(rng() * affordable.length)];
    army.push({ ...unit, id: `enemy-${unit.id}-${army.length + 1}`, unitId: unit.id });
    usedLeadership += score(unit);
  }
  const occupied = new Set();
  const units = army.map((unit) => ({ ...unit, position: placeEnemyUnit(unit, occupied) })).filter((unit) => unit.position);
  return { label: profile.label, leadershipBudget, leadershipUsed: usedLeadership, units };
}

function getEmpireUnitsByTier(tier) {
  return empireUnits.filter((unit) => unit.tier === tier);
}

export function createRun({ lordId = 'empire_lord_henrik', seed = 1 } = {}) {
  const lord = getEmpireLord(lordId) ?? getEmpireLord('empire_lord_henrik');
  return {
    lordId: lord.id,
    seed,
    lives: 3,
    gold: 20,
    difficulty: 1,
    economicLimit: lord.leadership,
    mines: 0,
    army: [],
    nextUnitNumber: 1,
    phase: 'hub'
  };
}

export function recruitUnit(run, unitId) {
  if (run.phase !== 'hub') return run;
  const unit = getEmpireUnit(unitId);
  if (!unit?.combat) return run;
  const cost = unit.combat.leadershipCost;
  const leadershipUsed = run.army.reduce((sum, member) => sum + getEmpireUnit(member.unitId).combat.leadershipCost, 0);
  if (run.gold < cost || leadershipUsed + cost > run.economicLimit) return run;

  const member = {
    instanceId: `${unitId}-${run.nextUnitNumber}`,
    unitId,
    hp: null,
    exp: 0,
    position: null
  };
  return { ...run, gold: run.gold - cost, army: [...run.army, member], nextUnitNumber: run.nextUnitNumber + 1 };
}

export function updateArmyMember(run, instanceId, update) {
  return {
    ...run,
    army: run.army.map((member) => member.instanceId === instanceId ? { ...member, ...update } : member)
  };
}

export function healUnit(run, instanceId, maxHp) {
  if (run.phase !== 'hub') return run;
  const member = run.army.find((item) => item.instanceId === instanceId);
  if (!member || member.hp === null || member.hp <= 0 || member.hp >= maxHp) return run;
  const cost = Math.max(1, Math.ceil((maxHp - member.hp) / 10));
  if (run.gold < cost) return run;
  return { ...updateArmyMember(run, instanceId, { hp: maxHp }), gold: run.gold - cost };
}

export function reviveUnit(run, instanceId, maxHp) {
  if (run.phase !== 'hub') return run;
  const member = run.army.find((item) => item.instanceId === instanceId);
  const cost = 10;
  if (!member || member.hp !== 0 || run.gold < cost) return run;
  return { ...updateArmyMember(run, instanceId, { hp: Math.ceil(maxHp / 2) }), gold: run.gold - cost };
}

export function evolveUnit(run, instanceId, targetUnitId) {
  if (run.phase !== 'hub') return run;
  const member = run.army.find((item) => item.instanceId === instanceId);
  const source = member && getEmpireUnit(member.unitId);
  const target = getEmpireUnit(targetUnitId);
  if (!member || !source?.combat?.evolutions.includes(targetUnitId) || !target?.combat || member.exp < (source.combat.expToUpgrade ?? 100)) return run;
  return updateArmyMember(run, instanceId, { unitId: targetUnitId, hp: null, exp: 0, position: null });
}

export function choosePath(run, path) {
  if (run.phase !== 'hub' || run.army.length === 0 || run.army.every((member) => member.hp === 0)) return run;
  return { ...run, phase: 'battle', selectedPath: path };
}

export function finishBattle(run, { victory, army = run.army }) {
  const nextDifficulty = victory ? run.difficulty + 1 : Math.max(1, run.difficulty - 5);
  const lives = victory ? run.lives : run.lives - 1;
  const rewards = victory ? run.selectedPath ?? {} : {};
  const experiencedArmy = army.map((member) => ({ ...member, exp: member.exp + (rewards.expReward ?? 0) }));
  return {
    ...run,
    lives,
    difficulty: nextDifficulty,
    gold: victory ? run.gold + (rewards.goldReward ?? 0) + run.mines : run.gold,
    economicLimit: run.economicLimit + (rewards.economicLimitReward ?? 0),
    mines: run.mines + (rewards.mineReward ?? 0),
    army: experiencedArmy,
    phase: lives > 0 ? 'hub' : 'game_over',
    selectedPath: null
  };
}

export function createPaths(difficulty) {
  return [
    { id: 'safe', name: 'Тихий шлях', goldReward: 5, expReward: 5, threat: difficulty },
    { id: 'rich', name: 'Золота дорога', goldReward: 10, economicLimitReward: 2, threat: difficulty + 1 },
    { id: 'risky', name: 'Небезпечний перевал', goldReward: 15, mineReward: 1, expReward: 10, threat: difficulty + 2 }
  ];
}
