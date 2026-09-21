import { useState } from 'react';
import { exerciseIdentity } from './exerciseMetadata';

// These are the actual movement photographs referenced by the supplied Stitch
// export. The export does not contain local artwork files, so the visual system
// maps every exercise to its closest supplied movement family rather than
// falling back to letter monograms.
const stitchArtwork = {
  incline: {
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCKnbM3ULT1UFShU1l5uMveI7ptL_5UQmEt93yHnb18YJDgJsK9ftpGrFG94EUvBdPBHiE0cd1bNR_SPOHdmjaL-uemosP39XmN7ijhbIcCXHQys2sHJSFoxIgJiiHKjWpqMLZXH-urtMYFYLEtVCUCqnGkrW8X9FcPxpPLwqBsme0eID5bP5_k5cuYS_drFIKJkfJ8P48g-i2x3KbYqQCdVdeqtbOdcwQFtgdFjSWL85OVmDIOzY',
    alt: 'Athlete performing an incline dumbbell press',
  },
  pull: {
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAZ3AjrytKEzZXkmRMHoSgMONafMz1SbREfOQnWsIQnbls3871u2QBEjPQJsZtzw33FO0hQ4KtsWbHDXhTlsKPJmcLL4JbBV59V6LSF3e8pt1hThfIGAruya1B6PjJ0LXOH3G7RkPWYuZQhZB9JAvK7xS36OBNTjlvGAklnQbLtcoYJ1vR00MChuGn1bhZXXrD7GLrWnfMbupdH0o_GTWHwJT_sXTTTa_uj0B4L6tog69uzSLEx_Jc',
    alt: 'Athlete performing a weighted pull-up',
  },
  overhead: {
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBWUqaLfpJhUvG3b3he1JHk1vJNhrZv6Qqp_1NCfJlcbAXMrYO_A-KPF65naa3i_1BSJFNZyvzS4pzIGlZo22S7H0fwOHHYsXe_Iz7Z8ZFmbNMY3CDdIiPbMdS2ISQJ0Jmae0-EsMNb3Vc9Pt_B7QBRcqx2ACWB8d1HN9HYsOZu_Wcge0d3wu_LW8uvgx0nSdI3iOeD13W7SX6amy2F3LZHjI1tcxy_F5-3FFVMS0ydAM4pJPZbne0',
    alt: 'Athlete performing a standing overhead press',
  },
  squat: {
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAi_YHPTszdm1fO-jYjRpvX4ta_DJMxOgxssBmutWos9kgzGyLB60qxx0aCN7gxHDIfwqVCBjx4GidUOeY4p_ut1_msonj0nLk0dsfF0SvS4MwMgmx_b-bHMxC1kubU010g4FHa5llpQ9JKl8nGLodKdKZaG_FufZ_uvaePgXjClskaFgzVhO5MN6Onf1ZhpCig2jIEFhVxswhHdAyEnRInhtm3xzQcX6GyWzE7hr3Yhp6Vzfo6gmU',
    alt: 'Athlete performing a barbell squat',
  },
  deadlift: {
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDlZfqrxXCA-uTcFyNhEwKRlJoql5jxsuK0nhfOSYYCXRQrCFZg9q6CoOIzwGa2Z1XFrLxqt8JnY2-dahg60LuK4JV_E5bFGeZLEn9NC-TFMD4rS8i4B_C33mYJub0a0u1By69kU82plGieIzCuAqdJGZXBoVj1-7LNk9uihBsX8hEKaaC4QNi4XDSRjBkIVY7Gq_s92J5OJ1DU8qDgz34gZygYqED6hCUdm_zK3tTwKNmRNlBHNXc',
    alt: 'Athlete performing a barbell deadlift',
  },
  bench: {
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA7vPu9P8kfTvUmeZOMqS1czRyauPjCtaImxK8nAn2LaIMITwFYqS7wBlQW6rpiRoyimgvT9wnDMSgrbZ75RJ6Xu7utQQRTcfqtiJmqXLVCSnMFwUNwIW60r5XIT8Rlx67Us78b4oeyZLxNIlQxjQfyz-HRbydsLyBR43IJGVG-dn2m16Wccid4Rt7Mx0IWOTW1zV5Ue0oMuESSnEN1vze65q8Z0tWSsGFio8ZqnBpdlR3UQhD6tF4',
    alt: 'Athlete performing a barbell bench press',
  },
};

function artworkFor(exercise) {
  // Only use supplied Stitch photography for the movement it actually depicts.
  // All other movements use the deterministic semantic illustration below.
  const label = String(exercise.name || '').toLowerCase();
  if (label.includes('incline dumbbell press')) return stitchArtwork.incline;
  if (/^barbell squat$|^back squat$/.test(label)) return stitchArtwork.squat;
  if (/^deadlift$|^barbell deadlift$/.test(label)) return stitchArtwork.deadlift;
  if (/^bench press$|^barbell bench press$/.test(label)) return stitchArtwork.bench;
  if (/^pull.?up$|^weighted pull.?up$/.test(label)) return stitchArtwork.pull;
  if (/^overhead press$|^standing overhead press$/.test(label)) return stitchArtwork.overhead;
  return null;
}

// The Stitch export only contains photography for six specific movements.
// For the rest of the catalogue we use this local, movement-specific scene
// system: each visual depicts the equipment and posture for that movement,
// rather than falling back to a letter, a generic dumbbell, or unrelated art.
function MovementScene({ pattern }) {
  const label = String(pattern || 'movement').replace(/_/g, ' ');
  return <svg className="exercise-movement-scene" viewBox="0 0 160 118" role="img" aria-label={`${label} exercise illustration`}>
    <defs>
      <linearGradient id="scene-skin" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f1b489"/><stop offset="1" stopColor="#be6e5a"/></linearGradient>
      <linearGradient id="scene-kit" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#1f4e79"/><stop offset="1" stopColor="#0b2542"/></linearGradient>
      <linearGradient id="scene-metal" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#9ed8fb"/><stop offset="1" stopColor="#3275aa"/></linearGradient>
    </defs>
    <rect className="scene-floor" x="14" y="93" width="132" height="7" rx="3.5" />
    {sceneFor(pattern)}
  </svg>;
}

function Athlete({ x = 80, y = 43, rotate = 0, pose = 'stand' }) {
  const limbs = {
    stand: <><path className="scene-skin" d="M-10 38 4 61 13 61 4 30Z"/><path className="scene-skin" d="M4 30 18 61 27 61 13 24Z"/><path className="scene-kit" d="M-10 14 13 11 20 32 2 40-13 29Z"/><path className="scene-skin" d="M-13 22-28 41-23 45-4 30ZM17 20 30 38 35 34 21 12Z"/></>,
    squat: <><path className="scene-kit" d="M-12 15 15 10 19 33-4 42-16 30Z"/><path className="scene-skin" d="M-4 38-25 57-18 64 7 47ZM8 39 26 55 20 62 0 47Z"/><path className="scene-skin" d="M-12 23-30 17-32 23-14 30ZM15 21 33 16 35 22 18 29Z"/></>,
    hinge: <><path className="scene-kit" d="M-12 17 16 20 22 36 4 43-17 31Z"/><path className="scene-skin" d="M3 39-16 58-8 64 13 47ZM12 40 32 54 27 62 5 47Z"/><path className="scene-skin" d="M-14 28-31 46-26 51-5 35ZM17 30 31 49 36 45 21 25Z"/></>,
    curl: <><path className="scene-kit" d="M-11 14 13 12 20 34 3 40-14 29Z"/><path className="scene-skin" d="M-12 24-25 37-20 43-5 31ZM16 23 28 36 23 42 9 29Z"/><path className="scene-skin" d="M-8 38-18 62-10 64 2 42ZM8 39 20 62 28 60 16 37Z"/></>,
    plank: <><path className="scene-kit" d="M-28 22 13 25 27 39 10 47-30 37Z"/><path className="scene-skin" d="M-26 33-39 56-33 59-18 40ZM16 41 34 59 40 54 22 34Z"/><path className="scene-skin" d="M-2 43-13 64-7 67 6 47ZM18 43 33 59 38 54 25 39Z"/></>,
  };
  return <g transform={`translate(${x} ${y}) rotate(${rotate})`}><circle className="scene-skin" cx="-2" cy="0" r="9"/>{limbs[pose] || limbs.stand}</g>;
}

function Barbell({ x, y, width = 72, rotate = 0 }) { return <g transform={`translate(${x} ${y}) rotate(${rotate})`}><rect className="scene-bar" x={-width / 2} y="-2" width={width} height="4" rx="2"/><rect className="scene-weight" x={-width / 2 - 5} y="-8" width="5" height="16" rx="2"/><rect className="scene-weight" x={width / 2} y="-8" width="5" height="16" rx="2"/></g>; }
function Dumbbell({ x, y, rotate = 0 }) { return <g transform={`translate(${x} ${y}) rotate(${rotate})`}><rect className="scene-bar" x="-10" y="-2" width="20" height="4" rx="2"/><rect className="scene-weight" x="-14" y="-6" width="5" height="12" rx="2"/><rect className="scene-weight" x="9" y="-6" width="5" height="12" rx="2"/></g>; }
function Machine({ x = 25, y = 15, cable = false }) { return <g><path className="scene-machine" d={`M${x} ${y + 75}V${y}h19v75M${x - 4} ${y + 75}h27`} />{cable && <><circle className="scene-pulley" cx={x + 9} cy={y + 8} r="4"/><path className="scene-cable" d={`M${x + 9} ${y + 12}v38l34 15`} /></>}</g>; }
function sceneFor(pattern) {
  switch (pattern) {
    case 'horizontal_press': return <><path className="scene-bench" d="M37 76h69l-5 7H41Z"/><path className="scene-bench" d="M49 82l-9 14m50-14 9 14"/><Athlete x={79} y={52} rotate={-86} pose="stand"/><Barbell x={79} y={32} width={91}/></>;
    case 'incline_press': return <><path className="scene-bench" d="M42 76 92 50l5 8-51 27Z"/><path className="scene-bench" d="M54 82 47 96m37-28 11 28"/><Athlete x={76} y={53} rotate={-53} pose="stand"/><Dumbbell x={56} y={33} rotate={-8}/><Dumbbell x={99} y={33} rotate={8}/></>;
    case 'vertical_pull': return <><Machine x={25} y={11} cable/><path className="scene-seat" d="M66 76h32v7H66Z"/><Athlete x={81} y={46} pose="stand"/><Barbell x={81} y={42} width={44}/></>;
    case 'horizontal_pull': return <><Machine x={24} y={25} cable/><path className="scene-cable" d="M38 65h35"/><path className="scene-seat" d="M73 78h34v7H73Z"/><Athlete x={92} y={50} rotate={7} pose="stand"/></>;
    case 'vertical_press': return <><Athlete x={80} y={36} pose="stand"/><Dumbbell x={49} y={13} rotate={90}/><Dumbbell x={111} y={13} rotate={90}/></>;
    case 'squat': return <><Barbell x={80} y={25} width={106}/><Athlete x={80} y={39} pose="squat"/></>;
    case 'hinge': return <><Barbell x={80} y={76} width={91}/><Athlete x={80} y={37} rotate={8} pose="hinge"/></>;
    case 'curl': return <><Athlete x={80} y={37} pose="curl"/><Dumbbell x={57} y={52} rotate={-60}/><Dumbbell x={105} y={52} rotate={60}/></>;
    case 'extension': return <><Machine x={27} y={13} cable/><Athlete x={92} y={38} pose="stand"/><path className="scene-cable" d="M38 60 67 58"/><Dumbbell x={65} y={58}/></>;
    case 'raise': return <><Athlete x={80} y={37} pose="stand"/><Dumbbell x={48} y={33} rotate={-27}/><Dumbbell x={112} y={33} rotate={27}/></>;
    case 'knee_flexion': return <><Machine x={29} y={25}/><path className="scene-seat" d="M61 71h47v8H61Z"/><Athlete x={86} y={53} rotate={-85} pose="stand"/><path className="scene-machine" d="M114 72v17h16"/></>;
    case 'calf_raise': return <><Machine x={33} y={18}/><Athlete x={89} y={37} pose="stand"/><path className="scene-platform" d="M64 82h53v7H64Z"/></>;
    case 'anti_extension': return <><path className="scene-mat" d="M25 80h108v11H25Z"/><Athlete x={75} y={41} rotate={-6} pose="plank"/></>;
    default: return <><path className="scene-orbit" d="M44 54c7-30 62-31 72 0-9 31-65 31-72 0Z"/><Athlete x={80} y={36} pose="stand"/></>;
  }
}

export default function ExerciseVisual({ name = 'Movement', muscle, exercise, compact = false }) {
  const identity = exerciseIdentity(exercise || { name, muscle_group: muscle });
  const asset = artworkFor(identity);
  const [failed, setFailed] = useState(false);
  const visualLabel = identity.primary_muscles?.[0] || muscle || 'Training movement';
  return <div className={`exercise-visual ${asset && !failed ? 'has-stitch-art' : 'has-exercise-scene'} ${compact ? 'is-compact' : ''}`} aria-label={visualLabel}>
    {asset && !failed ? <img src={asset.src} alt={asset.alt} loading="lazy" onError={() => setFailed(true)} /> : <MovementScene pattern={identity.visual_key} />}
    <span className="exercise-visual-badge">{visualLabel}</span>
  </div>;
}
