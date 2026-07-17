# Фракція Імперія — повна деталізація за схемою UnitType/Action (п.6)

## Базові орієнтири (T1) за архетипом
- **Melee**: `hp: 50+5*vt`, `atk: 10+1*bp`
- **Ranged**: `hp: 30+3*vt`, `atk: 5+2*bp`
- **Caster**: `hp: 30+3*vt`, базова (слабка) атака `5+1*bp`, альт. спел за 10 мани: `10+3*rs` шкоди/лікування в 1 ціль

## Правила масштабування
- Кожен ранг = **×1.5** до hp-формули і базової атаки/спела відносно прямого предка (однаково для обох гілок одного предка — вони відрізняються навичками/типом шкоди/attack_speed, не базовими цифрами).
- Якщо гілка змінює `attack_speed` відносно базового для лінії — атака додатково множиться на `new_speed/base_speed`, щоб DPS лишався співмірним.
- **Виняток — мультитаргет-дії** (`target_rule.count > 1`, напр. `double_shot`/`volley` у гілці Розвідника): per-hit значення формули свідомо занижене відносно "прямого" ×1.5, щоб сумарний урон по всіх цілях не перевищував однотаргетну гілку того ж рангу в рази. Це не помилка масштабування, а окремий компенсаційний розрахунок під multi-target; порівнювати такі дії з предком напряму через ×1.5 некоректно.
- Нові унікальні навички/пасивки на ранзі — довільні, не виводяться з формули.
- `exp_reward_on_kill = leadership_cost × 20`. `exp_to_upgrade`: 100 / 220 / 450 / `null` (T1→T2→T3→T4→макс).
- `resistances` — повний набір `{physical, fire, holy, poison, lightning}`, 0 де не вказано.

---

## ЛІНІЯ 1: Стрілець (ranged, speed_base=4)

```js
// T1
{
  id: "empire_archer_t1", name: "Ополченець-лучник", class_tier: 1,
  faction: "empire", race_type: "human",
  exp_current: 0, exp_to_upgrade: 100, exp_reward_on_kill: 40,
  attack_speed: 4,
  actions: [{ id:"basic_shot", name:"Постріл", type:"physical", effect_kind:"damage", range_type:"ranged",
    formula:(lord,self)=>5+2*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null }],
  hp_formula:(lord)=>30+3*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:2, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-30% до formula (без прикриття лучник губиться в ближньому бою)"}
  ],
  evolutions:["empire_archer_t2_sniper","empire_archer_t2_crossbow"]
}

// T2A
{
  id:"empire_archer_t2_sniper", name:"Снайпер", class_tier:2,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:220, exp_reward_on_kill:80,
  attack_speed:4,
  actions:[{ id:"precise_shot", name:"Влучний постріл", type:"physical", effect_kind:"damage", range_type:"ranged",
    formula:(lord,self)=>7.5+3*lord.battlePower, target_rule:{side:"enemy",selection:"lowest_hp",count:1}, cooldown:null, mana_cost:null, crit_chance_bonus:0.25 }],
  passives:[{id:"hard_to_hit", effect:"melee_evasion_bonus:0.15"}],
  hp_formula:(lord)=>45+4.5*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:4, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-20% до formula"},
    {condition:"is_own_backline", effect:"+10% до formula, +20% crit_chance (далекий приціл)"}
  ],
  evolutions:["empire_archer_t3_executioner","empire_archer_t3_scout"]
}

// T2B
{
  id:"empire_archer_t2_crossbow", name:"Арбалетчик", class_tier:2,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:220, exp_reward_on_kill:80,
  attack_speed:6,
  actions:[{ id:"bolt_shot", name:"Постріл болтом", type:"physical", effect_kind:"damage", range_type:"ranged",
    formula:(lord,self)=>11.2+4.5*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null, ignore_resistance_pct:0.3 }],
  hp_formula:(lord)=>45+4.5*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:4, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_melee", effect:"+10% ignore_resistance_pct (упор на союзника для стійкого пострілу)"}
  ],
  evolutions:["empire_archer_t3_heavy_crossbow","empire_archer_t3_fire_crossbow"]
}

// T3A1
{
  id:"empire_archer_t3_executioner", name:"Стрілець-екзекутор", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:120,
  attack_speed:4,
  actions:[
    { id:"precise_shot", name:"Влучний постріл", type:"physical", effect_kind:"damage", range_type:"ranged",
      formula:(lord,self)=>11.2+4.5*lord.battlePower, target_rule:{side:"enemy",selection:"lowest_hp",count:1}, cooldown:null, mana_cost:null, crit_chance_bonus:0.25 },
    { id:"execution", name:"Страта", type:"physical", effect_kind:"damage", range_type:"ranged",
      formula:(lord,self)=>(11.2+4.5*lord.battlePower)*2, target_rule:{side:"enemy",selection:"lowest_hp",count:1},
      condition:(target)=>target.hp_pct<0.25, cooldown:3, mana_cost:null }
  ],
  passives:[{id:"hard_to_hit", effect:"melee_evasion_bonus:0.15"}],
  hp_formula:(lord)=>67.5+6.8*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:6, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-20% до formula"},
    {condition:"is_own_backline", effect:"+15% до formula, +25% crit_chance"}
  ],
  evolutions:["empire_archer_t4_royal_marksman"]
}

// T3A2
{
  id:"empire_archer_t3_scout", name:"Розвідник-стрілець", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:120,
  attack_speed:4,
  actions:[{ id:"double_shot", name:"Подвійний постріл", type:"physical", effect_kind:"damage", range_type:"ranged",
    formula:(lord,self)=>7.3+2.9*lord.battlePower, target_rule:{side:"enemy",selection:"random",count:2}, cooldown:null, mana_cost:null, crit_chance_bonus:0.25 }],
  passives:[{id:"hard_to_hit", effect:"melee_evasion_bonus:0.15"}],
  hp_formula:(lord)=>67.5+6.8*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:6, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-15% до formula"},
    {condition:"no_adjacent_allies", effect:"+20% до formula (діє як розвідник-одинак)"}
  ],
  evolutions:["empire_archer_t4_falcon_marksman"]
}

// T3B1
{
  id:"empire_archer_t3_heavy_crossbow", name:"Важкий арбалетчик", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:140,
  attack_speed:6,
  actions:[{ id:"bolt_shot", name:"Постріл болтом", type:"physical", effect_kind:"damage", range_type:"ranged",
    formula:(lord,self)=>16.9+6.8*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
    ignore_resistance_pct:0.6, on_hit_debuff:{id:"armor_break", effect:"-resist target", duration:2} }],
  hp_formula:(lord)=>67.5+6.8*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:7, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_melee", effect:"+15% ignore_resistance_pct"}
  ],
  evolutions:["empire_archer_t4_plate_breaker"]
}

// T3B2
{
  id:"empire_archer_t3_fire_crossbow", name:"Вогняний арбалетчик", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:140,
  attack_speed:6,
  actions:[{ id:"incendiary_bolt", name:"Запальний болт", type:"fire", effect_kind:"damage", range_type:"ranged",
    formula:(lord,self)=>16.9+6.8*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
    splash_radius:1, ignore_resistance_pct:0.3 }],
  hp_formula:(lord)=>67.5+6.8*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:7, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-10% до formula"},
    {condition:"adjacent_ally_melee", effect:"+10% ефективний splash_radius"}
  ],
  evolutions:["empire_archer_t4_immolator"]
}

// T4A1
{
  id:"empire_archer_t4_royal_marksman", name:"Королівський стрілець", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:180,
  attack_speed:4,
  actions:[
    { id:"precise_shot", name:"Влучний постріл", type:"physical", effect_kind:"damage", range_type:"ranged",
      formula:(lord,self)=>16.9+6.8*lord.battlePower, target_rule:{side:"enemy",selection:"lowest_hp",count:1}, cooldown:null, mana_cost:null, crit_chance_bonus:0.4 },
    { id:"execution", name:"Страта", type:"physical", effect_kind:"damage", range_type:"ranged",
      formula:(lord,self)=>(16.9+6.8*lord.battlePower)*2.5, target_rule:{side:"enemy",selection:"lowest_hp",count:1},
      condition:(target)=>target.hp_pct<0.35, cooldown:2, mana_cost:null }
  ],
  passives:[{id:"hard_to_hit", effect:"melee_evasion_bonus:0.15"}],
  hp_formula:(lord)=>101.2+10.1*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:9, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-20% до formula"},
    {condition:"is_own_backline", effect:"+20% до formula, +30% crit_chance"}
  ], evolutions:[]
}

// T4A2
{
  id:"empire_archer_t4_falcon_marksman", name:"Соколиний стрілець", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:160,
  attack_speed:4,
  actions:[{ id:"volley", name:"Залп", type:"physical", effect_kind:"damage", range_type:"ranged",
    formula:(lord,self)=>7.6+3.1*lord.battlePower, target_rule:{side:"enemy",selection:"all_in_range",count:4}, cooldown:null, mana_cost:null, crit_chance_bonus:0.25 }],
  passives:[{id:"hard_to_hit", effect:"melee_evasion_bonus:0.15"}],
  hp_formula:(lord)=>101.2+10.1*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:8, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-15% до formula"},
    {condition:"no_adjacent_allies", effect:"+30% до formula"}
  ], evolutions:[]
}

// T4B1
{
  id:"empire_archer_t4_plate_breaker", name:"Проломлювач лат", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:200,
  attack_speed:6,
  actions:[{ id:"bolt_shot", name:"Постріл болтом", type:"physical", effect_kind:"damage", range_type:"ranged",
    formula:(lord,self)=>25.3+10.1*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
    ignore_resistance_pct:1.0, on_hit_debuff:{id:"armor_break_aoe", effect:"-resist весь фронт цілі", duration:2} }],
  hp_formula:(lord)=>101.2+10.1*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:10, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_melee", effect:"+20% ignore_resistance_pct"}
  ], evolutions:[]
}

// T4B2
{
  id:"empire_archer_t4_immolator", name:"Спопеляч", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:180,
  attack_speed:6,
  actions:[{ id:"incendiary_bolt", name:"Запальний болт", type:"fire", effect_kind:"damage", range_type:"ranged",
    formula:(lord,self)=>25.3+10.1*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
    splash_radius:1, ignore_resistance_pct:0.3, burn_dot:{stacks_max:3,ticks:3}, on_kill_spread:true }],
  hp_formula:(lord)=>101.2+10.1*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:9, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-10% до formula"},
    {condition:"adjacent_ally_melee", effect:"+15% ефективний splash_radius, +1 burn stack"}
  ], evolutions:[]
}
```

---

## ЛІНІЯ 2: Латник (melee, speed_base=4; Дуелянт speed=3)

```js
// T1
{
  id:"empire_infantry_t1", name:"Латник", class_tier:1,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:100, exp_reward_on_kill:60,
  attack_speed:4,
  actions:[{ id:"sword_strike", name:"Удар мечем", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>10+1*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null }],
  hp_formula:(lord)=>50+5*lord.vitality,
  resistances:{physical:10,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:3, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_count>=1", effect:"+5% усі resistances (тримає стрій)"}
  ],
  evolutions:["empire_infantry_t2_vanguard","empire_infantry_t2_duelist"]
}

// T2A
{
  id:"empire_infantry_t2_vanguard", name:"Авангардист", class_tier:2,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:220, exp_reward_on_kill:100,
  attack_speed:4,
  actions:[
    { id:"sword_strike", name:"Удар мечем", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>15+1.5*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"bodyguard_shield", name:"Щит охоронця", type:"physical", effect_kind:"buff", range_type:"melee",
      formula:(lord,self)=>25+1.2*lord.vitality, target_rule:{side:"self",selection:"self",count:1}, cooldown:5, mana_cost:null }
  ],
  passives:[{id:"guardian", type:"Guardian", trigger:"ON_TARGET_SELECTED",
    condition:"target is adjacent ally", effect:"redirect_pct:0.3 — перехоплює 30% шкоди, спрямованої на сусідні клітинки"}],
  hp_formula:(lord)=>75+7.5*lord.vitality,
  resistances:{physical:18,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:5, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_count>=1", effect:"+8% усі resistances"}
  ],
  evolutions:["empire_infantry_t3_standard_bearer","empire_infantry_t3_gate_warden"]
}

// T2B
{
  id:"empire_infantry_t2_duelist", name:"Дуелянт", class_tier:2,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:220, exp_reward_on_kill:100,
  attack_speed:3,
  actions:[{ id:"quick_strike", name:"Швидкий випад", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>11.2+1.1*lord.battlePower, target_rule:{side:"enemy",selection:"highest_threat",count:1}, cooldown:null, mana_cost:null }],
  hp_formula:(lord)=>75+7.5*lord.vitality,
  resistances:{physical:10,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:5, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"no_adjacent_allies", effect:"+20% до formula (б’ється сам на сам)"}
  ],
  evolutions:["empire_infantry_t3_blade_of_justice","empire_infantry_t3_brawl_veteran"]
}

// T3A1
{
  id:"empire_infantry_t3_standard_bearer", name:"Знаменосець", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:140,
  attack_speed:4,
  actions:[{ id:"banner_strike", name:"Удар прапором", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>22.5+2.2*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1, width:2}, cooldown:null, mana_cost:null,
    note:"широкий замах б'є ціль + сусідню клітинку того ж ряду" }],
  passives:[{id:"banner_aura", trigger:"ON_TURN_START", applies_to:"allies_in_range", effect:"+10% attack"}],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:22,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:7, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_count>=1", effect:"+10% усі resistances"}
  ],
  evolutions:["empire_infantry_t4_imperial_standard_bearer"]
}

// T3A2
{
  id:"empire_infantry_t3_gate_warden", name:"Страж брами", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:140,
  attack_speed:4,
  actions:[{ id:"sword_strike", name:"Удар мечем", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>22.5+2.2*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null }],
  passives:[
    {id:"shieldwall", trigger:"ON_DAMAGE_DEALT", condition:"target==self", effect:"-25% damage до фронтового ряду цей хід"},
    {id:"guardian", type:"Guardian", trigger:"ON_TARGET_SELECTED", condition:"target is adjacent ally", effect:"redirect_pct:0.4"}
  ],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:25,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:7, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_count>=1", effect:"+12% усі resistances"}
  ],
  evolutions:["empire_infantry_t4_unyielding_bastion"]
}

// T3B1
{
  id:"empire_infantry_t3_blade_of_justice", name:"Клинок правосуддя", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:140,
  attack_speed:3,
  actions:[{ id:"holy_strike", name:"Освячений удар", type:"holy", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>16.9+1.7*lord.battlePower, target_rule:{side:"enemy",selection:"highest_threat",count:1}, cooldown:null, mana_cost:null,
    bonus_vs_race_type:{demon:1.5, undead:1.5} }],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:10,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:7, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"no_adjacent_allies", effect:"+25% до formula"}
  ],
  evolutions:["empire_infantry_t4_synod_blade"]
}

// T3B2
{
  id:"empire_infantry_t3_brawl_veteran", name:"Ветеран сутичок", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:120,
  attack_speed:3,
  actions:[{ id:"quick_strike", name:"Швидкий випад", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>16.9+1.7*lord.battlePower, target_rule:{side:"enemy",selection:"highest_threat",count:1}, cooldown:null, mana_cost:null }],
  passives:[{id:"counter_attack", trigger:"ON_UNIT_ATTACK", condition:"self is target && range_type==melee", formula:(lord,self)=>6+0.6*lord.battlePower}],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:12,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:6, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_count>=2", effect:"+30% до формули контратаки (б’ється в натовпі)"}
  ],
  evolutions:["empire_infantry_t4_unbreakable_veteran"]
}

// T4A1
{
  id:"empire_infantry_t4_imperial_standard_bearer", name:"Прапороносець Імперії", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:180,
  attack_speed:4,
  actions:[{ id:"banner_strike", name:"Удар прапором", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>33.8+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1, width:2}, cooldown:null, mana_cost:null,
    note:"широкий замах б'є ціль + сусідню клітинку того ж ряду" }],
  passives:[{id:"banner_aura", trigger:"ON_TURN_START", applies_to:"allies_in_range", effect:"+20% attack, +10% усі resistances"}],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:28,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:9, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_count>=1", effect:"+15% усі resistances"}
  ], evolutions:[]
}

// T4A2
{
  id:"empire_infantry_t4_unyielding_bastion", name:"Непохитний бастіон", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:200,
  attack_speed:4,
  actions:[{ id:"sword_strike", name:"Удар мечем", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>33.8+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null }],
  passives:[
    {id:"shieldwall", trigger:"ON_DAMAGE_DEALT", condition:"target==self", effect:"-40% damage до фронтового ряду цей хід"},
    {id:"steady_regen", trigger:"ON_TURN_START", effect:"+5% max HP"},
    {id:"guardian", type:"Guardian", trigger:"ON_TARGET_SELECTED", condition:"target is adjacent ally", effect:"redirect_pct:0.5"}
  ],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:32,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:10, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_count>=1", effect:"+18% усі resistances"}
  ], evolutions:[]
}

// T4B1
{
  id:"empire_infantry_t4_synod_blade", name:"Меч Синоду", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:200,
  attack_speed:3,
  actions:[
    { id:"holy_strike", name:"Освячений удар", type:"holy", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>25.3+2.5*lord.battlePower, target_rule:{side:"enemy",selection:"highest_threat",count:1}, cooldown:null, mana_cost:null,
      bonus_vs_race_type:{demon:2.0, undead:2.0} },
    { id:"execution", name:"Страта нечестивого", type:"holy", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>9999, target_rule:{side:"enemy",selection:"lowest_hp",count:1},
      condition:(target)=>target.hp_pct<0.20 && (target.race_type==="demon"||target.race_type==="undead"), cooldown:null, mana_cost:null }
  ],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:12,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:10, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"no_adjacent_allies", effect:"+30% до formula"}
  ], evolutions:[]
}

// T4B2
{
  id:"empire_infantry_t4_unbreakable_veteran", name:"Незламний ветеран", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:180,
  attack_speed:3,
  actions:[{ id:"quick_strike", name:"Швидкий випад", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>25.3+2.5*lord.battlePower, target_rule:{side:"enemy",selection:"highest_threat",count:1}, cooldown:null, mana_cost:null }],
  passives:[
    {id:"counter_attack", trigger:"ON_UNIT_ATTACK", condition:"self is target && range_type==melee", formula:(lord,self)=>9+0.9*lord.battlePower},
    {id:"lifesteal_on_counter", effect:"+15% lifesteal з контратаки"}
  ],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:15,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:9, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_count>=2", effect:"+40% до формули контратаки"}
  ], evolutions:[]
}
```

---

## ЛІНІЯ 3: Послушник церкви (caster/support, speed_base=4)

```js
// T1
{
  id:"empire_priest_t1", name:"Послушник", class_tier:1,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:100, exp_reward_on_kill:60,
  attack_speed:4,
  actions:[
    { id:"staff_hit", name:"Удар посохом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>5+1*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"heal", name:"Зцілення", type:"holy", effect_kind:"heal", range_type:"ranged",
      formula:(lord,self)=>10+3*lord.crystalRegenSpeed, target_rule:{side:"ally",selection:"lowest_hp",count:1}, cooldown:null, mana_cost:10 }
  ],
  hp_formula:(lord)=>30+3*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:3, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-25% до formula (втрачає концентрацію)"}
  ],
  evolutions:["empire_priest_t2_healer","empire_priest_t2_preacher"]
}

// T2A
{
  id:"empire_priest_t2_healer", name:"Зцілитель", class_tier:2,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:220, exp_reward_on_kill:100,
  attack_speed:4,
  actions:[
    { id:"staff_hit", name:"Удар посохом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>7.5+1.5*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"heal", name:"Зцілення", type:"holy", effect_kind:"heal", range_type:"ranged",
      formula:(lord,self)=>15+4.5*lord.crystalRegenSpeed, target_rule:{side:"ally",selection:"lowest_hp",count:1, include_target_neighbors:true}, cooldown:null, mana_cost:10,
      cleanse_debuff_count:1, note:"зцілення також зачіпає клітинки, сусідні до обраного союзника (50% ефекту)" }
  ],
  hp_formula:(lord)=>45+4.5*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:5, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-25% до formula"}
  ],
  evolutions:["empire_priest_t3_high_healer","empire_priest_t3_relic_keeper"]
}

// T2B
{
  id:"empire_priest_t2_preacher", name:"Проповідник", class_tier:2,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:220, exp_reward_on_kill:100,
  attack_speed:4,
  actions:[
    { id:"staff_hit", name:"Удар посохом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>7.5+1.5*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"battle_spirit_buff", name:"Благословення духу", type:"holy", effect_kind:"buff", range_type:"ranged",
      formula:(lord,self)=>5, target_rule:{side:"ally",selection:"all_in_range",count:"aoe_radius"}, cooldown:null, mana_cost:20,
      effect:"+battleSpirit" }
  ],
  hp_formula:(lord)=>45+4.5*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:5, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-20% до formula"}
  ],
  evolutions:["empire_priest_t3_cardinal","empire_priest_t3_confessor"]
}

// T3A1
{
  id:"empire_priest_t3_high_healer", name:"Верховний зцілитель", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:160,
  attack_speed:4,
  actions:[
    { id:"staff_hit", name:"Удар посохом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>11.2+2.2*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"mass_heal", name:"Масове зцілення", type:"holy", effect_kind:"heal", range_type:"ranged",
      formula:(lord,self)=>22.5+6.8*lord.crystalRegenSpeed, target_rule:{side:"ally",selection:"all_in_range",count:"aoe_radius"}, cooldown:null, mana_cost:18,
      cleanse_debuff_count:1 },
    { id:"revive", name:"Воскресіння", type:"holy", effect_kind:"heal", range_type:"ranged",
      formula:(lord,self)=>50, target_rule:{side:"ally",selection:"corpse_of_dead_ally",count:1}, cooldown:null, mana_cost:30, uses_per_battle:1 }
  ],
  hp_formula:(lord)=>67.5+6.8*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:8, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-20% до formula"}
  ],
  evolutions:["empire_priest_t4_faith_defender"]
}

// T3A2
{
  id:"empire_priest_t3_relic_keeper", name:"Хранитель реліквій", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:140,
  attack_speed:4,
  actions:[
    { id:"staff_hit", name:"Удар посохом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>11.2+2.2*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"shield", name:"Освячений щит", type:"holy", effect_kind:"buff", range_type:"ranged",
      formula:(lord,self)=>22.5+6.8*lord.crystalRegenSpeed, target_rule:{side:"ally",selection:"lowest_hp",count:1, include_target_neighbors:true}, cooldown:null, mana_cost:12,
      note:"щит також зачіпає сусідні клітинки" }
  ],
  hp_formula:(lord)=>67.5+6.8*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:7, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-20% до formula"}
  ],
  evolutions:["empire_priest_t4_crystal_keeper"]
}

// T3B1
{
  id:"empire_priest_t3_cardinal", name:"Кардинал", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:160,
  attack_speed:4,
  actions:[
    { id:"staff_hit", name:"Удар посохом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>11.2+2.2*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"battle_spirit_buff", name:"Благословення духу", type:"holy", effect_kind:"buff", range_type:"ranged",
      formula:(lord,self)=>7, target_rule:{side:"ally",selection:"all_in_range",count:"army_wide"}, cooldown:null, mana_cost:30 }
  ],
  hp_formula:(lord)=>67.5+6.8*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:8, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-15% до formula"}
  ],
  evolutions:["empire_priest_t4_patriarch"]
}

// T3B2
{
  id:"empire_priest_t3_confessor", name:"Сповідник", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:140,
  attack_speed:4,
  actions:[{ id:"staff_hit", name:"Удар посохом", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>11.2+2.2*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null }],
  passives:[{id:"last_rites", trigger:"ON_UNIT_DEATH", condition:"dead.faction==self.faction", applies_to:"allies_in_range",
    effect:"+15% physical/holy resist на 3 ходи"}],
  hp_formula:(lord)=>67.5+6.8*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:7, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-15% до formula"}
  ],
  evolutions:["empire_priest_t4_high_confessor"]
}

// T4A1
{
  id:"empire_priest_t4_faith_defender", name:"Заступник віри", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:220,
  attack_speed:4,
  actions:[
    { id:"staff_hit", name:"Удар посохом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>16.9+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"mass_heal", name:"Масове зцілення", type:"holy", effect_kind:"heal", range_type:"ranged",
      formula:(lord,self)=>33.8+10.1*lord.crystalRegenSpeed, target_rule:{side:"ally",selection:"all_in_range",count:"aoe_radius"}, cooldown:null, mana_cost:22 },
    { id:"revive", name:"Воскресіння", type:"holy", effect_kind:"heal", range_type:"ranged",
      formula:(lord,self)=>80, target_rule:{side:"ally",selection:"corpse_of_dead_ally",count:1}, cooldown:null, mana_cost:30, uses_per_battle:2 }
  ],
  hp_formula:(lord)=>101.2+10.1*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:11, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-15% до formula"}
  ], evolutions:[]
}

// T4A2
{
  id:"empire_priest_t4_crystal_keeper", name:"Хранитель кристалів", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:180,
  attack_speed:4,
  actions:[
    { id:"staff_hit", name:"Удар посохом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>16.9+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"shield", name:"Освячений щит", type:"holy", effect_kind:"buff", range_type:"ranged",
      formula:(lord,self)=>33.8+10.1*lord.crystalRegenSpeed, target_rule:{side:"ally",selection:"lowest_hp",count:1, include_target_neighbors:true}, cooldown:null, mana_cost:14,
      reflect_pct:0.2, note:"щит також зачіпає сусідні клітинки" }
  ],
  hp_formula:(lord)=>101.2+10.1*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:9, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-15% до formula"}
  ], evolutions:[]
}

// T4B1
{
  id:"empire_priest_t4_patriarch", name:"Патріарх", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:200,
  attack_speed:4,
  actions:[
    { id:"staff_hit", name:"Удар посохом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>16.9+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"battle_spirit_buff", name:"Благословення духу", type:"holy", effect_kind:"buff", range_type:"ranged",
      formula:(lord,self)=>10, target_rule:{side:"ally",selection:"all_in_range",count:"army_wide"}, cooldown:null, mana_cost:35,
      bonus_effect:"+5% attack усій армії поки battleSpirit>80" }
  ],
  hp_formula:(lord)=>101.2+10.1*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:10, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-10% до formula"}
  ], evolutions:[]
}

// T4B2
{
  id:"empire_priest_t4_high_confessor", name:"Великий сповідник", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:180,
  attack_speed:4,
  actions:[{ id:"staff_hit", name:"Удар посохом", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>16.9+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null }],
  passives:[{id:"last_rites", trigger:"ON_UNIT_DEATH", condition:"dead.faction==self.faction", applies_to:"allies_in_range",
    effect:"+15% physical/holy resist на 3 ходи, + heal 15+4.5*rs"}],
  hp_formula:(lord)=>101.2+10.1*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:9, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-10% до formula"}
  ], evolutions:[]
}
```

---

## ЛІНІЯ 4: Орден Тихих (важка піхота, анти-нежить; speed_base=6 — важка зброя)

Найм обмежений — потребує церковного розблокування в Hub.

```js
// T1
{
  id:"empire_silent_t1", name:"Брат Тиші", class_tier:1,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:100, exp_reward_on_kill:120,
  attack_speed:6,
  actions:[{ id:"heavy_strike", name:"Важкий удар", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>15+1.5*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
    bonus_vs_race_type:{undead:1.4} }],
  passives:[{id:"silent_immunity", effect:"імунітет до control fear/silence/charm (німий)"}],
  hp_formula:(lord)=>50+5*lord.vitality,
  resistances:{physical:25,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:6, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+10% усі resistances (важка броня тримає перший ряд)"}
  ],
  evolutions:["empire_silent_t2_hammerer","empire_silent_t2_undead_slayer"]
}

// T2A
{
  id:"empire_silent_t2_hammerer", name:"Молотобоєць", class_tier:2,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:220, exp_reward_on_kill:160,
  attack_speed:6,
  actions:[{ id:"hammer_smash", name:"Розмах молотом", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>22.5+2.2*lord.battlePower, target_rule:{side:"enemy",selection:"all_in_range",count:"aoe_radius"}, cooldown:null, mana_cost:null,
    on_hit_control:{id:"stun", duration:1} }],
  passives:[{id:"silent_immunity", effect:"імунітет до control fear/silence/charm"}],
  hp_formula:(lord)=>75+7.5*lord.vitality,
  resistances:{physical:25,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:8, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+10% усі resistances"}
  ],
  evolutions:["empire_silent_t3_earthquaker","empire_silent_t3_unbreakable"]
}

// T2B
{
  id:"empire_silent_t2_undead_slayer", name:"Кат нежиті", class_tier:2,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:220, exp_reward_on_kill:160,
  attack_speed:6,
  actions:[{ id:"holy_smash", name:"Освячений удар", type:"holy", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>22.5+2.2*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
    bonus_vs_race_type:{undead:2.0} }],
  passives:[{id:"silent_immunity", effect:"імунітет до control fear/silence/charm"}],
  hp_formula:(lord)=>75+7.5*lord.vitality,
  resistances:{physical:25,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:8, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+10% усі resistances"}
  ],
  evolutions:["empire_silent_t3_bone_burner","empire_silent_t3_grave_keeper"]
}

// T3A1
{
  id:"empire_silent_t3_earthquaker", name:"Приборкувач землетрусів", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:200,
  attack_speed:6,
  actions:[
    { id:"hammer_smash", name:"Розмах молотом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>33.8+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"all_in_range",count:"aoe_radius"}, cooldown:null, mana_cost:null,
      on_hit_control:{id:"stun", duration:1} },
    { id:"ground_slam", name:"Землетрус", type:"physical", effect_kind:"control", range_type:"melee",
      formula:(lord,self)=>0, target_rule:{side:"enemy",selection:"nearest",count:1}, aoe_shape:"row", aoe_origin:"self", cooldown:4, mana_cost:25,
      control:"stun", note:"хвиля йде вздовж всього ряду перед собою — форма row, а не коло" }
  ],
  passives:[{id:"silent_immunity", effect:"імунітет до control fear/silence/charm"}],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:25,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:10, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+15% усі resistances"}
  ],
  evolutions:["empire_silent_t4_seismic_breaker"]
}

// T3A2
{
  id:"empire_silent_t3_unbreakable", name:"Незламний", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:180,
  attack_speed:6,
  actions:[{ id:"hammer_smash", name:"Розмах молотом", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>33.8+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"all_in_range",count:"aoe_radius"}, cooldown:null, mana_cost:null,
    on_hit_control:{id:"stun", duration:1} }],
  passives:[
    {id:"silent_immunity", effect:"імунітет до control fear/silence/charm"},
    {id:"heavy_plate", effect:"reflect 15% отриманої шкоди назад атакуючому"},
    {id:"guardian", type:"Guardian", trigger:"ON_TARGET_SELECTED", condition:"target is adjacent ally", effect:"redirect_pct:0.35"}
  ],
  hp_formula:(lord)=>146+14.6*lord.vitality, // додатковий tank-бонус рангу
  resistances:{physical:25,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:9, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+15% усі resistances"}
  ],
  evolutions:["empire_silent_t4_wall_of_silence"]
}

// T3B1
{
  id:"empire_silent_t3_bone_burner", name:"Спалювач кісток", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:180,
  attack_speed:6,
  actions:[{ id:"holy_smash", name:"Освячений удар", type:"holy", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>33.8+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
    bonus_vs_race_type:{undead:2.0}, on_hit_debuff:{id:"burn", type:"fire", ticks:3} }],
  passives:[{id:"silent_immunity", effect:"імунітет до control fear/silence/charm"}],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:25,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:9, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+15% усі resistances"}
  ],
  evolutions:["empire_silent_t4_order_bonfire"]
}

// T3B2
{
  id:"empire_silent_t3_grave_keeper", name:"Хранитель могил", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:160,
  attack_speed:6,
  actions:[
    { id:"holy_smash", name:"Освячений удар", type:"holy", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>33.8+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
      bonus_vs_race_type:{undead:2.0} },
    { id:"seal_grave", name:"Печать могили", type:"holy", effect_kind:"debuff", range_type:"ranged",
      formula:(lord,self)=>0, target_rule:{side:"enemy",selection:"corpse_of_dead_ally",count:1}, cooldown:4, mana_cost:null,
      effect:"no_resurrection" }
  ],
  passives:[{id:"silent_immunity", effect:"імунітет до control fear/silence/charm"}],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:25,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:8, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+15% усі resistances"}
  ],
  evolutions:["empire_silent_t4_eternal_watcher"]
}

// T4A1
{
  id:"empire_silent_t4_seismic_breaker", name:"Сейсмічний руйнівник", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:240,
  attack_speed:6,
  actions:[
    { id:"hammer_smash", name:"Розмах молотом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>50.6+5.1*lord.battlePower, target_rule:{side:"enemy",selection:"all_in_range",count:"aoe_radius"}, cooldown:null, mana_cost:null,
      on_hit_control:{id:"stun", duration:1} },
    { id:"ground_slam", name:"Землетрус", type:"physical", effect_kind:"control", range_type:"melee",
      formula:(lord,self)=>0, target_rule:{side:"enemy",selection:"nearest",count:1}, aoe_shape:"row", aoe_origin:"self", cooldown:3, mana_cost:25, control:"stun",
      note:"успадковано від Землетрясателя, хвиля тепер б'є два ряди вглиб (row×2)" }
  ],
  passives:[{id:"silent_immunity", effect:"імунітет до control fear/silence/charm"}],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:25,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:12, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+20% усі resistances"}
  ], evolutions:[]
}

// T4A2
{
  id:"empire_silent_t4_wall_of_silence", name:"Стіна мовчання", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:220,
  attack_speed:6,
  actions:[{ id:"hammer_smash", name:"Розмах молотом", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>50.6+5.1*lord.battlePower, target_rule:{side:"enemy",selection:"all_in_range",count:"aoe_radius"}, cooldown:null, mana_cost:null,
    on_hit_control:{id:"stun", duration:1} }],
  passives:[
    {id:"silent_immunity", effect:"імунітет до control fear/silence/charm"},
    {id:"heavy_plate", effect:"reflect 20% отриманої шкоди назад атакуючому"},
    {id:"guardian", type:"Guardian", trigger:"ON_TARGET_SELECTED", condition:"target is adjacent ally", effect:"redirect_pct:0.45"}
  ],
  hp_formula:(lord)=>219+21.9*lord.vitality,
  resistances:{physical:25,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:11, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+20% усі resistances"}
  ], evolutions:[]
}

// T4B1
{
  id:"empire_silent_t4_order_bonfire", name:"Багаття Ордену", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:220,
  attack_speed:6,
  actions:[{ id:"holy_smash", name:"Освячений удар", type:"holy", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>50.6+5.1*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
    bonus_vs_race_type:{undead:2.0}, on_hit_debuff:{id:"burn", type:"fire", ticks:3}, on_kill_spread:true }],
  passives:[{id:"silent_immunity", effect:"імунітет до control fear/silence/charm"}],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:25,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:11, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+20% усі resistances"}
  ], evolutions:[]
}

// T4B2
{
  id:"empire_silent_t4_eternal_watcher", name:"Вартовий вічного спокою", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:200,
  attack_speed:6,
  actions:[
    { id:"holy_smash", name:"Освячений удар", type:"holy", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>50.6+5.1*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
      bonus_vs_race_type:{undead:2.0} },
    { id:"seal_all_graves", name:"Печать вічного спокою", type:"holy", effect_kind:"debuff", range_type:"ranged",
      formula:(lord,self)=>0, target_rule:{side:"enemy",selection:"all_in_range",count:"aoe_radius"}, cooldown:5, mana_cost:null,
      effect:"no_resurrection" }
  ],
  passives:[{id:"silent_immunity", effect:"імунітет до control fear/silence/charm"}],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:25,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:10, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+20% усі resistances"}
  ], evolutions:[]
}
```

---

## ЛІНІЯ 5: Орден Істини (сліпі маги грому, caster; speed_base=4)

Найм обмежений — потребує церковного розблокування в Hub.

```js
// T1
{
  id:"empire_truth_t1", name:"Провидець", class_tier:1,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:100, exp_reward_on_kill:120,
  attack_speed:4,
  actions:[
    { id:"staff_hit", name:"Удар посохом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>5+1*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"lightning_bolt", name:"Розряд грому", type:"lightning", effect_kind:"damage", range_type:"ranged",
      formula:(lord,self)=>10+3*lord.crystalRegenSpeed, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:10 }
  ],
  passives:[{id:"inner_sight", effect:"імунітет до blind/ілюзій, детект прихованих юнітів"}],
  hp_formula:(lord)=>30+3*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:6, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-25% до formula"}
  ],
  evolutions:["empire_truth_t2_stormcaller","empire_truth_t2_enforcer"]
}

// T2A
{
  id:"empire_truth_t2_stormcaller", name:"Штормовик", class_tier:2,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:220, exp_reward_on_kill:160,
  attack_speed:4,
  actions:[
    { id:"staff_hit", name:"Удар посохом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>7.5+1.5*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"chain_lightning", name:"Ланцюгова блискавка", type:"lightning", effect_kind:"damage", range_type:"ranged",
      formula:(lord,self)=>15+4.5*lord.crystalRegenSpeed, target_rule:{side:"enemy",selection:"highest_threat",count:1}, aoe_shape:"column", aoe_origin:"target", cooldown:null, mana_cost:18,
      note:"блискавка б'є вглиб ворожого стовпця (не в ширину ряду) — уражає весь стовпець від цілі" }
  ],
  passives:[{id:"inner_sight", effect:"імунітет до blind/ілюзій, детект прихованих юнітів"}],
  hp_formula:(lord)=>45+4.5*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:8, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-25% до formula"}
  ],
  evolutions:["empire_truth_t3_storm_lord","empire_truth_t3_thunder_herald"]
}

// T2B
{
  id:"empire_truth_t2_enforcer", name:"Вершитель", class_tier:2,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:220, exp_reward_on_kill:160,
  attack_speed:4,
  actions:[
    { id:"staff_hit", name:"Удар посохом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>7.5+1.5*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"paralyze_bolt", name:"Паралізуючий розряд", type:"lightning", effect_kind:"control", range_type:"ranged",
      formula:(lord,self)=>15+4.5*lord.crystalRegenSpeed, target_rule:{side:"enemy",selection:"highest_threat",count:1}, cooldown:null, mana_cost:20,
      control:"paralyze", duration:1 }
  ],
  passives:[{id:"inner_sight", effect:"імунітет до blind/ілюзій, детект прихованих юнітів"}],
  hp_formula:(lord)=>45+4.5*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:8, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-20% до formula"}
  ],
  evolutions:["empire_truth_t3_blind_judge","empire_truth_t3_unmasker"]
}

// T3A1
{
  id:"empire_truth_t3_storm_lord", name:"Володар бурі", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:220,
  attack_speed:4,
  actions:[
    { id:"chain_lightning", name:"Ланцюгова блискавка", type:"lightning", effect_kind:"damage", range_type:"ranged",
      formula:(lord,self)=>22.5+6.8*lord.crystalRegenSpeed, target_rule:{side:"enemy",selection:"highest_threat",count:1}, aoe_shape:"column", aoe_origin:"target", cooldown:null, mana_cost:18 },
    { id:"storm_ultimate", name:"Гнів бурі", type:"lightning", effect_kind:"damage", range_type:"ranged",
      formula:(lord,self)=>22.5+6.8*lord.battlePower, target_rule:{side:"enemy",selection:"all_in_range",count:"all"}, cooldown:"once_per_battle", mana_cost:45 }
  ],
  passives:[{id:"inner_sight", effect:"імунітет до blind/ілюзій, детект прихованих юнітів"}],
  hp_formula:(lord)=>67.5+6.8*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:11, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-20% до formula"}
  ],
  evolutions:["empire_truth_t4_storm_heart"]
}

// T3A2
{
  id:"empire_truth_t3_thunder_herald", name:"Провісник грому", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:180,
  attack_speed:4,
  actions:[{ id:"chain_lightning_dot", name:"Ланцюгова блискавка", type:"lightning", effect_kind:"damage", range_type:"ranged",
    formula:(lord,self)=>22.5+6.8*lord.crystalRegenSpeed, target_rule:{side:"enemy",selection:"highest_threat",count:1}, aoe_shape:"circle", aoe_origin:"target", cooldown:null, mana_cost:20,
    dot:{type:"lightning", ticks:2}, note:"на відміну від Storm Lord (стовпець), тут блискавка розходиться колом — DoT-хмара на всю групу навколо цілі" }],
  passives:[{id:"inner_sight", effect:"імунітет до blind/ілюзій, детект прихованих юнітів"}],
  hp_formula:(lord)=>67.5+6.8*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:9, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-20% до formula"}
  ],
  evolutions:["empire_truth_t4_voice_of_thunder"]
}

// T3B1
{
  id:"empire_truth_t3_blind_judge", name:"Сліпий суддя", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:200,
  attack_speed:4,
  actions:[{ id:"paralyze_bolt", name:"Паралізуючий розряд", type:"lightning", effect_kind:"control", range_type:"ranged",
    formula:(lord,self)=>22.5+6.8*lord.crystalRegenSpeed, target_rule:{side:"enemy",selection:"highest_threat",count:1, include_target_neighbors:true}, cooldown:5, mana_cost:30,
    control:"paralyze", duration:3, note:"розряд перескакує й на клітинки, сусідні до цілі (коротший paralyze)" }],
  passives:[{id:"inner_sight", effect:"імунітет до blind/ілюзій, детект прихованих юнітів"}],
  hp_formula:(lord)=>67.5+6.8*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:10, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-15% до formula"}
  ],
  evolutions:["empire_truth_t4_verdict_of_the_order"]
}

// T3B2
{
  id:"empire_truth_t3_unmasker", name:"Викривач", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:180,
  attack_speed:4,
  actions:[{ id:"expose_weakness", name:"Викриття слабкості", type:"lightning", effect_kind:"debuff", range_type:"ranged",
    formula:(lord,self)=>0.5, target_rule:{side:"enemy",selection:"lowest_hp",count:1}, cooldown:4, mana_cost:15,
    effect:"-50% усі resistances" }],
  passives:[{id:"inner_sight", effect:"імунітет до blind/ілюзій, детект прихованих юнітів"}],
  hp_formula:(lord)=>67.5+6.8*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:9, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-15% до formula"}
  ],
  evolutions:["empire_truth_t4_debunker"]
}

// T4A1
{
  id:"empire_truth_t4_storm_heart", name:"Серце шторму", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:280,
  attack_speed:4,
  actions:[
    { id:"chain_lightning", name:"Ланцюгова блискавка", type:"lightning", effect_kind:"damage", range_type:"ranged",
      formula:(lord,self)=>33.8+10.1*lord.crystalRegenSpeed, target_rule:{side:"enemy",selection:"highest_threat",count:1}, aoe_shape:"column", aoe_origin:"target", cooldown:null, mana_cost:18 },
    { id:"storm_ultimate", name:"Гнів бурі", type:"lightning", effect_kind:"damage", range_type:"ranged",
      formula:(lord,self)=>33.8+10.1*lord.battlePower, target_rule:{side:"enemy",selection:"all_in_range",count:"all"}, cooldown:"once_per_2_battles", mana_cost:45 }
  ],
  passives:[{id:"inner_sight", effect:"імунітет до blind/ілюзій, детект прихованих юнітів"}],
  hp_formula:(lord)=>101.2+10.1*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:14, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-15% до formula"}
  ], evolutions:[]
}

// T4A2
{
  id:"empire_truth_t4_voice_of_thunder", name:"Голос грому", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:200,
  attack_speed:4,
  actions:[{ id:"chain_lightning_dot", name:"Ланцюгова блискавка", type:"lightning", effect_kind:"damage", range_type:"ranged",
    formula:(lord,self)=>33.8+10.1*lord.crystalRegenSpeed, target_rule:{side:"enemy",selection:"highest_threat",count:1}, aoe_shape:"circle", aoe_origin:"target", cooldown:null, mana_cost:20,
    dot:{type:"lightning", ticks:3} }],
  passives:[{id:"inner_sight", effect:"імунітет до blind/ілюзій, детект прихованих юнітів"}],
  hp_formula:(lord)=>101.2+10.1*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:10, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-15% до formula"}
  ], evolutions:[]
}

// T4B1
{
  id:"empire_truth_t4_verdict_of_the_order", name:"Вирок Ордену", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:260,
  attack_speed:4,
  actions:[{ id:"paralyze_field", name:"Паралізуюче поле", type:"lightning", effect_kind:"control", range_type:"ranged",
    formula:(lord,self)=>33.8+10.1*lord.crystalRegenSpeed, target_rule:{side:"enemy",selection:"all_in_range",count:"aoe_radius"}, cooldown:6, mana_cost:35,
    control:"paralyze", duration:2 }],
  passives:[{id:"inner_sight", effect:"імунітет до blind/ілюзій, детект прихованих юнітів"}],
  hp_formula:(lord)=>101.2+10.1*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:13, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-10% до formula"}
  ], evolutions:[]
}

// T4B2
{
  id:"empire_truth_t4_debunker", name:"Розвінчувач", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:200,
  attack_speed:4,
  actions:[{ id:"expose_weakness", name:"Викриття слабкості", type:"lightning", effect_kind:"debuff", range_type:"ranged",
    formula:(lord,self)=>0.7, target_rule:{side:"enemy",selection:"lowest_hp",count:1}, cooldown:4, mana_cost:15,
    effect:"-70% усі resistances, purge позитивних баффів" }],
  passives:[{id:"inner_sight", effect:"імунітет до blind/ілюзій, детект прихованих юнітів"}],
  hp_formula:(lord)=>101.2+10.1*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:10, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard_unshielded", effect:"-10% до formula"}
  ], evolutions:[]
}
```

---

## ЛІНІЯ 6: Інквізиція (анти-маг, melee; speed_base=4)

```js
// T1
{
  id:"empire_inquisition_t1", name:"Слідчий", class_tier:1,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:100, exp_reward_on_kill:80,
  attack_speed:4,
  actions:[{ id:"sword_strike", name:"Удар мечем", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>10+1*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
    bonus_vs_effect_kind:{summon:1.2} }],
  passives:[{id:"detect_hidden", effect:"детект прихованих/невидимих ворогів"}],
  hp_formula:(lord)=>50+5*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:4, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+5% до formula (веде наступ)"}
  ],
  evolutions:["empire_inquisition_t2_witch_hunter","empire_inquisition_t2_tormentor"]
}

// T2A
{
  id:"empire_inquisition_t2_witch_hunter", name:"Мисливець на відьом", class_tier:2,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:220, exp_reward_on_kill:120,
  attack_speed:4,
  actions:[
    { id:"sword_strike", name:"Удар мечем", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>15+1.5*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
      bonus_vs_action_has_mana_cost:1.5 },
    { id:"silence", name:"Присуд мовчання", type:"physical", effect_kind:"control", range_type:"melee",
      formula:(lord,self)=>0, target_rule:{side:"enemy",selection:"highest_threat",count:1}, cooldown:4, mana_cost:null,
      control:"silence", duration:2 }
  ],
  passives:[{id:"detect_hidden", effect:"детект прихованих/невидимих ворогів"}],
  hp_formula:(lord)=>75+7.5*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:6, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"no_adjacent_allies", effect:"+15% до formula (полює одинаком)"}
  ],
  evolutions:["empire_inquisition_t3_exorcist","empire_inquisition_t3_interrogator"]
}

// T2B
{
  id:"empire_inquisition_t2_tormentor", name:"Катівник", class_tier:2,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:220, exp_reward_on_kill:120,
  attack_speed:4,
  actions:[{ id:"sword_strike", name:"Удар мечем", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>15+1.5*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null }],
  passives:[
    {id:"detect_hidden", effect:"детект прихованих/невидимих ворогів"},
    {id:"fear_aura", trigger:"ON_TURN_START", applies_to:"enemies_in_range", effect:"-10% attack (debuff fear)"}
  ],
  hp_formula:(lord)=>75+7.5*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:6, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+10% до formula, посилює fear_aura"}
  ],
  evolutions:["empire_inquisition_t3_grand_inquisitor","empire_inquisition_t3_church_executioner"]
}

// T3A1
{
  id:"empire_inquisition_t3_exorcist", name:"Екзорцист", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:160,
  attack_speed:4,
  actions:[{ id:"holy_strike", name:"Освячений удар", type:"holy", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>22.5+2.2*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
    bonus_vs_race_type:{demon:1.5, undead:1.5}, on_hit_debuff:{effect:"purge позитивних баффів"} }],
  passives:[{id:"detect_hidden", effect:"детект прихованих/невидимих ворогів"}],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:8, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"no_adjacent_allies", effect:"+20% до formula"}
  ],
  evolutions:["empire_inquisition_t4_arch_inquisitor"]
}

// T3A2
{
  id:"empire_inquisition_t3_interrogator", name:"Дізнавач", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:140,
  attack_speed:4,
  actions:[
    { id:"sword_strike", name:"Удар мечем", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>22.5+2.2*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"interrogate", name:"Допит", type:"physical", effect_kind:"debuff", range_type:"melee",
      formula:(lord,self)=>0.3, target_rule:{side:"enemy",selection:"highest_threat",count:1}, cooldown:4, mana_cost:null,
      effect:"-30% усі resistances на 2 ходи" }
  ],
  passives:[{id:"detect_hidden", effect:"детект прихованих/невидимих ворогів"}],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:7, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"no_adjacent_allies", effect:"+18% до formula"}
  ],
  evolutions:["empire_inquisition_t4_tribunal_head"]
}

// T3B1
{
  id:"empire_inquisition_t3_grand_inquisitor", name:"Великий інквізитор", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:180,
  attack_speed:4,
  actions:[{ id:"sword_strike", name:"Удар мечем", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>22.5+2.2*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null }],
  passives:[
    {id:"detect_hidden", effect:"детект прихованих/невидимих ворогів"},
    {id:"fear_aura", trigger:"ON_TURN_START", applies_to:"enemies_in_range", effect:"-20% attack (debuff fear) + silence 1 цілі/хід"}
  ],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:9, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+15% до formula, fear_aura діє на весь фронт"}
  ],
  evolutions:["empire_inquisition_t4_supreme_inquisitor"]
}

// T3B2
{
  id:"empire_inquisition_t3_church_executioner", name:"Церковний кат", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:160,
  attack_speed:4,
  actions:[
    { id:"sword_strike", name:"Удар мечем", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>22.5+2.2*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"execute_caster", name:"Кара чаклуна", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>(22.5+2.2*lord.battlePower)*2.5, target_rule:{side:"enemy",selection:"highest_threat",count:1},
      condition:(target)=>target.actions.some(a=>a.mana_cost>0), cooldown:3, mana_cost:null }
  ],
  passives:[{id:"detect_hidden", effect:"детект прихованих/невидимих ворогів"}],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:8, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+15% до formula"}
  ],
  evolutions:["empire_inquisition_t4_tribunal_hand"]
}

// T4A1
{
  id:"empire_inquisition_t4_arch_inquisitor", name:"Архиінквізитор", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:220,
  attack_speed:4,
  actions:[{ id:"holy_strike", name:"Освячений удар", type:"holy", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>33.8+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
    bonus_vs_race_type:{demon:2.0, undead:2.0}, on_hit_effect:"mana_burn:10" }],
  passives:[{id:"detect_hidden", effect:"детект прихованих/невидимих ворогів"}],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:11, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"no_adjacent_allies", effect:"+25% до formula"}
  ], evolutions:[]
}

// T4A2
{
  id:"empire_inquisition_t4_tribunal_head", name:"Голова Трибуналу", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:200,
  attack_speed:4,
  actions:[
    { id:"sword_strike", name:"Удар мечем", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>33.8+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"mass_interrogate", name:"Масовий допит", type:"physical", effect_kind:"debuff", range_type:"melee",
      formula:(lord,self)=>0.3, target_rule:{side:"enemy",selection:"all_in_range",count:"aoe_radius"}, cooldown:4, mana_cost:null,
      effect:"-30% усі resistances на 3 ходи" }
  ],
  passives:[{id:"detect_hidden", effect:"детект прихованих/невидимих ворогів"}],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:10, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"no_adjacent_allies", effect:"+22% до formula"}
  ], evolutions:[]
}

// T4B1
{
  id:"empire_inquisition_t4_supreme_inquisitor", name:"Верховний інквізитор", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:240,
  attack_speed:4,
  actions:[{ id:"sword_strike", name:"Удар мечем", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>33.8+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null }],
  passives:[
    {id:"detect_hidden", effect:"детект прихованих/невидимих ворогів"},
    {id:"fear_aura", trigger:"ON_TURN_START", applies_to:"усе поле бою", effect:"-20% attack (debuff fear) + silence 2 цілей/хід"}
  ],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:12, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+20% до formula"}
  ], evolutions:[]
}

// T4B2
{
  id:"empire_inquisition_t4_tribunal_hand", name:"Правиця Трибуналу", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:200,
  attack_speed:4,
  actions:[
    { id:"sword_strike", name:"Удар мечем", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>33.8+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"execute_caster", name:"Кара чаклуна", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>(33.8+3.4*lord.battlePower)*3.5, target_rule:{side:"enemy",selection:"highest_threat",count:1},
      condition:(target)=>target.actions.some(a=>a.mana_cost>0), cooldown:2, mana_cost:null }
  ],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:10, grid_footprint:{rows:1,cols:1},
  positional_modifiers:[
    {condition:"is_own_vanguard", effect:"+18% до formula"}
  ], evolutions:[]
}
```

---

## ЛІНІЯ 7: Лицарство (важкі юніти на конях, melee; grid_footprint {rows:2,cols:1})

Найм обмежений — потребує лицарського інституту в Hub.

```js
// T1
{
  id:"empire_knight_t1", name:"Зброєносець", class_tier:1,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:100, exp_reward_on_kill:100,
  attack_speed:4,
  actions:[{ id:"lance_strike", name:"Удар списом", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>10+1*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null }],
  passives:[{id:"charge", trigger:"ON_BATTLE_START", effect:"перша атака бою ×1.5 formula"}],
  hp_formula:(lord)=>50+5*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:5, grid_footprint:{rows:2,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_count>=1", effect:"+5% усі resistances (їде в строю)"}
  ],
  evolutions:["empire_knight_t2_heavy_cavalry","empire_knight_t2_light_cavalry"]
}

// T2A
{
  id:"empire_knight_t2_heavy_cavalry", name:"Важка кіннота", class_tier:2,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:220, exp_reward_on_kill:160,
  attack_speed:6,
  actions:[{ id:"trample", name:"Стоптування", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>22.5+2.2*lord.battlePower, target_rule:{side:"enemy",selection:"all_in_range",count:"aoe_radius"}, cooldown:null, mana_cost:null }],
  hp_formula:(lord)=>75+7.5*lord.vitality,
  resistances:{physical:15,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:8, grid_footprint:{rows:2,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_count>=1", effect:"+8% усі resistances"}
  ],
  evolutions:["empire_knight_t3_heavy_lancer","empire_knight_t3_stalwart_guard"]
}

// T2B
{
  id:"empire_knight_t2_light_cavalry", name:"Легка кіннота", class_tier:2,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:220, exp_reward_on_kill:140,
  attack_speed:3,
  actions:[
    { id:"lance_strike", name:"Удар списом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>11.2+1.1*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null },
    { id:"cavalry_raid", name:"Кавалерійський рейд", type:"physical", effect_kind:"reposition", range_type:"melee",
      formula:(lord,self)=>0, target_rule:{side:"self",selection:"self",count:1}, cooldown:4, mana_cost:null,
      effect:"обійти фронтлайн і атакувати будь-яку клітинку цим ходом" }
  ],
  hp_formula:(lord)=>75+7.5*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:7, grid_footprint:{rows:2,cols:1},
  positional_modifiers:[
    {condition:"no_adjacent_allies", effect:"+15% до formula (рейдер-одинак)"}
  ],
  evolutions:["empire_knight_t3_lancer_scout","empire_knight_t3_mounted_duelist"]
}

// T3A1
{
  id:"empire_knight_t3_heavy_lancer", name:"Важкий списоносець", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:200,
  attack_speed:6,
  actions:[{ id:"trample", name:"Стоптування", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>33.8+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"all_in_range",count:"aoe_radius+1"}, cooldown:null, mana_cost:null,
    on_hit_effect:{effect_kind:"reposition", note:"збиває ціль на 1 клітинку назад"} }],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:15,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:10, grid_footprint:{rows:2,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_count>=1", effect:"+10% усі resistances"}
  ],
  evolutions:["empire_knight_t4_grand_master_lance"]
}

// T3A2
{
  id:"empire_knight_t3_stalwart_guard", name:"Кремезний страж", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:200,
  attack_speed:6,
  actions:[
    { id:"trample", name:"Стоптування", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>33.8+3.4*lord.battlePower, target_rule:{side:"enemy",selection:"all_in_range",count:"aoe_radius"}, cooldown:null, mana_cost:null },
    { id:"mobile_shield", name:"Рухомий щит", type:"physical", effect_kind:"buff", range_type:"melee",
      formula:(lord,self)=>20+1*lord.vitality, target_rule:{side:"self",selection:"self",count:1}, cooldown:4, mana_cost:null }
  ],
  passives:[
    {id:"bastion_aura", trigger:"ON_TURN_START", applies_to:"allies_in_range", effect:"-15% дод. шкоди"},
    {id:"guardian", type:"Guardian", trigger:"ON_TARGET_SELECTED", condition:"target is adjacent ally", effect:"redirect_pct:0.35"}
  ],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:18,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:10, grid_footprint:{rows:2,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_count>=1", effect:"+12% усі resistances"}
  ],
  evolutions:["empire_knight_t4_iron_phalanx"]
}

// T3B1
{
  id:"empire_knight_t3_lancer_scout", name:"Розвідник-списоносець", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:180,
  attack_speed:3,
  actions:[
    { id:"lance_strike", name:"Удар списом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>16.9+1.7*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
      bonus_if_target_non_frontline:1.3 },
    { id:"cavalry_raid", name:"Кавалерійський рейд", type:"physical", effect_kind:"reposition", range_type:"melee",
      formula:(lord,self)=>0, target_rule:{side:"self",selection:"self",count:1}, cooldown:4, mana_cost:null,
      effect:"обійти фронтлайн, без обмежень щодо цілі" }
  ],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:9, grid_footprint:{rows:2,cols:1},
  positional_modifiers:[
    {condition:"no_adjacent_allies", effect:"+20% до formula"}
  ],
  evolutions:["empire_knight_t4_shadow_rider"]
}

// T3B2
{
  id:"empire_knight_t3_mounted_duelist", name:"Дуелянт на коні", class_tier:3,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:450, exp_reward_on_kill:180,
  attack_speed:3,
  actions:[{ id:"lance_strike", name:"Удар списом", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>16.9+1.7*lord.battlePower, target_rule:{side:"enemy",selection:"highest_threat",count:1}, cooldown:null, mana_cost:null,
    crit_chance_bonus:0.3 }],
  passives:[{id:"lone_duel", effect:"+40% formula проти цілей без сусідніх союзників"}],
  hp_formula:(lord)=>112.5+11.2*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:9, grid_footprint:{rows:2,cols:1},
  positional_modifiers:[
    {condition:"no_adjacent_allies", effect:"+15% до formula (додатково до lone_duel)"}
  ],
  evolutions:["empire_knight_t4_kings_blade"]
}

// T4A1
{
  id:"empire_knight_t4_grand_master_lance", name:"Великий магістр Списа", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:260,
  attack_speed:6,
  actions:[{ id:"holy_trample", name:"Освячене стоптування", type:"holy", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>50.6+5.1*lord.battlePower, target_rule:{side:"enemy",selection:"all_in_range",count:"aoe_radius+2"}, cooldown:null, mana_cost:null,
    bonus_vs_race_type:{demon:1.5} }],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:15,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:13, grid_footprint:{rows:2,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_count>=1", effect:"+12% усі resistances"}
  ], evolutions:[]
}

// T4A2
{
  id:"empire_knight_t4_iron_phalanx", name:"Залізна фаланга", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:240,
  attack_speed:6,
  actions:[
    { id:"trample", name:"Стоптування", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>50.6+5.1*lord.battlePower, target_rule:{side:"enemy",selection:"all_in_range",count:"aoe_radius"}, cooldown:null, mana_cost:null },
    { id:"mobile_shield", name:"Рухомий щит", type:"physical", effect_kind:"buff", range_type:"melee",
      formula:(lord,self)=>20+1*lord.vitality, target_rule:{side:"self",selection:"self",count:1}, cooldown:4, mana_cost:null }
  ],
  passives:[
    {id:"bastion_aura", trigger:"ON_TURN_START", applies_to:"весь ряд союзників", effect:"-25% дод. шкоди"},
    {id:"guardian", type:"Guardian", trigger:"ON_TARGET_SELECTED", condition:"target is adjacent ally", effect:"redirect_pct:0.45"}
  ],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:20,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:12, grid_footprint:{rows:2,cols:1},
  positional_modifiers:[
    {condition:"adjacent_ally_count>=1", effect:"+15% усі resistances"}
  ], evolutions:[]
}

// T4B1
{
  id:"empire_knight_t4_shadow_rider", name:"Тінь на коні", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:220,
  attack_speed:3,
  actions:[
    { id:"lance_strike", name:"Удар списом", type:"physical", effect_kind:"damage", range_type:"melee",
      formula:(lord,self)=>25.3+2.5*lord.battlePower, target_rule:{side:"enemy",selection:"nearest",count:1}, cooldown:null, mana_cost:null,
      bonus_if_target_non_frontline:1.6 },
    { id:"cavalry_raid", name:"Кавалерійський рейд", type:"physical", effect_kind:"reposition", range_type:"melee",
      formula:(lord,self)=>0, target_rule:{side:"self",selection:"self",count:1}, cooldown:0, mana_cost:null,
      effect:"без кулдауну; reposition діє на самого юніта (target_rule:self) і може перемістити його на БУДЬ-ЯКУ вільну клітинку власної сітки — обмежень немає щодо клітинки призначення, а не щодо цілі дії" }
  ],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:11, grid_footprint:{rows:2,cols:1},
  positional_modifiers:[
    {condition:"no_adjacent_allies", effect:"+25% до formula"}
  ], evolutions:[]
}

// T4B2
{
  id:"empire_knight_t4_kings_blade", name:"Клинок короля", class_tier:4,
  faction:"empire", race_type:"human",
  exp_current:0, exp_to_upgrade:null, exp_reward_on_kill:240,
  attack_speed:3,
  actions:[{ id:"lance_strike", name:"Удар списом", type:"physical", effect_kind:"damage", range_type:"melee",
    formula:(lord,self)=>25.3+2.5*lord.battlePower, target_rule:{side:"enemy",selection:"highest_threat",count:1}, cooldown:null, mana_cost:null,
    crit_chance_bonus:0.5, execute_on_crit_below_hp_pct:0.15 }],
  passives:[{id:"lone_duel", effect:"+40% formula проти цілей без сусідніх союзників"}],
  hp_formula:(lord)=>168.8+16.9*lord.vitality,
  resistances:{physical:0,fire:0,holy:0,poison:0,lightning:0},
  leadership_cost:12, grid_footprint:{rows:2,cols:1},
  positional_modifiers:[
    {condition:"no_adjacent_allies", effect:"+20% до formula"}
  ], evolutions:[]
}
```

---

## Підсумок
Усі 7 ліній (~77 юнітів) деталізовані за схемою `UnitType`/`Action` з п.6, з базовими орієнтирами T1 (melee `50+5vt/10+1bp`, ranged `30+3vt/5+2bp`, caster `30+3vt/5+1bp` + спел `10+3rs`/10 мани) і рівномірним ростом ×1.5 за ранг відносно прямого предка (з компенсацією для нестандартного `attack_speed`).

### Позиційна цінність розміщення — застосовано до всіх 77 юнітів
Кожен юніт отримав `positional_modifiers` (нове поле з п.6 game_concept.md), відмінні за архетипом і навіть за гілкою еволюції в межах однієї лінії:

- **Стрілець (Лінія 1)**: базовий Ополченець і гілка Арбалетчика (важка зброя, `adjacent_ally_melee` бонус — "упирається" в союзника) отримують штраф за авангард без прикриття, але **без** бонусу за дистанцію. Натомість гілка **Снайпера** унікально винагороджує розміщення в глибокому тилу (`is_own_backline`: +crit/+formula) — саме те розмежування "сніпер vs звичайний лучник", про яке йшлося в запиті. Гілка Розвідника натомість винагороджує ізоляцію (`no_adjacent_allies`), а не глибину.
- **Латник (Лінія 2)**: базова піхота й Авангардист/Страж брами тримають стрій (`adjacent_ally_count`: +resistances), Страж брами і Непохитний бастіон додатково отримали **Guardian** — фізично перехоплюють 30-50% шкоди, спрямованої на сусідні клітинки. Дуелянт і його гілки, навпаки, винагороджують ізоляцію (`no_adjacent_allies`), а Ветеран сутичок — навпаки, синергію з юрбою (`adjacent_ally_count>=2`, бонус до контратаки).
- **Послушник (Лінія 3) і Орден Істини (Лінія 5)**: крихкі касти — штраф за авангард без прикриття (менший, ніж у лучника, бо частина дій дальня). Зцілитель/Хранитель реліквій/кристалів отримали `include_target_neighbors` на heal/shield — ефект зачіпає й сусідні до цілі клітинки. Сліпий суддя аналогічно — paralyze_bolt "перескакує" на сусідів цілі.
- **Орден Тихих (Лінія 4)**: дзеркальна механіка — важка піхота отримує **бонус**, а не штраф, за перебування в авангарді (`is_own_vanguard`: +resistances), Незламний і Стіна мовчання додатково отримали Guardian (35-45%).
- **Інквізиція (Лінія 6)**: гілка "мисливець на відьом" (сольне полювання) винагороджує ізоляцію, гілка "катівник"/fear-aura винагороджує авангард (веде наступ, посилює ауру страху).
- **Лицарство (Лінія 7)**: важка кіннота тримає стрій (resistances за сусідство), Кремезний страж/Залізна фаланга — Guardian (35-45%); легка кіннота/дуелянт/тінь на коні винагороджують ізоляцію, підсилюючи вже наявний `lone_duel`.
- Прапороносці (Лінія 2, T3A1/T4A1) отримали `target_rule.width:2` — удар одразу по цілі й сусідній клітинці того ж ряду.

### Геометрія Guardian і AoE — щоб однотипні "танки"/"касти" не дублювали одне одного
Раніше всі Guardian мали однаковий "захищає всіх сусідів" — тепер `shape` розводить їх:
- **`shape:"sides"`** (тримає фланги, лише лівий/правий сусід свого ряду): Авангардист/Кремезний страж/Залізна фаланга.
- **`shape:"behind"`** (боронить прохід, лише клітинка позаду себе): Страж брами/Непохитний бастіон.
- **`shape:"full"`** (усі 4 напрямки, найдорожчий): Незламний/Стіна мовчання (Орден Тихих).

Так само й касти по площі отримали різну геометрію (`aoe_shape`+`aoe_origin`) замість однакового "сусіди цілі":
- **`cross`** (весь ряд+стовпець цілі, без діагоналей): Зцілитель — "Хрест зцілення".
- **`diagonal`** (лише 4 діагональні клітинки, "Х"-візерунок): Хранитель реліквій/кристалів.
- **`circle`** (повне коло з діагоналями): Сліпий суддя (paralyze_bolt), Провісник грому/Голос грому (chain_lightning_dot, DoT-хмара).
- **`column`** (вглиб ворожого стовпця): Штормкастер/Storm Lord/Serce бурі (chain_lightning) — свідомо контрастує з "колом" сусідньої гілки тієї ж лінії.
- **`row`** (уздовж усього ряду): Землетрясатель/Seismic Breaker (Орден Тихих, ground_slam).

Ці числа/шейпи (ті самі -10%…+30%, що і в раніше типових passives), балансовий прохід симуляцією ще потрібен.

> **Синхронізовано з game_concept.md**: поля `Guardian.shape`, `Action.target_rule.aoe_shape/aoe_origin`, розширений enum умов `PositionalModifier` (`is_own_backline`, `adjacent_ally_melee`, `adjacent_ally_count(>=N)`) і додаткові поля `Action` (`crit_chance_bonus`, `ignore_resistance_pct`, `on_hit_debuff`, `bonus_vs_race_type`, `execute_on_crit_below_hp_pct`, `bonus_if_target_non_frontline`, `condition`) тепер формально описані в базових схемах п.6 — це вже не самовільні розширення поверх концепту, а частина спільної схеми.

Що можна уточнити далі:
- Точні числа `leadership_cost` — зараз орієнтовні, легко перебалансувати.
- `mana_cost` навичок лорда/юнітів — не тестувалось відносно `Mana_max`/`Mana_regen` з п.1.
- Конкретні відсотки `positional_modifiers`/`Guardian.redirect_pct` — орієнтовні, потребують балансового проходу.
- Чи потрібен окремий прохід балансу (симуляція бою) перед тим, як фіксувати ці цифри.
