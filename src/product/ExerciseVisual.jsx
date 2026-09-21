import { useState } from 'react';

// Exercise photographs referenced by the supplied Stitch export. The export
// contains remote artwork rather than local image files, so unmatched entries
// deliberately render a neutral data fallback instead of invented movement art.
const stitchArtwork = [
  {
    match: 'incline dumbbell press',
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCKnbM3ULT1UFShU1l5uMveI7ptL_5UQmEt93yHnb18YJDgJsK9ftpGrFG94EUvBdPBHiE0cd1bNR_SPOHdmjaL-uemosP39XmN7ijhbIcCXHQys2sHJSFoxIgJiiHKjWpqMLZXH-urtMYFYLEtVCUCqnGkrW8X9FcPxpPLwqBsme0eID5b5_k5cuYS_drFIKJkfJ8P48g-i2x3KbYqQCdVdeqtbOdcwQFtgdFjSWL85OVmDIOzY',
    alt: 'Athlete performing an incline dumbbell press',
  },
  {
    match: 'weighted pull',
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAZ3AjrytKEzZXkmRMHoSgMONafMz1SbREfOQnWsIQnbls3871u2QBEjPQJsZtzw33FO0hQ4KtsWbHDXhTlsKPJmcLL4JbBV59V6LSF3e8pt1hThfIGAruya1B6PjJ0LXOH3G7RkPWYuZQhZB9JAvK7xS36OBNTjlvGAklnQbLtcoYJ1vR00MChuGn1bhZXXrD7GLrWnfMbupdH0o_GTWHwJT_sXTTTa_uj0B4L6tog69uzSLEx_Jc',
    alt: 'Athlete performing a weighted pull-up',
  },
  {
    match: 'overhead press',
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBWUqaLfpJhUvG3b3he1JHk1vJNhrZv6Qqp_1NCfJlcbAXMrYO_A-KPF65naa3i_1BSJFNZyvzS4pzIGlZo22S7H0fwOHHYsXe_Iz7Z8ZFmbNMY3CDdIiPbMdS2ISQJ0Jmae0-EsMNb3Vc9Pt_B7QBRcqx2ACWB8d1HN9HYsOZu_Wcge0d3wu_LW8uvgx0nSdI3iOeD13W7SX6amy2F3LZHjI1tcxy_F5-3FFVMS0ydAM4pJPZbne0',
    alt: 'Athlete performing a standing overhead press',
  },
  {
    match: 'squat',
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAi_YHPTszdm1fO-jYjRpvX4ta_DJMxOgxssBmutWos9kgzGyLB60qxx0aCN7gxHDIfwqVCBjx4GidUOeY4p_ut1_msonj0nLk0dsfF0SvS4MwMgmx_b-bHMxC1kubU010g4FHa5llpQ9JKl8nGLodKdKZaG_FufZ_uvaePgXjClskaFgzVhO5MN6Onf1ZhpCig2jIEFhVxswhHdAyEnRInhtm3xzQcX6GyWzE7hr3Yhp6Vzfo6gmU',
    alt: 'Athlete performing a barbell squat',
  },
  {
    match: 'deadlift',
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDlZfqrxXCA-uTcFyNhEwKRlJoql5jxsuK0nhfOSYYCXRQrCFZg9q6CoOIzwGa2Z1XFrLxqt8JnY2-dahg60LuK4JV_E5bFGeZLEn9NC-TFMD4rS8i4B_C33mYJub0a0u1By69kU82plGieIzCuAqdJGZXBoVj1-7LNk9uihBsX8hEKaaC4QNi4XDSRjBkIVY7Gq_s92J5OJ1DU8qDgz34gZygYqED6hCUdm_zK3tTwKNmRNlBHNXc',
    alt: 'Athlete performing a barbell deadlift',
  },
  {
    match: 'bench press',
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA7vPu9P8kfTvUmeZOMqS1czRyauPjCtaImxK8nAn2LaIMITwFYqS7wBlQW6rpiRoyimgvT9wnDMSgrbZ75RJ6Xu7utQQRTcfqtiJmqXLVCSnMFwUNwIW60r5XIT8Rlx67Us78b4oeyZLxNIlQxjQfyz-HRbydsLyBR43IJGVG-dn2m16Wccid4Rt7Mx0IWOTW1zV5Ue0oMuESSnEN1vze65q8Z0tWSsGFio8ZqnBpdlR3UQhD6tF4',
    alt: 'Athlete performing a barbell bench press',
  },
];

function artworkFor(name) {
  const label = String(name || '').toLowerCase();
  return stitchArtwork.find((asset) => label.includes(asset.match));
}

export default function ExerciseVisual({ name = 'Movement', muscle, compact = false }) {
  const asset = artworkFor(name);
  const [failed, setFailed] = useState(false);
  const label = name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  return <div className={`exercise-visual ${asset && !failed ? 'has-stitch-art' : 'is-data-fallback'} ${compact ? 'is-compact' : ''}`}>
    {asset && !failed ? <img src={asset.src} alt={asset.alt} loading="lazy" onError={() => setFailed(true)} /> : <><span className="exercise-fallback-muscle">{muscle || 'Movement'}</span><strong>{label || 'EX'}</strong></>}
    <span className="exercise-monogram">{label || 'EX'}</span>
  </div>;
}
