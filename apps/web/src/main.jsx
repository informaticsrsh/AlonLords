/* eslint-disable react/prop-types */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { choosePath, createGrid, createPaths, createRun, createUnitInstance, empireLords, empireUnits, evolveUnit, finishBattle, generateEnemyArmy, getBattleLordStats, getEmpireLord, getEmpireUnit, healUnit, moveUnit, recruitUnit, reviveUnit, simulateBattle, updateArmyMember } from '@empire/game-core';
import './styles.css';

const roster = empireUnits.filter((unit) => unit.tier === 1);
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

function UnitPortrait({ unitId, className = '' }) {
  return <span className={`unit-portrait ${className}`} aria-hidden="true" style={{ backgroundImage: `url(${artUrl('imperial-unit-portraits.png')})`, backgroundPosition: unitPortraitPositions[unitId] ?? '100% 100%' }} />;
}

function battleEventInfo(event) {
  if (!event) return { kind: 'ready', icon: '✦', label: 'Армії займають позиції', amount: null };
  if (event.type === 'heal') return { kind: 'heal', icon: '✦', label: 'Зцілення', amount: event.amount };
  if (event.type === 'buff') return { kind: 'buff', icon: '↑', label: 'Посилення', amount: null };
  if (event.type === 'debuff' || event.type === 'control' || event.type === 'control_skip') return { kind: 'control', icon: '⚡', label: 'Контроль', amount: null };
  if (event.type === 'death') return { kind: 'death', icon: '☠', label: 'Юніт вибув', amount: null };
  if (event.type === 'faith') return { kind: 'faith', icon: '✦', label: 'Віра змінюється', amount: event.value };
  if (event.type === 'reflect') return { kind: 'damage', icon: '↶', label: 'Відбиття', amount: event.amount };
  if (event.type === 'counter') return { kind: 'damage', icon: '↯', label: 'Контратака', amount: event.amount };
  return { kind: 'damage', icon: event.isCritical ? '✹' : '⚔', label: event.isCritical ? 'Критичний удар' : 'Удар', amount: event.amount ?? event.damage };
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
  return Number.isInteger(value) ? value : Number(value.toFixed(1));
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

function LordCrystalStats({ lord, className = '' }) {
  return <dl className={`crystal-stats ${className}`}>
    <div><dt>{'\u0421\u0438\u043b\u0430 \u043a\u0440\u0438\u0441\u0442\u0430\u043b\u0443'}</dt><dd>{lord.crystalVolume}</dd></div>
    <div><dt>{'\u0420\u0435\u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0456\u044f \u043a\u0440\u0438\u0441\u0442\u0430\u043b\u0443'}</dt><dd>+{lord.crystalRegenSpeed / 5} {'/ \u0445\u0456\u0434'}</dd></div>
  </dl>;
}

function UnitDetails({ unit, lord, onClose }) {
  const battleLord = getBattleLordStats(lord);
  const instance = createUnitInstance(unit, battleLord);
  const hpBreakdown = getFormulaBreakdown(unit.combat.hpFormula, battleLord);
  const affectedStats = [...new Set([unit.combat.hpFormula?.lordStat, ...unit.combat.actions.map((action) => action.formula?.lordStat)].filter(Boolean))];
  return <article className="unit-details" aria-live="polite">
    <div className="unit-details-heading">
      <div><p className="eyebrow">{'\u0414\u0435\u0442\u0430\u043b\u0456 \u044e\u043d\u0456\u0442\u0430'}</p><h3>{unit.name}</h3></div>
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
  </article>;
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

function BattleFormation({ title, units, activeId, targetId, event }) {
  const unitAt = (row, column) => units.find((unit) => unit.position?.row === row && unit.position?.column === column);
  return <section className="formation"><header className="formation-heading"><h4>{title}</h4><span>{units.filter((unit) => unit.hp > 0).length}/{units.length}</span></header><div className="formation-grid">
    {Array.from({ length: 3 }, (_, row) => Array.from({ length: 5 }, (_, column) => {
      const unit = unitAt(row, column);
      const hpPercent = unit?.maxHp ? Math.max(0, Math.min(100, unit.hp / unit.maxHp * 100)) : 0;
      const isActor = unit?.id === activeId;
      const isTarget = unit?.id === targetId;
      const info = battleEventInfo(event);
      return <div className={`formation-cell ${unit ? 'occupied' : ''} ${isActor ? 'acting' : ''} ${isTarget ? 'targeted' : ''}`} key={`${row}-${column}`}>
        {unit && <><UnitPortrait unitId={unit.unitId} className="battle-portrait" />{isActor && <span className={`battle-cell-badge ${info.kind}`}>{info.icon} {info.label}</span>}{isTarget && info.amount !== null && <span className={`battle-float-number ${info.kind}`}>{info.kind === 'heal' ? '+' : '−'}{Math.round(info.amount)}</span>}<b>{unit.name}</b><i><span style={{ width: `${hpPercent}%` }} /></i><small>{Math.round(unit.hp)}/{Math.round(unit.maxHp)}</small></>}
      </div>;
    }))}
  </div></section>;
}

function BattleActionBanner({ event, units }) {
  const info = battleEventInfo(event);
  const actor = units.get(event?.attackerId);
  const target = units.get(event?.targetId ?? event?.unitId);
  return <div className={`battle-action-banner ${info.kind}`}>
    <div className="battle-action-unit">{actor ? <UnitPortrait unitId={actor.unitId} /> : <span className="battle-action-icon">{info.icon}</span>}<b>{actor?.name ?? 'Поле бою'}</b></div>
    <div className="battle-action-center"><span>{info.icon}</span><b>{info.label}</b>{info.amount !== null && <strong>{info.kind === 'heal' ? '+' : '−'}{Math.round(info.amount)}</strong>}</div>
    <div className="battle-action-unit target">{target ? <UnitPortrait unitId={target.unitId} /> : <span className="battle-action-icon">✦</span>}<b>{target?.name ?? (event?.type === 'faith' ? 'Імперська Віра' : '—')}</b></div>
  </div>;
}

function getPlaybackState(playback) {
  const units = [...playback.initialAllies, ...playback.initialEnemies].map((unit) => ({ ...unit }));
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  let faith = 50;
  for (const event of playback.battle.events.slice(0, playback.index)) {
    if (event.targetId && typeof event.hpAfter === 'number') {
      const target = byId.get(event.targetId);
      if (target) target.hp = event.hpAfter;
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

function loadRun() {
  try {
    const saved = window.localStorage.getItem(runStorageKey);
    if (!saved) return createRun();
    const run = JSON.parse(saved);
    const normalized = typeof run.army?.[0] === 'string'
      ? { ...run, army: run.army.map((unitId, index) => ({ instanceId: `${unitId}-${index + 1}`, unitId, hp: null, exp: 0, position: null })), nextUnitNumber: run.army.length + 1 }
      : run;
    const defaults = createRun();
    return {
      ...defaults,
      ...normalized,
      lordId: empireLords.some((lord) => lord.id === normalized.lordId) ? normalized.lordId : defaults.lordId
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
  const [battlePlayback, setBattlePlayback] = useState(null);
  const paths = createPaths(run.difficulty);
  const lord = getEmpireLord(run.lordId);
  const hasBattleReadyUnit = run.army.some((member) => member.hp !== 0);
  const leadershipUsed = run.army.reduce((total, member) => total + getEmpireUnit(member.unitId).combat.leadershipCost, 0);
  const playbackEvent = battlePlayback?.battle.events[Math.max(0, battlePlayback.index - 1)] ?? null;
  const playbackState = battlePlayback ? getPlaybackState(battlePlayback) : null;

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
    const battleLord = getBattleLordStats(lord);
    const alliesInBattle = run.army.map((member) => {
      const unit = { ...createUnitInstance(getEmpireUnit(member.unitId), battleLord), id: member.instanceId, unitId: member.unitId, lord: battleLord, position: member.position, tactics: member.tactics };
      unit.hp = member.hp ?? unit.maxHp;
      return unit;
    });
    const enemyArmy = generateEnemyArmy({ pathId: run.selectedPath.id, difficulty: run.difficulty, seed: formationSeed(run, run.selectedPath) });
    const enemyLord = { vitality: 0, battlePower: 0, crystalRegenSpeed: 0 };
    const enemiesInBattle = enemyArmy.units.map((member) => ({ ...createUnitInstance(getEmpireUnit(member.unitId), enemyLord), id: member.id, unitId: member.unitId, position: member.position, lord: enemyLord }));
    const battle = simulateBattle({ allies: alliesInBattle, enemies: enemiesInBattle, lord, seed: run.seed + run.difficulty });
    const victory = battle.winner === 'ally';
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
      enemyArmy
    };
    const hpByInstance = new Map(battle.allies.map((unit) => [unit.id, unit.hp]));
    const updatedArmy = run.army.map((member) => ({ ...member, hp: hpByInstance.get(member.instanceId) ?? 0 }));
    setBattlePlayback({ battle, report, victory, updatedArmy, initialAllies: alliesInBattle, initialEnemies: enemiesInBattle, index: 0 });
  };

  useEffect(() => {
    if (!battlePlayback) return undefined;
    if (battlePlayback.index >= battlePlayback.battle.events.length) {
      setLastBattle(battlePlayback.report);
      setRun((current) => finishBattle(current, { victory: battlePlayback.victory, army: battlePlayback.updatedArmy }));
      setHubView('results');
      setBattlePlayback(null);
      return undefined;
    }
    const timer = window.setTimeout(() => setBattlePlayback((current) => current && { ...current, index: current.index + 1 }), 230);
    return () => window.clearTimeout(timer);
  }, [battlePlayback]);

  const startNewRun = () => {
    const newRun = createRun({ lordId: selectedLordId });
    setRun(newRun);
    setGrid(gridFromRun(newRun));
    setLastBattle(null);
    setSelectedMemberId(null);
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
            <LordCrystalStats lord={selectedLord} className="lord-selector-crystal-stats" />
            <div className="lord-portrait" aria-label={`Портрет ${selectedLord.name}`}><img src={lordPortraits[selectedLord.id]} alt="" /></div>
            <div><p className="eyebrow">Лорд Імперії</p><h2>{selectedLord.name}</h2><p>{selectedLord.description}</p><dl className="lord-stats"><div><dt>Бойова сила</dt><dd>{selectedLord.battlePower}</dd></div><div><dt>Витривалість</dt><dd>{selectedLord.vitality}</dd></div><div><dt>Лідерство</dt><dd>{selectedLord.leadership}</dd></div><div><dt>Кристал</dt><dd>{selectedLord.crystalVolume}</dd></div></dl><section className="lord-skill"><b>{selectedLord.id === 'empire_lord_arthur' ? 'Удар милосердя' : 'Посилена Віра'}</b><p>{selectedLord.id === 'empire_lord_arthur' ? 'Здорові союзники завдають додаткової шкоди пораненим ворогам і добивають їх на низькому HP.' : 'Віра за знищених ворогів зростає швидше, а втрата Віри від союзників менша.'}</p></section><button className="menu-primary" onClick={startNewRun}>Обрати лорда й почати</button></div>
          </article>
        </section>
      </div>
    </main>;
  }

  return (
    <main className="campaign-page">
      <header className="campaign-header">
        <div className="campaign-title"><p className="eyebrow">Кампанія · забіг</p><h1>Воєнна рада</h1><span>Детермінований автобій · Seed {run.seed}</span></div>
        <button className="back-menu" onClick={() => setScreen('menu')}>← До головного меню</button>
      </header>
      <nav className="campaign-steps" aria-label="Прогрес забігу">
        <span className={run.phase === 'hub' && hubView === 'hub' ? 'active' : ''}><b>1</b> Армія</span>
        <span className={hubView === 'opponents' ? 'active' : ''}><b>2</b> Розстановка</span>
        <span className={run.phase === 'battle' ? 'active' : ''}><b>3</b> Бій</span>
      </nav>
      <section className="deployment hub">
        <h2>{run.phase === 'hub' ? 'Підготовка до бою' : run.phase === 'battle' ? 'Обраний шлях' : 'Забіг завершено'}</h2>
        <section className="lord-panel">
          <LordCrystalStats lord={lord} />
          <div><b>Лорд: {lord.name}</b><span>Рівень {lord.level} · Бойова сила {lord.battlePower} · Витривалість {lord.vitality} · Тактика {lord.tactics}</span></div>
        </section>
        <div className="resource-strip" aria-label="Ресурси забігу">
          <span><small>Життя</small><b>{run.lives}</b></span>
          <span><small>Золото</small><b>{run.gold}</b></span>
          <span><small>Рудники</small><b>{run.mines} <i>+{run.mines}/перемога</i></b></span>
          <span><small>Лідерство</small><b>{leadershipUsed}/{run.economicLimit}</b></span>
          <span><small>Складність</small><b>{run.difficulty}</b></span>
        </div>
        {run.phase === 'hub' && <>
          {hubView === 'hub' && <>
          <h3>1. Зберіть армію</h3>
          <p>Перегляньте ключові характеристики перед наймом. «Деталі» покаже повний розрахунок кожного значення для вашого лорда.</p>
          {selectedRecruitUnitId && <UnitDetails unit={getEmpireUnit(selectedRecruitUnitId)} lord={lord} onClose={() => setSelectedRecruitUnitId('')} />}
          <div className="roster">
            {roster.map((unit) => {
              const battleLord = getBattleLordStats(lord);
              const instance = createUnitInstance(unit, battleLord);
              const mainAction = unit.combat.actions.find((action) => action.effectKind === 'damage') ?? unit.combat.actions[0];
              const mainActionValue = getActionValue(mainAction, battleLord);
              const canRecruit = run.gold >= unit.combat.leadershipCost && leadershipUsed + unit.combat.leadershipCost <= run.economicLimit;
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
              const skillPriorities = actionPriorityOrder(member, unit);
              const enemyTargetPriorities = targetPriorityOrder(member, 'enemy');
              const allyTargetPriorities = targetPriorityOrder(member, 'ally');
              const updateTactics = (patch) => setRun((current) => updateArmyMember(current, member.instanceId, { tactics: { ...member.tactics, ...patch } }));
              const updateTargetPriorities = (side, priorities) => {
                const currentPriorities = member.tactics?.targetPriority;
                const targetPriority = currentPriorities && typeof currentPriorities === 'object' && !Array.isArray(currentPriorities) ? currentPriorities : {};
                updateTactics({ targetPriority: { ...targetPriority, [side]: priorities } });
              };
              return <div className="member-actions" key={member.instanceId}>
                <UnitPortrait unitId={unit.id} className="army-member-portrait" />
                <div className="member-heading"><strong>{unit.name}</strong><span>HP {member.hp ?? maxHp}/{maxHp} · EXP {member.exp}</span></div>
                <section className="tactics" aria-label={`Тактика юніта ${unit.name}`}>
                  <div className="tactics-heading"><div><b>Тактика</b><span>Порядок умінь і цілей налаштовується окремо.</span></div><button className="tactics-reset" onClick={() => setRun((current) => updateArmyMember(current, member.instanceId, { tactics: undefined }))}>Автоматично</button></div>
                  <div className="tactics-group">
                    <h4>1. Пріоритет умінь</h4>
                    <p>Юніт застосує перше доступне й доречне вміння зі списку.</p>
                    <ol className="tactics-priority-list">
                      {skillPriorities.map((actionId, index) => {
                        const action = unit.combat.actions.find((candidate) => candidate.id === actionId);
                        return <li key={actionId}><span className="priority-number">{index + 1}</span><div><b>{action.name}</b><small>{actionTacticSummary(action)}</small></div><div className="priority-move"><button aria-label={`Підняти ${action.name}`} disabled={index === 0} onClick={() => updateTactics({ actionPriority: movePriorityItem(skillPriorities, actionId, -1) })}>↑</button><button aria-label={`Опустити ${action.name}`} disabled={index === skillPriorities.length - 1} onClick={() => updateTactics({ actionPriority: movePriorityItem(skillPriorities, actionId, 1) })}>↓</button></div></li>;
                      })}
                    </ol>
                  </div>
                  {canConfigureTargetsFor(unit, 'enemy') && <div className="tactics-group">
                    <h4>2. Пріоритет цілей: вороги</h4>
                    <p>Застосовується лише до умінь, які обирають ворога.</p>
                    <ol className="tactics-priority-list compact">
                      {enemyTargetPriorities.map((priority, index) => <li key={priority}><span className="priority-number">{index + 1}</span><b>{targetPriorityOptions[priority]}</b><div className="priority-move"><button aria-label={`Підняти ${targetPriorityOptions[priority]}`} disabled={index === 0} onClick={() => updateTargetPriorities('enemy', movePriorityItem(enemyTargetPriorities, priority, -1))}>↑</button><button aria-label={`Опустити ${targetPriorityOptions[priority]}`} disabled={index === enemyTargetPriorities.length - 1} onClick={() => updateTargetPriorities('enemy', movePriorityItem(enemyTargetPriorities, priority, 1))}>↓</button></div></li>)}
                    </ol>
                  </div>}
                  {canConfigureTargetsFor(unit, 'ally') && <div className="tactics-group">
                    <h4>3. Пріоритет цілей: союзники</h4>
                    <p>Застосовується лише до умінь, які обирають союзника.</p>
                    <ol className="tactics-priority-list compact">
                      {allyTargetPriorities.map((priority, index) => <li key={priority}><span className="priority-number">{index + 1}</span><b>{targetPriorityOptions[priority]}</b><div className="priority-move"><button aria-label={`Підняти ${targetPriorityOptions[priority]}`} disabled={index === 0} onClick={() => updateTargetPriorities('ally', movePriorityItem(allyTargetPriorities, priority, -1))}>↑</button><button aria-label={`Опустити ${targetPriorityOptions[priority]}`} disabled={index === allyTargetPriorities.length - 1} onClick={() => updateTargetPriorities('ally', movePriorityItem(allyTargetPriorities, priority, 1))}>↓</button></div></li>)}
                    </ol>
                  </div>}
                </section>
                {member.hp === 0 && <button onClick={() => setRun((current) => reviveUnit(current, member.instanceId, maxHp))}>Воскресити (10)</button>}
                {member.hp && member.hp < maxHp && <button onClick={() => setRun((current) => healUnit(current, member.instanceId, maxHp))}>Лікувати</button>}
                {unit.combat.evolutions.map((targetId) => <button disabled={member.exp < (unit.combat.expToUpgrade ?? 100)} key={targetId} onClick={() => setRun((current) => evolveUnit(current, member.instanceId, targetId))}>Еволюція: {getEmpireUnit(targetId).name}</button>)}
              </div>;
            })}
          </div>
          <button className="battle-button" disabled={!hasBattleReadyUnit} onClick={() => setHubView('opponents')}>Готово — обрати противника</button>
          </>}
          {hubView === 'opponents' && <>
          <section className="deployment compact-deployment">
            <h3>2. Розставте армію</h3>
            <p>Виберіть юніта нижче, а потім клітинку. Позиція зберігається; лицар займає дві клітинки по вертикалі.</p>
            <div className="roster">
              {run.army.map((member) => <button className={selectedMemberId === member.instanceId ? 'selected' : ''} key={member.instanceId} onClick={() => setSelectedMemberId(member.instanceId)}>{getEmpireUnit(member.unitId).name}</button>)}
            </div>
            <div className="grid" role="grid" aria-label="Сітка розміщення армії">
              {Array.from({ length: 3 }, (_, row) => Array.from({ length: 5 }, (_, column) => {
                const placement = placedAt(row, column);
                return <button className="cell" key={`${row}-${column}`} onClick={() => selectCell(row, column)}>{placement?.unit.name ?? ''}</button>;
              }))}
            </div>
          </section>
          <h3>3. Оберіть маршрут і почніть бій</h3>
          <p>Виберіть одного з трьох противників. Перед боєм можете змінити розстановку вище.</p>
          <div className="roster">
            {paths.map((path) => {
              const enemyArmy = generateEnemyArmy({ pathId: path.id, difficulty: run.difficulty, seed: formationSeed(run, path) });
              return <button className="enemy-choice" key={path.id} disabled={!hasBattleReadyUnit} onClick={() => setRun((current) => choosePath(current, path))}><b>{path.name}</b><span>{enemyArmy.label} · лідерство {enemyArmy.leadershipUsed}/{enemyArmy.leadershipBudget}</span><small>{enemyArmy.units.map((unit) => unit.name).join(', ')}</small><em>Нагорода: {path.goldReward} золота · загроза {path.threat} →</em></button>;
            })}
          </div>
          <button className="reset-button" onClick={() => setHubView('hub')}>← Повернутися до Hub</button>
          </>}
        </>}
        {run.phase === 'battle' && !battlePlayback && <section className="battle-ready"><h3>Противник обраний: {run.selectedPath.name}</h3><p>Загроза {run.selectedPath.threat}. Армія готова — натисніть, щоб розпочати автобій.</p><button className="battle-button" onClick={resolveRunBattle}>В бій</button></section>}
        {battlePlayback && <section className="battle-playback" aria-live="polite">
          <div className="battle-arena-hud">
            <div className="arena-team ally"><span>✦</span><b>Імперія</b><small>Віра</small><i><em style={{ width: `${Math.max(0, Math.min(100, playbackState.faith))}%` }} /></i><strong>{Math.round(playbackState.faith)}</strong></div>
            <div className="arena-round"><span>АВТОБІЙ</span><b>VS</b><small>Раунд {playbackEvent?.round ?? 1}</small></div>
            <div className="arena-team enemy"><span>⚔</span><b>Рейдери</b><small>Кристал</small><i><em style={{ width: `${Math.max(0, Math.min(100, (battlePlayback.battle.allyCrystal.mana / battlePlayback.battle.allyCrystal.manaMax) * 100))}%` }} /></i><strong>{Math.round(battlePlayback.battle.allyCrystal.mana)}</strong></div>
          </div>
          <div className="playback-heading"><div><b>Автобій триває</b><span>Подія {Math.min(battlePlayback.index, battlePlayback.battle.events.length)}/{battlePlayback.battle.events.length}</span></div><strong>{playbackEvent ? describeBattleEvent(playbackEvent) : 'Армії займають позиції…'}</strong><em>Віра: {Math.round(playbackState.faith)}/100 · Кристал: {Math.round(battlePlayback.battle.allyCrystal.mana)}/{battlePlayback.battle.allyCrystal.manaMax}</em></div>
          <BattleActionBanner event={playbackEvent} units={playbackState.units} />
          <div className="battlefield" aria-label="Поле бою з розміщенням армій">
            <BattleFormation title="Імперія" units={battlePlayback.initialAllies.map((unit) => playbackState.units.get(unit.id))} activeId={playbackEvent?.attackerId} targetId={playbackEvent?.targetId ?? playbackEvent?.unitId} event={playbackEvent} />
            <strong className="battlefield-versus">VS</strong>
            <BattleFormation title="Ворожа армія Імперії" units={battlePlayback.initialEnemies.map((unit) => playbackState.units.get(unit.id))} activeId={playbackEvent?.attackerId} targetId={playbackEvent?.targetId ?? playbackEvent?.unitId} event={playbackEvent} />
          </div>
          <div className={`action-flash ${playbackEvent?.type ?? 'ready'}`}>{playbackEvent?.type === 'heal' ? '✦ Зцілення' : playbackEvent?.type === 'control' ? '⚡ Контроль' : playbackEvent?.type === 'death' ? '☠ Загибель' : '✹ Удар'}</div>
        </section>}
        {lastBattle && hubView === 'results' && <section className={`battle-report battle-results-screen ${lastBattle.victory ? 'victory' : 'defeat'}`} aria-live="polite">
          <p className="eyebrow">Підсумок сутички</p>
          <h3>{lastBattle.victory ? 'Перемога' : 'Поразка'} · {lastBattle.rounds} раундів</h3>
          <p className="battle-resources">Віра: {lastBattle.faith}/100 · Сила кристала: {Math.round(lastBattle.crystal.mana)}/{lastBattle.crystal.manaMax}</p>
          {lastBattle.victory && <p>Нагорода: +{lastBattle.path.goldReward} золота{lastBattle.path.expReward ? ` · +${lastBattle.path.expReward} EXP` : ''}{lastBattle.path.economicLimitReward ? ` · +${lastBattle.path.economicLimitReward} ліміту` : ''}{lastBattle.path.mineReward ? ' · новий рудник' : ''}.</p>}
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
          <button className="battle-button results-continue" onClick={() => { setLastBattle(null); setHubView('hub'); }}>Продовжити похід →</button>
        </section>}
        {run.phase === 'game_over' && <button className="battle-button" onClick={() => setRun(createRun())}>Почати новий забіг</button>}
        {run.phase === 'hub' && hubView !== 'results' && <button className="reset-button" onClick={() => setRun(createRun())}>Скинути забіг</button>}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
