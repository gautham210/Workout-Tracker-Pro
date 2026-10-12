import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen, act } from '@testing-library/react'

function Counter() {
  const [n, setN] = useState(0)
  return <button type="button" onClick={() => setN(n + 1)}>count {n}</button>
}

describe('harness', () => {
  it('renders a component and drives state', () => {
    render(<Counter />)
    const button = screen.getByRole('button', { name: /count 0/i })
    act(() => { button.click() })
    expect(screen.getByRole('button', { name: /count 1/i })).toBeTruthy()
  })
})
