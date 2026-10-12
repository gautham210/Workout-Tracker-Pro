import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HoldButton from '../src/product/react-bits/HoldButton'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { width: 100, height: 40, top: 0, left: 0, right: 100, bottom: 40, x: 0, y: 0, toJSON() {} };
  };
})

const setup = (props = {}) => {
  const onHold = vi.fn();
  const onTap = vi.fn();
  render(<HoldButton holdTime={20} resetAfter={0} onHold={onHold} onTap={onTap} {...props}>Hold to finish</HoldButton>);
  const button = screen.getByRole('button', { name: /Hold to finish/i });
  button.focus();
  return { onHold, onTap, button };
};

describe('HoldButton — keyboard access', () => {
  // Defect: handleKeyDown/handleKeyUp only matched `''` and `'Enter'`. The Space key is
  // `' '` (or legacy `'Spacebar'`), so holding Space did nothing at all on a native button.
  it('completes on a held Space key (WCAG 2.1.1)', async () => {
    const { onHold, button } = setup();

    fireEvent.keyDown(button, { key: ' ' });
    await wait(250);
    fireEvent.keyUp(button, { key: ' ' });

    expect(onHold).toHaveBeenCalledTimes(1);
  })

  it('completes on a held Enter key when no tap path is supplied', async () => {
    const { onHold, button } = setup({ onTap: undefined });

    fireEvent.keyDown(button, { key: 'Enter' });
    await wait(250);
    fireEvent.keyUp(button, { key: 'Enter' });

    expect(onHold).toHaveBeenCalledTimes(1);
  })

  it('completes on a held Space key even when a tap path is supplied', async () => {
    const { onHold, onTap, button } = setup();

    fireEvent.keyDown(button, { key: ' ' });
    await wait(250);
    fireEvent.keyUp(button, { key: ' ' });

    expect(onHold).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  })

  it('does not activate when the key is released before the hold completes', async () => {
    const { onHold, button } = setup({ holdTime: 5000 });

    fireEvent.keyDown(button, { key: 'Enter' });
    await wait(60);
    fireEvent.keyUp(button, { key: 'Enter' });
    await wait(60);

    expect(onHold).not.toHaveBeenCalled();
  })

  it('cancels a held Space key on Escape', async () => {
    const { onHold, button } = setup({ holdTime: 5000 });

    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.keyDown(button, { key: 'Escape' });
    await wait(80);

    expect(onHold).not.toHaveBeenCalled();
  })

  // Defect: the only route to finishing a workout was an 850ms press-and-hold, which is a
  // timing requirement with no adjustable alternative (WCAG 2.2.1).
  it('offers a timing-free alternative path (WCAG 2.2.1)', async () => {
    const { onHold, onTap, button } = setup({ holdTime: 5000 });

    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyUp(button, { key: 'Enter' });

    await waitFor(() => expect(onTap).toHaveBeenCalledTimes(1));
    expect(onHold).not.toHaveBeenCalled();
  })

  it('fires the tap path once, not both tap and hold, on a fast Enter press', async () => {
    const { onHold, onTap, button } = setup();

    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyUp(button, { key: 'Enter' });
    await wait(120);

    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onHold).not.toHaveBeenCalled();
  })

  it('still requires a deliberate hold on the pointer', async () => {
    const { onHold, button } = setup();

    fireEvent.pointerDown(button, { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 });
    fireEvent.pointerUp(button, { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 });
    await wait(60);

    expect(onHold).not.toHaveBeenCalled();
  })

  it('exposes the control as a real button with an accessible name', () => {
    const { button } = setup();
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
  })
})
