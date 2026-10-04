// In-app replacement for window.confirm: a bottom sheet with one confirm and one cancel action.
export default function ConfirmSheet({ title, body, confirmLabel, onConfirm, onCancel, danger = false }) {
  return <div className="sheet-backdrop" onMouseDown={onCancel}>
    <section className="more-sheet confirm-sheet" role="alertdialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
      <div className="sheet-handle" />
      <h2>{title}</h2>
      <p>{body}</p>
      <button type="button" className={`primary-action ${danger ? 'is-danger' : ''}`} autoFocus onClick={onConfirm}>{confirmLabel}</button>
      <button type="button" className="text-action" onClick={onCancel}>Cancel</button>
    </section>
  </div>;
}
