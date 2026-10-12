import { Component } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

/**
 * Catches render errors anywhere below it so a single bad screen cannot blank the whole app.
 *
 * Error reporting is deliberately safe: the user sees a short reference id, never a stack
 * trace, a component name, or the original message, which can contain user health data such as
 * exercise notes or body metrics. The full detail goes to the console for an engineer to read.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, reference: null };
    this.retry = () => this.setState({ error: null, reference: null });
  }

  static getDerivedStateFromError() {
    return { error: true, reference: `err_${Date.now().toString(36)}` };
  }

  componentDidCatch(error, info) {
    // Full detail goes to the console; the UI only ever shows a short reference id.
    console.error('[ui] render error', {
      message: error?.message,
      componentStack: info?.componentStack,
    });
    if (typeof this.props.onError === 'function') {
      try { this.props.onError(error, info); } catch { /* reporting must never throw */ }
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="quiet-panel" role="alert">
        <TriangleAlert size={24} />
        <h2>This screen could not be displayed.</h2>
        <p>Your training data is unaffected. Try again, and if it keeps happening use the reference below when reporting it.</p>
        <p><small>Reference: {this.state.reference}</small></p>
        <button type="button" className="secondary-action" onClick={this.retry}>
          <RefreshCw size={16} /> Try again
        </button>
      </div>
    );
  }
}
