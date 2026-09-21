import { useState } from 'react';

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

function artworkFor(name, muscle) {
  const label = `${name || ''} ${muscle || ''}`.toLowerCase();
  if (label.includes('incline dumbbell press')) return stitchArtwork.incline;
  if (/deadlift|romanian|\brdl\b|hip thrust|good morning|hamstring/.test(label)) return stitchArtwork.deadlift;
  if (/squat|lunge|leg press|leg extension|calf|quad|glute/.test(label)) return stitchArtwork.squat;
  if (/overhead|shoulder|lateral raise|front raise|shrug|deltoid/.test(label)) return stitchArtwork.overhead;
  if (/pull|row|lat |pulldown|curl|bicep|tricep|face pull|rear delt|back/.test(label)) return stitchArtwork.pull;
  if (/bench|chest|press|push.?up|fly|dip|pec/.test(label)) return stitchArtwork.bench;
  return stitchArtwork.bench;
}

export default function ExerciseVisual({ name = 'Movement', muscle, compact = false }) {
  const asset = artworkFor(name, muscle);
  const [failed, setFailed] = useState(false);
  const visualLabel = muscle || 'Training movement';
  return <div className={`exercise-visual ${!failed ? 'has-stitch-art' : 'is-artwork-unavailable'} ${compact ? 'is-compact' : ''}`} aria-label={visualLabel}>
    {!failed ? <img src={asset.src} alt={asset.alt} loading="lazy" onError={() => setFailed(true)} /> : <span className="exercise-visual-neutral" aria-hidden="true"><i /><i /><i /></span>}
    <span className="exercise-visual-badge">{visualLabel}</span>
  </div>;
}
