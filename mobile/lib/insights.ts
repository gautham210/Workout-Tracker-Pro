import type { LocalSession } from './db';
import { formatKg, muscleRecency, relativeDays, sessionVolume, summarizeExercises, weekStart, workoutsInLastDays } from './analytics';

/**
 * Every insight is computed from finished sessions stored on this device and carries the numbers that produced it
 * as `evidence`. Nothing here is a generic claim: if the data does not support an insight it is simply not emitted.
 */
export interface Insight {
  id: string;
  type: 'progression' | 'plateau' | 'consistency' | 'imbalance' | 'volume' | 'data';
  title: string;
  summary: string;
  evidence: string[];
}

export interface FocusSuggestion { muscle: string; daysSince: number; evidence: string }

const DAY_MS = 86_400_000;

export function generateInsights(sessions: LocalSession[], now = new Date()): { insights: Insight[]; focus: FocusSuggestion | null } {
  const insights: Insight[] = [];
  const nowMs = now.getTime();
  if (sessions.length < 3) {
    insights.push({
      id: 'insufficient-data', type: 'data', title: 'Not enough history yet',
      summary: 'Trends need a few finished workouts before they mean anything.',
      evidence: [`${sessions.length} finished workout${sessions.length === 1 ? '' : 's'} on this device.`],
    });
    return { insights, focus: null };
  }

  // Consistency: last 30 days vs the 30 days before.
  const last30 = workoutsInLastDays(sessions, 30, nowMs);
  const last60 = workoutsInLastDays(sessions, 60, nowMs);
  const prior30 = last60 - last30;
  if (last60 > 0) {
    const diff = last30 - prior30;
    insights.push({
      id: 'consistency', type: 'consistency',
      title: diff > 0 ? 'More workouts than last month' : diff < 0 ? 'Fewer workouts than last month' : 'Same workout frequency as last month',
      summary: diff === 0 ? `You trained ${last30} time${last30 === 1 ? '' : 's'} in each of the last two 30-day windows.` : `${Math.abs(diff)} ${diff > 0 ? 'more' : 'fewer'} finished workouts than the previous 30 days.`,
      evidence: [`Last 30 days: ${last30} workouts.`, `Previous 30 days: ${prior30} workouts.`],
    });
  }

  // Volume: this week vs last week (working sets only).
  const thisWeekStart = weekStart(now).getTime();
  const lastWeekStart = thisWeekStart - 7 * DAY_MS;
  let thisVol = 0; let lastVol = 0;
  for (const s of sessions) {
    const t = Date.parse(s.date); if (!Number.isFinite(t)) continue;
    if (t >= thisWeekStart) thisVol += sessionVolume(s); else if (t >= lastWeekStart) lastVol += sessionVolume(s);
  }
  if (lastVol > 0 && thisVol > 0) {
    const pct = Math.round(((thisVol - lastVol) / lastVol) * 100);
    insights.push({
      id: 'volume', type: 'volume', title: pct >= 0 ? 'Weekly volume is up' : 'Weekly volume is down',
      summary: `This week's completed volume is ${Math.abs(pct)}% ${pct >= 0 ? 'above' : 'below'} last week's. The week is not over yet, so this can still change.`,
      evidence: [`This week so far: ${formatKg(thisVol)}.`, `Last week: ${formatKg(lastVol)}.`],
    });
  }

  const exercises = summarizeExercises(sessions, nowMs);
  const prs = exercises.filter((e) => e.recentPR);
  if (prs.length) {
    insights.push({
      id: 'e1rm-prs', type: 'progression', title: `${prs.length} estimated 1RM PR${prs.length === 1 ? '' : 's'} in the last 30 days`,
      summary: 'Estimated one-rep max is calculated from your logged weight, reps and reps in reserve; it is an estimate, not a tested max.',
      evidence: prs.slice(0, 4).map((e) => `${e.name}: ${Math.round(e.recentPR!.previous)} → ${Math.round(e.recentPR!.e1rm)} kg est. 1RM (${relativeDays(e.recentPR!.date, nowMs)}).`),
    });
  }
  const plateaus = exercises.filter((e) => e.plateau);
  if (plateaus.length) {
    insights.push({
      id: 'plateau', type: 'plateau', title: `Estimated 1RM has not moved on ${plateaus.length} lift${plateaus.length === 1 ? '' : 's'}`,
      summary: 'Flagged when the best of your last two sessions is under 2% above the best of the two before, across at least 21 days.',
      evidence: plateaus.slice(0, 4).map((e) => `${e.name}: ${Math.round(e.plateauFrom ?? 0)} kg → ${Math.round(e.plateauTo ?? 0)} kg over your last 4 sessions.`),
    });
  }

  const recency = muscleRecency(sessions, nowMs).filter((m) => m.sessionsIn90d >= 2 && m.daysSince >= 10);
  let focus: FocusSuggestion | null = null;
  if (recency.length) {
    const top = recency[0];
    focus = { muscle: top.muscle, daysSince: top.daysSince, evidence: `${top.muscle} was last trained ${top.daysSince} days ago and appeared in ${top.sessionsIn90d} sessions in the last 90 days.` };
    insights.push({
      id: 'recency', type: 'imbalance', title: 'Muscle groups you have not trained recently',
      summary: 'Groups you usually train (2+ sessions in 90 days) with no working sets in at least 10 days.',
      evidence: recency.slice(0, 4).map((m) => `${m.muscle}: last trained ${m.daysSince} days ago (${m.sessionsIn90d} sessions in 90 days).`),
    });
  }
  return { insights, focus };
}
