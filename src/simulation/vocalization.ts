import type { CreatureState } from './worldState';

export type CreatureMood = 'bright' | 'curious' | 'hungry' | 'tired' | 'lonely' | 'unwell';

const LINES: Record<CreatureMood, string[]> = {
  bright: ['Hey! Yipi!', 'Bela-bop!', 'Hiii! Wawa!', 'Tili-taa!'],
  curious: ['Owa?', 'Bibi… hey?', 'Toko-toko?', 'Mmm? Luma!'],
  hungry: ['Aw… numi?', 'Moba-moba…', 'Nib nib?', 'Ooo… dew?'],
  tired: ['Aww… mimi.', 'Yaaawn… bo.', 'Mumu…', 'Nini now?'],
  lonely: ['Hey… awa?', 'Bii? Bii?', 'Owa… friend?', 'Lumi-loo?'],
  unwell: ['Aw… oof.', 'Mmm… no-no.', 'Woba…', 'Eep… awa.']
};

export function creatureMood(creature: CreatureState): CreatureMood {
  if (creature.needs.health < 48) return 'unwell';
  if (creature.needs.hunger < 38) return 'hungry';
  if (creature.needs.energy < 30) return 'tired';
  if (creature.needs.happiness < 42) return 'lonely';
  if (creature.personality.curiosity > 0.68) return 'curious';
  return 'bright';
}

export function creatureVocalization(creature: CreatureState, variant: number) {
  const mood = creatureMood(creature);
  const serial = Number(creature.id.replace(/\D/g, '')) || 1;
  const lines = LINES[mood];
  return { mood, text: lines[(serial + variant) % lines.length] };
}

export function voicePitch(creature: CreatureState) {
  const serial = Number(creature.id.replace(/\D/g, '')) || 1;
  return 330 + (serial % 9) * 24 + creature.personality.sociability * 70;
}
