import { getEmpireUnit } from './catalog.js';

export function createRun({ lordId = 'henry', seed = 1 } = {}) {
  return {
    lordId,
    seed,
    lives: 3,
    gold: 20,
    difficulty: 1,
    economicLimit: 12,
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
