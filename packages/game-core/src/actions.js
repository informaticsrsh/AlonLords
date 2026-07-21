import { getLordSkillEffects } from './lords.js';

export function evaluateFormula(formula, lord) {
  return (formula.base + formula.multiplier * (lord[formula.lordStat] ?? 0)) * (formula.resultMultiplier ?? 1);
}

function distanceByColumns(left, right) {
  return Math.abs(left.position.column - right.position.column);
}

function opposingColumnDistance(target, attacker) {
  const attackerColumns = attacker.formationColumns;
  const targetColumns = target.formationColumns;
  if (!Number.isInteger(attackerColumns) || !Number.isInteger(targetColumns)) return distanceByColumns(target, attacker);
  const targetCenter = attacker.position.column + (targetColumns - attackerColumns) / 2;
  return Math.abs(target.position.column - targetCenter);
}

function gridDistance(left, right) {
  return Math.abs(left.position.row - right.position.row) + Math.abs(left.position.column - right.position.column);
}

function adjacentAllies(unit, allies = []) {
  if (!unit?.position) return [];
  return allies.filter((ally) => ally !== unit && ally.id !== unit.id && ally.hp > 0 && ally.position && gridDistance(ally, unit) === 1);
}

function percentFrom(text, keyword) {
  const match = text.match(new RegExp(`([+-]?[0-9.]+)\\s*%[^,]*(?:${keyword})`, 'i'));
  return match ? Number(match[1]) / 100 : 0;
}

function hasPositionCondition(unit, allies, condition) {
  if (!unit?.position) return false;
  const positioned = allies.filter((ally) => ally.hp > 0 && ally.position);
  const adjacent = adjacentAllies(unit, allies);
  const rows = positioned.map((ally) => ally.position.row);
  const frontline = rows.length ? Math.min(...rows) : null;
  const backline = rows.length ? Math.max(...rows) : null;
  if (condition === 'is_own_vanguard') return unit.position.row === frontline;
  if (condition === 'is_own_backline') return unit.position.row === backline;
  if (condition === 'is_own_vanguard_unshielded') return unit.position.row === frontline && adjacent.length === 0;
  if (condition === 'no_adjacent_allies') return adjacent.length === 0;
  if (condition === 'adjacent_ally_melee') return adjacent.some((ally) => ally.role === 'melee');
  const count = condition.match(/^adjacent_ally_count>=([0-9]+)$/);
  return count ? adjacent.length >= Number(count[1]) : false;
}

function positionBonuses(unit, allies = []) {
  return (unit?.positionModifiers ?? []).reduce((bonuses, modifier) => {
    if (!hasPositionCondition(unit, allies, modifier.condition)) return bonuses;
    const effect = modifier.effect ?? '';
    const signed = effect.match(/([+-][0-9.]+)\s*%/);
    if (/formula/i.test(effect) && signed) bonuses.formulaMultiplier *= 1 + Number(signed[1]) / 100;
    if (/crit_chance/i.test(effect)) bonuses.critChanceBonus += percentFrom(effect, 'crit_chance');
    if (/ignore_resistance_pct/i.test(effect)) bonuses.ignoreResistancePct += percentFrom(effect, 'ignore_resistance_pct');
    if (/resistances/i.test(effect) && signed) bonuses.resistanceBonus += Number(signed[1]) / 100;
    if (/контратаки/i.test(effect) && signed) bonuses.counterMultiplier *= 1 + Number(signed[1]) / 100;
    return bonuses;
  }, { formulaMultiplier: 1, critChanceBonus: 0, ignoreResistancePct: 0, resistanceBonus: 0, counterMultiplier: 1 });
}

function passivePercent(unit, keyword) {
  const passive = unit.passives?.find((item) => item.id === keyword || item.effect?.toLowerCase().includes(keyword));
  const match = passive?.effect?.match(/([0-9.]+)\s*%/);
  return match ? Number(match[1]) / 100 : 0;
}

function passiveNumericValue(unit, keyword) {
  const passive = unit.passives?.find((item) => item.id === keyword || item.effect?.toLowerCase().includes(keyword));
  const match = passive?.effect?.match(new RegExp(`${keyword}:([0-9.]+)`, 'i'));
  return match ? Number(match[1]) : 0;
}

function effectPercent(unit, key) {
  return (unit.effects ?? []).reduce((total, effect) => total + (effect[key] ?? 0), 0);
}

function resistanceFor(target, damageType) {
  const rawBase = target.resistances?.[damageType] ?? target.resistance ?? 0;
  const base = (rawBase > 1 ? rawBase / 100 : rawBase) + (target.auraResistanceBonus ?? 0) + (target.positionResistanceBonus ?? 0);
  const reduction = (target.effects ?? [])
    .filter((effect) => effect.resistanceReduction)
    .reduce((total, effect) => total + effect.resistanceReduction, 0);
  return Math.max(0, Math.min(0.95, base - reduction));
}

export function calculateDamage(action, amount, attacker, target, rng = Math.random) {
  const evade = action.rangeType === 'melee' ? passiveNumericValue(target, 'melee_evasion_bonus') : 0;
  if (evade > 0 && rng() < evade) return { amount: 0, critical: false, resistance: resistanceFor(target, action.type), evaded: true };
  const critical = rng() < Math.min(1, (attacker?.critChance ?? 0) + (action.critChanceBonus ?? 0));
  const raceBonus = action.bonusVsRaceType?.[target.raceType] ?? 1;
  const penetration = Math.max(0, Math.min(1, (action.ignoreResistancePct ?? 0) + (action.armorPenetrationPct ?? 0)));
  const resistance = resistanceFor(target, action.type) * (1 - penetration);
  const damage = amount * (attacker?.auraAttackMultiplier ?? 1) * raceBonus * (critical ? (action.critMultiplier ?? 2) : 1) * (1 - resistance) * (1 - (target.damageReductionPct ?? 0));
  return { amount: damage, critical, resistance, evaded: false };
}

export function getAccessibleTargets(candidates, attacker, rangeType) {
  const living = candidates.filter((unit) => unit.hp > 0);
  if (rangeType !== 'melee' || !attacker?.position || living.some((unit) => !unit.position)) return living;

  const rows = [...new Set(living.map((unit) => unit.position.row))].sort((a, b) => a - b);
  for (const row of rows) {
    const rowTargets = living.filter((unit) => unit.position.row === row);
    const hasOffsetCenter = Number.isInteger(attacker.formationColumns)
      && Number.isInteger(rowTargets[0]?.formationColumns)
      && (attacker.formationColumns - rowTargets[0].formationColumns) % 2 !== 0;
    const opposingTargets = rowTargets.filter((unit) => hasOffsetCenter
      ? opposingColumnDistance(unit, attacker) === 0.5
      : opposingColumnDistance(unit, attacker) <= 1);

    // In each enemy row, melee units first attack the unit directly opposite
    // them and its two horizontal neighbours. If formations have different
    // parity, the opposing point falls between two cells, so only those two
    // cells are accessible. Only when that area is empty do they expand to the
    // remaining units in that row. The next row is checked only after the
    // current row has no living enemies.
    if (opposingTargets.length) return opposingTargets;
    if (rowTargets.length) return rowTargets;
  }

  return [];
}

export function findGuardian(target, allies) {
  if (!target.position) return null;
  return allies.find((ally) => {
    const guardian = ally.passives?.find((passive) => passive.id === 'guardian');
    if (!guardian || !ally.position || ally.hp <= 0) return false;
    return Math.abs(ally.position.row - target.position.row) + Math.abs(ally.position.column - target.position.column) === 1;
  }) ?? null;
}

export function selectTargets(candidates, rule, rng = Math.random, attacker = null, rangeType = 'ranged') {
  if (rule.selection === 'self') return attacker ? [attacker] : [];
  if (rule.selection === 'corpse_of_dead_ally') return candidates.filter((unit) => unit.hp <= 0).slice(0, typeof rule.count === 'number' ? rule.count : 1);
  const count = typeof rule.count === 'number' ? rule.count : candidates.length;
  const living = getAccessibleTargets(candidates, attacker, rangeType);

  if (rule.selection === 'lowest_hp') {
    return [...living].sort((a, b) => a.hp - b.hp).slice(0, count);
  }
  if (rule.selection === 'highest_threat') {
    return [...living].sort((a, b) => (b.threat ?? 0) - (a.threat ?? 0)).slice(0, count);
  }
  if (rule.selection === 'random') {
    return [...living].sort(() => rng() - 0.5).slice(0, count);
  }
  return attacker?.position
    ? [...living].sort((a, b) => distanceByColumns(a, attacker) - distanceByColumns(b, attacker)).slice(0, count)
    : living.slice(0, count);
}

export function expandAreaTargets(candidates, primaryTargets, action) {
  const shape = action.aoeShape ?? (action.splashRadius ? 'circle' : action.targetRule?.width ? 'width' : null);
  if (!shape || !primaryTargets.length || primaryTargets.some((unit) => !unit.position)) return primaryTargets;
  const origin = primaryTargets[0];
  const radius = action.aoeRadius ?? action.splashRadius ?? 1;
  const width = action.targetRule?.width ?? radius;
  const matchesShape = (unit) => {
    if (!unit.position || unit.hp <= 0) return false;
    if (shape === 'row') return unit.position.row === origin.position.row;
    if (shape === 'column') return unit.position.column === origin.position.column;
    if (shape === 'circle') return Math.max(Math.abs(unit.position.row - origin.position.row), Math.abs(unit.position.column - origin.position.column)) <= radius;
    if (shape === 'cross') return unit.position.row === origin.position.row || unit.position.column === origin.position.column;
    if (shape === 'diagonal') return Math.abs(unit.position.row - origin.position.row) === Math.abs(unit.position.column - origin.position.column);
    if (shape === 'width') return unit.position.row === origin.position.row && Math.abs(unit.position.column - origin.position.column) <= width;
    return false;
  };
  return candidates.filter(matchesShape);
}

function percentValues(effect) {
  return [...effect.matchAll(/([0-9.]+)\s*%/g)].map((match) => Number(match[1]) / 100);
}

/** Applies battle-start auras without mutating the supplied unit instances. */
export function applyBattleAuras(units, enemies = []) {
  const friendly = units.map((unit) => ({ ...unit }));
  const opposing = enemies.map((unit) => ({ ...unit }));
  for (const source of friendly) {
    for (const passive of source.passives ?? []) {
      const values = percentValues(passive.effect ?? '');
      if (passive.id === 'banner_aura') for (const target of friendly) {
        target.auraAttackMultiplier = (target.auraAttackMultiplier ?? 1) * (1 + (values[0] ?? 0));
        target.auraResistanceBonus = (target.auraResistanceBonus ?? 0) + (values[1] ?? 0);
      }
      if (passive.id === 'bastion_aura') for (const target of friendly) target.damageReductionPct = (target.damageReductionPct ?? 0) + (values[0] ?? 0);
      if (passive.id === 'fear_aura') for (const target of opposing) target.auraAttackMultiplier = (target.auraAttackMultiplier ?? 1) * (1 - (values[0] ?? 0));
      if (passive.id === 'shieldwall') {
        const positioned = friendly.filter((unit) => unit.position);
        const frontline = positioned.length ? Math.min(...positioned.map((unit) => unit.position.row)) : null;
        for (const target of friendly) if (frontline !== null && target.position?.row === frontline) target.damageReductionPct = (target.damageReductionPct ?? 0) + (values[0] ?? 0);
      }
      if (passive.id === 'steady_regen') source.steadyRegenPct = values[0] ?? 0;
    }
  }
  return { units: friendly, enemies: opposing };
}

function includeNeighbors(candidates, targets, action) {
  if (!action.includeTargetNeighbors || !targets.length || !targets[0].position) return targets;
  const primary = targets[0];
  return candidates.filter((unit) => unit.hp > 0 && unit.position && gridDistance(unit, primary) <= 1);
}

export function resolveAction(action, lord, candidates, rng, attacker) {
  const targetRule = getTacticalTargetRule(action, attacker);
  const primaryTargets = selectTargets(candidates, targetRule, rng, attacker, action.rangeType);
  return {
    actionId: action.id,
    effectKind: action.effectKind,
    amount: evaluateFormula(action.formula, lord),
    targets: includeNeighbors(candidates, expandAreaTargets(candidates, primaryTargets, action), action)
  };
}

function getTacticalTargetRule(action, attacker) {
  const rule = action.targetRule;
  // Self-targeting and resurrection have gameplay-specific target rules and
  // must not be replaced by a general target preference.
  if (!rule || rule.selection === 'self' || rule.selection === 'corpse_of_dead_ally') return rule;

  const configured = attacker?.tactics?.targetPriority;
  const priorities = Array.isArray(configured?.[rule.side])
    ? configured[rule.side]
    // Keep saved runs from the earlier single enemy-target setting working.
    : rule.side === 'enemy' && typeof configured === 'string' ? [configured] : [];
  const selection = priorities.find((priority) => ['nearest', 'lowest_hp', 'highest_threat', 'random'].includes(priority));
  return selection ? { ...rule, selection } : rule;
}

export function applyActionEffect(action, lord, candidates, rng, attacker, guardians = candidates, attackerAllies = []) {
  const attackerBonuses = positionBonuses(attacker, attackerAllies);
  const adjustedAction = {
    ...action,
    critChanceBonus: (action.critChanceBonus ?? 0) + attackerBonuses.critChanceBonus,
    ignoreResistancePct: (action.ignoreResistancePct ?? 0) + attackerBonuses.ignoreResistancePct
  };
  const resolution = resolveAction(adjustedAction, lord, candidates, rng, attacker);
  const changes = resolution.targets.map((target) => {
    const hpBefore = target.hp;
    const effectsBefore = target.effects ?? [];
    const guardian = action.effectKind === 'damage' ? findGuardian(target, guardians) : null;
    const redirectPct = guardian ? Number(guardian.passives.find((passive) => passive.id === 'guardian').effect.match(/([0-9.]+)/)?.[1] ?? 0) : 0;
    const loneDuel = attacker?.passives?.find((passive) => passive.id === 'lone_duel');
    const targetHasNeighbor = target.position && guardians.some((ally) => ally.id !== target.id && ally.hp > 0 && ally.position && gridDistance(ally, target) === 1);
    const loneDuelBonus = loneDuel && !targetHasNeighbor ? passivePercent(attacker, 'lone_duel') : 0;
    const targetBonuses = positionBonuses(target, guardians);
    const targetWithPositionBonuses = { ...target, positionResistanceBonus: targetBonuses.resistanceBonus };
    const targetIsNonFrontline = target.position && guardians.some((ally) => ally.hp > 0 && ally.position && ally.position.row < target.position.row);
    const targetHasManaAction = target.actions?.some((targetAction) => (targetAction.manaCost ?? 0) > 0);
    const actionMultiplier = (action.bonusIfTargetNonFrontline && targetIsNonFrontline ? action.bonusIfTargetNonFrontline : 1)
      * (action.bonusVsActionHasManaCost && targetHasManaAction ? action.bonusVsActionHasManaCost : 1);
    const damage = action.effectKind === 'damage'
      ? calculateDamage(adjustedAction, resolution.amount * attackerBonuses.formulaMultiplier * (1 + loneDuelBonus) * actionMultiplier, attacker, targetWithPositionBonuses, rng)
      : null;
    const finalDamage = damage?.amount ?? 0;
    const redirectedDamage = finalDamage * redirectPct;
    const arthurEffects = attacker?.lord?.id === 'empire_lord_arthur' ? getLordSkillEffects(attacker.lord) : null;
    const attackerHpPct = attacker ? attacker.hp / attacker.maxHp : 0;
    const targetHpPctBefore = target.maxHp ? hpBefore / target.maxHp : 0;
    const mercyActive = arthurEffects !== null
      && attackerHpPct > arthurEffects.healthyAllyThreshold
      && targetHpPctBefore < arthurEffects.woundedTargetThreshold;
    const mercyDamage = mercyActive ? finalDamage * arthurEffects.mercyDamageMultiplier : 0;
    const isRevive = action.targetRule.selection === 'corpse_of_dead_ally' && action.effectKind === 'heal';
    const blockedRevive = effectsBefore.some((effect) => effect.id === 'no_resurrection');
    const hpAfter = action.effectKind === 'damage'
      ? Math.max(0, hpBefore - finalDamage - mercyDamage + redirectedDamage)
      : isRevive && !blockedRevive
        ? Math.min(target.maxHp, resolution.amount)
      : action.effectKind === 'heal'
        ? Math.min(target.maxHp, hpBefore + resolution.amount)
        : hpBefore;
    const rawStatus = action.onHitDebuff ?? action.onHitControl ?? action.dot ?? (action.burnDot ? { id: 'burn', ticks: action.burnDot.ticks } : null);
    const status = rawStatus?.id || rawStatus?.ticks || rawStatus?.duration
      ? rawStatus
      : action.control ? { id: action.control, duration: action.duration } : null;
    const hasPurge = String(action.effect ?? action.onHitDebuff?.effect ?? '').toLowerCase().includes('purge');
    const manaBurn = Number(String(action.onHitEffect ?? '').match(/mana_burn:(\d+)/)?.[1] ?? 0);
    const resistanceText = String(action.effect ?? rawStatus?.effect ?? '');
    const resistanceReduction = Number(resistanceText.match(/-([0-9.]+)%.*resist/i)?.[1] ?? 0) / 100;
    const controlImmune = status && ['stun', 'paralyze', 'silence', 'fear', 'charm'].includes(status.id) && target.passives?.some((passive) => passive.id === 'silent_immunity');
    const effect = (['buff', 'debuff', 'control'].includes(action.effectKind) || status) && !controlImmune
      ? {
        id: status?.id ?? action.id,
        kind: action.effectKind === 'damage' ? (status?.id === 'stun' || status?.id === 'paralyze' ? 'control' : 'debuff') : action.effectKind,
        amount: resolution.amount,
        duration: action.duration ?? status?.duration ?? status?.ticks ?? Number(String(action.effect ?? '').match(/на\s*([0-9]+)\s*ход/i)?.[1] ?? null),
        damagePerTurn: action.effectKind === 'damage' && status ? Math.max(1, Math.floor(resolution.amount * 0.2)) : 0,
        reflectPct: action.reflectPct ?? 0,
        resistanceReduction
      }
      : null;

    target.hp = hpAfter;
    if (manaBurn) target.mana = Math.max(0, (target.mana ?? 0) - manaBurn);
    if ((action.effectKind === 'reposition' || action.onHitEffect?.effectKind === 'reposition') && target.position) {
      const direction = action.effectKind === 'reposition' ? -1 : 1;
      target.position = { ...target.position, row: Math.max(0, target.position.row + direction) };
    }
    if (hasPurge) target.effects = effectsBefore.filter((item) => item.kind !== 'buff');
    if (action.cleanseDebuffCount) {
      let remaining = action.cleanseDebuffCount;
      target.effects = (target.effects ?? effectsBefore).filter((item) => item.kind !== 'debuff' || remaining-- <= 0);
    }
    if (String(action.effect ?? '').includes('no_resurrection')) target.effects = [...(target.effects ?? effectsBefore), { id: 'no_resurrection', kind: 'debuff', duration: action.duration ?? null }];
    if (guardian) guardian.hp = Math.max(0, guardian.hp - redirectedDamage);
    const reflectedDamage = action.effectKind === 'damage' ? finalDamage * (passivePercent(target, 'reflect') + effectPercent(target, 'reflectPct')) : 0;
    if (attacker && reflectedDamage) attacker.hp = Math.max(0, attacker.hp - reflectedDamage);
    const counterPassive = action.effectKind === 'damage' && action.rangeType === 'melee' && target.hp > 0
      ? target.passives?.find((passive) => passive.id === 'counter_attack')
      : null;
    const counterAmount = counterPassive ? evaluateFormula(counterPassive.formula, target.lord ?? {}) * targetBonuses.counterMultiplier : 0;
    const counter = counterPassive && attacker
      ? calculateDamage({ type: 'physical' }, counterAmount, target, attacker, rng)
      : null;
    if (attacker && counter) attacker.hp = Math.max(0, attacker.hp - counter.amount);
    const counterLifesteal = counter ? passivePercent(target, 'lifesteal') : 0;
    const counterHealing = counterLifesteal ? Math.min(target.maxHp, target.hp + counter.amount * counterLifesteal) - target.hp : 0;
    if (counterHealing) target.hp += counterHealing;
    const lifesteal = action.effectKind === 'damage' ? (action.lifestealPct ?? passivePercent(attacker ?? {}, 'lifesteal')) : 0;
    const healedAttacker = attacker && lifesteal ? Math.min(attacker.maxHp, attacker.hp + finalDamage * lifesteal) - attacker.hp : 0;
    if (attacker && healedAttacker) attacker.hp += healedAttacker;
    if (effect) target.effects = [...(target.effects ?? effectsBefore), effect];
    if (action.onKillSpread && target.hp === 0 && effect && target.position) {
      for (const neighbor of candidates.filter((candidate) => candidate.hp > 0 && candidate.position && gridDistance(candidate, target) === 1)) {
        neighbor.effects = [...(neighbor.effects ?? []), { ...effect }];
      }
    }
    if (damage?.critical && action.executeOnCritBelowHpPct && target.hp / target.maxHp <= action.executeOnCritBelowHpPct) target.hp = 0;
    if (mercyActive && target.hp / target.maxHp < arthurEffects.executeThreshold) target.hp = 0;
    return { targetId: target.id, hpBefore, hpAfter: target.hp, effect, guardianId: guardian?.id ?? null, redirectedDamage, damage: finalDamage, mercyDamage, critical: damage?.critical ?? false, evaded: damage?.evaded ?? false, reflectedDamage, counterDamage: counter?.amount ?? 0, counterHealing, healedAttacker, manaBurn, revived: isRevive && !blockedRevive, repositioned: action.effectKind === 'reposition' || action.onHitEffect?.effectKind === 'reposition' };
  });

  return { ...resolution, changes };
}

export function isActionUsable(action, unit, resource = unit) {
  const cooldown = unit.cooldowns?.[action.id] ?? 0;
  const uses = unit.actionUses?.[action.id] ?? 0;
  return cooldown <= 0 && (action.usesPerBattle === undefined || uses < action.usesPerBattle) && (resource.mana ?? Infinity) >= (action.manaCost ?? 0);
}

function hasMeaningfulTarget(action, unit, allies, enemies) {
  const rule = action.targetRule ?? {};
  const effectId = actionEffectId(action);
  if (rule.selection === 'self' || rule.side === 'self') {
    return !effectId || !(unit.effects ?? []).some((effect) => effect.id === effectId);
  }
  const candidates = rule.side === 'ally' ? allies : enemies;
  if (rule.selection === 'corpse_of_dead_ally') return candidates.some((target) => target.hp <= 0 && !(target.effects ?? []).some((effect) => effect.id === 'no_resurrection'));
  const targets = getAccessibleTargets(candidates, unit, action.rangeType);
  if (action.effectKind === 'heal') return targets.some((target) => target.hp > 0 && target.hp < target.maxHp);
  if (effectId && ['buff', 'debuff', 'control'].includes(action.effectKind)) return targets.some((target) => !(target.effects ?? []).some((effect) => effect.id === effectId));
  return targets.length > 0;
}

function actionEffectId(action) {
  return action.onHitDebuff?.id ?? action.onHitControl?.id ?? action.control ?? (['buff', 'debuff', 'control'].includes(action.effectKind) ? action.id : null);
}

function meetsActionCondition(action, allies, enemies, unit) {
  if (!action.condition) return true;
  const candidates = action.targetRule.side === 'ally' ? allies : enemies;
  const accessible = action.targetRule.side === 'self' ? [unit] : getAccessibleTargets(candidates, unit, action.rangeType);
  if (action.condition.targetHasManaAction) return accessible.some((target) => target.actions?.some((candidate) => (candidate.manaCost ?? 0) > 0));
  return candidates.some((target) => {
    if (action.condition.hpPctBelow !== undefined && !(target.hp / target.maxHp < action.condition.hpPctBelow)) return false;
    if (action.condition.raceTypeIn && !action.condition.raceTypeIn.includes(target.raceType)) return false;
    const value = action.condition.field === 'hpPct' ? target.hp / target.maxHp : target[action.condition.field];
    if (!action.condition.field) return true;
    return action.condition.operator === 'lt' ? value < action.condition.value : value > action.condition.value;
  });
}

function meetsTacticalRule(action, tactics, allies, enemies, resource, unit) {
  const rule = tactics?.actionRules?.[action.id];
  if (!rule) return true;
  const livingAllies = allies.filter((ally) => ally.hp > 0 && ally.maxHp > 0);
  const allyThreshold = Math.max(0, Math.min(100, Number(rule.healthThreshold ?? 65))) / 100;
  if (action.effectKind === 'heal' && action.targetRule?.selection !== 'corpse_of_dead_ally') {
    if (rule.allyHealth === 'any_below' && !livingAllies.some((ally) => ally.hp / ally.maxHp <= allyThreshold)) return false;
    if (rule.allyHealth === 'all_above' && (!livingAllies.length || !livingAllies.every((ally) => ally.hp / ally.maxHp >= allyThreshold))) return false;
  }

  const livingEnemies = getAccessibleTargets(enemies, unit, action.rangeType).filter((enemy) => enemy.maxHp > 0);
  const enemyThreshold = Math.max(0, Math.min(100, Number(rule.enemyHealthThreshold ?? 65))) / 100;
  if (action.effectKind === 'damage') {
    if (rule.enemyHealth === 'any_below' && !livingEnemies.some((enemy) => enemy.hp / enemy.maxHp <= enemyThreshold)) return false;
    if (rule.enemyHealth === 'all_above' && (!livingEnemies.length || !livingEnemies.every((enemy) => enemy.hp / enemy.maxHp >= enemyThreshold))) return false;
  }

  const effectId = actionEffectId(action);
  if (effectId && action.targetRule?.selection !== 'corpse_of_dead_ally' && ['buff', 'debuff', 'control'].includes(action.effectKind)) {
    const candidates = action.targetRule?.side === 'ally' ? allies : enemies;
    const targets = action.targetRule?.selection === 'self' ? [unit] : getAccessibleTargets(candidates, unit, action.rangeType);
    if (rule.effectState === 'missing' && !targets.some((target) => !(target.effects ?? []).some((effect) => effect.id === effectId))) return false;
    if (rule.effectState === 'present' && !targets.some((target) => (target.effects ?? []).some((effect) => effect.id === effectId))) return false;
  }

  const crystal = resource?.mana ?? 0;
  const crystalValue = Math.max(0, Number(rule.crystalValue ?? action.manaCost ?? 0));
  if (rule.crystal === 'at_least' && crystal < crystalValue) return false;
  if (rule.crystal === 'at_most' && crystal > crystalValue) return false;
  return true;
}

export function selectAutomaticAction(unit, allies = [], enemies = [], resource = unit) {
  const actions = (unit.actions ?? [])
    .filter((action) => isActionUsable(action, unit, resource))
    .filter((action) => meetsActionCondition(action, allies, enemies, unit));
  const configuredPriorities = unit.tactics?.actionPriority;
  if (Array.isArray(configuredPriorities)) {
    for (const actionId of configuredPriorities) {
      const action = actions.find((candidate) => candidate.id === actionId);
      if (action && meetsTacticalRule(action, unit.tactics, allies, enemies, resource, unit) && hasMeaningfulTarget(action, unit, allies, enemies)) return action;
    }
  }
  // Compatibility with saves created before skills received their own order.
  if (typeof configuredPriorities === 'string') {
    const preferred = actions.find((action) => action.effectKind === configuredPriorities);
    if (preferred) return preferred;
  }
  const revive = actions.find((action) => action.targetRule.selection === 'corpse_of_dead_ally');
  if (revive && allies.some((ally) => ally.hp <= 0 && !(ally.effects ?? []).some((effect) => effect.id === 'no_resurrection'))) return revive;
  const heal = actions.find((action) => action.effectKind === 'heal');
  if (heal && allies.some((ally) => ally.hp > 0 && ally.hp < ally.maxHp)) return heal;

  return actions.find((action) => action.effectKind === 'damage' && action.rangeType === 'ranged')
    ?? actions.find((action) => action.effectKind === 'damage')
    ?? actions[0]
    ?? null;
}

export function beginTurn(unit) {
  const cooldowns = Object.fromEntries(Object.entries(unit.cooldowns ?? {}).map(([id, turns]) => [id, Math.max(0, turns - 1)]));
  const activeEffects = (unit.effects ?? []).map((effect) => ({ ...effect, duration: effect.duration === null ? null : effect.duration - 1 }))
    .filter((effect) => effect.duration === null || effect.duration >= 0);
  const dotDamage = activeEffects.reduce((sum, effect) => sum + (effect.damagePerTurn ?? 0), 0);
  return {
    ...unit,
    hp: Math.min(unit.maxHp ?? Infinity, Math.max(0, unit.hp - dotDamage) + (unit.maxHp ?? 0) * (unit.steadyRegenPct ?? 0)),
    ...(unit.mana === undefined ? {} : { mana: Math.min(unit.manaMax ?? 0, unit.mana + (unit.manaRegen ?? 0)) }),
    cooldowns,
    effects: activeEffects
  };
}

export function spendActionResources(unit, action) {
  return {
    ...unit,
    ...(unit.mana === undefined ? {} : { mana: unit.mana - (action.manaCost ?? 0) }),
    cooldowns: typeof action.cooldown === 'number'
      ? { ...(unit.cooldowns ?? {}), [action.id]: action.cooldown }
      : unit.cooldowns ?? {},
    actionUses: action.usesPerBattle === undefined
      ? unit.actionUses ?? {}
      : { ...(unit.actionUses ?? {}), [action.id]: (unit.actionUses?.[action.id] ?? 0) + 1 }
  };
}

export function spendCrystalResources(crystal, action) {
  return { ...crystal, mana: Math.max(0, crystal.mana - (action.manaCost ?? 0)) };
}

export function regenerateCrystal(crystal) {
  return { ...crystal, mana: Math.min(crystal.manaMax, crystal.mana + crystal.manaRegen / 5) };
}
