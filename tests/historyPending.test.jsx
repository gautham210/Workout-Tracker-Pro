import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import HistoryExperience from '../src/product/HistoryExperience'
import { enqueuePendingWorkout } from '../src/product/pendingSync'
import { buildWorkoutGraph } from '../src/product/workoutDraft'

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }))
vi.mock('../src/context/AuthContext', () => ({ useAuth }))

const { fetchSessionPage } = vi.hoisted(() => ({ fetchSessionPage: vi.fn() }))
vi.mock('../src/product/analyticsData', () => ({ fetchSessionPage }))

// Minimal PostgREST-ish thenable chain; only the exact-count head query is exercised.
const { supabase } = vi.hoisted(() => ({
  supabase: { from: () => ({ select: () => chain() }) },
}))
vi.mock('../src/lib/supabase', () => ({ supabase }))

function chain() {
  const builder = {
    eq: () => builder,
    order: () => builder,
    range: () => Promise.resolve({ data: [], error: null }),
    limit: () => Promise.resolve({ data: [], error: null }),
    then: (resolve) => resolve({ data: null, count: 0, error: null }),
  }
  return builder
}

vi.mock('../src/product/ExerciseVisual', () => ({
  default: ({ name }) => <span data-testid="visual">{name || 'unresolved'}</span>,
}))
vi.mock('../src/product/react-bits/AnimatedList', () => ({
  default: () => null,
}))

const USER = 'user-1'

/** Mirrors what WorkoutExperience hands to enqueuePendingWorkout. */
const queueWorkout = (over = {}) => {
  const startedAt = Date.parse('2026-03-04T09:30:00.000Z')
  const exercises = [
    {
      id: 'se-1',
      exercise: { id: 'ex-bench', name: 'Barbell Bench Press', muscle_group: 'Chest' },
      plannedRestSeconds: 90,
      notes: '',
      sets: [
        { id: 's1', weight_kg: 60, reps: 8, completed: true, is_warmup: false, rpe: 8, rir: 2, notes: '' },
        { id: 's2', weight_kg: 70, reps: 6, completed: true, is_warmup: false, rpe: 9, rir: 1, notes: '' },
      ],
    },
  ]
  const graph = buildWorkoutGraph({
    graphId: over.graphId || '11111111-1111-4111-8111-111111111111',
    exercises, startedAt, title: 'Push Day', now: startedAt + 45 * 60_000,
  })
  return enqueuePendingWorkout(USER, graph, { storage: localStorage, labels: over.labels })
}

beforeEach(() => {
  localStorage.clear()
  useAuth.mockReturnValue({ user: { id: USER } })
  fetchSessionPage.mockResolvedValue([])
})

describe('HistoryExperience — offline (pending) workouts', () => {
  it('renders the real date instead of inventing "today"', async () => {
    queueWorkout({ labels: { 'ex-bench': { name: 'Barbell Bench Press', muscle_group: 'Chest' } } })

    render(<HistoryExperience />)
    expect(await screen.findByText('March 4')).toBeTruthy()
    expect(screen.queryByText('Today')).toBeNull()
  })

  it('renders real movements, sets and volume from the queued graph', async () => {
    queueWorkout({ labels: { 'ex-bench': { name: 'Barbell Bench Press', muscle_group: 'Chest' } } })

    render(<HistoryExperience />)
    await screen.findByText('March 4')

    expect(screen.getByRole('button', { name: /Push Day/i })).toBeTruthy()
    // 1 movement; volume 60x8 + 70x6 = 900 kg (locale-independent)
    expect(screen.getByText(/1 movements/)).toBeTruthy()
    expect(screen.getByText(/900 kg volume/)).toBeTruthy()
  })

  it('shows the queued movements and sets when expanded', async () => {
    queueWorkout({ labels: { 'ex-bench': { name: 'Barbell Bench Press', muscle_group: 'Chest' } } })

    render(<HistoryExperience />)
    await screen.findByText('March 4')

    screen.getByRole('button', { name: /Push Day/i }).click()

    const heading = await screen.findByRole('heading', { name: 'Barbell Bench Press' })
    const detail = heading.parentElement
    expect(detail.textContent).toMatch(/60 kg × 8/)
    expect(detail.textContent).toMatch(/70 kg × 6/)
  })

  it('falls back to the stored queue timestamp, never to render time, when the graph has no date', async () => {
    const graph = buildWorkoutGraph({
      graphId: '22222222-2222-4222-8222-222222222222',
      exercises: [{
        id: 'se-1',
        exercise: { id: 'ex-bench', name: 'Barbell Bench Press', muscle_group: 'Chest' },
        plannedRestSeconds: 90, notes: '',
        sets: [{ id: 's1', weight_kg: 60, reps: 8, completed: true, is_warmup: false }],
      }],
      startedAt: Date.parse('2026-03-04T09:30:00.000Z'),
      title: 'Push Day',
      now: Date.parse('2026-03-04T10:15:00.000Z'),
    });
    const dateless = { ...graph };
    delete dateless.date;
    enqueuePendingWorkout(USER, dateless, { storage: localStorage, now: Date.parse('2026-02-20T08:00:00.000Z') })

    render(<HistoryExperience />)
    // The queue timestamp (Feb 20) is real stored data, so it is used instead of today.
    expect(await screen.findByText('February 20')).toBeTruthy()
    expect(screen.queryByText('Today')).toBeNull()
  })

  it('renders nothing for an unreadable queue entry rather than an empty session', async () => {
    localStorage.setItem(
      `wtp_pending_sync_v1_${USER}`,
      JSON.stringify([{ id: 'g1', queuedAt: 1_700_000_000_000, attempts: 0, lastError: null, graph: null }]),
    )

    render(<HistoryExperience />)
    await screen.findByText(/Your first session starts the story/)

    expect(screen.queryByText('January 1')).toBeNull()
    expect(screen.queryByText(/0 movements/)).toBeNull()
    expect(screen.queryByText(/No exercise detail was recorded/)).toBeNull()
    expect(screen.queryByText(/saved on this device/i)).toBeNull()
  })

  it('shows the real duration from the queued graph', async () => {
    queueWorkout({ labels: { 'ex-bench': { name: 'Barbell Bench Press', muscle_group: 'Chest' } } })

    render(<HistoryExperience />)
    await screen.findByText('March 4')

    expect(screen.getByText(/45 min/)).toBeTruthy()
  })

  it('never leaks another account queued workouts', async () => {
    const other = 'user-2';
    const graph = buildWorkoutGraph({
      graphId: '33333333-3333-4333-8333-333333333333',
      exercises: [{
        id: 'se-x', exercise: { id: 'ex-2', name: 'Deadlift', muscle_group: 'Back' },
        plannedRestSeconds: 90, notes: '',
        sets: [{ id: 's1', weight_kg: 100, reps: 5, completed: true }],
      }],
      startedAt: Date.parse('2026-03-06T09:00:00.000Z'),
      title: 'Pull Day', now: Date.parse('2026-03-06T10:00:00.000Z'),
    });
    enqueuePendingWorkout(other, graph, { storage: localStorage });

    render(<HistoryExperience />)
    await screen.findByText(/Your first session starts the story/)

    expect(screen.queryByText('Pull Day')).toBeNull()
    expect(screen.queryByText(/100 kg/)).toBeNull()
  })
})
