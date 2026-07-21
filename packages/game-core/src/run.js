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

function shuffleEnemyCandidates(candidates, rng) {
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function createEnemyCompositions(candidates, leadershipBudget, maxUnits, limit = 128) {
  const compositions = [];
  const copies = new Map();

  function collect(startIndex, spent, units) {
    if (compositions.length >= limit || units.length >= maxUnits) return;
    for (let index = startIndex; index < candidates.length; index += 1) {
      const unit = candidates[index];
      const cost = unit.combat.leadershipCost;
      const nextSpent = spent + cost;
      if (nextSpent > leadershipBudget || (copies.get(unit.id) ?? 0) >= 2) continue;

      const nextUnits = [...units, unit];
      if (nextSpent === leadershipBudget) {
        compositions.push(nextUnits);
        if (compositions.length >= limit) return;
        continue;
      }

      copies.set(unit.id, (copies.get(unit.id) ?? 0) + 1);
      collect(index, nextSpent, nextUnits);
      const remainingCopies = copies.get(unit.id) - 1;
      if (remainingCopies === 0) copies.delete(unit.id);
      else copies.set(unit.id, remainingCopies);
      if (compositions.length >= limit) return;
    }
  }

  collect(0, 0, []);
  return compositions;
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

function canPlaceEnemyComposition(composition) {
  const occupied = new Set();
  return composition.every((unit) => placeEnemyUnit(unit, occupied));
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
  const compositions = createEnemyCompositions(shuffleEnemyCandidates(candidates, rng), leadershipBudget, profile.maxUnits)
    .filter(canPlaceEnemyComposition);
  const selectedComposition = compositions[Math.floor(rng() * compositions.length)] ?? [];
  const army = selectedComposition.map((unit, index) => ({ ...unit, id: `enemy-${unit.id}-${index + 1}`, unitId: unit.id }));
  const occupied = new Set();
  const units = army.map((unit) => ({ ...unit, position: placeEnemyUnit(unit, occupied) })).filter((unit) => unit.position);
  const leadershipUsed = units.reduce((total, unit) => total + unit.combat.leadershipCost, 0);
  return { label: profile.label, leadershipBudget, leadershipUsed, units };
}

function getEmpireUnitsByTier(tier) {
  return empireUnits.filter((unit) => unit.tier === tier);
}

/**
 * A new recruit starts with useful, event-aware tactics. The player may later
 * reorder these actions and tune the health/crystal thresholds in the UI.
 */
export function createDefaultTactics(unit) {
  const priority = (action) => {
    if (action.targetRule?.selection === 'corpse_of_dead_ally') return 0;
    if (action.effectKind === 'heal') return 1;
    if (action.effectKind === 'buff') return 2;
    if (action.effectKind === 'control') return 3;
    if (action.manaCost) return 4;
    if (action.effectKind === 'damage') return 5;
    return 6;
  };
  const actions = [...unit.combat.actions].sort((left, right) => priority(left) - priority(right));
  return {
    actionPriority: actions.map((action) => action.id),
    actionRules: Object.fromEntries(actions.map((action) => [action.id, {
      allyHealth: action.effectKind === 'heal' ? 'any_below' : 'any',
      healthThreshold: 65,
      crystal: action.manaCost ? 'at_least' : 'enough',
      crystalValue: action.manaCost ?? 0
    }])),
    // An untouched target order deliberately uses the target rule authored
    // for each skill (for example, a sniper keeps "lowest HP").
    targetPriority: {}
  };
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
    position: null,
    tactics: createDefaultTactics(unit)
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
