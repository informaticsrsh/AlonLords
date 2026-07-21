/* eslint-disable react/prop-types */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { choosePath, createDefaultTactics, createGrid, createPaths, createRun, createUnitInstance, empireLords, evolveUnit, finishBattle, generateEnemyArmy, getBattleLordStats, getEmpireLord, getEmpireUnit, getLordSkillEffects, getRecruitableUnits, getRunLord, getUnitUnlockProgress, healUnit, moveUnit, recruitUnit, reviveUnit, simulateBattle, spendLordAttributePoint, updateArmyMember } from '@empire/game-core';
import './styles.css';

const runStorageKey = 'empire-lords.run.v1';
const artUrl = (file) => `${import.meta.env.BASE_URL}art/${file}`;
const lordPortraits = {
  empire_lord_henrik: artUrl('lord-henrik.png'),
  empire_lord_arthur: artUrl('lord-arthur.png')
};
const unitPortraitPositions = {
  empire_archer_t1: '0% 0%', empire_infantry_t1: '33.333% 0%', empire_priest_t1: '66.667% 0%', empire_silent_t1: '100% 0%',
  empire_truth_t1: '0% 100%', empire_inquisition_t1: '33.333% 100%', empire_knight_t1: '66.667% 100%'
};
const unitLinePortraitPositions = {
  archer: '0% 0%', infantry: '33.333% 0%', priest: '66.667% 0%', silent: '100% 0%',
  truth: '0% 100%', inquisition: '33.333% 100%', knight: '66.667% 100%'
};

function getUnitPortraitPosition(unitId) {
  if (unitPortraitPositions[unitId]) return unitPortraitPositions[unitId];
  const line = unitId.match(/^empire_(.+?)_t\d+(?:_|$)/)?.[1];
  return unitLinePortraitPositions[line] ?? '100% 100%';
}

function getUnitTier(unitId) {
  return Number(unitId.match(/_t(\d+)(?:_|$)/)?.[1] ?? 1);
}

function UnitPortrait({ unitId, className = '' }) {
  const tier = getUnitTier(unitId);
  return <span className={`unit-portrait tier-${tier} ${className}`} aria-hidden="true" data-tier={tier > 1 ? `T${tier}` : undefined} style={{ backgroundImage: `url(${artUrl('imperial-unit-portraits.png')})`, backgroundPosition: getUnitPortraitPosition(unitId) }} />;
}

function battleEventInfo(event) {
  if (!event) return { kind: 'ready', icon: '✦', label: 'Армії займають позиції', amount: null };
  if (event.type === 'heal') return { kind: 'heal', icon: '✦', label: 'Зцілення', amount: event.amount };
  if (event.type === 'buff') return { kind: 'buff', icon: '↑', label: 'Посилення', amount: null };
  if (event.type === 'debuff') return { kind: 'debuff', icon: '↓', label: 'Послаблення', amount: null };
  if (event.type === 'control' || event.type === 'control_skip') return { kind: 'control', icon: '⚡', label: 'Контроль', amount: null };
  if (event.type === 'death') return { kind: 'death', icon: '☠', label: 'Юніт вибув', amount: null };
  if (event.type === 'faith') return { kind: 'faith', icon: '✦', label: 'Віра змінюється', amount: event.value };
  const damageType = event.damageType ?? 'physical';
  const damageLabels = { physical: 'Фізична шкода', fire: 'Вогняна шкода', holy: 'Свята шкода', arcane: 'Магічна шкода', ice: 'Крижана шкода', poison: 'Отрута', lightning: 'Блискавка' };
  if (event.type === 'reflect') return { kind: 'damage', damageType, icon: '↶', label: 'Відбиття', amount: event.amount };
  if (event.type === 'counter') return { kind: 'damage', damageType, icon: '↯', label: 'Контратака', amount: event.amount };
  return { kind: 'damage', damageType, icon: event.isCritical ? '✹' : '⚔', label: event.isCritical ? `Критичний удар · ${damageLabels[damageType] ?? 'Шкода'}` : damageLabels[damageType] ?? 'Шкода', amount: event.amount ?? event.damage };
}

function effectIcon(effect) {
  if (effect.kind === 'buff') return effect.id.includes('shield') ? '🛡' : '↑';
  if (effect.kind === 'control') return '⚡';
  if (effect.id.includes('burn')) return '🔥';
  if (effect.id.includes('poison')) return '☠';
  if (effect.id.includes('armor') || effect.id.includes('resist')) return '🛡';
  return '↓';
}

function actionEvents(events) {
  const turnEvents = events.filter((event) => ['attack', 'damage', 'heal', 'buff', 'debuff', 'control', 'reposition', 'control_skip'].includes(event.type));
  return turnEvents.filter((event, index) => {
    const previous = turnEvents[index - 1];
    return !previous || event.type === 'control_skip' || previous.type === 'control_skip'
      || previous.attackerId !== event.attackerId || previous.actionId !== event.actionId || previous.round !== event.round;
  });
}

function nextActionTiming(playback, unitId) {
  const timeline = actionEvents(playback.battle.events);
  const elapsed = actionEvents(playback.battle.events.slice(0, playback.index)).length;
  const next = timeline.slice(elapsed).findIndex((event) => (event.attackerId ?? event.unitId) === unitId);
  if (next < 0) return { remaining: null, progress: 0, label: 'дій не залишилось' };
  const remaining = next;
  const progress = Math.max(0, Math.min(100, 100 - remaining * 20));
  return { remaining, progress, label: remaining === 0 ? 'дія зараз' : `до дії: ${remaining}` };
}
const factions = [{
  id: 'empire',
  name: 'Імперія',
  emblem: '✥',
  feature: 'Віра',
  description: 'Починає кожен бій з 50 Віри. Віра зростає за знищення ворогів та зменшується від втрат союзників.',
  mechanic: 'Висока Віра прискорює дії армії, низька — сповільнює. Лорди Імперії по-своєму змінюють цю механіку.'
}];

function formatStat(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  return Number.isInteger(numericValue) ? numericValue : Number(numericValue.toFixed(1));
}

function formatPathReward(reward) {
  if (!reward) return 'немає';
  const labels = {
    gold: 'золота',
    lord_experience: 'досвіду лорду',
    skill_points: 'поінт навички',
    mines: 'шахта'
  };
  return `+${reward.amount} ${labels[reward.type] ?? reward.type}`;
}

function getActionValue(action, lord) {
  if (!action.formula) return null;
  const { base = 0, lordStat, multiplier = 0, resultMultiplier = 1 } = action.formula;
  return (base + (lord?.[lordStat] ?? 0) * multiplier) * resultMultiplier;
}

const lordStatNames = {
  vitality: 'Витривалість',
  battlePower: 'Бойова сила',
  crystalRegenSpeed: 'Регенерація кристалу',
  crystalVolume: 'Сила кристалу',
  leadership: 'Лідерство',
  tactics: 'Тактика'
};
const roleNames = { melee: 'Ближній бій', ranged: 'Дальній бій', caster: 'Заклинач' };
const effectNames = { damage: 'Шкода', heal: 'Зцілення', buff: 'Посилення', debuff: 'Послаблення', control: 'Контроль' };

function getFormulaBreakdown(formula, lord) {
  if (!formula) return null;
  const { base = 0, lordStat, multiplier = 0, resultMultiplier = 1 } = formula;
  const statValue = lord?.[lordStat] ?? 0;
  const subtotal = base + statValue * multiplier;
  const result = subtotal * resultMultiplier;
  const statName = lordStatNames[lordStat] ?? lordStat;
  const expression = `${formatStat(base)} + ${formatStat(multiplier)} × ${statName} (${formatStat(statValue)})`;
  return {
    result,
    statName,
    statValue,
    calculation: resultMultiplier === 1
      ? `${expression} = ${formatStat(result)}`
      : `(${expression}) × ${formatStat(resultMultiplier)} = ${formatStat(result)}`
  };
}

function actionTargetDescription(action) {
  const side = action.targetRule?.side === 'ally' ? 'союзника' : 'ворога';
  const selection = { nearest: 'найближчого', lowest_hp: 'з найменшим здоров’ям', highest_threat: 'з найбільшою загрозою', random: 'випадкового', self: 'себе' }[action.targetRule?.selection] ?? 'ціль';
  const count = action.targetRule?.count ?? 1;
  return action.targetRule?.selection === 'self' ? 'Ціль: себе' : `Ціль: ${count > 1 ? `${count} ${side === 'ворога' ? 'ворогів' : 'союзників'}` : `${selection} ${side}`}`;
}

const targetPriorityOptions = {
  nearest: 'Найближча доступна',
  lowest_hp: 'Найслабша (найменше HP)',
  highest_threat: 'Найнебезпечніша (загроза)',
  random: 'Випадкова'
};

function movePriorityItem(items, item, direction) {
  const index = items.indexOf(item);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function actionPriorityOrder(member, unit) {
  const saved = Array.isArray(member.tactics?.actionPriority) ? member.tactics.actionPriority : [];
  const validSaved = saved.filter((actionId) => unit.combat.actions.some((action) => action.id === actionId));
  return [...validSaved, ...unit.combat.actions.map((action) => action.id).filter((actionId) => !validSaved.includes(actionId))];
}

function actionConditionKind(action) {
  if (action.effectKind === 'heal' && action.targetRule?.selection !== 'corpse_of_dead_ally') return 'allyHealth';
  if (action.effectKind === 'damage') return 'enemyHealth';
  if (['buff', 'debuff', 'control'].includes(action.effectKind) && action.targetRule?.selection !== 'corpse_of_dead_ally') return 'effect';
  return null;
}

function defaultActionRule(action) {
  const conditionKind = actionConditionKind(action);
  return {
    allyHealth: conditionKind === 'allyHealth' ? 'any_below' : 'any',
    healthThreshold: 65,
    enemyHealth: 'any',
    enemyHealthThreshold: 65,
    effectState: conditionKind === 'effect' ? 'missing' : 'any',
    crystal: action.manaCost ? 'at_least' : 'enough',
    crystalValue: action.manaCost ?? 0
  };
}

function actionRuleFor(member, action) {
  return { ...defaultActionRule(action), ...(member.tactics?.actionRules?.[action.id] ?? {}) };
}

function targetPriorityOrder(member, side) {
  const saved = member.tactics?.targetPriority;
  const validSaved = Array.isArray(saved?.[side]) ? saved[side].filter((priority) => targetPriorityOptions[priority]) : [];
  return [...validSaved, ...Object.keys(targetPriorityOptions).filter((priority) => !validSaved.includes(priority))];
}

function canConfigureTargetsFor(unit, side) {
  return unit.combat.actions.some((action) => action.targetRule?.side === side && !['self', 'corpse_of_dead_ally'].includes(action.targetRule.selection));
}

function actionTacticSummary(action) {
  const target = action.targetRule?.selection === 'self' ? 'на себе'
    : action.targetRule?.selection === 'corpse_of_dead_ally' ? 'на полеглого союзника'
      : action.targetRule?.side === 'ally' ? 'на союзника' : 'на ворога';
  return `${effectNames[action.effectKind] ?? action.effectKind} ${target}${action.manaCost ? ` · ${action.manaCost} кристала` : ''}${action.cooldown ? ` · відновлення ${action.cooldown}` : ''}`;
}

function LordProfileButton({ lord, onClick, label = 'Профіль лорда' }) {
  return <button className="lord-profile-button" onClick={onClick} aria-label={`Відкрити профіль лорда ${lord.name}`}>
    <span className="lord-profile-icon"><img src={lordPortraits[lord.id]} alt="" /></span>
    <span><small>Лорд</small><b>{label}</b></span>
  </button>;
}

function getLordUnitAvailability(lord) {
  const starterUnitIds = new Set(lord.starterUnitIds ?? []);
  const sharedFactionUnitIds = empireLords
    .map((candidate) => candidate.starterUnitIds ?? [])
    .reduce((shared, unitIds) => shared.filter((unitId) => unitIds.includes(unitId)));
  const unitNames = (unitIds) => unitIds.map((unitId) => getEmpireUnit(unitId)?.name).filter(Boolean).join(', ');
  return {
    factionUnits: unitNames(sharedFactionUnitIds),
    specialUnits: unitNames([...starterUnitIds].filter((unitId) => !sharedFactionUnitIds.includes(unitId))),
    unlockableUnits: empireUnits
      .filter((unit) => unit.tier === 1 && !starterUnitIds.has(unit.id))
      .map((unit) => unit.name)
      .join(', ')
  };
}

function LordUnitAvailability({ lord, compact = false }) {
  const availability = getLordUnitAvailability(lord);
  return <section className={`lord-unit-availability ${compact ? 'compact' : ''}`}>
    <b>Набір юнітів</b>
    <div><small>Юніти фракції</small><span>{availability.factionUnits}</span></div>
    <div><small>Особливий стартовий юніт</small><span>{availability.specialUnits}</span></div>
    <div><small>Відкриття за складні перемоги</small><span>{availability.unlockableUnits}</span></div>
  </section>;
}

function LordDetails({ lord, onClose, onSpendAttributePoint, canSpendAttributePoint = false }) {
  const battleLord = getBattleLordStats(lord);
  const skill = getLordSkillEffects(lord);
  const experience = lord.experience ?? 0;
  const experienceToNextLevel = lord.experienceToNextLevel ?? 100;
  const progress = experienceToNextLevel ? Math.min(100, experience / experienceToNextLevel * 100) : 100;
  const isArthur = lord.id === 'empire_lord_arthur';
  const statItems = [
    { id: 'leadership', name: 'Лідерство', value: lord.leadership, increase: '+1' },
    { id: 'tactics', name: 'Тактика', value: lord.tactics, increase: '+1' },
    { id: 'battlePower', name: 'Бойова сила', value: lord.battlePower, battleValue: battleLord.battlePower, increase: '+1' },
    { id: 'vitality', name: 'Витривалість', value: lord.vitality, battleValue: battleLord.vitality, increase: '+1' },
    { id: 'crystalVolume', name: 'Сила кристалу', value: lord.crystalVolume, increase: '+5' },
    { id: 'crystalRegenSpeed', name: 'Регенерація кристалу', value: lord.crystalRegenSpeed / 5, battleValue: battleLord.crystalRegenSpeed / 5, suffix: '/хід', increase: '+0,2/хід' }
  ];
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <article className="lord-details modal-dialog" role="dialog" aria-modal="true" aria-label={`Профіль лорда ${lord.name}`}>
      <header className="lord-details-heading">
        <div className="lord-details-title"><span className="lord-details-portrait"><img src={lordPortraits[lord.id]} alt="" /></span><div><p className="eyebrow">Профіль лорда</p><h2>{lord.name}</h2><span>{lord.description}</span></div></div>
        <button className="details-close" onClick={onClose} aria-label="Закрити профіль лорда">×</button>
      </header>
      <section className="lord-level-card">
        <div><span>Рівень</span><b>{lord.level ?? 1}</b></div>
        <div className="lord-experience"><span>Досвід до рівня {Number(lord.level ?? 1) + 1}</span><b>{formatStat(experience)} / {formatStat(experienceToNextLevel)}</b><i><em style={{ width: `${progress}%` }} /></i></div>
        <div><span>Скілпойнти</span><b>{lord.skillPoints ?? 0}</b><small>+3 за рівень</small></div>
      </section>
      <section className="lord-details-section">
        <h3>Характеристики</h3>
        <div className="lord-profile-stats">
          {statItems.map((stat) => <div key={stat.id}><span>{stat.name}</span><b>{formatStat(stat.value)}{stat.suffix ?? ''}</b>{stat.battleValue !== undefined && stat.battleValue !== stat.value && <small>У бою: {formatStat(stat.battleValue)}{stat.suffix ?? ''}</small>}{onSpendAttributePoint && <button className="attribute-upgrade" disabled={!canSpendAttributePoint || (lord.skillPoints ?? 0) < 1} onClick={() => onSpendAttributePoint(stat.id)}>Покращити {stat.increase} · 1 SP</button>}</div>)}
        </div>
      </section>
      <section className="lord-details-section">
        <h3>Доступні юніти</h3>
        <LordUnitAvailability lord={lord} />
      </section>
      <section className="lord-details-section lord-skill-details">
        <div className="lord-skill-heading"><div><p className="eyebrow">Унікальна навичка · залежить від рівня {skill.level}</p><h3>{isArthur ? 'Удар милосердя' : 'Посилена Віра'}</h3></div><span>Рівень {skill.level}</span></div>
        {isArthur ? <>
          <p>Здоровий союзник завдає додаткової шкоди пораненому ворогу. Якщо після цього удару ціль майже переможена — вона буде страчена.</p>
          <div className="skill-calculations">
            <div><b>Умова</b><span>HP союзника &gt; {formatStat(skill.healthyAllyThreshold * 100)}% і HP ворога &lt; {formatStat(skill.woundedTargetThreshold * 100)}%</span><small>90% − 2% × рівень; 18% + 1,6% × рівень</small></div>
            <div><b>Додаткова шкода</b><span>Шкода удару × {formatStat(skill.mercyDamageMultiplier * 100)}%</span><small>15% + 2% × рівень</small></div>
            <div><b>Страта</b><span>Після удару HP ворога &lt; {formatStat(skill.executeThreshold * 100)}%</span><small>6% + 0,7% × рівень</small></div>
          </div>
        </> : <>
          <p>Змінює Віру під час бою: за знищеного ворога вона зростає швидше, а за смерть союзника — втрачається менше.</p>
          <div className="skill-calculations">
            <div><b>Віра за перемогу</b><span>10 × {formatStat(skill.faithGainMultiplier)} = {formatStat(10 * skill.faithGainMultiplier)}</span><small>Множник: 1,3 + 0,03 × рівень, максимум 2</small></div>
            <div><b>Втрата Віри</b><span>10 × {formatStat(skill.faithLossMultiplier)} = {formatStat(10 * skill.faithLossMultiplier)}</span><small>Множник: 1 − 0,02 × рівень, мінімум 0,5</small></div>
            <div><b>Присутність у бою</b><span>{formatStat(Math.min(0.7 + 0.015 * ((lord.level ?? 1) - 1), 0.9) * 100)}% базових бойових параметрів</span><small>70% + 1,5% × (рівень − 1), максимум 90%</small></div>
            <div><b>Віра понад 80</b><span>Швидкість ×{formatStat(skill.highFaithSpeedMultiplier)} · опір +{formatStat(skill.highFaithResistanceBonus * 100)}% · крит +{formatStat(skill.highFaithCritBonus * 100)}%</span><small>Бонуси зростають разом із рівнем лорда</small></div>
            <div><b>Віра нижче 20</b><span>Швидкість ×{formatStat(skill.lowFaithSpeedMultiplier)}</span><small>0,8 + 0,01 × рівень, максимум ×1</small></div>
          </div>
        </>}
        {onSpendAttributePoint && <small className="skill-spend-note">Скілпойнти покращують базові характеристики. Унікальна навичка зростає тільки з рівнем лорда.</small>}
      </section>
    </article>
  </div>;
}

function UnitDetails({ unit, lord, onClose }) {
  const battleLord = getBattleLordStats(lord);
  const instance = createUnitInstance(unit, battleLord);
  const hpBreakdown = getFormulaBreakdown(unit.combat.hpFormula, battleLord);
  const affectedStats = [...new Set([unit.combat.hpFormula?.lordStat, ...unit.combat.actions.map((action) => action.formula?.lordStat)].filter(Boolean))];
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <article className="unit-details modal-dialog" role="dialog" aria-modal="true" aria-label={`Деталі юніта ${unit.name}`}>
    <div className="unit-details-heading">
      <div className="unit-details-title"><UnitPortrait unitId={unit.id} className="unit-details-portrait" /><div><p className="eyebrow">{'\u0414\u0435\u0442\u0430\u043b\u0456 \u044e\u043d\u0456\u0442\u0430'}</p><h3>{unit.name}</h3><span>{roleNames[unit.role] ?? unit.role} · рівень {unit.tier}</span></div></div>
      <button className="details-close" onClick={onClose} aria-label={'\u0417\u0430\u043a\u0440\u0438\u0442\u0438 \u0434\u0435\u0442\u0430\u043b\u0456 \u044e\u043d\u0456\u0442\u0430'}>×</button>
    </div>
    <dl className="unit-stats">
      <div><dt>{'\u0417\u0434\u043e\u0440\u043e\u0432\u2019\u044f'}</dt><dd>{formatStat(instance.maxHp)}</dd></div>
      <div><dt>{'\u0428\u0432\u0438\u0434\u043a\u0456\u0441\u0442\u044c \u0430\u0442\u0430\u043a\u0438'}</dt><dd>{unit.combat.attackSpeed}</dd></div>
      <div><dt>{'\u041b\u0456\u0434\u0435\u0440\u0441\u0442\u0432\u043e'}</dt><dd>{unit.combat.leadershipCost}</dd></div>
      <div><dt>{'\u0420\u043e\u043b\u044c'}</dt><dd>{roleNames[unit.role] ?? unit.role}</dd></div>
      <div><dt>{'\u0420\u043e\u0437\u043c\u0456\u0440'}</dt><dd>{unit.gridFootprint.rows}×{unit.gridFootprint.columns}</dd></div>
    </dl>
    <section className="unit-details-section formula-section">
      <h4>Звідки беруться характеристики</h4>
      <p className="formula-intro">Значення нижче розраховано для лорда «{lord.name}». У бою використовуються його поточні бойові параметри.</p>
      <div className="formula-list">
        <div><b>Здоров’я: {formatStat(instance.maxHp)}</b><span>{hpBreakdown.calculation}</span><small>На цей показник впливає {hpBreakdown.statName} лорда.</small></div>
        <div><b>Швидкість атаки: {unit.combat.attackSpeed}</b><span>Базове значення юніта</span><small>Не залежить від параметрів лорда.</small></div>
        <div><b>Вартість лідерства: {unit.combat.leadershipCost}</b><span>Базове значення юніта</span><small>Не залежить від параметрів лорда.</small></div>
        {affectedStats.map((stat) => <div className="lord-contribution" key={stat}><b>{lordStatNames[stat] ?? stat}: {formatStat(battleLord[stat] ?? 0)}</b><span>Поточне значення лорда в бою</span></div>)}
      </div>
    </section>
    <section className="unit-details-section">
      <h4>{'\u0423\u043c\u0456\u043d\u043d\u044f'}</h4>
      <div className="unit-abilities">
        {unit.combat.actions.map((action) => {
          const breakdown = getFormulaBreakdown(action.formula, battleLord);
          return <div key={action.id}>
            <b>{action.name}</b>
            <span>{effectNames[action.effectKind] ?? action.effectKind} · {action.rangeType === 'melee' ? 'ближня' : 'дальня'} дія · {actionTargetDescription(action)}</span>
            {breakdown && <strong>{effectNames[action.effectKind] ?? 'Ефект'}: {formatStat(breakdown.result)}</strong>}
            {breakdown && <small className="formula">Розрахунок: {breakdown.calculation}</small>}
            <small>{action.manaCost ? `Вартість: ${action.manaCost} сили кристала` : 'Без витрат сили кристала'}{action.cooldown ? ` · Відновлення: ${action.cooldown} ходи` : ''}</small>
          </div>;
        })}
      </div>
    </section>
    {(unit.combat.passives ?? []).length > 0 && <section className="unit-details-section">
      <h4>{'\u041f\u0430\u0441\u0438\u0432\u043d\u0456 \u0437\u0434\u0456\u0431\u043d\u043e\u0441\u0442\u0456'}</h4>
      <ul>{unit.combat.passives.map((passive) => <li key={passive.id}><b>{passive.id}</b>{passive.effect ? ` — ${passive.effect}` : ''}{passive.trigger ? ` (${passive.trigger})` : ''}</li>)}</ul>
    </section>}
    </article>
  </div>;
}

function TacticsModal({ member, unit, onClose, onChange }) {
  const skillPriorities = actionPriorityOrder(member, unit);
  const enemyTargetPriorities = targetPriorityOrder(member, 'enemy');
  const allyTargetPriorities = targetPriorityOrder(member, 'ally');
  const updateTactics = (patch) => onChange({ ...member.tactics, ...patch });
  const updateActionRule = (action, patch) => updateTactics({ actionRules: { ...(member.tactics?.actionRules ?? {}), [action.id]: { ...actionRuleFor(member, action), ...patch } } });
  const updateTargetPriorities = (side, priorities) => updateTactics({ targetPriority: { ...(member.tactics?.targetPriority ?? {}), [side]: priorities } });
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <article className="tactics-modal modal-dialog" role="dialog" aria-modal="true" aria-label={`Тактика юніта ${unit.name}`}>
      <header className="modal-heading"><div className="unit-details-title"><UnitPortrait unitId={unit.id} className="unit-details-portrait" /><div><p className="eyebrow">Тактика юніта</p><h3>{unit.name}</h3><span>Умови перевіряються на початку кожного ходу.</span></div></div><button className="details-close" onClick={onClose} aria-label="Закрити налаштування тактики">×</button></header>
      <p className="tactics-modal-intro">Юніт виконує першу доступну навичку зі списку, для якої виконані її умови. Порядок навичок не залежить від порядку цілей.</p>
      <section className="tactics-group">
        <h4>1. Порядок навичок та умови</h4>
        <ol className="tactics-priority-list tactical-actions">
          {skillPriorities.map((actionId, index) => {
            const action = unit.combat.actions.find((candidate) => candidate.id === actionId);
            const rule = actionRuleFor(member, action);
            const conditionKind = actionConditionKind(action);
            return <li key={actionId}>
              <span className="priority-number">{index + 1}</span>
              <div className="tactical-action-copy"><b>{action.name}</b><small>{actionTacticSummary(action)}</small>
                <div className="tactical-rule-fields">
                  {conditionKind === 'allyHealth' && <><label>Стан союзників<select value={rule.allyHealth} onChange={(event) => updateActionRule(action, { allyHealth: event.target.value })}><option value="any">Не враховувати</option><option value="any_below">Є союзник з HP не вище</option><option value="all_above">Усі союзники мають HP не нижче</option></select></label>{rule.allyHealth !== 'any' && <label>Поріг HP<input type="number" min="1" max="100" value={rule.healthThreshold} onChange={(event) => updateActionRule(action, { healthThreshold: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} /><span>%</span></label>}</>}
                  {conditionKind === 'enemyHealth' && <><label>Стан ворогів<select value={rule.enemyHealth} onChange={(event) => updateActionRule(action, { enemyHealth: event.target.value })}><option value="any">Не враховувати</option><option value="any_below">Є ворог з HP не вище</option><option value="all_above">Усі доступні вороги мають HP не нижче</option></select></label>{rule.enemyHealth !== 'any' && <label>Поріг HP<input type="number" min="1" max="100" value={rule.enemyHealthThreshold} onChange={(event) => updateActionRule(action, { enemyHealthThreshold: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} /><span>%</span></label>}</>}
                  {conditionKind === 'effect' && <label>Ефект навички на цілі<select value={rule.effectState} onChange={(event) => updateActionRule(action, { effectState: event.target.value })}><option value="missing">Накладати, якщо ефекту ще немає</option><option value="any">Не враховувати</option></select></label>}
                  <label>Заряд кристалу<select value={rule.crystal} onChange={(event) => updateActionRule(action, { crystal: event.target.value })}><option value="enough">Достатньо для навички</option><option value="at_least">Не нижче</option><option value="at_most">Не вище</option></select></label>
                  {rule.crystal !== 'enough' && <label>Поріг заряду<input type="number" min="0" value={rule.crystalValue} onChange={(event) => updateActionRule(action, { crystalValue: Math.max(0, Number(event.target.value) || 0) })} /></label>}
                </div>
              </div>
              <div className="priority-move"><button aria-label={`Підняти ${action.name}`} disabled={index === 0} onClick={() => updateTactics({ actionPriority: movePriorityItem(skillPriorities, actionId, -1) })}>↑</button><button aria-label={`Опустити ${action.name}`} disabled={index === skillPriorities.length - 1} onClick={() => updateTactics({ actionPriority: movePriorityItem(skillPriorities, actionId, 1) })}>↓</button></div>
            </li>;
          })}
        </ol>
      </section>
      {canConfigureTargetsFor(unit, 'enemy') && <section className="tactics-group"><h4>2. Пріоритет цілей: вороги</h4><p>Без змін діє власне правило навички; переміщення створює спільний пріоритет для її ворожих цілей.</p><ol className="tactics-priority-list compact">{enemyTargetPriorities.map((priority, index) => <li key={priority}><span className="priority-number">{index + 1}</span><b>{targetPriorityOptions[priority]}</b><div className="priority-move"><button aria-label={`Підняти ${targetPriorityOptions[priority]}`} disabled={index === 0} onClick={() => updateTargetPriorities('enemy', movePriorityItem(enemyTargetPriorities, priority, -1))}>↑</button><button aria-label={`Опустити ${targetPriorityOptions[priority]}`} disabled={index === enemyTargetPriorities.length - 1} onClick={() => updateTargetPriorities('enemy', movePriorityItem(enemyTargetPriorities, priority, 1))}>↓</button></div></li>)}</ol></section>}
      {canConfigureTargetsFor(unit, 'ally') && <section className="tactics-group"><h4>3. Пріоритет цілей: союзники</h4><p>Без змін діє власне правило навички; переміщення створює спільний пріоритет для її союзних цілей.</p><ol className="tactics-priority-list compact">{allyTargetPriorities.map((priority, index) => <li key={priority}><span className="priority-number">{index + 1}</span><b>{targetPriorityOptions[priority]}</b><div className="priority-move"><button aria-label={`Підняти ${targetPriorityOptions[priority]}`} disabled={index === 0} onClick={() => updateTargetPriorities('ally', movePriorityItem(allyTargetPriorities, priority, -1))}>↑</button><button aria-label={`Опустити ${targetPriorityOptions[priority]}`} disabled={index === allyTargetPriorities.length - 1} onClick={() => updateTargetPriorities('ally', movePriorityItem(allyTargetPriorities, priority, 1))}>↓</button></div></li>)}</ol></section>}
      <footer className="tactics-modal-footer"><button className="tactics-reset" onClick={() => onChange(createDefaultTactics(unit))}>Відновити ефективні налаштування</button><button className="recruit-buy-button" onClick={onClose}>Готово</button></footer>
    </article>
  </div>;
}

function describeBattleEvent(event) {
  if (event.type === 'death') return `${event.unitId} вибуває з бою`;
  if (event.type === 'control_skip') return `${event.unitId} пропускає хід через контроль`;
  if (event.type === 'reflect') return `${event.attackerId} відбиває ${Math.round(event.amount)} шкоди в ${event.targetId}`;
  if (event.type === 'counter') return `${event.attackerId} контратакує ${event.targetId} на ${Math.round(event.amount)} шкоди`;
  const prefix = event.type === 'attack' ? 'базова атака' : event.actionId;
  return `${event.attackerId} → ${event.targetId}: ${Math.round(event.amount ?? event.damage ?? 0)} шкоди${event.isCritical ? ' · критичний удар' : ''} (${prefix})`;
}

function BattleUnitCard({ unit, activeId, targetId }) {
  const hpPercent = unit.maxHp ? Math.max(0, Math.min(100, unit.hp / unit.maxHp * 100)) : 0;
  const manaPercent = unit.manaMax ? Math.max(0, Math.min(100, unit.mana / unit.manaMax * 100)) : 0;
  const cooldowns = Object.entries(unit.cooldowns ?? {}).filter(([, turns]) => turns > 0);
  return <article className={`battle-unit ${unit.hp <= 0 ? 'fallen' : ''} ${unit.id === activeId ? 'acting' : ''} ${unit.id === targetId ? 'targeted' : ''}`}>
    <strong>{unit.name ?? unit.id}</strong>
    <div className="stat-line"><span>HP {Math.round(unit.hp)}/{Math.round(unit.maxHp)}</span><i className="hp-bar"><b style={{ width: `${hpPercent}%` }} /></i></div>
    <div className="stat-line"><span>Mana {Math.round(unit.mana ?? 0)}/{Math.round(unit.manaMax ?? 0)}</span><i className="mana-bar"><b style={{ width: `${manaPercent}%` }} /></i></div>
    <div className="battle-tags">
      {cooldowns.map(([id, turns]) => <span key={id}>CD {id}: {turns}</span>)}
      {(unit.effects ?? []).map((effect, index) => <span className={effect.kind} key={`${effect.id}-${index}`}>{effect.id}{effect.duration !== null ? ` (${effect.duration})` : ''}</span>)}
      {!cooldowns.length && !(unit.effects ?? []).length && <span>без ефектів</span>}
    </div>
  </article>;
}

function BattleFormation({ title, side, units, activeId, targetId, event, playback }) {
  const unitAt = (row, column) => units.find((unit) => unit.position?.row === row && unit.position?.column === column);
  return <section className={`formation ${side}`}><header className="formation-heading"><h4>{title}</h4><span>{units.filter((unit) => unit.hp > 0).length}/{units.length}</span></header><div className="formation-lanes"><b>{side === 'enemy' ? 'ФРОНТ ↓' : 'ФРОНТ ↑'}</b><span>{side === 'enemy' ? 'Тил ↑' : 'Тил ↓'}</span></div><div className="formation-grid">
    {Array.from({ length: 3 }, (_, row) => Array.from({ length: 5 }, (_, column) => {
      const logicalRow = side === 'enemy' ? 2 - row : row;
      const unit = unitAt(logicalRow, column);
      const hpPercent = unit?.maxHp ? Math.max(0, Math.min(100, unit.hp / unit.maxHp * 100)) : 0;
      const isActor = unit?.id === activeId;
      const isTarget = unit?.id === targetId;
      const info = battleEventInfo(event);
      const timing = unit ? nextActionTiming(playback, unit.id) : null;
      return <div className={`formation-cell ${logicalRow === 0 ? 'frontline-cell' : ''} ${unit ? 'occupied' : ''} ${isActor ? 'acting' : ''} ${isTarget ? 'targeted' : ''}`} key={`${row}-${column}`}>
        {unit && <><UnitPortrait unitId={unit.unitId} className="battle-portrait" />
          <div className="unit-effect-icons" aria-label="Активні ефекти">{(unit.effects ?? []).map((effect, index) => <span className={effect.kind} key={`${effect.id}-${index}`} title={`${effect.id}${effect.duration !== null ? ` · ${effect.duration} ход.` : ''}`}>{effectIcon(effect)}<small>{effect.duration !== null ? effect.duration : ''}</small></span>)}</div>
          {isActor && <span className={`battle-cell-badge ${info.kind} ${info.damageType ? `damage-${info.damageType}` : ''}`}>{info.icon} {info.label}</span>}
          {isTarget && info.amount !== null && <span className={`battle-float-number ${info.kind} ${info.damageType ? `damage-${info.damageType}` : ''}`}>{info.kind === 'heal' ? '+' : '−'}{Math.round(info.amount)}</span>}
          <b>{unit.name}</b><i><span style={{ width: `${hpPercent}%` }} /></i><small>{Math.round(unit.hp)}/{Math.round(unit.maxHp)}</small>
          <div className={`initiative-meter ${timing.remaining === 0 ? 'ready' : ''}`} title={`Наступна дія: ${timing.label}`}><span style={{ width: `${timing.progress}%` }} /><small>{timing.label}</small></div>
        </>}
      </div>;
    }))}
  </div></section>;
}

function BattleActionBanner({ event, units }) {
  const info = battleEventInfo(event);
  const actor = units.get(event?.attackerId);
  const target = units.get(event?.targetId ?? event?.unitId);
  return <div className={`battle-action-banner ${info.kind} ${info.damageType ? `damage-${info.damageType}` : ''}`}>
    <div className="battle-action-unit">{actor ? <UnitPortrait unitId={actor.unitId} /> : <span className="battle-action-icon">{info.icon}</span>}<b>{actor?.name ?? 'Поле бою'}</b></div>
    <div className="battle-action-center"><span>{info.icon}</span><b>{info.label}</b>{info.amount !== null && <strong>{info.kind === 'heal' ? '+' : '−'}{Math.round(info.amount)}</strong>}</div>
    <div className="battle-action-unit target">{target ? <UnitPortrait unitId={target.unitId} /> : <span className="battle-action-icon">✦</span>}<b>{target?.name ?? (event?.type === 'faith' ? 'Імперська Віра' : '—')}</b></div>
  </div>;
}

function getPlaybackState(playback) {
  const units = [...playback.initialAllies, ...playback.initialEnemies].map((unit) => ({ ...unit, effects: (unit.effects ?? []).map((effect) => ({ ...effect })) }));
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  let faith = 50;
  for (const event of playback.battle.events.slice(0, playback.index)) {
    if (event.targetId && typeof event.hpAfter === 'number') {
      const target = byId.get(event.targetId);
      if (target) target.hp = event.hpAfter;
    }
    if (event.targetId && event.effectsAfter) {
      const target = byId.get(event.targetId);
      if (target) target.effects = event.effectsAfter.map((effect) => ({ ...effect }));
    }
    if (event.attackerId && event.attackerEffectsAfter) {
      const attacker = byId.get(event.attackerId);
      if (attacker) attacker.effects = event.attackerEffectsAfter.map((effect) => ({ ...effect }));
    }
    if (event.type === 'control_skip' && event.effectsAfter) {
      const unit = byId.get(event.unitId);
      if (unit) unit.effects = event.effectsAfter.map((effect) => ({ ...effect }));
    }
    if (event.targetId && event.positionAfter) {
      const target = byId.get(event.targetId);
      if (target) target.position = { ...event.positionAfter };
    }
    if (event.type === 'death') {
      const target = byId.get(event.unitId);
      if (target) target.hp = 0;
    }
    if (event.type === 'faith') faith = event.value;
  }
  return { units: byId, faith };
}

function formationSeed(run, path) {
  return run.seed + run.difficulty * 100 + path.id.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
}

function normalizeTactics(unit, tactics) {
  const defaults = createDefaultTactics(unit);
  if (!tactics) return defaults;
  const actionPriority = Array.isArray(tactics.actionPriority)
    ? tactics.actionPriority
    : typeof tactics.actionPriority === 'string'
      ? [...unit.combat.actions.filter((action) => action.effectKind === tactics.actionPriority).map((action) => action.id), ...defaults.actionPriority.filter((actionId) => !unit.combat.actions.some((action) => action.effectKind === tactics.actionPriority && action.id === actionId))]
      : defaults.actionPriority;
  const targetPriority = typeof tactics.targetPriority === 'string'
    ? { ...defaults.targetPriority, enemy: [tactics.targetPriority, ...defaults.targetPriority.enemy.filter((priority) => priority !== tactics.targetPriority)] }
    : { ...defaults.targetPriority, ...(tactics.targetPriority ?? {}) };
  return { ...defaults, ...tactics, actionPriority, actionRules: { ...defaults.actionRules, ...(tactics.actionRules ?? {}) }, targetPriority };
}

function loadRun() {
  try {
    const saved = window.localStorage.getItem(runStorageKey);
    if (!saved) return createRun();
    const run = JSON.parse(saved);
    const normalized = typeof run.army?.[0] === 'string'
      ? { ...run, army: run.army.map((unitId, index) => ({ instanceId: `${unitId}-${index + 1}`, unitId, hp: null, exp: 0, position: null })), nextUnitNumber: run.army.length + 1 }
      : run;
    const army = (normalized.army ?? []).map((member) => {
      const unit = getEmpireUnit(member.unitId);
      return unit ? { ...member, tactics: normalizeTactics(unit, member.tactics) } : member;
    });
    const lordId = empireLords.some((lord) => lord.id === normalized.lordId) ? normalized.lordId : 'empire_lord_henrik';
    const defaults = createRun({ lordId });
    return {
      ...defaults,
      ...normalized,
      army,
      lordId
    };
  } catch {
    return createRun();
  }
}

function gridFromRun(run) {
  return {
    ...createGrid({ rows: 3, columns: 5 }),
    placements: run.army.flatMap((member) => member.position ? [{ unit: { ...getEmpireUnit(member.unitId), id: member.instanceId }, position: member.position }] : [])
  };
}

function App() {
  const [run, setRun] = useState(loadRun);
  const [grid, setGrid] = useState(() => gridFromRun(run));
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [lastBattle, setLastBattle] = useState(null);
  const [screen, setScreen] = useState('menu');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedLordId, setSelectedLordId] = useState('empire_lord_henrik');
  const [selectedFactionId, setSelectedFactionId] = useState('empire');
  const [hubView, setHubView] = useState('hub');
  const [selectedRecruitUnitId, setSelectedRecruitUnitId] = useState('');
  const [selectedTacticsMemberId, setSelectedTacticsMemberId] = useState(null);
  const [battlePlayback, setBattlePlayback] = useState(null);
  const [lastReplay, setLastReplay] = useState(null);
  const [showLordDetails, setShowLordDetails] = useState(false);
  const paths = createPaths(run.difficulty, run.seed);
  const lord = getRunLord(run);
  const recruitableUnits = getRecruitableUnits(run);
  const unitUnlockProgress = getUnitUnlockProgress(run);
  const hasBattleReadyUnit = run.army.some((member) => member.hp !== 0);
  const hasDeployedArmy = hasBattleReadyUnit && run.army.every((member) => member.hp === 0 || member.position);
  const leadershipUsed = run.army.reduce((total, member) => total + getEmpireUnit(member.unitId).combat.leadershipCost, 0);
  const leadershipLimit = run.economicLimit + (lord.attributes?.leadership ?? 0);
  const playbackEvent = battlePlayback?.battle.events[Math.max(0, battlePlayback.index - 1)] ?? null;
  const playbackState = battlePlayback ? getPlaybackState(battlePlayback) : null;
  const selectedTacticsMember = run.army.find((member) => member.instanceId === selectedTacticsMemberId) ?? null;

  useEffect(() => {
    window.localStorage.setItem(runStorageKey, JSON.stringify(run));
  }, [run]);

  const placedAt = (row, column) => grid.placements.find((placement) => (
    row >= placement.position.row
    && row < placement.position.row + placement.unit.gridFootprint.rows
    && column >= placement.position.column
    && column < placement.position.column + placement.unit.gridFootprint.columns
  ));

  const selectCell = (row, column) => {
    const member = run.army.find((item) => item.instanceId === selectedMemberId);
    if (!member) return;
    const unit = { ...getEmpireUnit(member.unitId), id: member.instanceId };
    setGrid((currentGrid) => moveUnit(currentGrid, unit, { row, column }));
    setRun((current) => updateArmyMember(current, member.instanceId, { position: { row, column } }));
  };

  const resolveRunBattle = () => {
    if (!run.selectedPath || !hasDeployedArmy) return;
    const battleLord = getBattleLordStats(lord);
    const alliesInBattle = run.army.map((member) => {
      const unit = { ...createUnitInstance(getEmpireUnit(member.unitId), battleLord), id: member.instanceId, unitId: member.unitId, lord: battleLord, position: member.position, tactics: member.tactics };
      unit.hp = member.hp ?? unit.maxHp;
      return unit;
    });
    const enemyArmy = generateEnemyArmy({ pathId: run.selectedPath.id, difficulty: run.difficulty, seed: formationSeed(run, run.selectedPath) });
    const enemyLord = { vitality: 0, battlePower: 0, crystalVolume: enemyArmy.crystal.manaMax, crystalRegenSpeed: enemyArmy.crystal.manaRegen };
    const enemiesInBattle = enemyArmy.units.map((member) => ({ ...createUnitInstance(getEmpireUnit(member.unitId), enemyLord), id: member.id, unitId: member.unitId, position: member.position, lord: enemyLord }));
    const battle = simulateBattle({ allies: alliesInBattle, enemies: enemiesInBattle, lord, enemyCrystal: enemyArmy.crystal, seed: run.seed + run.difficulty });
    const victory = battle.winner === 'ally';
    const battleExperienceReward = battle.enemies
      .filter((unit) => unit.hp === 0)
      .reduce((total, unit) => total + (unit.experienceRewardOnKill ?? 0), 0);
    const survivingUnitCount = battle.allies.filter((unit) => unit.hp > 0).length;
    const unitExperienceReward = survivingUnitCount > 0 ? battleExperienceReward / survivingUnitCount : 0;
    const report = {
      victory,
      rounds: battle.round,
      events: battle.events,
      path: run.selectedPath,
      survivors: battle.allies.map((unit) => ({ id: unit.id, hp: Math.round(unit.hp), maxHp: Math.round(unit.maxHp) })),
      allies: battle.allies,
      enemies: battle.enemies,
      faith: Math.round(battle.battleSpirit),
      crystal: battle.allyCrystal,
      enemyArmy,
      battleExperienceReward,
      unitExperienceReward,
      survivingUnitCount,
      lordExperienceReward: battleExperienceReward + (victory ? (run.selectedPath.lordExperienceReward ?? 0) : 0)
    };
    const hpByInstance = new Map(battle.allies.map((unit) => [unit.id, unit.hp]));
    const updatedArmy = run.army.map((member) => ({
      ...member,
      hp: hpByInstance.get(member.instanceId) ?? 0
    }));
    setBattlePlayback({ battle, report, victory, updatedArmy, initialAllies: alliesInBattle, initialEnemies: enemiesInBattle, index: 0, speed: 1, isPaused: false, isReplay: false });
  };

  useEffect(() => {
    if (!battlePlayback) return undefined;
    if (battlePlayback.index >= battlePlayback.battle.events.length) {
      if (!battlePlayback.isReplay) {
        setLastBattle(battlePlayback.report);
        setLastReplay({ battle: battlePlayback.battle, initialAllies: battlePlayback.initialAllies, initialEnemies: battlePlayback.initialEnemies, report: battlePlayback.report });
        setRun((current) => finishBattle(current, { victory: battlePlayback.victory, army: battlePlayback.updatedArmy, battleExperienceReward: battlePlayback.report.battleExperienceReward }));
        setHubView('results');
      }
      setBattlePlayback(null);
      return undefined;
    }
    if (battlePlayback.isPaused) return undefined;
    const timer = window.setTimeout(() => setBattlePlayback((current) => current && !current.isPaused ? { ...current, index: current.index + 1 } : current), Math.round(520 / battlePlayback.speed));
    return () => window.clearTimeout(timer);
  }, [battlePlayback]);

  const replayLastBattle = () => {
    if (!lastReplay) return;
    setBattlePlayback({ ...lastReplay, index: 0, speed: 1, isPaused: false, isReplay: true });
  };

  const startNewRun = () => {
    const newRun = createRun({ lordId: selectedLordId });
    setRun(newRun);
    setGrid(gridFromRun(newRun));
    setLastBattle(null);
    setLastReplay(null);
    setSelectedMemberId(null);
    setSelectedTacticsMemberId(null);
    setShowLordDetails(false);
    setHubView('hub');
    setScreen('game');
  };

  if (screen === 'menu') return <main className="start-menu">
    <p className="eyebrow">Imperial command</p>
    <h1>Empire Lords</h1>
    <p className="lead">Зберіть армію Імперії, оберіть маршрут і переживіть нескінченний забіг.</p>
    <section className="menu-panel">
      <button className="menu-primary" onClick={() => setScreen('faction')}>Нова гра</button>
      <button className="menu-button" onClick={() => setScreen('game')}>Продовжити забіг</button>
      <button className="menu-button" onClick={() => setShowSettings((value) => !value)}>Налаштування</button>
      {showSettings && <div className="settings-panel">
        <p><b>Seed поточного забігу:</b> {run.seed}</p>
      </div>}
    </section>
  </main>;

  if (screen === 'faction') {
    const faction = factions.find((item) => item.id === selectedFactionId) ?? factions[0];
    const availableLords = empireLords.filter(() => faction.id === 'empire');
    const selectedLord = getEmpireLord(selectedLordId);
    return <main className="faction-select">
      <button className="back-menu" onClick={() => setScreen('menu')}>← Головне меню</button>
      <p className="eyebrow">Нова кампанія</p>
      <h1>Оберіть фракцію та лорда</h1>
      <div className="faction-layout">
        <aside className="faction-list" aria-label="Список фракцій">
          {factions.map((item) => <button className={`faction-card ${item.id === faction.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelectedFactionId(item.id)}><i>{item.emblem}</i><span><b>{item.name}</b><small>{item.feature}</small></span></button>)}
          <div className="faction-feature"><b>{faction.emblem} {faction.feature}</b><p>{faction.description}</p><p>{faction.mechanic}</p></div>
        </aside>
        <section className="lords-gallery">
          <div className="lord-gallery-list">
            {availableLords.map((candidate) => <button className={`lord-gallery-card ${candidate.id === selectedLordId ? 'selected' : ''}`} key={candidate.id} onClick={() => setSelectedLordId(candidate.id)}><span className="mini-portrait"><img src={lordPortraits[candidate.id]} alt="" /></span><span><b>{candidate.name}</b><small>{candidate.description}</small></span></button>)}
          </div>
          <article className="lord-detail">
            <div className="lord-portrait" aria-label={`Портрет ${selectedLord.name}`}><img src={lordPortraits[selectedLord.id]} alt="" /></div>
            <div><p className="eyebrow">Лорд Імперії</p><h2>{selectedLord.name}</h2><p>{selectedLord.description}</p><LordUnitAvailability lord={selectedLord} compact /><LordProfileButton lord={selectedLord} onClick={() => setShowLordDetails(true)} label="Деталі лорда" /><button className="menu-primary" onClick={startNewRun}>Обрати лорда й почати</button></div>
          </article>
          {showLordDetails && <LordDetails lord={selectedLord} onClose={() => setShowLordDetails(false)} />}
        </section>
      </div>
    </main>;
  }

  return (
    <main className="campaign-page">
      <header className="campaign-header">
        <div className="campaign-title"><p className="eyebrow">Кампанія · забіг</p><h1>Воєнна рада</h1><span>Детермінований автобій · Seed {run.seed}</span></div>
        <div className="campaign-header-actions"><LordProfileButton lord={lord} onClick={() => setShowLordDetails(true)} /><button className="back-menu" onClick={() => setScreen('menu')}>← До головного меню</button></div>
      </header>
      <nav className="campaign-steps" aria-label="Прогрес забігу">
        <span className={run.phase === 'hub' && hubView === 'hub' ? 'active' : ''}><b>1</b> Армія</span>
        <span className={hubView === 'opponents' ? 'active' : ''}><b>2</b> Розстановка</span>
        <span className={run.phase === 'battle' ? 'active' : ''}><b>3</b> Бій</span>
      </nav>
      <section className="deployment hub">
        <h2>{run.phase === 'hub' ? 'Підготовка до бою' : run.phase === 'battle' ? 'Обраний шлях' : 'Забіг завершено'}</h2>
        <div className="resource-strip" aria-label="Ресурси забігу">
          <span><small>Життя</small><b>{run.lives}</b></span>
          <span><small>Золото</small><b>{run.gold}</b></span>
          <span><small>Рудники</small><b>{run.mines} <i>+{run.mines}/перемога</i></b></span>
          <span><small>Лідерство</small><b>{leadershipUsed}/{leadershipLimit}</b></span>
          <span><small>Складність</small><b>{run.difficulty}</b></span>
        </div>
        {run.phase === 'hub' && <>
          {hubView === 'hub' && <>
          <h3>1. Зберіть армію</h3>
          <p>Перегляньте ключові характеристики перед наймом. «Деталі» покаже повний розрахунок кожного значення для вашого лорда. За кожні 3 перемоги на Небезпечному перевалі відкривається один новий базовий юніт.</p>
          {unitUnlockProgress.remainingUnitIds.length > 0 && <small>До наступного відкриття: {unitUnlockProgress.victoriesUntilNextUnlock} {unitUnlockProgress.victoriesUntilNextUnlock === 1 ? 'перемога' : 'перемоги'} на Небезпечному перевалі · ще доступно {unitUnlockProgress.remainingUnitIds.length}.</small>}
          {unitUnlockProgress.remainingUnitIds.length === 0 && <small>Усі доступні базові юніти вже відкриті.</small>}
          {selectedRecruitUnitId && <UnitDetails unit={getEmpireUnit(selectedRecruitUnitId)} lord={lord} onClose={() => setSelectedRecruitUnitId('')} />}
          <div className="roster">
            {recruitableUnits.map((unit) => {
              const battleLord = getBattleLordStats(lord);
              const instance = createUnitInstance(unit, battleLord);
              const mainAction = unit.combat.actions.find((action) => action.effectKind === 'damage') ?? unit.combat.actions[0];
              const mainActionValue = getActionValue(mainAction, battleLord);
              const canRecruit = run.gold >= unit.combat.leadershipCost && leadershipUsed + unit.combat.leadershipCost <= leadershipLimit;
              const unavailableReason = run.gold < unit.combat.leadershipCost ? 'Бракує золота' : 'Бракує лідерства';
              return <article className="recruit-card" key={unit.id}>
                <UnitPortrait unitId={unit.id} className="recruit-portrait" />
                <div className="recruit-card-copy">
                  <b>{unit.name}</b>
                  <span>{roleNames[unit.role] ?? unit.role}</span>
                  <div className="recruit-stats"><span>HP <strong>{formatStat(instance.maxHp)}</strong></span>{mainActionValue !== null && <span>{effectNames[mainAction.effectKind] ?? 'Ефект'} <strong>{formatStat(mainActionValue)}</strong></span>}<span>Швидкість <strong>{unit.combat.attackSpeed}</strong></span></div>
                  <small>{unit.combat.leadershipCost} золота · {unit.combat.leadershipCost} лідерства</small>
                </div>
                <div className="recruit-card-actions">
                  <button className="recruit-details-button" onClick={() => setSelectedRecruitUnitId(unit.id)}>Деталі</button>
                  <button className="recruit-buy-button" disabled={!canRecruit} title={!canRecruit ? unavailableReason : undefined} onClick={() => setRun((current) => recruitUnit(current, unit.id))}>Купити</button>
                </div>
              </article>;
            })}
          </div>
          <p className="army-summary">Ваша армія: {run.army.length ? run.army.map((member) => getEmpireUnit(member.unitId).name).join(', ') : 'ще порожня — найміть хоча б одного юніта.'}</p>
          <div className="army-actions">
            {run.army.map((member) => {
              const unit = getEmpireUnit(member.unitId);
              const maxHp = createUnitInstance(unit, getBattleLordStats(lord)).maxHp;
              return <div className="member-actions" key={member.instanceId}>
                <UnitPortrait unitId={unit.id} className="army-member-portrait" />
                <div className="member-heading"><strong>{unit.name}</strong><span>HP {member.hp ?? maxHp}/{maxHp} · EXP {member.exp}</span></div>
                <button className="open-tactics" onClick={() => setSelectedTacticsMemberId(member.instanceId)}>Налаштувати тактику</button>
                {member.hp === 0 && <button onClick={() => setRun((current) => reviveUnit(current, member.instanceId, maxHp))}>Воскресити (10)</button>}
                {member.hp && member.hp < maxHp && <button onClick={() => setRun((current) => healUnit(current, member.instanceId, maxHp))}>Лікувати</button>}
                {unit.combat.evolutions.map((targetId) => <button disabled={member.exp < (unit.combat.expToUpgrade ?? 100)} key={targetId} onClick={() => setRun((current) => evolveUnit(current, member.instanceId, targetId))}>Еволюція: {getEmpireUnit(targetId).name}</button>)}
              </div>;
            })}
          </div>
          {selectedTacticsMember && <TacticsModal member={selectedTacticsMember} unit={getEmpireUnit(selectedTacticsMember.unitId)} onClose={() => setSelectedTacticsMemberId(null)} onChange={(tactics) => setRun((current) => updateArmyMember(current, selectedTacticsMember.instanceId, { tactics }))} />}
          <button className="battle-button" disabled={!hasBattleReadyUnit} onClick={() => setHubView('opponents')}>Готово — обрати противника</button>
          </>}
          {hubView === 'opponents' && <>
          <section className="deployment compact-deployment">
            <h3>2. Розставте армію</h3>
            <p>Виберіть юніта нижче, а потім клітинку. Позиція зберігається; лицар займає дві клітинки по вертикалі.</p>
            <div className="roster">
              {run.army.map((member) => <button className={selectedMemberId === member.instanceId ? 'selected' : ''} key={member.instanceId} onClick={() => setSelectedMemberId(member.instanceId)}>{getEmpireUnit(member.unitId).name}</button>)}
            </div>
            <div className="deployment-lanes" aria-hidden="true"><b>ФРОНТ — ПЕРШИЙ РЯД</b><span>ТИЛ ↓</span></div>
            <div className="grid" role="grid" aria-label="Сітка розміщення армії">
              {Array.from({ length: 3 }, (_, row) => Array.from({ length: 5 }, (_, column) => {
                const placement = placedAt(row, column);
                return <button className={`cell ${row === 0 ? 'frontline-cell' : ''}`} key={`${row}-${column}`} aria-label={`${row === 0 ? 'Фронтлайн. ' : ''}${placement?.unit.name ?? 'Порожня клітинка'}`} onClick={() => selectCell(row, column)}>{row === 0 && !placement ? <small>ФРОНТ</small> : placement?.unit.name ?? ''}</button>;
              }))}
            </div>
          </section>
          <h3>3. Оберіть маршрут і почніть бій</h3>
          <p>{hasDeployedArmy ? 'Виберіть одного з трьох противників. Перед боєм можете змінити розстановку вище.' : 'Спершу розставте всіх живих юнітів на полі — після цього стане доступним вибір противника.'}</p>
          <div className="roster">
            {paths.map((path) => {
              const enemyArmy = generateEnemyArmy({ pathId: path.id, difficulty: run.difficulty, seed: formationSeed(run, path) });
              return <button className="enemy-choice" key={path.id} disabled={!hasDeployedArmy} title={!hasDeployedArmy ? 'Спершу розставте всіх живих юнітів' : undefined} onClick={() => setRun((current) => choosePath(current, path))}><b>{path.name}</b><span>{enemyArmy.label} · лідерство {enemyArmy.leadershipUsed}/{enemyArmy.leadershipBudget}</span><small>Кристал: {enemyArmy.crystal.manaMax} · реген +{enemyArmy.crystal.manaRegen / 5}/хід</small><small>{enemyArmy.units.map((unit) => unit.name).join(', ')}</small><em>Нагорода: {formatPathReward(path.reward)} · загроза {path.threat} →</em></button>;
            })}
          </div>
          <button className="reset-button" onClick={() => setHubView('hub')}>← Повернутися до Hub</button>
          </>}
        </>}
        {run.phase === 'battle' && !battlePlayback && <section className="battle-ready"><h3>Противник обраний: {run.selectedPath.name}</h3><p>{hasDeployedArmy ? `Загроза ${run.selectedPath.threat}. Армія готова — натисніть, щоб розпочати автобій.` : 'Армія не розставлена, тому бій не можна розпочати.'}</p><button className="battle-button" disabled={!hasDeployedArmy} onClick={resolveRunBattle}>В бій</button></section>}
        {battlePlayback && <section className="battle-playback" aria-live="polite">
          <div className="battle-arena-hud">
            <div className="arena-team ally"><span>✦</span><b>Імперія</b><small>Віра</small><i><em style={{ width: `${Math.max(0, Math.min(100, playbackState.faith))}%` }} /></i><strong>{Math.round(playbackState.faith)}</strong></div>
            <div className="arena-round"><span>АВТОБІЙ</span><b>VS</b><small>Раунд {playbackEvent?.round ?? 1}</small></div>
            <div className="arena-team enemy"><span>⚔</span><b>Рейдери</b><small>Ворожий кристал</small><i><em style={{ width: `${Math.max(0, Math.min(100, (battlePlayback.battle.enemyCrystal.mana / battlePlayback.battle.enemyCrystal.manaMax) * 100))}%` }} /></i><strong>{Math.round(battlePlayback.battle.enemyCrystal.mana)}</strong></div>
          </div>
          <div className="playback-heading"><div><b>{battlePlayback.isReplay ? 'Повтор бою' : 'Автобій триває'}</b><span>Подія {Math.min(battlePlayback.index, battlePlayback.battle.events.length)}/{battlePlayback.battle.events.length}</span></div><strong>{playbackEvent ? describeBattleEvent(playbackEvent) : 'Армії займають позиції…'}</strong><em>Віра: {Math.round(playbackState.faith)}/100 · Кристал: {Math.round(battlePlayback.battle.allyCrystal.mana)}/{battlePlayback.battle.allyCrystal.manaMax}</em></div>
          <div className="playback-controls" aria-label="Керування повтором бою">
            <button onClick={() => setBattlePlayback((current) => current && { ...current, index: Math.max(0, current.index - 1), isPaused: true })} disabled={battlePlayback.index === 0}>← Крок</button>
            <button className="playback-primary" onClick={() => setBattlePlayback((current) => current && { ...current, isPaused: !current.isPaused })}>{battlePlayback.isPaused ? '▶ Продовжити' : 'Ⅱ Пауза'}</button>
            <button onClick={() => setBattlePlayback((current) => current && { ...current, index: Math.min(current.battle.events.length, current.index + 1), isPaused: true })} disabled={battlePlayback.index >= battlePlayback.battle.events.length}>Крок →</button>
            <label>Швидкість<select value={battlePlayback.speed} onChange={(event) => setBattlePlayback((current) => current && { ...current, speed: Number(event.target.value) })}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
          </div>
          <BattleActionBanner event={playbackEvent} units={playbackState.units} />
          <div className="battlefield" aria-label="Поле бою з розміщенням армій">
            <BattleFormation title="Ворожа армія Імперії" side="enemy" units={battlePlayback.initialEnemies.map((unit) => playbackState.units.get(unit.id))} activeId={playbackEvent?.attackerId} targetId={playbackEvent?.targetId ?? playbackEvent?.unitId} event={playbackEvent} playback={battlePlayback} />
            <strong className="battlefield-versus">VS</strong>
            <BattleFormation title="Імперія" side="ally" units={battlePlayback.initialAllies.map((unit) => playbackState.units.get(unit.id))} activeId={playbackEvent?.attackerId} targetId={playbackEvent?.targetId ?? playbackEvent?.unitId} event={playbackEvent} playback={battlePlayback} />
          </div>
          <div className={`action-flash ${playbackEvent?.type ?? 'ready'}`}>{playbackEvent?.type === 'heal' ? '✦ Зцілення' : playbackEvent?.type === 'control' ? '⚡ Контроль' : playbackEvent?.type === 'death' ? '☠ Загибель' : '✹ Удар'}</div>
        </section>}
        {lastBattle && !battlePlayback && hubView === 'results' && <section className={`battle-report battle-results-screen ${lastBattle.victory ? 'victory' : 'defeat'}`} aria-live="polite">
          <p className="eyebrow">Підсумок сутички</p>
          <h3>{lastBattle.victory ? 'Перемога' : 'Поразка'} · {lastBattle.rounds} раундів</h3>
          <p className="battle-resources">Віра: {lastBattle.faith}/100 · Сила кристала: {Math.round(lastBattle.crystal.mana)}/{lastBattle.crystal.manaMax}</p>
          {lastBattle.victory && <p>Нагорода: {formatPathReward(lastBattle.path.reward)}.</p>}
          {lastBattle.battleExperienceReward > 0 && <p>Досвід за переможених: +{formatStat(lastBattle.battleExperienceReward)} лорду · +{formatStat(lastBattle.unitExperienceReward)} EXP кожному з {lastBattle.survivingUnitCount} живих юнітів.</p>}
          {lastBattle.victory && run.lastUnlockedUnitId && <p>Відкрито для набору: <b>{getEmpireUnit(run.lastUnlockedUnitId)?.name}</b>.</p>}
          <div className="battle-state" aria-label="Фінальний стан бою">
            <div><h4>Імперія</h4>{lastBattle.allies.map((unit) => <BattleUnitCard key={unit.id} unit={unit} />)}</div>
            <div><h4>Рейдери</h4>{lastBattle.enemies.map((unit) => <BattleUnitCard key={unit.id} unit={unit} />)}</div>
          </div>
          <div className="survivors">
            {lastBattle.survivors.map((unit) => <span key={unit.id}>{getEmpireUnit(run.army.find((member) => member.instanceId === unit.id)?.unitId)?.name ?? unit.id}: {unit.hp}/{unit.maxHp} HP</span>)}
          </div>
          <details>
            <summary>Журнал бою — {lastBattle.events.length} подій</summary>
            <ol className="battle-log">
              {lastBattle.events.slice(0, 30).map((event, index) => <li key={`${event.round}-${index}`}><b>Р{event.round}.</b> {describeBattleEvent(event)}</li>)}
            </ol>
          </details>
          <div className="results-actions"><button className="replay-button" onClick={replayLastBattle}>↻ Переглянути бій ще раз</button><button className="battle-button results-continue" onClick={() => { setLastBattle(null); setHubView('hub'); }}>Продовжити похід →</button></div>
        </section>}
        {run.phase === 'game_over' && <button className="battle-button" onClick={() => setRun(createRun())}>Почати новий забіг</button>}
        {run.phase === 'hub' && hubView !== 'results' && <button className="reset-button" onClick={() => setRun(createRun())}>Скинути забіг</button>}
        {showLordDetails && <LordDetails lord={lord} onClose={() => setShowLordDetails(false)} onSpendAttributePoint={(attribute) => setRun((current) => spendLordAttributePoint(current, attribute))} canSpendAttributePoint={run.phase === 'hub'} />}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
