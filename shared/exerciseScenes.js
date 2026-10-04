// Drawn movement scenes. Every scene is a self-contained SVG string with inline
// paint (no CSS classes, no external references), so it renders identically as a
// data-URI <img> on the web and through react-native-svg's SvgXml on mobile, and
// it can never be a broken image.

const FLOOR = 'fill="#246497" fill-opacity=".18"';
const SKIN = 'fill="url(#s-skin)"';
const KIT = 'fill="url(#s-kit)"';
const BENCH = 'fill="#406e96" stroke="#183c5d" stroke-width="2"';
const SOLID = 'fill="#406e96"';
const METAL = 'fill="none" stroke="url(#s-metal)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"';
const CABLE = 'fill="none" stroke="#4a8fc0" stroke-width="2.2" stroke-linecap="round"';
const WEIGHT = 'fill="#17466e"';

const limbs = {
  stand: `<path ${SKIN} d="M-10 38 4 61 13 61 4 30Z"/><path ${SKIN} d="M4 30 18 61 27 61 13 24Z"/><path ${KIT} d="M-10 14 13 11 20 32 2 40-13 29Z"/><path ${SKIN} d="M-13 22-28 41-23 45-4 30ZM17 20 30 38 35 34 21 12Z"/>`,
  squat: `<path ${KIT} d="M-12 15 15 10 19 33-4 42-16 30Z"/><path ${SKIN} d="M-4 38-25 57-18 64 7 47ZM8 39 26 55 20 62 0 47Z"/><path ${SKIN} d="M-12 23-30 17-32 23-14 30ZM15 21 33 16 35 22 18 29Z"/>`,
  hinge: `<path ${KIT} d="M-12 17 16 20 22 36 4 43-17 31Z"/><path ${SKIN} d="M3 39-16 58-8 64 13 47ZM12 40 32 54 27 62 5 47Z"/><path ${SKIN} d="M-14 28-31 46-26 51-5 35ZM17 30 31 49 36 45 21 25Z"/>`,
  curl: `<path ${KIT} d="M-11 14 13 12 20 34 3 40-14 29Z"/><path ${SKIN} d="M-12 24-25 37-20 43-5 31ZM16 23 28 36 23 42 9 29Z"/><path ${SKIN} d="M-8 38-18 62-10 64 2 42ZM8 39 20 62 28 60 16 37Z"/>`,
  plank: `<path ${KIT} d="M-28 22 13 25 27 39 10 47-30 37Z"/><path ${SKIN} d="M-26 33-39 56-33 59-18 40ZM16 41 34 59 40 54 22 34Z"/><path ${SKIN} d="M-2 43-13 64-7 67 6 47ZM18 43 33 59 38 54 25 39Z"/>`,
};

const athlete = ({ x = 80, y = 43, rotate = 0, pose = 'stand' } = {}) => `<g transform="translate(${x} ${y}) rotate(${rotate})"><circle ${SKIN} cx="-2" cy="0" r="9"/>${limbs[pose] || limbs.stand}</g>`;
const barbell = (x, y, width = 72, rotate = 0) => `<g transform="translate(${x} ${y}) rotate(${rotate})"><rect ${METAL} x="${-width / 2}" y="-2" width="${width}" height="4" rx="2"/><rect ${WEIGHT} x="${-width / 2 - 5}" y="-8" width="5" height="16" rx="2"/><rect ${WEIGHT} x="${width / 2}" y="-8" width="5" height="16" rx="2"/></g>`;
const dumbbell = (x, y, rotate = 0) => `<g transform="translate(${x} ${y}) rotate(${rotate})"><rect ${METAL} x="-10" y="-2" width="20" height="4" rx="2"/><rect ${WEIGHT} x="-14" y="-6" width="5" height="12" rx="2"/><rect ${WEIGHT} x="9" y="-6" width="5" height="12" rx="2"/></g>`;
const machine = (x = 25, y = 15, cable = false) => `<g><path ${METAL} d="M${x} ${y + 75}V${y}h19v75M${x - 4} ${y + 75}h27"/>${cable ? `<circle cx="${x + 9}" cy="${y + 8}" r="4" fill="#e9f9ff" stroke="#337eae" stroke-width="2"/><path ${CABLE} d="M${x + 9} ${y + 12}v38l34 15"/>` : ''}</g>`;
const pullUpBar = `<path ${METAL} d="M30 12H130M38 12V96M122 12V96"/>`;

const scenes = {
  horizontal_press: () => `<path ${BENCH} d="M37 76h69l-5 7H41Z"/><path ${BENCH} d="M49 82l-9 14m50-14 9 14"/>${athlete({ x: 79, y: 52, rotate: -86 })}${barbell(79, 32, 91)}`,
  incline_press: () => `<path ${BENCH} d="M42 76 92 50l5 8-51 27Z"/><path ${BENCH} d="M54 82 47 96m37-28 11 28"/>${athlete({ x: 76, y: 53, rotate: -53 })}${dumbbell(56, 33, -8)}${dumbbell(99, 33, 8)}`,
  fly: () => `<path ${BENCH} d="M37 76h69l-5 7H41Z"/><path ${BENCH} d="M49 82l-9 14m50-14 9 14"/>${athlete({ x: 79, y: 52, rotate: -86 })}${dumbbell(40, 50, 90)}${dumbbell(118, 50, 90)}`,
  push_up: () => `<path ${FLOOR} d="M25 92h108v7H25Z"/>${athlete({ x: 75, y: 56, rotate: -6, pose: 'plank' })}`,
  vertical_pull: () => `${machine(25, 11, true)}<path ${SOLID} d="M66 76h32v7H66Z"/>${athlete({ x: 81, y: 46 })}${barbell(81, 42, 44)}`,
  horizontal_pull: () => `${machine(24, 25, true)}<path ${CABLE} d="M38 65h35"/><path ${SOLID} d="M73 78h34v7H73Z"/>${athlete({ x: 92, y: 50, rotate: 7 })}`,
  vertical_press: () => `${athlete({ x: 80, y: 36 })}${dumbbell(49, 13, 90)}${dumbbell(111, 13, 90)}`,
  squat: () => `${barbell(80, 25, 106)}${athlete({ x: 80, y: 39, pose: 'squat' })}`,
  lunge: () => `${athlete({ x: 80, y: 38, pose: 'squat' })}${dumbbell(48, 52, -80)}${dumbbell(112, 52, 80)}<path ${SOLID} d="M112 80h22v6h-22Z"/>`,
  hinge: () => `${barbell(80, 76, 91)}${athlete({ x: 80, y: 37, rotate: 8, pose: 'hinge' })}`,
  curl: () => `${athlete({ x: 80, y: 37, pose: 'curl' })}${dumbbell(57, 52, -60)}${dumbbell(105, 52, 60)}`,
  extension: () => `${machine(27, 13, true)}${athlete({ x: 92, y: 38 })}<path ${CABLE} d="M38 60 67 58"/>${dumbbell(65, 58)}`,
  raise: () => `${athlete({ x: 80, y: 37 })}${dumbbell(48, 33, -27)}${dumbbell(112, 33, 27)}`,
  knee_extension: () => `${machine(29, 25)}<path ${SOLID} d="M61 71h30v8H61Z"/>${athlete({ x: 80, y: 50, rotate: -20 })}<path ${METAL} d="M100 78h24"/>`,
  knee_flexion: () => `${machine(29, 25)}<path ${SOLID} d="M61 71h47v8H61Z"/>${athlete({ x: 86, y: 53, rotate: -85 })}<path ${METAL} d="M114 72v17h16"/>`,
  calf_raise: () => `${machine(33, 18)}${athlete({ x: 89, y: 37 })}<path ${SOLID} d="M64 82h53v7H64Z"/>`,
  anti_extension: () => `<path ${FLOOR} d="M25 80h108v11H25Z"/>${athlete({ x: 75, y: 41, rotate: -6, pose: 'plank' })}`,
  crunch: () => `<path ${FLOOR} d="M25 80h108v11H25Z"/>${athlete({ x: 72, y: 56, rotate: -62, pose: 'curl' })}`,
  hang_raise: () => `${pullUpBar}${athlete({ x: 80, y: 33, pose: 'curl' })}`,
  movement: () => `<path fill="none" stroke="#6fbef2" stroke-width="3" stroke-dasharray="5 5" d="M44 54c7-30 62-31 72 0-9 31-65 31-72 0Z"/>${athlete({ x: 80, y: 36 })}`,
};

const svgCache = new Map();

/** Complete SVG document for a movement pattern; unknown patterns get the generic movement scene. */
export function exerciseSceneSvg(pattern) {
  const key = scenes[pattern] ? pattern : 'movement';
  if (!svgCache.has(key)) {
    svgCache.set(key, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 118"><defs><linearGradient id="s-skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1b489"/><stop offset="1" stop-color="#be6e5a"/></linearGradient><linearGradient id="s-kit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f4e79"/><stop offset="1" stop-color="#0b2542"/></linearGradient><linearGradient id="s-metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ed8fb"/><stop offset="1" stop-color="#3275aa"/></linearGradient></defs><rect ${FLOOR} x="14" y="93" width="132" height="7" rx="3.5"/>${scenes[key]()}</svg>`);
  }
  return svgCache.get(key);
}

export const exerciseSceneDataUri = (pattern) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(exerciseSceneSvg(pattern))}`;
