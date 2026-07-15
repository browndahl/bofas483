import type { CreatureState } from './worldState';

export type CreatureMood = 'bright' | 'curious' | 'hungry' | 'tired' | 'lonely' | 'frightened' | 'unwell' | 'annoyed' | 'baby';
export type VoiceContext = 'click' | 'answer' | 'social' | 'sleep' | 'play' | 'critical' | 'return' | 'rename' | 'birth';

const LINES: Record<CreatureMood, string[]> = {
  bright: ['Hey! Yipi!', 'Bela-bop!', 'Hiii! Wawa!', 'Tili-taa!'],
  curious: ['Owa?', 'Bibi… hey?', 'Toko-toko?', 'Mmm? Luma!'],
  hungry: ['Aw… numi?', 'Moba-moba…', 'Nib nib?', 'Ooo… dew?'],
  tired: ['Aww… mimi.', 'Yaaawn… bo.', 'Mumu…', 'Nini now?'],
  lonely: ['Hey… awa?', 'Bii? Bii?', 'Owa… friend?', 'Lumi-loo?'],
  unwell: ['Aw… oof.', 'Mmm… no-no.', 'Woba…', 'Eep… awa.'],
  frightened: ['Eep! Owa!', 'Bibi—bii!', 'Ah! Luma?', 'Wip-wip!'],
  annoyed: ['Buh! No-no.', 'Mrr… bibi.', 'Owa, hmph!', 'Taka—nah.'],
  baby: ['Bibi!', 'Yip-yip!', 'Wawa!', 'Pip-pip!']
};

export function creatureMood(creature: CreatureState): CreatureMood {
  if (creature.needs.health < 48) return 'unwell';
  if (creature.stress > 72) return 'annoyed';
  if (creature.needs.hunger < 38) return 'hungry';
  if (creature.needs.energy < 30) return 'tired';
  if (creature.needs.happiness < 42) return 'lonely';
  if (creature.personality.curiosity > 0.68) return 'curious';
  return 'bright';
}

export function creatureVocalization(creature: CreatureState, variant: number) {
  const mood = creature.age < 24 ? 'baby' : creatureMood(creature);
  const serial = Number(creature.id.replace(/\D/g, '')) || 1;
  const lines = LINES[mood];
  return { mood, text: lines[(serial + variant) % lines.length] };
}

export function contextualVocalization(creature: CreatureState, variant: number, context: VoiceContext, frightened = false) {
  if (frightened) { const lines = LINES.frightened; return { mood: 'frightened' as const, text: lines[variant % lines.length] }; }
  const base = creatureVocalization(creature, variant);
  const contextual: Partial<Record<VoiceContext, string[]>> = {
    answer: ['Hey-hey!', 'Owa! Bibi!', 'Yip! I hear!', 'Luma-loo!'],
    social: ['Bibi-baba…', 'Luma, luma!', 'Tili-taa ♡', 'Owa-owa!'],
    sleep: ['Mimi…', 'Aww… nini.', 'Mmm… luma.', 'Boo… zzz.'],
    play: ['Yip-yip!', 'Wawa! Hey!', 'Tili-taa!', 'Bop-bop-bii!'],
    critical: ['Aw! Help-help!', 'Eep… owa!', 'Bibi no…', 'Hey! Hey!'],
    return: ['Hey! You came back!', 'Owa! Home-home!', 'Bibi! You!', 'Yip! Hello again!'],
    rename: ['Owa? Me?', 'Bibi! New-new!', 'Hey! I like!', 'Yip! That’s me!'],
    birth: LINES.baby
  };
  const options = contextual[context]; return options ? { mood: context === 'sleep' ? 'tired' as const : context === 'critical' ? 'frightened' as const : base.mood, text: options[(variant + Number(creature.id.replace(/\D/g, ''))) % options.length] } : base;
}

export function voicePitch(creature: CreatureState) {
  const serial = Number(creature.id.replace(/\D/g, '')) || 1;
  const style = { chirpy: 1.16, round: 0.88, whispery: 1.04, raspy: 0.78, musical: 1.1 }[creature.voiceStyle ?? 'round'];
  return (330 + (serial % 9) * 24 + creature.personality.sociability * 70) * style * (creature.age < 24 ? 1.28 : 1);
}
