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

function MovementGlyph({ pattern }) {
  const poses = {
    horizontal_press: 'M24 48h48M42 29l12 19 14-17M32 68h50', vertical_press: 'M48 67V26m0 0-13 13m13-13 13 13M27 24h42',
    horizontal_pull: 'M25 43h50m-11-12 11 12-11 12M35 66l13-23 13 23', vertical_pull: 'M24 26h48M48 26v38m-13-12 13 12 13-12',
    squat: 'M48 24v22L31 64m17-18 18 18M26 27h44', hinge: 'M28 31l22 18 20-14M50 49 35 68m15-19 18 19M22 70h52',
    curl: 'M48 26v38M31 39l17 13 17-13M26 68h44', raise: 'M48 69V40M25 30l23 10 23-10M48 40V22',
    knee_flexion: 'M27 59h42M32 43l16 16 16-16M22 70h52', calf_raise: 'M48 25v37M32 65h32M27 70h42', anti_extension: 'M21 61h58M32 50h32M34 42l-13 19m45-19 13 19', movement: 'M48 23c8 0 14 6 14 14S56 51 48 51 34 45 34 37s6-14 14-14Zm0 30v23M28 69l20-16 20 16',
  };
  return <svg className="exercise-motion-glyph" viewBox="0 0 96 96" role="img" aria-label={`${String(pattern).replace(/_/g, ' ')} movement illustration`}><path d={poses[pattern] || poses.movement} /><circle cx="48" cy="15" r="5" /></svg>;
}

export default function ExerciseVisual({ name = 'Movement', muscle, exercise, compact = false }) {
  const identity = exerciseIdentity(exercise || { name, muscle_group: muscle });
  const asset = artworkFor(identity);
  const [failed, setFailed] = useState(false);
  const visualLabel = identity.primary_muscles?.[0] || muscle || 'Training movement';
  return <div className={`exercise-visual ${asset && !failed ? 'has-stitch-art' : 'has-movement-glyph'} ${compact ? 'is-compact' : ''}`} aria-label={visualLabel}>
    {asset && !failed ? <img src={asset.src} alt={asset.alt} loading="lazy" onError={() => setFailed(true)} /> : <MovementGlyph pattern={identity.visual_key} />}
    <span className="exercise-visual-badge">{visualLabel}</span>
  </div>;
}
