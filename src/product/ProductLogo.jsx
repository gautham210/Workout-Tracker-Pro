export default function ProductLogo({ size = 30, title = 'Workout Tracker Pro' }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={title} className="product-logo">
    <defs><linearGradient id="wtp-mark" x1="3" y1="2" x2="29" y2="31" gradientUnits="userSpaceOnUse"><stop stopColor="#6cd7ff" /><stop offset=".48" stopColor="#007aff" /><stop offset="1" stopColor="#5551c7" /></linearGradient><linearGradient id="wtp-spark" x1="9" y1="8" x2="23" y2="24" gradientUnits="userSpaceOnUse"><stop stopColor="#fff" stopOpacity=".96"/><stop offset="1" stopColor="#d9f5ff" stopOpacity=".72"/></linearGradient></defs>
    <rect x="1" y="1" width="30" height="30" rx="10" fill="url(#wtp-mark)" />
    <path d="M8 22.5V10.4c0-.9.73-1.65 1.65-1.65.54 0 1.04.27 1.34.71l4.08 6.06 4.1-6.06c.3-.44.8-.71 1.34-.71.92 0 1.65.75 1.65 1.65v12.1" fill="none" stroke="url(#wtp-spark)" strokeWidth="2.55" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9.15 22.6h13.7" stroke="rgba(255,255,255,.55)" strokeWidth="1.35" strokeLinecap="round" />
    <circle cx="24.3" cy="8.4" r="1.45" fill="rgba(255,255,255,.83)" />
  </svg>;
}
