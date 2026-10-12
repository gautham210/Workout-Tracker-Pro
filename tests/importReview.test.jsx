import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ImportExperience from '../src/product/ImportExperience'

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }))
vi.mock('../src/context/AuthContext', () => ({ useAuth }))

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../src/lib/api', () => ({ authenticatedApiPost: post }))

const { getExerciseCatalog } = vi.hoisted(() => ({ getExerciseCatalog: vi.fn() }))
vi.mock('../src/product/trainingData', () => ({ getExerciseCatalog }))

const { sendWorkoutGraph } = vi.hoisted(() => ({ sendWorkoutGraph: vi.fn() }))
vi.mock('../src/product/workoutSync', () => ({ sendWorkoutGraph }))

const { requestHandoff } = vi.hoisted(() => ({ requestHandoff: vi.fn() }))
vi.mock('../src/product/useDraftHandoff', () => ({
  default: () => ({ request: requestHandoff, dialog: null }),
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../src/product/ExerciseVisual', () => ({ default: () => <span /> }))

const CATALOG = [
  { id: 'ex-bench', name: 'Barbell Bench Press', slug: 'barbell-bench-press', muscle_group: 'Chest' },
  { id: 'ex-squat', name: 'Barbell Back Squat', slug: 'barbell-back-squat', muscle_group: 'Legs' },
]

const PARSED = {
  split: 'Push', date: '2026-03-04', source: 'ai',
  exercises: [{ name: 'Barbell Bench Press', sets: [{ weight_kg: 60, reps: 8 }] }],
}

const review = async () => {
  const textarea = await screen.findByLabelText('Paste a workout log')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(textarea, 'Bench press 60kg x 8')
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  screen.getByRole('button', { name: /Parse workout/i }).click()
  await screen.findByDisplayValue('Barbell Bench Press')
}

beforeEach(() => {
  localStorage.clear()
  useAuth.mockReturnValue({ user: { id: 'user-1' } })
  post.mockReset().mockResolvedValue(PARSED)
  getExerciseCatalog.mockReset().mockResolvedValue(CATALOG)
  sendWorkoutGraph.mockReset().mockResolvedValue({ error: null })
})

describe('ImportExperience — review mapping', () => {
  it('shows a confirmed server match', async () => {
    render(<ImportExperience />)
    await review()
    expect(screen.getByText(/Matches Barbell Bench Press/)).toBeTruthy()
    expect(screen.getByText(/1 of 1 movements ready/)).toBeTruthy()
  })

  it('does not claim model output when the deterministic fallback was used', async () => {
    post.mockResolvedValue({ ...PARSED, source: 'fallback' });

    render(<ImportExperience />)
    await review()

    expect(screen.getByText(/offline structural parser, not the model/i)).toBeTruthy();
  })

  it('does not show a fallback notice for genuine model output', async () => {
    post.mockResolvedValue({ ...PARSED, source: 'ai' });

    render(<ImportExperience />)
    await review()

    expect(screen.queryByText(/offline structural parser/i)).toBeNull();
  })

  it('keeps a hand-picked mapping when the movement name is edited', async () => {
    render(<ImportExperience />)
    await review()

    // Map the row by hand, then retype its display name.
    screen.getByRole('button', { name: /Change match/i }).click()
    await screen.findByRole('dialog')
    screen.getByRole('button', { name: /Barbell Back Squat/i }).click()

    await waitFor(() => expect(screen.getByText(/Matches Barbell Back Squat/)).toBeTruthy())

    const nameInput = screen.getByDisplayValue('Barbell Bench Press')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(nameInput, 'Barbell Bench Press (paused)')
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))

    // The user's explicit library choice must survive a cosmetic rename.
    expect(screen.getByText(/Matches Barbell Back Squat/)).toBeTruthy()
    expect(screen.getByText(/1 of 1 movements ready/)).toBeTruthy()
  })

  it('keeps the caret in the movement name field while typing', async () => {
    render(<ImportExperience />)
    await review()

    const nameInput = screen.getByDisplayValue('Barbell Bench Press')
    nameInput.focus()
    expect(document.activeElement).toBe(nameInput)

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(nameInput, 'Barbell Bench');
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))

    // React remounts the row when the key embeds the edited value, which drops focus
    // after a single character and makes correction impossible.
    await waitFor(() => expect(screen.getByDisplayValue('Barbell Bench')).toBeTruthy())
    expect(document.activeElement).toBe(screen.getByDisplayValue('Barbell Bench'))
  })

  it('refuses to import without an account instead of crashing', async () => {
    useAuth.mockReturnValue({ user: undefined })
    sendWorkoutGraph.mockResolvedValue({ error: new Error('failed to fetch') })

    render(<ImportExperience />)
    await review()

    screen.getByRole('button', { name: /Import completed history/i }).click()

    await waitFor(() => expect(screen.getByText(/need to be signed in/i)).toBeTruthy())
    expect(screen.queryByText(/Cannot read properties of undefined/)).toBeNull()
    expect(sendWorkoutGraph).not.toHaveBeenCalled()
  })
})
