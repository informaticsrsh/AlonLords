import { z } from 'zod';
import rawEmpireUnits from '../data/empire-units.json' with { type: 'json' };

const footprintSchema = z.object({
  rows: z.number().int().positive(),
  columns: z.number().int().positive()
});

const formulaSchema = z.object({
  base: z.number(),
  lordStat: z.enum(['vitality', 'battlePower', 'crystalRegenSpeed']),
  multiplier: z.number()
});

const actionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['physical', 'fire', 'holy', 'poison', 'lightning']),
  effectKind: z.enum(['damage', 'heal', 'buff', 'debuff', 'control', 'reposition']),
  rangeType: z.enum(['melee', 'ranged']),
  formula: formulaSchema,
  targetRule: z.object({
    side: z.enum(['ally', 'enemy']),
    selection: z.enum(['nearest', 'lowest_hp', 'highest_threat', 'random', 'self', 'all_in_range', 'corpse_of_dead_ally']),
    count: z.union([z.number().int().positive(), z.string()])
  }),
  cooldown: z.union([z.number(), z.string(), z.null()]),
  manaCost: z.number().nullable(),
  bonusVsRaceType: z.record(z.number()).optional()
});

const combatSchema = z.object({
  hpFormula: formulaSchema,
  attackSpeed: z.number().positive(),
  leadershipCost: z.number().int().positive(),
  actions: z.array(actionSchema).min(1),
  evolutions: z.array(z.string())
});

const unitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  line: z.string().min(1),
  tier: z.number().int().min(1).max(4),
  role: z.enum(['melee', 'ranged', 'caster']),
  gridFootprint: footprintSchema,
  combat: combatSchema.optional()
});

export const empireUnits = Object.freeze(unitSchema.array().parse(rawEmpireUnits));

export function getEmpireUnit(id) {
  return empireUnits.find((unit) => unit.id === id) ?? null;
}
