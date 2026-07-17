export function evaluateFormula(formula, lord) {
  return formula.base + formula.multiplier * (lord[formula.lordStat] ?? 0);
}

export function selectTargets(candidates, rule, rng = Math.random) {
  const count = typeof rule.count === 'number' ? rule.count : candidates.length;
  const living = candidates.filter((unit) => unit.hp > 0);

  if (rule.selection === 'lowest_hp') {
    return [...living].sort((a, b) => a.hp - b.hp).slice(0, count);
  }
  if (rule.selection === 'highest_threat') {
    return [...living].sort((a, b) => (b.threat ?? 0) - (a.threat ?? 0)).slice(0, count);
  }
  if (rule.selection === 'random') {
    return [...living].sort(() => rng() - 0.5).slice(0, count);
  }
  return living.slice(0, count);
}

export function resolveAction(action, lord, candidates, rng) {
  return {
    actionId: action.id,
    effectKind: action.effectKind,
    amount: evaluateFormula(action.formula, lord),
    targets: selectTargets(candidates, action.targetRule, rng)
  };
}
