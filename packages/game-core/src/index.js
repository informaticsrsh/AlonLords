export { empireUnits, getEmpireUnit } from './catalog.js';
export { evaluateFormula, resolveAction, selectTargets } from './actions.js';

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

function cloneUnit(unit) {
  return { ...unit, hp: unit.maxHp };
}

function firstLiving(units) {
  return units.find((unit) => unit.hp > 0);
}

/**
 * Мінімальний детермінований автобій для вертикального зрізу.
 * Кожен живий юніт атакує першого живого суперника за порядком у складі.
 */
export function simulateBattle({ allies, enemies, seed = 1, maxRounds = 50 }) {
  const rng = createRng(seed);
  const state = {
    allies: allies.map(cloneUnit),
    enemies: enemies.map(cloneUnit),
    events: [],
    round: 0,
    winner: null
  };

  while (!state.winner && state.round < maxRounds) {
    state.round += 1;

    for (const [attackers, defenders, side] of [
      [state.allies, state.enemies, 'ally'],
      [state.enemies, state.allies, 'enemy']
    ]) {
      for (const attacker of attackers) {
        if (attacker.hp <= 0 || state.winner) continue;

        const target = firstLiving(defenders);
        if (!target) {
          state.winner = side;
          break;
        }

        const isCritical = rng() < (attacker.critChance ?? 0);
        const damage = attacker.attack * (isCritical ? 2 : 1);
        target.hp = Math.max(0, target.hp - damage);
        state.events.push({
          type: 'attack',
          round: state.round,
          attackerId: attacker.id,
          targetId: target.id,
          damage,
          isCritical
        });

        if (target.hp === 0) {
          state.events.push({ type: 'death', round: state.round, unitId: target.id });
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
