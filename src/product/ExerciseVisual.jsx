const palettes = {
  chest: ['#e7f1ff', '#007aff'], back: ['#e8f8f0', '#34c759'], legs: ['#fff3df', '#ff9f0a'],
  shoulders: ['#f1ecff', '#8b5cf6'], arms: ['#fff0f2', '#ff6482'], other: ['#eef2f7', '#60728e'],
};

function resolvePalette(muscle = '') {
  const key = muscle.toLowerCase();
  if (key.includes('chest')) return palettes.chest;
  if (key.includes('back')) return palettes.back;
  if (key.includes('leg') || key.includes('quad') || key.includes('glute')) return palettes.legs;
  if (key.includes('shoulder')) return palettes.shoulders;
  if (key.includes('arm') || key.includes('bicep') || key.includes('tricep')) return palettes.arms;
  return palettes.other;
}

export default function ExerciseVisual({ name = 'Movement', muscle, compact = false }) {
  const [soft, accent] = resolvePalette(muscle);
  const label = name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  return (
    <div className={`exercise-visual ${compact ? 'is-compact' : ''}`} style={{ '--exercise-soft': soft, '--exercise-accent': accent }} aria-hidden="true">
      <svg viewBox="0 0 120 120" fill="none" focusable="false">
        <path d="M20 78c12-15 26-23 40-23s28 8 40 23" stroke="var(--exercise-accent)" strokeWidth="7" strokeLinecap="round" opacity=".22" />
        <circle cx="60" cy="31" r="12" fill="var(--exercise-accent)" opacity=".9" />
        <path d="M60 44v31m0-20L34 68m26-13 26 13M47 98l13-23 13 23" stroke="#1d2b43" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 57h17m44 0h17M18 50v14m82-14v14" stroke="var(--exercise-accent)" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span>{label || 'EX'}</span>
    </div>
  );
}
