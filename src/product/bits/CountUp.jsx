// Adapted from React Bits Count Up (MIT + Commons Clause):
// https://github.com/DavidHDev/react-bits/tree/main/src/content/TextAnimations/CountUp
import { useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { useCallback, useEffect, useRef } from 'react';

function decimals(value) {
  const fraction = String(value).split('.')[1];
  return fraction && Number(fraction) !== 0 ? fraction.length : 0;
}

export default function CountUp({ value, from = 0, duration = 0.72, className = '', separator = ',' }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const target = Number.isFinite(value) ? value : 0;
  const initial = Number.isFinite(from) ? from : 0;
  const motionValue = useMotionValue(initial);
  const spring = useSpring(motionValue, { damping: 25 + (30 / Math.max(duration, .1)), stiffness: 125 / Math.max(duration, .1) });
  const visible = useInView(ref, { once: true, margin: '0px' });
  const places = Math.max(decimals(initial), decimals(target));
  const format = useCallback((number) => new Intl.NumberFormat(undefined, { minimumFractionDigits: places, maximumFractionDigits: places }).format(number).replace(/,/g, separator), [places, separator]);

  useEffect(() => {
    if (ref.current) ref.current.textContent = format(reduce ? target : initial);
  }, [format, initial, reduce, target]);
  useEffect(() => {
    if (visible) motionValue.set(target);
  }, [motionValue, target, visible]);
  useEffect(() => {
    const unsubscribe = spring.on('change', (latest) => {
      if (ref.current) ref.current.textContent = format(latest);
    });
    return unsubscribe;
  }, [format, spring]);

  return <span ref={ref} className={className} />;
}
