import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createGrid, empireUnits, placeUnit, simulateBattle } from '@empire/game-core';
import './styles.css';

const allies = [{ id: 'imperial-guard', name: 'Імперський страж', maxHp: 30, attack: 8, critChance: 0.15 }];
const enemies = [{ id: 'raider', name: 'Прикордонний рейдер', maxHp: 24, attack: 6, critChance: 0.1 }];
const roster = empireUnits.filter((unit) => unit.tier === 1);

function App() {
  const result = simulateBattle({ allies, enemies, seed: 42 });
  const [grid, setGrid] = useState(() => createGrid({ rows: 3, columns: 5 }));
  const [selectedUnit, setSelectedUnit] = useState(roster[0]);

  const placedAt = (row, column) => grid.placements.find((placement) => (
    row >= placement.position.row
    && row < placement.position.row + placement.unit.gridFootprint.rows
    && column >= placement.position.column
    && column < placement.position.column + placement.unit.gridFootprint.columns
  ));

  const selectCell = (row, column) => {
    setGrid((currentGrid) => placeUnit(currentGrid, selectedUnit, { row, column }));
  };

  return (
    <main>
      <p className="eyebrow">Вертикальний зріз</p>
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
      <section className="deployment">
        <h2>Розміщення армії</h2>
        <p>Виберіть юніта зі складу й клітинку. Показано 7 стартових юнітів; каталог уже містить усі {empireUnits.length} задокументованих юнітів Імперії. Лицар займає дві клітинки по вертикалі.</p>
        <div className="roster">
          {roster.map((unit) => <button className={selectedUnit.id === unit.id ? 'selected' : ''} key={unit.id} onClick={() => setSelectedUnit(unit)}>{unit.name}</button>)}
        </div>
        <div className="grid" role="grid" aria-label="Сітка розміщення армії">
          {Array.from({ length: 3 }, (_, row) => Array.from({ length: 5 }, (_, column) => {
            const placement = placedAt(row, column);
            return <button className="cell" key={`${row}-${column}`} onClick={() => selectCell(row, column)}>{placement?.unit.name ?? ''}</button>;
          }))}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
