const palettes = {
  chest: ['#dff7fb', '#007aff'], back: ['#e4faee', '#16a66a'], legs: ['#fff0d8', '#f28c18'],
  shoulders: ['#eee9ff', '#7656e8'], arms: ['#ffe9ef', '#e44f79'], other: ['#eaf0f8', '#546b88'],
};

function resolvePalette(muscle = '') {
  const key = muscle.toLowerCase();
  if (key.includes('chest')) return palettes.chest;
  if (key.includes('back')) return palettes.back;
  if (key.includes('leg') || key.includes('quad') || key.includes('glute') || key.includes('calf')) return palettes.legs;
  if (key.includes('shoulder')) return palettes.shoulders;
  if (key.includes('arm') || key.includes('bicep') || key.includes('tricep')) return palettes.arms;
  return palettes.other;
}

function movementFor(name = '', muscle = '') {
  const value = `${name} ${muscle}`.toLowerCase();
  if (value.includes('bench') || value.includes('chest press') || value.includes('push-up')) return 'press';
  if (value.includes('squat') || value.includes('lunge') || value.includes('leg press')) return 'squat';
  if (value.includes('deadlift') || value.includes('row') || value.includes('pull')) return 'pull';
  if (value.includes('curl') || value.includes('raise') || value.includes('extension')) return 'raise';
  return 'motion';
}

function PressGlyph() {
  return <><path d="M17 73h86M27 66h66" className="movement-muted" /><path d="M38 61 53 47l15 8 13 16M53 47l-7-13m22 21 10-13M51 83l10-20 15 20" className="movement-body" /><circle cx="43" cy="29" r="7" className="movement-fill" /><path d="M27 28h18m30 0h18M30 22v13m15-13v13m30-13v13m15-13v13" className="movement-accent" /></>;
}
function SquatGlyph() {
  return <><path d="M26 30h68m-56-7v14m12-14v14m20-14v14m12-14v14" className="movement-accent" /><circle cx="57" cy="39" r="7" className="movement-fill" /><path d="M57 47 46 62l17 10 17-10M46 62 34 82m29-10-4 18m21-28 10 20" className="movement-body" /><path d="M26 91h68" className="movement-muted" /></>;
}
function PullGlyph() {
  return <><circle cx="60" cy="27" r="7" className="movement-fill" /><path d="M60 35 51 58l14 16 18-17M51 58 31 65m34 9-9 17m9-17 17 17" className="movement-body" /><path d="M24 63h15m42-10h15M20 58v11m19-11v11m42-11v11m19-11v11" className="movement-accent" /><path d="M23 93h74" className="movement-muted" /></>;
}
function RaiseGlyph() {
  return <><circle cx="60" cy="29" r="7" className="movement-fill" /><path d="M60 37v31m0-23L37 52m23-7 23 7M47 89l13-21 13 21" className="movement-body" /><path d="m29 45 10 7m42-7-10 7m-45 5-8-6m76 6 8-6" className="movement-accent" /><path d="M25 93h70" className="movement-muted" /></>;
}
function MotionGlyph() {
  return <><path d="M22 77c11-17 24-25 38-25s27 8 38 25" className="movement-muted" /><circle cx="60" cy="30" r="8" className="movement-fill" /><path d="M60 40v31m0-20L37 63m23-12 23 12M47 91l13-20 13 20" className="movement-body" /><path d="M24 52h14m44 0h14M20 47v11m18-11v11m44-11v11m18-11v11" className="movement-accent" /></>;
}

export default function ExerciseVisual({ name = 'Movement', muscle, compact = false }) {
  const [soft, accent] = resolvePalette(muscle);
  const label = name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  const movement = movementFor(name, muscle);
  const Glyph = movement === 'press' ? PressGlyph : movement === 'squat' ? SquatGlyph : movement === 'pull' ? PullGlyph : movement === 'raise' ? RaiseGlyph : MotionGlyph;
  return (
    <div className={`exercise-visual visual-${movement} ${compact ? 'is-compact' : ''}`} style={{ '--exercise-soft': soft, '--exercise-accent': accent }} aria-hidden="true">
      <span className="visual-orbit orbit-one" /><span className="visual-orbit orbit-two" />
      <svg viewBox="0 0 120 120" fill="none" focusable="false"><Glyph /></svg>
      <span className="exercise-monogram">{label || 'EX'}</span>
    </div>
  );
}
