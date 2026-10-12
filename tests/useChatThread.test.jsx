import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChatThread } from '../src/product/useChatThread'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../src/lib/api', () => ({ authenticatedApiPost: post }))

const KEY_A = 'wtp_coach_v1_user-a'
const KEY_B = 'wtp_coach_v1_user-b'

const readKey = (key) => {
  const raw = localStorage.getItem(key)
  return raw ? JSON.parse(raw) : []
}
const storedText = (key) => readKey(key).map((m) => m.content).join(' | ')

beforeEach(() => {
  localStorage.clear()
  post.mockReset()
  post.mockResolvedValue({ text: 'assistant reply', intent: 'general_fitness' })
})

const hookWith = (storageKey) => renderHook(
  (props) => useChatThread({ storageKey: props.storageKey }),
  { initialProps: { storageKey } },
)

describe('useChatThread — per-account isolation', () => {
  // Defect: on an account switch, the persistence effect ran with the NEW
  // storage key but the PREVIOUS account's messages, writing one user's
  // coach history (including nutrition/body-metric disclosures) into
  // another user's localStorage key.
  it("never writes the previous account's messages into the new account's key", async () => {
    const { result, rerender } = hookWith(KEY_A);

    await act(async () => { await result.current.ask('user A private question'); });

    await waitFor(() => expect(storedText(KEY_A)).toContain('user A private question'));

    // Switch accounts on the same mounted hook (shared device / fast sign-in).
    await act(async () => { rerender({ storageKey: KEY_B }); });

    expect(storedText(KEY_B)).not.toContain('user A private question');
    expect(localStorage.getItem(KEY_B)).toBeNull();
  })

  it('restores the second account own history on switch, not a blend', async () => {
    localStorage.setItem(KEY_B, JSON.stringify([{ id: 'b1', role: 'user', content: 'user B question' }]));

    const { result, rerender } = hookWith(KEY_A);
    await act(async () => { await result.current.ask('user A private question'); });

    await act(async () => { rerender({ storageKey: KEY_B }); });

    await waitFor(() => expect(result.current.messages.length).toBe(1));
    expect(result.current.messages[0].content).toBe('user B question');
    expect(storedText(KEY_B)).toContain('user B question');
    expect(storedText(KEY_B)).not.toContain('user A private question');
  })

  it('keeps each account history independent across repeated switches', async () => {
    const { result, rerender } = hookWith(KEY_A);
    await act(async () => { await result.current.ask('alpha secret'); });

    await act(async () => { rerender({ storageKey: KEY_B }); });
    await act(async () => { await result.current.ask('beta secret'); });

    await act(async () => { rerender({ storageKey: KEY_A }); });

    await waitFor(() => expect(result.current.messages.some((m) => m.content === 'alpha secret')).toBe(true));
    expect(storedText(KEY_A)).toContain('alpha secret');
    expect(storedText(KEY_A)).not.toContain('beta secret');
    expect(storedText(KEY_B)).toContain('beta secret');
    expect(storedText(KEY_B)).not.toContain('alpha secret');
  })

  it('writes nothing on sign-out when no account is present', async () => {
    const { result, rerender } = hookWith(KEY_A);
    await act(async () => { await result.current.ask('user A private question'); });

    await act(async () => { rerender({ storageKey: null }); });

    await waitFor(() => expect(result.current.messages).toHaveLength(0));
    expect(storedText(KEY_A)).toContain('user A private question');
  })
})

describe('useChatThread — persistence still works within one account', () => {
  it('persists turns for the active account', async () => {
    const { result } = hookWith(KEY_A);
    await act(async () => { await result.current.ask('first question'); });

    await waitFor(() => expect(storedText(KEY_A)).toContain('first question'));
    expect(storedText(KEY_A)).toContain('assistant reply');
  })

  it('rehydrates an existing thread on mount', () => {
    localStorage.setItem(KEY_A, JSON.stringify([{ id: 'x1', role: 'user', content: 'earlier question' }]));
    const { result } = hookWith(KEY_A);
    expect(result.current.messages[0].content).toBe('earlier question');
  })

  it('never persists error bubbles', async () => {
    post.mockRejectedValueOnce(new Error('provider exploded'));
    const { result } = hookWith(KEY_A);
    await act(async () => { await result.current.ask('will fail'); });

    await waitFor(() => expect(result.current.messages.some((m) => m.error)).toBe(true));
    expect(storedText(KEY_A)).not.toContain('provider exploded');
  })
})
