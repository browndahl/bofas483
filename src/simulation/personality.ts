import type { CreaturePersonality, CreatureState } from './worldState';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function createCreaturePersonality(id: string, generation = 0, parent?: CreaturePersonality): CreaturePersonality {
  const trait = (name: keyof CreaturePersonality) => {
    const innate = 0.18 + hashUnit(`${id}:${generation}:${name}`) * 0.76;
    return parent ? clamp01(parent[name] * 0.68 + innate * 0.32) : innate;
  };
  return {
    sociability: trait('sociability'),
    curiosity: trait('curiosity'),
    diligence: trait('diligence'),
    empathy: trait('empathy'),
    resilience: trait('resilience')
  };
}

const TRAIT_LABELS: Array<[keyof CreaturePersonality, string]> = [
  ['empathy', 'WARM'], ['curiosity', 'CURIOUS'], ['sociability', 'SOCIAL'], ['diligence', 'STEADY'], ['resilience', 'BRAVE']
];

export function personalityLabels(personality: CreaturePersonality, count = 2): string[] {
  return TRAIT_LABELS
    .map(([key, label], index) => ({ label, score: personality[key], index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .map((item) => item.label);
}

export function socialCompatibility(a: CreatureState, b: CreatureState): number {
  const sharedCuriosity = 1 - Math.abs(a.personality.curiosity - b.personality.curiosity);
  const socialBalance = 1 - Math.abs(a.personality.sociability - b.personality.sociability) * 0.6;
  const existingBond = (a.bonds[b.id] ?? 0) / 100;
  return sharedCuriosity * 0.35 + socialBalance * 0.25 + existingBond * 0.4;
}

export function setBond(creature: CreatureState, otherId: string, value: number) {
  creature.bonds[otherId] = Math.max(0, Math.min(100, value));
  const entries = Object.entries(creature.bonds);
  if (entries.length <= 8) return;
  entries.sort((a, b) => b[1] - a[1]);
  creature.bonds = Object.fromEntries(entries.slice(0, 8));
}
