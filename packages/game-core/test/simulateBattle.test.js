import { describe, expect, it } from 'vitest';
import { canPlaceUnit, createGrid, empireUnits, evaluateFormula, getEmpireUnit, placeUnit, resolveAction, simulateBattle } from '../src/index.js';

const allies = [
  { id: 'guard', maxHp: 24, attack: 7, critChance: 0.2 }
];
const enemies = [
  { id: 'raider', maxHp: 18, attack: 5, critChance: 0.1 }
];

describe('simulateBattle', () => {
  it('repeats the same battle with the same seed', () => {
    expect(simulateBattle({ allies, enemies, seed: 42 })).toEqual(
      simulateBattle({ allies, enemies, seed: 42 })
    );
  });

  it('does not mutate unit templates', () => {
    simulateBattle({ allies, enemies, seed: 42 });
    expect(allies[0]).not.toHaveProperty('hp');
    expect(enemies[0]).not.toHaveProperty('hp');
  });
});

describe('battle grid', () => {
  const knight = { id: 'knight', gridFootprint: { rows: 2, columns: 1 } };

  it('places a two-row unit only where its whole footprint fits', () => {
    const grid = createGrid({ rows: 3, columns: 5 });
    expect(canPlaceUnit(grid, knight, { row: 2, column: 0 })).toBe(false);
    expect(canPlaceUnit(grid, knight, { row: 1, column: 0 })).toBe(true);
  });

  it('prevents overlap and leaves the previous grid unchanged on an invalid placement', () => {
    const grid = createGrid({ rows: 3, columns: 5 });
    const withKnight = placeUnit(grid, knight, { row: 0, column: 0 });
    expect(placeUnit(withKnight, { id: 'guard' }, { row: 1, column: 0 })).toEqual(withKnight);
    expect(grid.placements).toHaveLength(0);
  });
});

describe('Empire unit catalog', () => {
  it('contains every documented Empire unit and preserves knight footprints', () => {
    expect(empireUnits).toHaveLength(77);
    expect(getEmpireUnit('empire_knight_t1')).toMatchObject({
      name: 'Зброєносець',
      gridFootprint: { rows: 2, columns: 1 }
    });
  });

  it('evaluates documented formulas and support targeting', () => {
    const priest = getEmpireUnit('empire_priest_t1');
    const heal = priest.combat.actions.find((action) => action.id === 'heal');
    expect(evaluateFormula(heal.formula, { crystalRegenSpeed: 4 })).toBe(22);
    expect(resolveAction(heal, { crystalRegenSpeed: 4 }, [{ id: 'a', hp: 12 }, { id: 'b', hp: 4 }]).targets).toEqual([{ id: 'b', hp: 4 }]);
  });
});
