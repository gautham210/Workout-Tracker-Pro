import { supabase } from './supabase';

export interface Insight {
  id: string;
  type: 'progression' | 'plateau' | 'consistency' | 'imbalance' | 'trend';
  title: string;
  whatHappened: string;
  evidence: string;
  whyItMatters: string;
  whatToDoNext: string;
}

/**
 * Analyzes the user's real Supabase data to generate actionable insights.
 */
export async function generateInsights(userId: string): Promise<Insight[]> {
  const insights: Insight[] = [];
  
  if (!userId) return insights;

  try {
    const { data: sessions, error } = await supabase
      .from('workout_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (error) throw error;
    
    if (!sessions || sessions.length < 3) {
      insights.push({
        id: 'insufficient-data',
        type: 'trend',
        title: 'Need More Data',
        whatHappened: 'Not enough workout sessions logged yet.',
        evidence: `You have logged ${sessions?.length || 0} sessions so far.`,
        whyItMatters: 'AI Insights require a baseline of data to detect meaningful trends and patterns.',
        whatToDoNext: 'Keep tracking your workouts! We recommend logging at least 3-5 sessions before insights begin generating.',
      });
      return insights;
    }

    // Consistency Insight
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentSessions = sessions.filter(s => new Date(s.date) >= thirtyDaysAgo);
    
    if (recentSessions.length < 4) {
      insights.push({
        id: 'consistency-drop',
        type: 'consistency',
        title: 'Low Workout Frequency',
        whatHappened: 'You have worked out less than once a week over the last month.',
        evidence: `You logged ${recentSessions.length} sessions in the last 30 days.`,
        whyItMatters: 'Consistency is the primary driver of adaptations. Long breaks reset muscle protein synthesis.',
        whatToDoNext: 'Try scheduling 2-3 shorter sessions per week rather than relying on motivation for long workouts.',
      });
    } else {
      insights.push({
        id: 'consistency-good',
        type: 'consistency',
        title: 'Great Consistency',
        whatHappened: 'You are consistently hitting the gym.',
        evidence: `You logged ${recentSessions.length} sessions in the last 30 days.`,
        whyItMatters: 'Regular stimulus is required for hypertrophy.',
        whatToDoNext: 'Keep up the great work and ensure you are recovering adequately.',
      });
    }

    // Imbalance Insight (Using split strings)
    const legSessions = recentSessions.filter(s => s.split?.toLowerCase().includes('leg')).length;
    const totalSessions = recentSessions.length;
    const legRatio = totalSessions > 0 ? legSessions / totalSessions : 0;

    if (legRatio < 0.2 && totalSessions >= 5) {
      insights.push({
        id: 'imbalance-legs',
        type: 'imbalance',
        title: 'Volume Imbalance: Legs',
        whatHappened: 'Your leg training frequency is low compared to your upper body.',
        evidence: `Leg focused sessions make up only ${(legRatio * 100).toFixed(0)}% of your recent workouts.`,
        whyItMatters: 'Neglecting leg volume can lead to asymmetrical physique development.',
        whatToDoNext: 'Consider adding a dedicated leg day or adding squat variations to your full-body days.',
      });
    }

  } catch (err) {
    console.error('Error generating insights:', err);
  }

  return insights;
}
