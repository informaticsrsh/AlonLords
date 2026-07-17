/* eslint-disable react/prop-types */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { choosePath, createGrid, createPaths, createRun, createUnitInstance, empireLords, empireUnits, evolveUnit, finishBattle, generateEnemyArmy, getBattleLordStats, getEmpireLord, getEmpireUnit, healUnit, moveUnit, recruitUnit, reviveUnit, simulateBattle, updateArmyMember } from '@empire/game-core';
import './styles.css';

const allies = [{ id: 'imperial-guard', name: 'Імперський страж', maxHp: 30, attack: 8, critChance: 0.15 }];
const enemies = [{ id: 'raider', name: 'Прикордонний рейдер', maxHp: 24, attack: 6, critChance: 0.1 }];
const roster = empireUnits.filter((unit) => unit.tier === 1);
const runStorageKey = 'empire-lords.run.v1';
const factions = [{
  id: 'empire',
  name: 'Імперія',
  emblem: '✥',
  feature: 'Віра',
  description: 'Починає кожен бій з 50 Віри. Віра зростає за знищення ворогів та зменшується від втрат союзників.',
  mechanic: 'Висока Віра прискорює дії армії, низька — сповільнює. Лорди Імперії по-своєму змінюють цю механіку.'
}];

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

function BattleFormation({ title, units, activeId, targetId }) {
  const unitAt = (row, column) => units.find((unit) => unit.position?.row === row && unit.position?.column === column);
  return <div className="formation"><h4>{title}</h4><div className="formation-grid">
    {Array.from({ length: 3 }, (_, row) => Array.from({ length: 5 }, (_, column) => {
      const unit = unitAt(row, column);
      const hpPercent = unit?.maxHp ? Math.max(0, Math.min(100, unit.hp / unit.maxHp * 100)) : 0;
      return <div className={`formation-cell ${unit ? 'occupied' : ''} ${unit?.id === activeId ? 'acting' : ''} ${unit?.id === targetId ? 'targeted' : ''}`} key={`${row}-${column}`}>
        {unit && <><b>{unit.name}</b><i><span style={{ width: `${hpPercent}%` }} /></i><small>{Math.round(unit.hp)}/{Math.round(unit.maxHp)}</small></>}
      </div>;
    }))}
  </div></div>;
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
  const result = simulateBattle({ allies, enemies, seed: 42 });
  const [run, setRun] = useState(loadRun);
  const [grid, setGrid] = useState(() => gridFromRun(run));
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [lastBattle, setLastBattle] = useState(null);
  const [screen, setScreen] = useState('menu');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedLordId, setSelectedLordId] = useState('empire_lord_henrik');
  const [selectedFactionId, setSelectedFactionId] = useState('empire');
  const [hubView, setHubView] = useState('hub');
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
      const unit = { ...createUnitInstance(getEmpireUnit(member.unitId), battleLord), id: member.instanceId, lord: battleLord, position: member.position, tactics: member.tactics };
      unit.hp = member.hp ?? unit.maxHp;
      return unit;
    });
    const enemyArmy = generateEnemyArmy({ pathId: run.selectedPath.id, difficulty: run.difficulty, seed: formationSeed(run, run.selectedPath) });
    const enemyLord = { vitality: 0, battlePower: 0, crystalRegenSpeed: 0 };
    const enemiesInBattle = enemyArmy.units.map((member) => ({ ...createUnitInstance(getEmpireUnit(member.unitId), enemyLord), id: member.id, position: member.position, lord: enemyLord }));
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
      setHubView('hub');
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
        <p>Режим «Кампанія» доступний зараз. Інші режими буде додано пізніше.</p>
      </div>}
    </section>
    <p className="menu-note">Порядок гри: вибір армії → розстановка → маршрут → бій.</p>
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
            {availableLords.map((candidate) => <button className={`lord-gallery-card ${candidate.id === selectedLordId ? 'selected' : ''}`} key={candidate.id} onClick={() => setSelectedLordId(candidate.id)}><span className="mini-portrait">{candidate.name[0]}</span><span><b>{candidate.name}</b><small>{candidate.description}</small></span></button>)}
          </div>
          <article className="lord-detail">
            <div className="lord-portrait" aria-label={`Портрет ${selectedLord.name}`}>{selectedLord.name[0]}</div>
            <div><p className="eyebrow">Лорд Імперії</p><h2>{selectedLord.name}</h2><p>{selectedLord.description}</p><dl className="lord-stats"><div><dt>Бойова сила</dt><dd>{selectedLord.battlePower}</dd></div><div><dt>Витривалість</dt><dd>{selectedLord.vitality}</dd></div><div><dt>Лідерство</dt><dd>{selectedLord.leadership}</dd></div><div><dt>Кристал</dt><dd>{selectedLord.crystalVolume}</dd></div></dl><section className="lord-skill"><b>{selectedLord.id === 'empire_lord_arthur' ? 'Удар милосердя' : 'Посилена Віра'}</b><p>{selectedLord.id === 'empire_lord_arthur' ? 'Здорові союзники завдають додаткової шкоди пораненим ворогам і добивають їх на низькому HP.' : 'Віра за знищених ворогів зростає швидше, а втрата Віри від союзників менша.'}</p></section><button className="menu-primary" onClick={startNewRun}>Обрати лорда й почати</button></div>
          </article>
        </section>
      </div>
    </main>;
  }

  return (
    <main>
      <button className="back-menu" onClick={() => setScreen('menu')}>← Головне меню</button>
      <p className="eyebrow">Кампанія · забіг</p>
      <h1>Empire Lords</h1>
      <p className="lead">Детермінований автобій: той самий seed завжди дає той самий результат.</p>
      <section className="arena" aria-label="Результат тестового бою">
        <article><h2>{allies[0].name}</h2><p>HP {allies[0].maxHp} · ATK {allies[0].attack}</p></article>
        <strong>VS</strong>
        <article><h2>{enemies[0].name}</h2><p>HP {enemies[0].maxHp} · ATK {enemies[0].attack}</p></article>
      </section>
      <section className="result">
        <h2>Переможець: {result.winner === 'ally' ? 'Імперія' : 'Рейдери'}</h2>
        <p>Раундів: {result.round} · Подій: {result.events.length} · Seed: 42</p>
      </section>
      <section className="deployment hub">
        <h2>{run.phase === 'hub' ? 'Hub — підготовка' : run.phase === 'battle' ? 'Обраний шлях' : 'Забіг завершено'}</h2>
        <section className="lord-panel">
          <div><b>Лорд: {lord.name}</b><span>Рівень {lord.level} · Бойова сила {lord.battlePower} · Витривалість {lord.vitality} · Тактика {lord.tactics}</span></div>
          <div><b>Кристал лорда</b><span>{lord.crystalVolume} сили · +{lord.crystalRegenSpeed / 5} за тік</span></div>
          <div><b>Віра Імперії</b><span>Стартує з 50, зростає за перемоги й падає за втрати.</span></div>
        </section>
        <p>Життя: {run.lives} · Золото: {run.gold} · Рудники: {run.mines} (+{run.mines} золота за перемогу) · Лідерство: {leadershipUsed}/{run.economicLimit} · Складність: {run.difficulty}</p>
        {run.phase === 'hub' && <>
          {hubView === 'hub' && <>
          <h3>1. Зберіть армію</h3>
          <p>Натисніть картку юніта, щоб найняти його. Вартість у дужках — лідерство.</p>
          <div className="roster">
            {roster.map((unit) => <button className="recruit-card" key={unit.id} onClick={() => setRun((current) => recruitUnit(current, unit.id))}><b>{unit.name}</b><span>{unit.role} · {unit.combat.leadershipCost} лідерства</span><small>Найняти</small></button>)}
          </div>
          <p className="army-summary">Ваша армія: {run.army.length ? run.army.map((member) => getEmpireUnit(member.unitId).name).join(', ') : 'ще порожня — найміть хоча б одного юніта.'}</p>
          <div className="army-actions">
            {run.army.map((member) => {
              const unit = getEmpireUnit(member.unitId);
              const maxHp = createUnitInstance(unit, getBattleLordStats(lord)).maxHp;
              return <div className="member-actions" key={member.instanceId}>
                <strong>{unit.name}</strong> · HP {member.hp ?? maxHp}/{maxHp} · EXP {member.exp}
                <div className="tactics">
                  <label>Дія
                    <select value={member.tactics?.actionPriority ?? ''} onChange={(event) => setRun((current) => updateArmyMember(current, member.instanceId, { tactics: { ...member.tactics, actionPriority: event.target.value || undefined } }))}>
                      <option value="">Автоматично</option>
                      <option value="damage">Шкода</option>
                      <option value="heal">Лікування</option>
                      <option value="control">Контроль</option>
                      <option value="buff">Бафи</option>
                    </select>
                  </label>
                  <label>Ціль
                    <select value={member.tactics?.targetPriority ?? ''} onChange={(event) => setRun((current) => updateArmyMember(current, member.instanceId, { tactics: { ...member.tactics, targetPriority: event.target.value || undefined } }))}>
                      <option value="">За замовчуванням</option>
                      <option value="nearest">Найближча</option>
                      <option value="lowest_hp">Найнижче HP</option>
                      <option value="highest_threat">Найбільша загроза</option>
                      <option value="random">Випадкова</option>
                    </select>
                  </label>
                </div>
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
              return <button className="enemy-choice" key={path.id} disabled={!hasBattleReadyUnit} onClick={() => setRun((current) => choosePath(current, path))}><b>{path.name} · {enemyArmy.label}</b><span>Лідерство ворога: {enemyArmy.leadershipUsed}/{enemyArmy.leadershipBudget}</span><small>{enemyArmy.units.map((unit) => unit.name).join(', ')}</small><em>{path.goldReward} золота · загроза {path.threat}</em></button>;
            })}
          </div>
          <button className="reset-button" onClick={() => setHubView('hub')}>← Повернутися до Hub</button>
          </>}
        </>}
        {run.phase === 'battle' && !battlePlayback && <section className="battle-ready"><h3>Противник обраний: {run.selectedPath.name}</h3><p>Загроза {run.selectedPath.threat}. Армія готова — натисніть, щоб розпочати автобій.</p><button className="battle-button" onClick={resolveRunBattle}>В бій</button></section>}
        {battlePlayback && <section className="battle-playback" aria-live="polite">
          <div className="playback-heading"><div><b>Автобій триває</b><span>Подія {Math.min(battlePlayback.index, battlePlayback.battle.events.length)}/{battlePlayback.battle.events.length}</span></div><strong>{playbackEvent ? describeBattleEvent(playbackEvent) : 'Армії займають позиції…'}</strong><em>Віра: {Math.round(playbackState.faith)}/100 · Кристал: {Math.round(battlePlayback.battle.allyCrystal.mana)}/{battlePlayback.battle.allyCrystal.manaMax}</em></div>
          <div className="battlefield" aria-label="Поле бою з розміщенням армій">
            <BattleFormation title="Імперія" units={battlePlayback.initialAllies.map((unit) => playbackState.units.get(unit.id))} activeId={playbackEvent?.attackerId} targetId={playbackEvent?.targetId ?? playbackEvent?.unitId} />
            <strong className="battlefield-versus">VS</strong>
            <BattleFormation title="Ворожа армія Імперії" units={battlePlayback.initialEnemies.map((unit) => playbackState.units.get(unit.id))} activeId={playbackEvent?.attackerId} targetId={playbackEvent?.targetId ?? playbackEvent?.unitId} />
          </div>
          <div className={`action-flash ${playbackEvent?.type ?? 'ready'}`}>{playbackEvent?.type === 'heal' ? '✦ Зцілення' : playbackEvent?.type === 'control' ? '⚡ Контроль' : playbackEvent?.type === 'death' ? '☠ Загибель' : '✹ Удар'}</div>
        </section>}
        {lastBattle && <section className={`battle-report ${lastBattle.victory ? 'victory' : 'defeat'}`} aria-live="polite">
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
        </section>}
        {run.phase === 'game_over' && <button className="battle-button" onClick={() => setRun(createRun())}>Почати новий забіг</button>}
        {run.phase === 'hub' && <button className="reset-button" onClick={() => setRun(createRun())}>Скинути забіг</button>}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
