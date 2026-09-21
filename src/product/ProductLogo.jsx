export default function ProductLogo({ size = 30, title = 'Workout Tracker Pro' }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={title} className="product-logo">
    <defs><linearGradient id="wtp-mark" x1="4" y1="2" x2="29" y2="31" gradientUnits="userSpaceOnUse"><stop stopColor="#53c7ff" /><stop offset=".52" stopColor="#007aff" /><stop offset="1" stopColor="#6959d6" /></linearGradient></defs>
    <rect x="1" y="1" width="30" height="30" rx="10" fill="url(#wtp-mark)" />
    <path d="M8 11.5h16M10.5 8.5v6M21.5 8.5v6M10 20.5l4 3.5 8-12" fill="none" stroke="white" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 22.5h5" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}
