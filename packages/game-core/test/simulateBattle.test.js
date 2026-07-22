import { describe, expect, it } from 'vitest';
import { addLordExperience, applyActionEffect, applyBattleAuras, beginTurn, calculateDamage, canPlaceUnit, choosePath, createGrid, createPaths, createRun, createUnitInstance, empireUnits, evaluateFormula, evolveUnit, expandAreaTargets, finishBattle, generateEnemyArmy, getAccessibleTargets, getBattleLordStats, getEmpireLord, getEmpireUnit, getEvolutionRequirements, getLordSkillEffects, getRecruitableUnits, getRunLord, getUnitExperienceCap, getUnitExperienceMultiplier, getUnitUnlockProgress, healUnit, isActionUsable, moveUnit, placeUnit, recruitUnit, resolveAction, reviveUnit, selectAutomaticAction, simulateBattle, simulateBattleSeries, spendActionResources, spendLordAttributePoint } from '../src/index.js';

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

  it('reports deterministic aggregate results for balance simulations', () => {
    const series = simulateBattleSeries({ allies, enemies, seed: 7, battles: 10 });
    expect(series).toMatchObject({ battles: 10, wins: expect.any(Number), losses: expect.any(Number), draws: expect.any(Number) });
    expect(series.wins + series.losses + series.draws).toBe(10);
    expect(series).toEqual(simulateBattleSeries({ allies, enemies, seed: 7, battles: 10 }));
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

  it('moves the same unit instead of duplicating it on the grid', () => {
    const grid = createGrid({ rows: 3, columns: 5 });
    const unit = { id: 'member-1' };
    const moved = moveUnit(placeUnit(grid, unit, { row: 0, column: 0 }), unit, { row: 1, column: 2 });
    expect(moved.placements).toEqual([{ unit, position: { row: 1, column: 2 } }]);
  });
});

describe('Empire unit catalog', () => {
  it('loads every documented resistance and positional modifier from the full unit schema', () => {
    expect(empireUnits).toHaveLength(77);
    for (const unit of empireUnits) {
      expect(unit.positionModifiers.length).toBeGreaterThan(0);
      expect(unit.combat.resistances).toEqual(expect.objectContaining({ physical: expect.any(Number), fire: expect.any(Number), holy: expect.any(Number), poison: expect.any(Number), lightning: expect.any(Number) }));
    }
    expect(getEmpireUnit('empire_knight_t4_iron_phalanx').combat.resistances.physical).toBe(20);
  });

  it('applies positional formula bonuses, native percentage resistances and melee evasion', () => {
    const strike = { id: 'strike', type: 'physical', effectKind: 'damage', rangeType: 'melee', formula: { base: 10, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 } };
    const attacker = { id: 'scout', hp: 30, maxHp: 30, position: { row: 1, column: 1 }, positionModifiers: [{ condition: 'no_adjacent_allies', effect: '+20% до formula' }] };
    const defended = { id: 'defended', hp: 100, maxHp: 100, resistances: { physical: 20 }, position: { row: 0, column: 1 } };
    const positionedHit = applyActionEffect(strike, {}, [defended], () => 1, attacker, [defended], [attacker]).changes[0];
    expect(positionedHit.damage).toBeCloseTo(9.6);
    expect(positionedHit.hpAfter).toBeCloseTo(90.4);

    const evasive = { id: 'evasive', hp: 30, maxHp: 30, passives: [{ id: 'hard_to_hit', effect: 'melee_evasion_bonus:0.15' }] };
    expect(calculateDamage(strike, 10, {}, evasive, () => 0)).toMatchObject({ amount: 0, evaded: true });
  });

  it('enforces caster-only conditions, silence immunity, timed resistance debuffs and hit repositioning', () => {
    const base = { id: 'base', type: 'physical', effectKind: 'damage', rangeType: 'ranged', formula: { base: 1, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 } };
    const execute = { ...base, id: 'execute', formula: { base: 99, lordStat: 'battlePower', multiplier: 0 }, condition: { targetHasManaAction: true } };
    const unit = { actions: [execute, base] };
    expect(selectAutomaticAction(unit, [], [{ id: 'non-caster', hp: 10, maxHp: 10, actions: [base] }]).id).toBe('base');
    expect(selectAutomaticAction(unit, [], [{ id: 'caster', hp: 10, maxHp: 10, actions: [{ ...base, manaCost: 1 }] }]).id).toBe('execute');

    const immune = { id: 'immune', hp: 10, maxHp: 10, passives: [{ id: 'silent_immunity', effect: 'immune' }] };
    const silence = { ...base, id: 'silence', effectKind: 'control', control: 'silence', duration: 2 };
    expect(applyActionEffect(silence, {}, [immune]).changes[0].effect).toBeNull();

    const target = { id: 'target', hp: 30, maxHp: 30, position: { row: 0, column: 0 }, effects: [] };
    const debuff = { ...base, id: 'interrogate', effectKind: 'debuff', effect: '-30% усі resistances на 2 ходи' };
    expect(applyActionEffect(debuff, {}, [target]).changes[0].effect).toMatchObject({ duration: 2, resistanceReduction: 0.3 });
    const charge = { ...base, onHitEffect: { effectKind: 'reposition' } };
    expect(applyActionEffect(charge, {}, [target], Math.random, { position: { row: 0, column: 1 } }).changes[0]).toMatchObject({ repositioned: true });
    expect(target.position.row).toBe(1);
  });

  it('contains every documented Empire unit and preserves knight footprints', () => {
    expect(empireUnits).toHaveLength(77);
    expect(getEmpireUnit('empire_knight_t1')).toMatchObject({
      name: 'Зброєносець',
      gridFootprint: { rows: 2, columns: 1 }
    });
  });

  it('contains complete combat data for the whole archer line', () => {
    const archers = empireUnits.filter((unit) => unit.line === 'archer');
    const royalMarksman = getEmpireUnit('empire_archer_t4_royal_marksman');
    const execution = royalMarksman.combat.actions.find((action) => action.id === 'execution');

    expect(archers).toHaveLength(11);
    expect(archers.every((unit) => unit.combat)).toBe(true);
    expect(evaluateFormula(execution.formula, { battlePower: 3 })).toBe(93.25);
  });

  it('contains complete combat data and Guardian rules for the infantry line', () => {
    const infantry = empireUnits.filter((unit) => unit.line === 'infantry');
    const bastion = getEmpireUnit('empire_infantry_t4_unyielding_bastion');

    expect(infantry).toHaveLength(11);
    expect(infantry.every((unit) => unit.combat)).toBe(true);
    expect(bastion.combat.passives).toContainEqual(expect.objectContaining({ id: 'guardian', effect: 'redirect_pct:0.5' }));
  });

  it('contains complete support data for the priest line', () => {
    const priests = empireUnits.filter((unit) => unit.line === 'priest');
    const faithDefender = getEmpireUnit('empire_priest_t4_faith_defender');

    expect(priests).toHaveLength(11);
    expect(priests.every((unit) => unit.combat)).toBe(true);
    expect(faithDefender.combat.actions.find((action) => action.id === 'revive')).toMatchObject({ usesPerBattle: 2 });
  });

  it('contains complete anti-undead data for the Silent Order line', () => {
    const silentOrder = empireUnits.filter((unit) => unit.line === 'silent_order');
    const watcher = getEmpireUnit('empire_silent_t4_eternal_watcher');

    expect(silentOrder).toHaveLength(11);
    expect(silentOrder.every((unit) => unit.combat)).toBe(true);
    expect(watcher.combat.actions.find((action) => action.id === 'seal_all_graves')).toMatchObject({ effect: 'no_resurrection' });
  });

  it('provides combat data for every documented unit, including two-row knights', () => {
    const knights = empireUnits.filter((unit) => unit.line === 'knight');

    expect(empireUnits.every((unit) => unit.combat)).toBe(true);
    expect(knights).toHaveLength(11);
    expect(knights.every((unit) => unit.gridFootprint.rows === 2 && unit.gridFootprint.columns === 1)).toBe(true);
  });

  it('evaluates documented formulas and support targeting', () => {
    const priest = getEmpireUnit('empire_priest_t1');
    const heal = priest.combat.actions.find((action) => action.id === 'heal');
    expect(evaluateFormula(heal.formula, { crystalRegenSpeed: 4 })).toBe(22);
    expect(resolveAction(heal, { crystalRegenSpeed: 4 }, [{ id: 'a', hp: 12 }, { id: 'b', hp: 4 }]).targets).toEqual([{ id: 'b', hp: 4 }]);
  });

  it('applies healing without exceeding a unit maximum HP', () => {
    const heal = getEmpireUnit('empire_priest_t1').combat.actions.find((action) => action.id === 'heal');
    const ally = { id: 'ally', hp: 28, maxHp: 30 };
    const result = applyActionEffect(heal, { crystalRegenSpeed: 4 }, [ally]);
    expect(result.changes).toMatchObject([{ targetId: 'ally', hpBefore: 28, hpAfter: 30, effect: null }]);
  });

  it('stores control effects on the target with their duration', () => {
    const enforcer = getEmpireUnit('empire_truth_t2_enforcer');
    const paralyze = enforcer.combat?.actions.find((action) => action.id === 'paralyze_bolt');
    const target = { id: 'enemy', hp: 20, maxHp: 20 };
    const result = applyActionEffect(paralyze, { crystalRegenSpeed: 2 }, [target]);

    expect(result.changes[0].effect).toMatchObject({ kind: 'control', duration: 1 });
    expect(target.effects).toHaveLength(1);
  });

  it('limits melee attacks to the frontline while ranged attacks reach the whole grid', () => {
    const attacker = { position: { row: 2, column: 1 } };
    const targets = [
      { id: 'front-near', hp: 10, position: { row: 0, column: 1 } },
      { id: 'front-far', hp: 10, position: { row: 0, column: 4 } },
      { id: 'back', hp: 10, position: { row: 1, column: 1 } }
    ];
    expect(getAccessibleTargets(targets, attacker, 'melee').map((unit) => unit.id)).toEqual(['front-near']);
    expect(getAccessibleTargets(targets, attacker, 'ranged')).toHaveLength(3);
  });

  it('prioritizes opposing cells before expanding across each enemy row for melee attacks', () => {
    const attacker = { position: { row: 2, column: 1 } };
    const targets = [
      { id: 'front-far', hp: 10, position: { row: 0, column: 4 } },
      { id: 'second-row-opposite', hp: 10, position: { row: 1, column: 1 } }
    ];

    expect(getAccessibleTargets(targets, attacker, 'melee').map((unit) => unit.id)).toEqual(['front-far']);

    targets[0].hp = 0;
    expect(getAccessibleTargets(targets, attacker, 'melee').map((unit) => unit.id)).toEqual(['second-row-opposite']);
  });

  it('limits the initial melee zone to two cells when opposing formations have different parity', () => {
    const attacker = { position: { row: 2, column: 2 }, formationColumns: 5 };
    const targets = [
      { id: 'left-neighbor', hp: 10, position: { row: 0, column: 1 }, formationColumns: 6 },
      { id: 'left-opposing', hp: 10, position: { row: 0, column: 2 }, formationColumns: 6 },
      { id: 'right-opposing', hp: 10, position: { row: 0, column: 3 }, formationColumns: 6 },
      { id: 'right-neighbor', hp: 10, position: { row: 0, column: 4 }, formationColumns: 6 }
    ];

    expect(getAccessibleTargets(targets, attacker, 'melee').map((unit) => unit.id)).toEqual(['left-opposing', 'right-opposing']);
  });

  it('regenerates mana and respects action cooldowns', () => {
    const action = { id: 'spell', manaCost: 20, cooldown: 2 };
    const unit = { mana: 30, manaMax: 50, manaRegen: 5, cooldowns: {} };
    const spent = spendActionResources(unit, action);
    expect(spent).toMatchObject({ mana: 10, cooldowns: { spell: 2 } });
    expect(isActionUsable(action, spent)).toBe(false);
    expect(beginTurn(beginTurn(spent))).toMatchObject({ mana: 20, cooldowns: { spell: 0 } });
    expect(isActionUsable(action, beginTurn(beginTurn(spent)))).toBe(true);
  });

  it('applies damage over time and expires it after its duration', () => {
    const burning = { hp: 20, mana: 0, manaMax: 0, manaRegen: 0, cooldowns: {}, effects: [{ id: 'burn', kind: 'debuff', duration: 1, damagePerTurn: 3 }] };
    const firstTurn = beginTurn(burning);
    const secondTurn = beginTurn(firstTurn);
    expect(firstTurn).toMatchObject({ hp: 17, effects: [{ id: 'burn', duration: 0 }] });
    expect(secondTurn).toMatchObject({ hp: 17, effects: [] });
  });

  it('redirects part of adjacent ally damage to a Guardian', () => {
    const action = { id: 'hit', effectKind: 'damage', rangeType: 'ranged', formula: { base: 10, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 } };
    const protectedUnit = { id: 'ally', hp: 20, maxHp: 20, position: { row: 0, column: 0 } };
    const guardian = { id: 'guard', hp: 30, maxHp: 30, position: { row: 0, column: 1 }, passives: [{ id: 'guardian', effect: 'redirect_pct:0.3' }] };
    const result = applyActionEffect(action, {}, [protectedUnit], Math.random, null, [protectedUnit, guardian]);
    expect(result.changes[0]).toMatchObject({ hpAfter: 13, guardianId: 'guard', redirectedDamage: 3 });
    expect(guardian.hp).toBe(27);
  });

  it('expands an action from its primary target across documented AoE shapes', () => {
    const units = [
      { id: 'center', hp: 10, position: { row: 1, column: 1 } },
      { id: 'same-row', hp: 10, position: { row: 1, column: 3 } },
      { id: 'same-column', hp: 10, position: { row: 2, column: 1 } },
      { id: 'outside', hp: 10, position: { row: 3, column: 3 } }
    ];
    expect(expandAreaTargets(units, [units[0]], { aoeShape: 'row' }).map((unit) => unit.id)).toEqual(['center', 'same-row']);
    expect(expandAreaTargets(units, [units[0]], { aoeShape: 'column' }).map((unit) => unit.id)).toEqual(['center', 'same-column']);
    expect(expandAreaTargets(units, [units[0]], { aoeShape: 'circle', aoeRadius: 1 }).map((unit) => unit.id)).toEqual(['center', 'same-column']);
  });

  it('uses resistance, penetration, crits, reflection and lifesteal when resolving damage', () => {
    const action = { id: 'strike', type: 'physical', effectKind: 'damage', formula: { base: 100, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 }, ignoreResistancePct: 0.5, lifestealPct: 0.2 };
    const attacker = { id: 'attacker', hp: 50, maxHp: 100, critChance: 1 };
    const target = { id: 'target', hp: 300, maxHp: 300, resistance: 0.4, passives: [{ id: 'heavy_plate', effect: 'reflect 10%' }] };
    expect(calculateDamage(action, 100, attacker, target, () => 0)).toMatchObject({ amount: 160, critical: true, resistance: 0.2 });
    const result = applyActionEffect(action, {}, [target], () => 0, attacker);
    expect(result.changes[0]).toMatchObject({ damage: 160, reflectedDamage: 16, healedAttacker: 32, hpAfter: 140 });
    expect(attacker.hp).toBe(66);
  });

  it('handles cleanse, purge, mana burn, resurrection and reposition effects', () => {
    const healer = { id: 'healer', position: { row: 1, column: 1 } };
    const ally = { id: 'ally', hp: 5, maxHp: 20, position: { row: 1, column: 2 }, effects: [{ id: 'burn', kind: 'debuff' }] };
    const heal = { id: 'heal', effectKind: 'heal', formula: { base: 10, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'ally', selection: 'lowest_hp', count: 1 }, cleanseDebuffCount: 1 };
    applyActionEffect(heal, {}, [ally], Math.random, healer);
    expect(ally).toMatchObject({ hp: 15, effects: [] });

    const enemy = { id: 'enemy', hp: 30, maxHp: 30, mana: 15, effects: [{ id: 'shield', kind: 'buff' }], position: { row: 2, column: 1 } };
    const strike = { id: 'strike', type: 'holy', effectKind: 'damage', formula: { base: 1, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 }, onHitEffect: 'mana_burn:10', onHitDebuff: { effect: 'purge positive buffs' } };
    applyActionEffect(strike, {}, [enemy], Math.random, healer);
    expect(enemy).toMatchObject({ mana: 5, effects: [] });

    const corpse = { id: 'corpse', hp: 0, maxHp: 40, effects: [] };
    const revive = { id: 'revive', effectKind: 'heal', formula: { base: 20, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'ally', selection: 'corpse_of_dead_ally', count: 1 } };
    expect(applyActionEffect(revive, {}, [corpse]).changes[0]).toMatchObject({ revived: true, hpAfter: 20 });

    const rider = { id: 'rider', hp: 30, maxHp: 30, position: { row: 2, column: 2 } };
    const raid = { id: 'raid', effectKind: 'reposition', formula: { base: 0, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'self', selection: 'self', count: 1 } };
    applyActionEffect(raid, {}, [rider], Math.random, rider);
    expect(rider.position).toEqual({ row: 1, column: 2 });
  });

  it('uses tactical target priorities and skips controlled units', () => {
    const action = { id: 'hit', effectKind: 'damage', rangeType: 'ranged', formula: { base: 1, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 } };
    const targets = [{ id: 'healthy', hp: 20 }, { id: 'weak', hp: 5 }];
    expect(resolveAction(action, {}, targets, Math.random, { tactics: { targetPriority: { enemy: ['lowest_hp', 'nearest'] } } }).targets[0].id).toBe('weak');

    const controlled = { id: 'controlled', maxHp: 10, attack: 10, effects: [{ id: 'stun', kind: 'control', duration: null }] };
    const result = simulateBattle({ allies: [controlled], enemies: [{ id: 'enemy', maxHp: 10, attack: 0 }], maxRounds: 1 });
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'control_skip', unitId: 'controlled' }));
  });

  it('keeps ordered skill use independent from ally target priorities', () => {
    const strike = { id: 'strike', effectKind: 'damage', rangeType: 'ranged', formula: { base: 5, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 } };
    const heal = { id: 'heal', effectKind: 'heal', rangeType: 'ranged', formula: { base: 5, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'ally', selection: 'lowest_hp', count: 1 } };
    const unit = { actions: [strike, heal], tactics: { actionPriority: ['heal', 'strike'] } };
    const injured = { id: 'injured', hp: 4, maxHp: 10, position: { row: 0, column: 2 } };
    const nearby = { id: 'nearby', hp: 8, maxHp: 10, position: { row: 0, column: 0 } };
    const enemy = { id: 'enemy', hp: 10, maxHp: 10 };

    expect(selectAutomaticAction(unit, [injured, nearby], [enemy]).id).toBe('heal');
    expect(selectAutomaticAction(unit, [{ ...injured, hp: 10 }, { ...nearby, hp: 10 }], [enemy]).id).toBe('strike');
    expect(resolveAction(heal, {}, [injured, nearby], Math.random, { position: { row: 0, column: 0 }, tactics: { targetPriority: { ally: ['nearest', 'lowest_hp'] } } }).targets[0].id).toBe('nearby');
  });

  it('uses tactical health and crystal rules before selecting a prioritized skill', () => {
    const strike = { id: 'strike', effectKind: 'damage', rangeType: 'ranged', formula: { base: 5, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 } };
    const heal = { id: 'heal', effectKind: 'heal', rangeType: 'ranged', formula: { base: 5, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'ally', selection: 'lowest_hp', count: 1 }, manaCost: 10 };
    const unit = { actions: [strike, heal], tactics: { actionPriority: ['heal', 'strike'], actionRules: { heal: { allyHealth: 'any_below', healthThreshold: 50, crystal: 'at_least', crystalValue: 10 } } } };
    const enemy = { id: 'enemy', hp: 10, maxHp: 10 };

    expect(selectAutomaticAction(unit, [{ id: 'ally', hp: 6, maxHp: 10 }], [enemy], { mana: 10 }).id).toBe('strike');
    expect(selectAutomaticAction(unit, [{ id: 'ally', hp: 4, maxHp: 10 }], [enemy], { mana: 9 }).id).toBe('strike');
    expect(selectAutomaticAction(unit, [{ id: 'ally', hp: 4, maxHp: 10 }], [enemy], { mana: 10 }).id).toBe('heal');
  });

  it('uses enemy health for attacks and skips repeated control effects', () => {
    const basic = { id: 'basic', effectKind: 'damage', rangeType: 'ranged', formula: { base: 3, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 } };
    const finisher = { id: 'finisher', effectKind: 'damage', rangeType: 'ranged', formula: { base: 8, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 } };
    const stun = { id: 'stun', effectKind: 'control', control: 'stun', rangeType: 'ranged', formula: { base: 0, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 } };
    const finisherUnit = { actions: [finisher, basic], tactics: { actionPriority: ['finisher', 'basic'], actionRules: { finisher: { enemyHealth: 'any_below', enemyHealthThreshold: 50 } } } };
    const controller = { actions: [stun, basic], tactics: { actionPriority: ['stun', 'basic'], actionRules: { stun: { effectState: 'missing' } } } };

    expect(selectAutomaticAction(finisherUnit, [], [{ id: 'healthy', hp: 8, maxHp: 10 }]).id).toBe('basic');
    expect(selectAutomaticAction(finisherUnit, [], [{ id: 'wounded', hp: 4, maxHp: 10 }]).id).toBe('finisher');
    expect(selectAutomaticAction(controller, [], [{ id: 'free', hp: 10, maxHp: 10, effects: [] }]).id).toBe('stun');
    expect(selectAutomaticAction(controller, [], [{ id: 'stunned', hp: 10, maxHp: 10, effects: [{ id: 'stun', kind: 'control' }] }]).id).toBe('basic');
  });

  it('reacts to melee hits with counterattacks and reflects damage from an active shield', () => {
    const hit = { id: 'hit', type: 'physical', effectKind: 'damage', rangeType: 'melee', formula: { base: 10, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 } };
    const attacker = { id: 'attacker', hp: 50, maxHp: 50 };
    const defender = { id: 'defender', hp: 50, maxHp: 50, effects: [{ id: 'shield', kind: 'buff', reflectPct: 0.2 }], passives: [{ id: 'counter_attack', effect: 'counter melee', formula: { base: 8, lordStat: 'battlePower', multiplier: 0 } }] };
    const result = applyActionEffect(hit, {}, [defender], () => 1, attacker);

    expect(result.changes[0]).toMatchObject({ reflectedDamage: 2, counterDamage: 8 });
    expect(attacker.hp).toBe(40);
  });

  it('applies battle-start auras, regeneration, splash burn and execute-on-crit', () => {
    const auraSource = { id: 'banner', passives: [{ id: 'banner_aura', effect: '+20% attack, +10% resistances' }, { id: 'steady_regen', effect: '+5% max HP' }], hp: 50, maxHp: 100, mana: 0, manaMax: 0, manaRegen: 0, cooldowns: {} };
    const ally = { id: 'ally', hp: 50, maxHp: 100 };
    const withAuras = applyBattleAuras([auraSource, ally]);
    expect(withAuras.units[1]).toMatchObject({ auraAttackMultiplier: 1.2, auraResistanceBonus: 0.1 });
    expect(beginTurn(withAuras.units[0]).hp).toBe(55);

    const burn = { id: 'burn', type: 'fire', effectKind: 'damage', rangeType: 'ranged', formula: { base: 2, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 }, splashRadius: 1, burnDot: { ticks: 2 } };
    const close = { id: 'close', hp: 20, maxHp: 20, position: { row: 0, column: 0 } };
    const nearby = { id: 'nearby', hp: 20, maxHp: 20, position: { row: 0, column: 1 } };
    expect(applyActionEffect(burn, {}, [close, nearby], () => 1, { position: { row: 1, column: 0 } }).changes).toHaveLength(2);
    expect(nearby.effects[0]).toMatchObject({ id: 'burn', duration: 2 });

    const execute = { id: 'execute', type: 'physical', effectKind: 'damage', formula: { base: 5, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 }, critChanceBonus: 1, executeOnCritBelowHpPct: 0.15 };
    const target = { id: 'target', hp: 20, maxHp: 100 };
    expect(applyActionEffect(execute, {}, [target], () => 0).changes[0].hpAfter).toBe(0);
  });

  it('applies Shieldwall and lone-duel bonuses while respecting control immunity', () => {
    const wall = { id: 'wall', position: { row: 0, column: 0 }, passives: [{ id: 'shieldwall', effect: '-25% damage до фронтового ряду' }] };
    const protectedUnit = { id: 'protected', position: { row: 0, column: 1 } };
    expect(applyBattleAuras([wall, protectedUnit]).units[1].damageReductionPct).toBe(0.25);

    const strike = { id: 'strike', type: 'physical', effectKind: 'damage', formula: { base: 10, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 } };
    const duelist = { id: 'duelist', passives: [{ id: 'lone_duel', effect: '+40% formula' }] };
    const loneTarget = { id: 'lone', hp: 30, maxHp: 30, position: { row: 0, column: 0 } };
    expect(applyActionEffect(strike, {}, [loneTarget], () => 1, duelist).changes[0].damage).toBe(14);

    const immune = { id: 'immune', hp: 10, maxHp: 10, passives: [{ id: 'silent_immunity', effect: 'імунітет до control' }] };
    const stun = { id: 'stun', type: 'physical', effectKind: 'control', formula: { base: 0, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 }, control: 'stun', duration: 1 };
    applyActionEffect(stun, {}, [immune]);
    expect(immune.effects ?? []).toHaveLength(0);
  });

  it('creates battle units from documented data and uses their action in combat', () => {
    const lord = { vitality: 2, battlePower: 3, crystalRegenSpeed: 1 };
    const archer = createUnitInstance(getEmpireUnit('empire_archer_t1'), lord);
    const defender = { id: 'target', maxHp: 50, attack: 0 };
    const result = simulateBattle({ allies: [{ ...archer, lord }], enemies: [defender], seed: 1 });

    expect(archer.maxHp).toBe(36);
    expect(result.events[0]).toMatchObject({ actionId: 'basic_shot', amount: 11, damageType: 'physical', effectsAfter: [] });
  });
});

describe('run loop', () => {
  it('levels a lord, awards three skill points, and spends them on base attributes', () => {
    const progressed = addLordExperience({ level: 1, experience: 45, skillPoints: 0 }, 10);
    expect(progressed).toMatchObject({ level: 2, experience: 5, skillPoints: 3, attributes: { battlePower: 0 } });

    const run = { ...createRun(), lordProgress: progressed };
    const upgraded = spendLordAttributePoint(run, 'battlePower');
    expect(getRunLord(upgraded)).toMatchObject({ level: 2, experience: 5, experienceToNextLevel: 75, skillPoints: 2, battlePower: 4 });
    expect(getLordSkillEffects(getRunLord(upgraded)).faithGainMultiplier).toBeCloseTo(1.36);
  });

  it('continues lord levels beyond 20 while keeping per-level experience progression', () => {
    expect(addLordExperience({ level: 20, experience: 500, skillPoints: 0 }, 25)).toMatchObject({ level: 21, experience: 0, skillPoints: 3 });
  });

  it('shares battle experience equally between surviving units and awards its total to the lord', () => {
    const onceRecruited = recruitUnit(createRun(), 'empire_archer_t1');
    const run = choosePath(recruitUnit(onceRecruited, 'empire_infantry_t1'), { id: 'safe', goldReward: 5 });
    const completed = finishBattle(run, { victory: true, battleExperienceReward: 40 });
    expect(completed.army.map((member) => member.exp)).toEqual([20, 20]);
    expect(getRunLord(completed)).toMatchObject({ experience: 40, skillPoints: 0 });
  });

  it('caps unit experience at each evolution threshold and halves its gain at every tier', () => {
    const unitIds = ['empire_archer_t1', 'empire_archer_t2_sniper', 'empire_archer_t3_executioner', 'empire_archer_t4_royal_marksman'];
    const run = {
      ...createRun(),
      phase: 'battle',
      army: unitIds.map((unitId, index) => ({ instanceId: `unit-${index}`, unitId, hp: 1, exp: 0 }))
    };
    const completed = finishBattle(run, { victory: true, battleExperienceReward: 160 });
    const capped = finishBattle({ ...run, army: [{ ...run.army[0], exp: 90 }] }, { victory: true, battleExperienceReward: 40 });

    expect(completed.army.map((member) => member.exp)).toEqual([40, 20, 10, 0]);
    expect(capped.army[0].exp).toBe(100);
    expect(getUnitExperienceCap(getEmpireUnit('empire_archer_t1'))).toBe(100);
    expect(getUnitExperienceCap(getEmpireUnit('empire_archer_t2_sniper'))).toBe(220);
    expect(getUnitExperienceCap(getEmpireUnit('empire_archer_t3_executioner'))).toBe(450);
    expect(getUnitExperienceCap(getEmpireUnit('empire_archer_t4_royal_marksman'))).toBe(0);
    expect(getUnitExperienceMultiplier(getEmpireUnit('empire_archer_t3_executioner'))).toBe(0.25);
  });

  it('does not award battle experience to dead units', () => {
    const onceRecruited = recruitUnit(createRun(), 'empire_archer_t1');
    const recruited = recruitUnit(onceRecruited, 'empire_infantry_t1');
    const completed = finishBattle(choosePath(recruited, { id: 'safe' }), {
      victory: true,
      army: [{ ...recruited.army[0], hp: 10 }, { ...recruited.army[1], hp: 0 }],
      battleExperienceReward: 40
    });
    expect(completed.army[0]).toMatchObject({ exp: 40 });
    expect(completed.army[1]).toMatchObject({ exp: 0 });
    expect(getRunLord(completed)).toMatchObject({ experience: 40 });
  });

  it('awards experience from generated tier-one enemies and keeps it through consecutive battles', () => {
    let run = recruitUnit(createRun({ seed: 1 }), 'empire_archer_t1');

    const finishGeneratedBattle = (currentRun) => {
      const path = createPaths(currentRun.difficulty, currentRun.seed)[0];
      const enemies = generateEnemyArmy({ pathId: path.id, difficulty: currentRun.difficulty, seed: currentRun.seed });
      const reward = enemies.units
        .map((unit) => createUnitInstance(unit, { vitality: 0, battlePower: 0, crystalRegenSpeed: 0 }))
        .reduce((total, unit) => total + unit.experienceRewardOnKill, 0);
      return finishBattle(choosePath(currentRun, path), {
        victory: true,
        army: currentRun.army.map((member) => ({ ...member, hp: 1 })),
        battleExperienceReward: reward
      });
    };

    run = finishGeneratedBattle(run);
    const firstBattleExp = run.army[0].exp;
    const firstLord = getRunLord(run);
    expect(firstBattleExp).toBeGreaterThan(0);
    expect(firstLord.level > 1 || firstLord.experience > 0).toBe(true);

    run = finishGeneratedBattle(run);
    const secondLord = getRunLord(run);
    expect(run.army[0].exp).toBeGreaterThan(firstBattleExp);
    expect(secondLord.level).toBeGreaterThanOrEqual(firstLord.level);
    expect(secondLord.level > firstLord.level || secondLord.experience > firstLord.experience).toBe(true);
  });

  it('recruits in Hub, enters battle through a path, and grants its reward on victory', () => {
    const run = createRun();
    const recruited = recruitUnit(run, 'empire_archer_t1');
    const inBattle = choosePath(recruited, { id: 'safe', goldReward: 5 });
    const completed = finishBattle(inBattle, { victory: true });

    expect(recruited.army).toMatchObject([{ unitId: 'empire_archer_t1', hp: null, exp: 0, position: null }]);
    expect(inBattle.phase).toBe('battle');
    expect(completed).toMatchObject({ phase: 'hub', difficulty: 1.5, gold: 23 });
  });

  it('allows a lord to recruit beyond their leadership, while reservists do not gain battle experience', () => {
    let run = { ...createRun(), gold: 100 };
    for (let index = 0; index < 7; index += 1) run = recruitUnit(run, 'empire_archer_t1');

    expect(run.army).toHaveLength(7);
    expect(run.army.reduce((total, member) => total + getEmpireUnit(member.unitId).combat.leadershipCost, 0)).toBeGreaterThan(run.economicLimit);

    const completed = finishBattle(choosePath(run, { id: 'safe' }), {
      victory: true,
      army: run.army.map((member, index) => ({ ...member, hp: 10 })),
      battleExperienceReward: 40,
      participatedInstanceIds: [run.army[0].instanceId, run.army[1].instanceId]
    });
    expect(completed.army.map((member) => member.exp)).toEqual([20, 20, 0, 0, 0, 0, 0]);
  });

  it('advances difficulty at half the previous rate and keeps a five-battle loss rollback', () => {
    const afterVictory = finishBattle({ ...createRun(), selectedPath: { id: 'safe' } }, { victory: true });
    const afterFiveVictories = Array.from({ length: 5 }).reduce(
      (run) => finishBattle({ ...run, selectedPath: { id: 'safe' } }, { victory: true }),
      createRun()
    );
    const afterDefeat = finishBattle({ ...afterFiveVictories, selectedPath: { id: 'safe' } }, { victory: false });

    expect(afterVictory.difficulty).toBe(1.5);
    expect(afterFiveVictories.difficulty).toBe(3.5);
    expect(afterDefeat.difficulty).toBe(1);
  });

  it('limits recruitment to each lord’s starting roster', () => {
    const henrik = createRun({ lordId: 'empire_lord_henrik', seed: 1 });
    const arthur = createRun({ lordId: 'empire_lord_arthur', seed: 1 });

    expect(getRecruitableUnits(henrik).map((unit) => unit.id).sort()).toEqual([
      'empire_archer_t1', 'empire_infantry_t1', 'empire_priest_t1', 'empire_truth_t1'
    ]);
    expect(getRecruitableUnits(arthur).map((unit) => unit.id).sort()).toEqual([
      'empire_archer_t1', 'empire_infantry_t1', 'empire_knight_t1', 'empire_truth_t1'
    ]);
    expect(recruitUnit(henrik, 'empire_knight_t1')).toBe(henrik);
    expect(recruitUnit(arthur, 'empire_priest_t1')).toBe(arthur);
  });

  it('unlocks one remaining base unit after every third risky victory', () => {
    let run = createRun({ lordId: 'empire_lord_henrik', seed: 42 });
    const riskyPath = { id: 'risky' };
    const safePath = { id: 'safe' };

    for (let index = 0; index < 2; index += 1) run = finishBattle({ ...run, selectedPath: riskyPath }, { victory: true });
    expect(getUnitUnlockProgress(run)).toMatchObject({ hardBattleVictories: 2, victoriesUntilNextUnlock: 1 });
    expect(getRecruitableUnits(run)).toHaveLength(4);

    run = finishBattle({ ...run, selectedPath: riskyPath }, { victory: true });
    expect(run).toMatchObject({ hardBattleVictories: 3, lastUnlockedUnitId: expect.any(String) });
    expect(getRecruitableUnits(run)).toHaveLength(5);
    expect(getUnitUnlockProgress(run).remainingUnitIds).toHaveLength(2);

    const afterSafeVictory = finishBattle({ ...run, selectedPath: safePath }, { victory: true });
    expect(afterSafeVictory.hardBattleVictories).toBe(3);
    expect(afterSafeVictory.lastUnlockedUnitId).toBeNull();
  });

  it('heals, revives, and evolves individual army members only in Hub', () => {
    const recruited = recruitUnit(createRun(), 'empire_archer_t1');
    const member = recruited.army[0];
    const wounded = { ...recruited, army: [{ ...member, hp: 10, exp: 100 }] };
    const healed = healUnit(wounded, member.instanceId, 36);
    const evolved = evolveUnit(healed, member.instanceId, 'empire_archer_t2_sniper');
    const revived = reviveUnit({ ...recruited, army: [{ ...member, hp: 0 }] }, member.instanceId, 36);

    expect(healed.army[0].hp).toBe(36);
    expect(evolved.army[0]).toMatchObject({ unitId: 'empire_archer_t2_sniper', exp: 0, hp: null });
    expect(evolved.gold).toBe(5);
    expect(revived.army[0].hp).toBe(18);
  });

  it('requires both the published experience threshold and gold to evolve', () => {
    const recruited = recruitUnit(createRun(), 'empire_archer_t1');
    const member = recruited.army[0];
    const readyButPoor = { ...recruited, gold: 9, army: [{ ...member, exp: 100 }] };

    expect(getEvolutionRequirements(getEmpireUnit('empire_archer_t1'))).toEqual({ experience: 100, gold: 10 });
    expect(getEvolutionRequirements(getEmpireUnit('empire_archer_t2_sniper'))).toEqual({ experience: 220, gold: 20 });
    expect(getEvolutionRequirements(getEmpireUnit('empire_archer_t3_executioner'))).toEqual({ experience: 450, gold: 35 });
    expect(evolveUnit(readyButPoor, member.instanceId, 'empire_archer_t2_sniper')).toBe(readyButPoor);
  });

  it('creates deterministic random rewards scaled from each path leadership budget', () => {
    const multipliers = { gold: 2, lord_experience: 4, skill_points: 0.05, mines: 0.08 };
    const paths = createPaths(3, 42);

    expect(paths).toEqual(createPaths(3, 42));
    expect(paths.map((path) => path.leadershipBudget)).toEqual([6, 12, 18]);
    for (const path of paths) {
      expect(path.reward.amount).toBe(Math.floor(path.leadershipBudget * multipliers[path.reward.type]));
      expect(path.reward.amount).toBeGreaterThan(0);
    }

    for (const difficulty of [1, 5, 10]) {
      for (const path of createPaths(difficulty, 7)) {
        expect(path.reward.amount).toBeGreaterThan(0);
      }
    }
  });

  it('applies gold, lord experience, skill points, and mine rewards on victory', () => {
    const recruited = recruitUnit(createRun(), 'empire_archer_t1');
    const selectedPath = { id: 'reward-test', lordExperienceReward: 16, skillPointReward: 1, mineReward: 2 };
    const completed = finishBattle(choosePath(recruited, selectedPath), { victory: true });

    expect(completed).toMatchObject({ gold: 18, mines: 2 });
    expect(getRunLord(completed)).toMatchObject({ experience: 16, skillPoints: 1 });
  });

  it('does not enter a battle path when every army member is dead', () => {
    const recruited = recruitUnit(createRun(), 'empire_archer_t1');
    const defeatedArmy = { ...recruited, army: recruited.army.map((member) => ({ ...member, hp: 0 })) };
    expect(choosePath(defeatedArmy, createPaths(1)[0])).toEqual(defeatedArmy);
  });

  it('uses selected lord statistics and a shared crystal for skills', () => {
    const henrik = getEmpireLord('empire_lord_henrik');
    expect(getBattleLordStats(henrik).battlePower).toBeCloseTo(2.1);
    expect(createRun({ lordId: 'empire_lord_arthur' })).toMatchObject({ lordId: 'empire_lord_arthur', economicLimit: 12 });

    const spell = { id: 'spell', type: 'holy', effectKind: 'heal', rangeType: 'ranged', formula: { base: 1, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'ally', selection: 'lowest_hp', count: 1 }, manaCost: 10 };
    const caster = { id: 'caster', hp: 10, maxHp: 10, actions: [spell] };
    const battle = simulateBattle({ allies: [caster], enemies: [{ id: 'enemy', maxHp: 20, attack: 0 }], lord: { ...henrik, crystalVolume: 10, crystalRegenSpeed: 0 }, maxRounds: 1 });
    expect(battle.allyCrystal.mana).toBe(0);
    expect(battle.allies[0]).not.toHaveProperty('mana');
  });

  it('applies Arthur’s Mercy Strike to a wounded target', () => {
    const action = { id: 'hit', type: 'physical', effectKind: 'damage', formula: { base: 10, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 } };
    const attacker = { id: 'ally', hp: 100, maxHp: 100, lord: getEmpireLord('empire_lord_arthur') };
    const target = { id: 'enemy', hp: 15, maxHp: 100 };
    const result = applyActionEffect(action, {}, [target], () => 1, attacker);
    expect(result.changes[0]).toMatchObject({ hpAfter: 0 });
    expect(result.changes[0].mercyDamage).toBeCloseTo(1.7);
  });

  it('creates reproducible Empire enemy armies within a growing leadership budget', () => {
    const safe = generateEnemyArmy({ pathId: 'safe', difficulty: 1, seed: 42 });
    const risky = generateEnemyArmy({ pathId: 'risky', difficulty: 3, seed: 42 });

    expect(safe).toEqual(generateEnemyArmy({ pathId: 'safe', difficulty: 1, seed: 42 }));
    expect(safe.leadershipBudget).toBe(4);
    expect(safe.leadershipUsed).toBe(4);
    expect(risky.leadershipBudget).toBe(18);
    expect(risky.leadershipUsed).toBe(risky.leadershipBudget);
    expect(safe.crystal).toMatchObject({ manaMax: 48, manaRegen: 8 });
    expect(risky.crystal.manaMax).toBeGreaterThan(safe.crystal.manaMax);
    expect(risky.crystal.manaRegen).toBeGreaterThan(safe.crystal.manaRegen);
    const repeats = risky.units.reduce((counts, unit) => counts.set(unit.unitId, (counts.get(unit.unitId) ?? 0) + 1), new Map());
    expect(Math.max(...repeats.values())).toBeLessThanOrEqual(2);
    expect(new Set(risky.units.map((unit) => `${unit.position.row}:${unit.position.column}`)).size).toBe(risky.units.length);

    const compositions = new Set(Array.from({ length: 10 }, (_, seed) => (
      generateEnemyArmy({ pathId: 'risky', difficulty: 3, seed }).units.map((unit) => unit.unitId).sort().join(',')
    )));
    expect(compositions.size).toBeGreaterThan(1);
  });

  it('spends a supplied enemy crystal on enemy skills', () => {
    const allyStrike = { id: 'ally_strike', type: 'physical', effectKind: 'damage', rangeType: 'ranged', formula: { base: 1, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 } };
    const enemySpell = { id: 'enemy_spell', type: 'lightning', effectKind: 'damage', rangeType: 'ranged', formula: { base: 5, lordStat: 'battlePower', multiplier: 0 }, targetRule: { side: 'enemy', selection: 'nearest', count: 1 }, manaCost: 10 };
    const result = simulateBattle({
      allies: [{ id: 'ally', maxHp: 30, actions: [allyStrike] }],
      enemies: [{ id: 'enemy', maxHp: 30, actions: [enemySpell] }],
      enemyCrystal: { manaMax: 10, manaRegen: 0 },
      maxRounds: 1
    });

    expect(result.events).toContainEqual(expect.objectContaining({ attackerId: 'enemy', actionId: 'enemy_spell', damageType: 'lightning' }));
    expect(result.enemyCrystal.mana).toBe(0);
  });
});
