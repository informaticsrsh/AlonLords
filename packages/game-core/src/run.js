import { empireUnits, getEmpireUnit } from './catalog.js';
import { addLordExperience, createLordProgress, experienceToNextLordLevel, getEmpireLord, getLordStarterUnitIds, LORD_ATTRIBUTE_UPGRADES, normalizeLordProgress } from './lords.js';

const enemyProfiles = {
  safe: { leadership: 4, growth: 1, maxUnits: 2, label: 'Легкий загін' },
  rich: { leadership: 8, growth: 2, maxUnits: 4, label: 'Середній загін' },
  risky: { leadership: 12, growth: 3, maxUnits: 6, label: 'Важкий загін' }
};

const rewardDefinitions = [
  { type: 'gold', multiplier: 2 },
  { type: 'lord_experience', multiplier: 4 },
  { type: 'skill_points', multiplier: 0.05 },
  { type: 'mines', multiplier: 0.08 }
];

export const HARD_BATTLE_VICTORIES_PER_UNIT_UNLOCK = 3;

function createEnemyRng(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function getEnemyLeadershipBudget(pathId, difficulty) {
  const profile = enemyProfiles[pathId] ?? enemyProfiles.safe;
  return profile.leadership + (difficulty - 1) * profile.growth;
}

function pathRewardSeed(seed, difficulty, pathId) {
  const pathValue = String(pathId).split('').reduce((total, character) => total + character.charCodeAt(0), 0);
  return Number(seed) + difficulty * 1009 + pathValue;
}

function createPathReward(leadershipBudget, rng) {
  const availableRewards = rewardDefinitions
    .map((definition) => ({ ...definition, amount: Math.floor(leadershipBudget * definition.multiplier) }))
    // Skill points and mines cannot be awarded as zero-value rewards.
    .filter((reward) => reward.type === 'gold' || reward.type === 'lord_experience' || reward.amount > 0);
  return availableRewards[Math.floor(rng() * availableRewards.length)];
}

function getLordStarterUnits(run) {
  return getLordStarterUnitIds(run.lordId).filter((unitId) => getEmpireUnit(unitId));
}

function getUnlockableUnitIds(run) {
  const starterUnitIds = new Set(getLordStarterUnits(run));
  // The current recruitment roster consists of tier-1 units. Higher tiers are
  // obtained through unit evolution, rather than recruited directly.
  return empireUnits
    .filter((unit) => unit.tier === 1 && !starterUnitIds.has(unit.id))
    .map((unit) => unit.id);
}

function getUnlockedUnitIds(run) {
  const starterUnitIds = getLordStarterUnits(run);
  const allowedUnitIds = new Set([...starterUnitIds, ...getUnlockableUnitIds(run)]);
  const savedUnitIds = Array.isArray(run.unlockedUnitIds) ? run.unlockedUnitIds : starterUnitIds;
  return [...new Set([...starterUnitIds, ...savedUnitIds])].filter((unitId) => allowedUnitIds.has(unitId));
}

export function getRecruitableUnits(run) {
  const unlockedUnitIds = new Set(getUnlockedUnitIds(run));
  return empireUnits.filter((unit) => unit.tier === 1 && unlockedUnitIds.has(unit.id));
}

export function getUnitUnlockProgress(run) {
  const unlockedUnitIds = new Set(getUnlockedUnitIds(run));
  const remainingUnitIds = getUnlockableUnitIds(run).filter((unitId) => !unlockedUnitIds.has(unitId));
  const hardBattleVictories = Math.max(0, Number(run.hardBattleVictories) || 0);
  return {
    hardBattleVictories,
    victoriesUntilNextUnlock: remainingUnitIds.length === 0
      ? 0
      : HARD_BATTLE_VICTORIES_PER_UNIT_UNLOCK - (hardBattleVictories % HARD_BATTLE_VICTORIES_PER_UNIT_UNLOCK),
    remainingUnitIds
  };
}

function selectUnitUnlock(run, hardBattleVictories, unlockedUnitIds) {
  const candidates = getUnlockableUnitIds(run).filter((unitId) => !unlockedUnitIds.includes(unitId));
  if (candidates.length === 0 || hardBattleVictories % HARD_BATTLE_VICTORIES_PER_UNIT_UNLOCK !== 0) return null;
  const rng = createEnemyRng(Number(run.seed) + hardBattleVictories * 7919);
  return candidates[Math.floor(rng() * candidates.length)];
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
  const leadershipBudget = getEnemyLeadershipBudget(pathId, difficulty);
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
  // The enemy crystal grows with the actual force fielded, not just the chosen path.
  // This keeps mana skills viable as stronger compositions unlock more casters.
  const crystal = {
    manaMax: 40 + leadershipUsed * 2 + (difficulty - 1) * 5,
    manaRegen: 6 + Math.ceil(leadershipUsed / 3) + (difficulty - 1) * 2
  };
  return { label: profile.label, leadershipBudget, leadershipUsed, crystal, units };
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
    actionRules: Object.fromEntries(actions.map((action) => {
      const isRevive = action.targetRule?.selection === 'corpse_of_dead_ally';
      const isStatusSkill = ['buff', 'debuff', 'control'].includes(action.effectKind) && !isRevive;
      return [action.id, {
        allyHealth: action.effectKind === 'heal' && !isRevive ? 'any_below' : 'any',
        healthThreshold: 65,
        enemyHealth: 'any',
        enemyHealthThreshold: 65,
        effectState: isStatusSkill ? 'missing' : 'any',
        crystal: action.manaCost ? 'at_least' : 'enough',
        crystalValue: action.manaCost ?? 0
      }];
    })),
    // An untouched target order deliberately uses the target rule authored
    // for each skill (for example, a sniper keeps "lowest HP").
    targetPriority: {}
  };
}

function createRunSeed() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return values[0] || 1;
  }
  return Math.floor(Math.random() * 0xffffffff) + 1;
}

export function createRun({ lordId = 'empire_lord_henrik', seed = createRunSeed() } = {}) {
  const lord = getEmpireLord(lordId) ?? getEmpireLord('empire_lord_henrik');
  return {
    lordId: lord.id,
    lordProgress: createLordProgress(),
    seed,
    lives: 3,
    gold: 20,
    difficulty: 1,
    economicLimit: lord.leadership,
    mines: 0,
    unlockedUnitIds: getLordStarterUnitIds(lord.id),
    hardBattleVictories: 0,
    lastUnlockedUnitId: null,
    army: [],
    nextUnitNumber: 1,
    phase: 'hub'
  };
}

/** Combines a lord definition with the saved campaign-specific progression. */
export function getRunLord(run) {
  const lord = getEmpireLord(run.lordId) ?? getEmpireLord('empire_lord_henrik');
  const progress = normalizeLordProgress(run.lordProgress);
  const upgradedStats = Object.fromEntries(Object.entries(LORD_ATTRIBUTE_UPGRADES).map(([attribute, upgrade]) => [
    attribute,
    lord[attribute] + progress.attributes[attribute] * upgrade.amount
  ]));
  return {
    ...lord,
    ...progress,
    ...upgradedStats,
    experienceToNextLevel: experienceToNextLordLevel(progress.level)
  };
}

export function spendLordAttributePoint(run, attribute) {
  if (run.phase !== 'hub') return run;
  if (!LORD_ATTRIBUTE_UPGRADES[attribute]) return run;
  const progress = normalizeLordProgress(run.lordProgress);
  if (progress.skillPoints < 1) return { ...run, lordProgress: progress };
  return {
    ...run,
    lordProgress: {
      ...progress,
      skillPoints: progress.skillPoints - 1,
      attributes: { ...progress.attributes, [attribute]: progress.attributes[attribute] + 1 }
    }
  };
}

function leadershipLimit(run) {
  return run.economicLimit + normalizeLordProgress(run.lordProgress).attributes.leadership * LORD_ATTRIBUTE_UPGRADES.leadership.amount;
}

export function recruitUnit(run, unitId) {
  if (run.phase !== 'hub') return run;
  const unit = getEmpireUnit(unitId);
  if (!unit?.combat || !getUnlockedUnitIds(run).includes(unitId)) return run;
  const cost = unit.combat.leadershipCost;
  const leadershipUsed = run.army.reduce((sum, member) => sum + getEmpireUnit(member.unitId).combat.leadershipCost, 0);
  if (run.gold < cost || leadershipUsed + cost > leadershipLimit(run)) return run;

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
  return { ...run, phase: 'battle', selectedPath: path, lastUnlockedUnitId: null };
}

export function finishBattle(run, { victory, army = run.army, battleExperienceReward = 0 }) {
  const nextDifficulty = victory ? run.difficulty + 1 : Math.max(1, run.difficulty - 5);
  const lives = victory ? run.lives : run.lives - 1;
  const rewards = victory ? run.selectedPath ?? {} : {};
  const earnedBattleExperience = Math.max(0, Number(battleExperienceReward) || 0);
  const survivors = army.filter((member) => member.hp === null || member.hp === undefined || Number(member.hp) > 0);
  const experiencePerSurvivor = survivors.length > 0 ? earnedBattleExperience / survivors.length : 0;
  const experiencedArmy = army.map((member) => ({
    ...member,
    exp: Math.max(0, Number(member.exp) || 0) + (member.hp === null || member.hp === undefined || Number(member.hp) > 0 ? experiencePerSurvivor : 0)
  }));
  const lordExperienceReward = earnedBattleExperience + (rewards.lordExperienceReward ?? 0);
  const experiencedLordProgress = addLordExperience(run.lordProgress, lordExperienceReward);
  const lordProgress = victory
    ? { ...experiencedLordProgress, skillPoints: experiencedLordProgress.skillPoints + (rewards.skillPointReward ?? 0) }
    : experiencedLordProgress;
  const isHardBattleVictory = victory && rewards.id === 'risky';
  const hardBattleVictories = Math.max(0, Number(run.hardBattleVictories) || 0) + (isHardBattleVictory ? 1 : 0);
  const unlockedUnitIds = getUnlockedUnitIds(run);
  const lastUnlockedUnitId = isHardBattleVictory
    ? selectUnitUnlock(run, hardBattleVictories, unlockedUnitIds)
    : null;
  return {
    ...run,
    lives,
    difficulty: nextDifficulty,
    gold: victory ? run.gold + (rewards.goldReward ?? 0) + run.mines : run.gold,
    economicLimit: run.economicLimit + (rewards.economicLimitReward ?? 0),
    mines: run.mines + (rewards.mineReward ?? 0),
    unlockedUnitIds: lastUnlockedUnitId ? [...unlockedUnitIds, lastUnlockedUnitId] : unlockedUnitIds,
    hardBattleVictories,
    lastUnlockedUnitId,
    army: experiencedArmy,
    lordProgress,
    phase: lives > 0 ? 'hub' : 'game_over',
    selectedPath: null
  };
}

export function createPaths(difficulty, seed = 1) {
  return [
    { id: 'safe', name: 'Тихий шлях', threat: difficulty },
    { id: 'rich', name: 'Золота дорога', threat: difficulty + 1 },
    { id: 'risky', name: 'Небезпечний перевал', threat: difficulty + 2 }
  ].map((path) => {
    const leadershipBudget = getEnemyLeadershipBudget(path.id, difficulty);
    const reward = createPathReward(leadershipBudget, createEnemyRng(pathRewardSeed(seed, difficulty, path.id)));
    return {
      ...path,
      leadershipBudget,
      reward,
      goldReward: reward.type === 'gold' ? reward.amount : 0,
      lordExperienceReward: reward.type === 'lord_experience' ? reward.amount : 0,
      skillPointReward: reward.type === 'skill_points' ? reward.amount : 0,
      mineReward: reward.type === 'mines' ? reward.amount : 0
    };
  });
}
