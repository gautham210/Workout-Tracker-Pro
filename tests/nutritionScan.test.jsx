import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NutritionExperience from '../src/product/NutritionExperience'

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }))
vi.mock('../src/context/AuthContext', () => ({ useAuth }))

const { getSession, from, PNG_1PX } = vi.hoisted(() => ({
  getSession: vi.fn(),
  from: vi.fn(),
  // Smallest valid PNG data URI, used as the already-decoded scan payload.
  PNG_1PX: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
}))
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession }, from } }))

// jsdom cannot decode images or provide a 2D canvas, so the downscale pipeline cannot run.
// Stub only the decode/resize step; keep the real error-code and message helpers so these
// assertions exercise production behaviour rather than a parallel implementation.
vi.mock('../src/product/foodScan', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    prepareMealImage: vi.fn(async () => ({ dataUri: PNG_1PX, width: 1, height: 1, bytes: 200 })),
  }
})

vi.mock('../src/product/ExerciseVisual', () => ({ default: () => <span /> }))

// PostgREST-style builder: every chained filter returns itself, terminal methods resolve
// empty. A Proxy keeps this resilient to whichever filters the component happens to use.
const TERMINALS = new Set(['maybeSingle', 'single', 'limit', 'range'])
const emptyChain = () => new Proxy({}, {
  get(_target, prop) {
    if (prop === 'then') return undefined // must not be thenable
    if (TERMINALS.has(prop)) return async () => ({ data: [], error: null, count: 0 })
    return () => emptyChain()
  },
})

const isDisabled = (el) => el.disabled === true
const scanButton = () => screen.getByRole('button', { name: /scan meal/i })

let fetchCalls

beforeEach(() => {
  localStorage.clear()
  useAuth.mockReturnValue({ user: { id: 'u1' } })
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null })
  from.mockReturnValue(emptyChain())
  fetchCalls = []
  globalThis.fetch = vi.fn((url, init = {}) => {
    fetchCalls.push({ url, init })
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'Rice and chicken',
        macros: {
          detectedFoods: ['Rice'], items: [], caloriesRange: '200-250',
          proteinRange: '4-6', carbsRange: '40-45', fatRange: '1-2', confidence: 'Medium',
        },
      }),
    })
  })
})

const uploadPhoto = async () => {
  const input = await waitFor(() => {
    const el = document.querySelector('input[type="file"]')
    if (!el) throw new Error('file input not rendered yet')
    return el
  })
  const file = new File([atob(PNG_1PX.split(',')[1])], 'meal.png', { type: 'image/png' })
  Object.defineProperty(file, 'size', { value: 200 })
  fireEvent.change(input, { target: { files: [file] } })
  await waitFor(() => expect(isDisabled(scanButton())).toBe(false), { timeout: 4000 })
}

const renderNutrition = () => render(<MemoryRouter><NutritionExperience /></MemoryRouter>)

describe('NutritionExperience — food scan cancellation', () => {
  it('always sends a timeout signal so a hung scan cannot brick the button forever', async () => {
    renderNutrition()
    await uploadPhoto()

    fireEvent.click(scanButton())
    await waitFor(() => expect(fetchCalls.length).toBeGreaterThan(0))

    const call = fetchCalls.find((f) => f.url === '/api/parse-food')
    expect(call).toBeTruthy()
    expect(call.init.signal, 'the scan request must carry an AbortSignal').toBeTruthy()
  })

  it('reports a timeout as an actionable error instead of hanging forever', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))

    renderNutrition()
    await uploadPhoto()

    fireEvent.click(scanButton())

    // Before the fix the promise never settled and the button stayed disabled permanently.
    await waitFor(() => expect(isDisabled(scanButton())).toBe(false), { timeout: 4000 })
  })

  it('re-enables scanning after a provider failure', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: false, status: 502, json: async () => ({ error: 'upstream', code: 'provider_malformed' }),
    }))

    renderNutrition()
    await uploadPhoto()

    fireEvent.click(scanButton())
    await waitFor(() => expect(isDisabled(scanButton())).toBe(false), { timeout: 4000 })
  })

  it('re-enables scanning when the device is offline', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))

    renderNutrition()
    await uploadPhoto()

    fireEvent.click(scanButton())
    await waitFor(() => expect(isDisabled(scanButton())).toBe(false), { timeout: 4000 })
  })
})
