import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

// Domain-owned paths replace the global overflow strip. Each primary area
// exposes its related workflows at the point users expect to find them.
export default function DomainLinks({ label, title, items }) {
  return <section className="domain-links" aria-label={label}>
    <div className="domain-links-heading">
      <p className="eyebrow">{label}</p>
      {title ? <h2>{title}</h2> : null}
    </div>
    <div className={`domain-links-grid domain-links-${Math.min(items.length, 3)}`}>
      {items.map(({ to, href, onSelect, icon: Icon, title: itemTitle, copy }) => {
        const content = <><span className="domain-link-icon"><Icon size={18} strokeWidth={2.1} /></span><span className="domain-link-copy"><strong>{itemTitle}</strong><small>{copy}</small></span><ArrowUpRight size={16} aria-hidden="true" /></>;
        const key = to || href || itemTitle;
        if (onSelect) return <button key={key} type="button" onClick={onSelect}>{content}</button>;
        if (href) return <a key={key} href={href}>{content}</a>;
        return <Link key={key} to={to}>{content}</Link>;
      })}
    </div>
  </section>;
}
