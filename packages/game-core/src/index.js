import { applyActionEffect, applyBattleAuras, beginTurn, evaluateFormula, regenerateCrystal, selectAutomaticAction, spendActionResources, spendCrystalResources } from './actions.js';
import { getBattleLordStats, getEmpireLord } from './lords.js';

export { empireUnits, getEmpireUnit } from './catalog.js';
export { empireLords, getBattleLordStats, getEmpireLord } from './lords.js';
export { choosePath, createPaths, createRun, evolveUnit, finishBattle, generateEnemyArmy, healUnit, recruitUnit, reviveUnit, updateArmyMember } from './run.js';
export { applyActionEffect, applyBattleAuras, beginTurn, calculateDamage, evaluateFormula, expandAreaTargets, findGuardian, getAccessibleTargets, isActionUsable, regenerateCrystal, resolveAction, selectAutomaticAction, selectTargets, spendActionResources, spendCrystalResources } from './actions.js';

export function createUnitInstance(definition, lord) {
  if (!definition.combat) {
    throw new Error(`Unit ${definition.id} does not have combat data yet.`);
  }

  const maxHp = evaluateFormula(definition.combat.hpFormula, lord);
  return {
    id: definition.id,
    name: definition.name,
    maxHp,
    hp: maxHp,
    actions: definition.combat.actions,
    passives: definition.combat.passives ?? [],
    raceType: 'human',
    effects: [],
    cooldowns: {}
  };
}

/**
 * Створює відтворюваний генератор випадкових чисел.
 * Однаковий seed завжди повертає однакову послідовність значень.
 */
export function createRng(seed) {
  let state = Number(seed) >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createGrid({ rows, columns }) {
  return { rows, columns, placements: [] };
}

export function canPlaceUnit(grid, unit, position) {
  const footprint = unit.gridFootprint ?? { rows: 1, columns: 1 };
  const fitsInGrid = position.row >= 0
    && position.column >= 0
    && position.row + footprint.rows <= grid.rows
    && position.column + footprint.columns <= grid.columns;

  if (!fitsInGrid) return false;

  return !grid.placements.some((placement) => {
    const placedFootprint = placement.unit.gridFootprint ?? { rows: 1, columns: 1 };
    const overlapsByRows = position.row < placement.position.row + placedFootprint.rows
      && position.row + footprint.rows > placement.position.row;
    const overlapsByColumns = position.column < placement.position.column + placedFootprint.columns
      && position.column + footprint.columns > placement.position.column;
    return overlapsByRows && overlapsByColumns;
  });
}

export function placeUnit(grid, unit, position) {
  if (!canPlaceUnit(grid, unit, position)) return grid;
  return {
    ...grid,
    placements: [...grid.placements, { unit, position }]
  };
}

export function moveUnit(grid, unit, position) {
  const withoutUnit = {
    ...grid,
    placements: grid.placements.filter((placement) => placement.unit.id !== unit.id)
  };
  return canPlaceUnit(withoutUnit, unit, position) ? placeUnit(withoutUnit, unit, position) : grid;
}

function cloneUnit(unit) {
  return { ...unit, hp: unit.hp ?? unit.maxHp, effects: [...(unit.effects ?? [])], cooldowns: { ...(unit.cooldowns ?? {}) } };
}

function firstLiving(units) {
  return units.find((unit) => unit.hp > 0);
}

/**
 * Мінімальний детермінований автобій для вертикального зрізу.
 * Кожен живий юніт атакує першого живого суперника за порядком у складі.
 */
export function simulateBattle({ allies, enemies, lord = getEmpireLord('empire_lord_henrik'), seed = 1, maxRounds = 50 }) {
  const rng = createRng(seed);
  const battleLord = getBattleLordStats(lord);
  const initialAllies = allies.map((unit) => ({ ...cloneUnit(unit), lord: unit.lord ?? battleLord }));
  const initialEnemies = enemies.map(cloneUnit);
  const alliedAuras = applyBattleAuras(initialAllies, initialEnemies);
  const enemyAuras = applyBattleAuras(alliedAuras.enemies, alliedAuras.units);
  const state = {
    allies: enemyAuras.enemies,
    enemies: enemyAuras.units,
    events: [],
    round: 0,
    winner: null,
    battleSpirit: 50,
    allyCrystal: { mana: battleLord.crystalVolume, manaMax: battleLord.crystalVolume, manaRegen: battleLord.crystalRegenSpeed },
    enemyCrystal: { mana: 0, manaMax: 0, manaRegen: 0 }
  };

  while (!state.winner && state.round < maxRounds) {
    state.round += 1;
    state.allyCrystal = regenerateCrystal(state.allyCrystal);
    state.enemyCrystal = regenerateCrystal(state.enemyCrystal);

    for (const [attackers, defenders, side] of [
      [state.allies, state.enemies, 'ally'],
      [state.enemies, state.allies, 'enemy']
    ]) {
      for (let attackerIndex = 0; attackerIndex < attackers.length; attackerIndex += 1) {
        let attacker = attackers[attackerIndex];
        if (attacker.hp <= 0 || state.winner) continue;
        attacker = beginTurn(attacker);
        attackers[attackerIndex] = attacker;
        if (attacker.hp <= 0) continue;
        if (attacker.effects.some((effect) => effect.kind === 'control')) {
          state.events.push({ type: 'control_skip', round: state.round, unitId: attacker.id });
          continue;
        }

        if (!firstLiving(defenders)) {
          state.winner = side;
          break;
        }

        const crystalKey = side === 'ally' ? 'allyCrystal' : 'enemyCrystal';
        const action = selectAutomaticAction(attacker, attackers, defenders, state[crystalKey]);
        if (action) {
          const candidates = action.targetRule.side === 'ally' ? attackers : defenders;
          const resolution = applyActionEffect(action, attacker.lord ?? {}, candidates, rng, attacker, action.targetRule.side === 'enemy' ? defenders : attackers);
          attackers[attackerIndex] = spendActionResources(attacker, action);
          state[crystalKey] = spendCrystalResources(state[crystalKey], action);
          for (const change of resolution.changes) {
            state.events.push({
              type: action.effectKind,
              round: state.round,
              attackerId: attacker.id,
              targetId: change.targetId,
              amount: change.damage || resolution.amount,
              hpBefore: change.hpBefore,
              hpAfter: change.hpAfter,
              isCritical: change.critical,
              actionId: action.id
            });
            if (change.reflectedDamage) {
              state.events.push({ type: 'reflect', round: state.round, attackerId: change.targetId, targetId: attacker.id, amount: change.reflectedDamage });
            }
            if (change.counterDamage) {
              state.events.push({ type: 'counter', round: state.round, attackerId: change.targetId, targetId: attacker.id, amount: change.counterDamage });
            }
            if (change.hpAfter === 0) {
              state.events.push({ type: 'death', round: state.round, unitId: change.targetId });
              if (side === 'ally') {
                const faithGain = 10 * (lord.id === 'empire_lord_henrik' ? Math.min(1.3 + 0.03 * lord.level, 2) : 1);
                state.battleSpirit = Math.min(100, state.battleSpirit + faithGain);
              } else {
                const faithLoss = 10 * (lord.id === 'empire_lord_henrik' ? Math.max(0.5, 1 - 0.02 * lord.level) : 1);
                state.battleSpirit = Math.max(0, state.battleSpirit - faithLoss);
              }
              state.events.push({ type: 'faith', round: state.round, value: state.battleSpirit });
            }
          }
        } else {
          const target = firstLiving(defenders);
          const isCritical = rng() < (attacker.critChance ?? 0);
          const damage = attacker.attack * (isCritical ? 2 : 1);
          const hpBefore = target.hp;
          target.hp = Math.max(0, target.hp - damage);
          state.events.push({
            type: 'attack', round: state.round, attackerId: attacker.id, targetId: target.id, damage, hpBefore, hpAfter: target.hp, isCritical, actionId: 'basic_attack'
          });
          if (target.hp === 0) {
            state.events.push({ type: 'death', round: state.round, unitId: target.id });
            if (side === 'ally') {
              const faithGain = 10 * (lord.id === 'empire_lord_henrik' ? Math.min(1.3 + 0.03 * lord.level, 2) : 1);
              state.battleSpirit = Math.min(100, state.battleSpirit + faithGain);
            } else {
              const faithLoss = 10 * (lord.id === 'empire_lord_henrik' ? Math.max(0.5, 1 - 0.02 * lord.level) : 1);
              state.battleSpirit = Math.max(0, state.battleSpirit - faithLoss);
            }
            state.events.push({ type: 'faith', round: state.round, value: state.battleSpirit });
          }
        }

        if (!firstLiving(defenders)) {
          state.winner = side;
          break;
        }
      }
    }
  }

  return {
    ...state,
    winner: state.winner ?? 'draw'
  };
}

/** Підсумовує серію відтворюваних боїв для швидкої перевірки балансу. */
export function simulateBattleSeries({ allies, enemies, seed = 1, battles = 100, maxRounds = 50 }) {
  const results = Array.from({ length: battles }, (_, index) => simulateBattle({ allies, enemies, seed: seed + index, maxRounds }));
  const wins = results.filter((result) => result.winner === 'ally').length;
  const losses = results.filter((result) => result.winner === 'enemy').length;
  const draws = results.length - wins - losses;
  return {
    battles,
    wins,
    losses,
    draws,
    winRate: battles ? wins / battles : 0,
    averageRounds: battles ? results.reduce((total, result) => total + result.round, 0) / battles : 0
  };
}
