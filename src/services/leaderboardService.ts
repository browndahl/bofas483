import { supabase } from './supabaseClient';

export interface LeaderboardEntry { display_name: string; final_chapter: number; ending_id: string; population_peak: number; submitted_at: string }

export const leaderboardService = {
  async top(limit = 100): Promise<LeaderboardEntry[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('leaderboard').select('display_name,final_chapter,ending_id,population_peak,submitted_at').order('final_chapter', { ascending: false }).order('population_peak', { ascending: false }).limit(limit);
    if (error) throw error; return data as LeaderboardEntry[];
  },
  async submit(saveId: string, displayName: string) {
    if (!supabase) throw new Error('Cloud backend is not configured');
    const { data, error } = await supabase.functions.invoke('submit-score', { body: { saveId, displayName } });
    if (error) throw error; return data;
  }
};
