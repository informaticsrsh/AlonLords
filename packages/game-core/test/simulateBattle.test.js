import { describe, expect, it } from 'vitest';
import { applyActionEffect, applyBattleAuras, beginTurn, calculateDamage, canPlaceUnit, choosePath, createGrid, createPaths, createRun, createUnitInstance, empireUnits, evaluateFormula, evolveUnit, expandAreaTargets, finishBattle, generateEnemyArmy, getAccessibleTargets, getBattleLordStats, getEmpireLord, getEmpireUnit, healUnit, isActionUsable, moveUnit, placeUnit, recruitUnit, resolveAction, reviveUnit, simulateBattle, simulateBattleSeries, spendActionResources } from '../src/index.js';

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
    expect(resolveAction(action, {}, targets, Math.random, { tactics: { targetPriority: 'lowest_hp' } }).targets[0].id).toBe('weak');

    const controlled = { id: 'controlled', maxHp: 10, attack: 10, effects: [{ id: 'stun', kind: 'control', duration: null }] };
    const result = simulateBattle({ allies: [controlled], enemies: [{ id: 'enemy', maxHp: 10, attack: 0 }], maxRounds: 1 });
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'control_skip', unitId: 'controlled' }));
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
    expect(result.events[0]).toMatchObject({ actionId: 'basic_shot', amount: 11 });
  });
});

describe('run loop', () => {
  it('recruits in Hub, enters battle through a path, and grants its reward on victory', () => {
    const run = createRun();
    const recruited = recruitUnit(run, 'empire_archer_t1');
    const inBattle = choosePath(recruited, { id: 'safe', goldReward: 5 });
    const completed = finishBattle(inBattle, { victory: true });

    expect(recruited.army).toMatchObject([{ unitId: 'empire_archer_t1', hp: null, exp: 0, position: null }]);
    expect(inBattle.phase).toBe('battle');
    expect(completed).toMatchObject({ phase: 'hub', difficulty: 2, gold: 23 });
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
    expect(revived.army[0].hp).toBe(18);
  });

  it('applies path rewards to experience, leadership capacity and mine income', () => {
    const recruited = recruitUnit(createRun(), 'empire_archer_t1');
    const rich = finishBattle(choosePath(recruited, createPaths(1).find((path) => path.id === 'rich')), { victory: true });
    const risky = finishBattle(choosePath(rich, createPaths(rich.difficulty).find((path) => path.id === 'risky')), { victory: true });

    expect(rich).toMatchObject({ gold: 28, economicLimit: 14, mines: 0 });
    expect(risky).toMatchObject({ gold: 43, mines: 1 });
    expect(risky.army[0].exp).toBe(10);
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
    const repeats = risky.units.reduce((counts, unit) => counts.set(unit.unitId, (counts.get(unit.unitId) ?? 0) + 1), new Map());
    expect(Math.max(...repeats.values())).toBeLessThanOrEqual(2);
    expect(new Set(risky.units.map((unit) => `${unit.position.row}:${unit.position.column}`)).size).toBe(risky.units.length);

    const compositions = new Set(Array.from({ length: 10 }, (_, seed) => (
      generateEnemyArmy({ pathId: 'risky', difficulty: 3, seed }).units.map((unit) => unit.unitId).sort().join(',')
    )));
    expect(compositions.size).toBeGreaterThan(1);
  });
});
