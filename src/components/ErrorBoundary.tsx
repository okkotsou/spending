/**
 * The last line of defence.
 *
 * A render error anywhere below this leaves a white screen and no way back.
 * Since all of the user's data is local, the important thing to say is that it
 * is still there, and to offer the two actions that help: reload, or take a
 * backup first. React still has no hook form of this, so it is a class.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Rendered instead of the children when a descendant throws. */
  fallback: (reset: () => void) => ReactNode;
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render failed', error, info.componentStack);
  }

  private readonly reset = () => this.setState({ failed: false });

  override render(): ReactNode {
    if (this.state.failed) return this.props.fallback(this.reset);
    return this.props.children;
  }
}
