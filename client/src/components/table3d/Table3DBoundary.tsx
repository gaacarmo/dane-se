import { Component, type ReactNode } from 'react';
import { setPref } from '../../lib/prefs';
import { notify } from '../../lib/store';

/**
 * If the 3D table crashes (no WebGL, lost graphics context, an old device), switch to the Mobile table
 * instead of leaving a blank screen.
 */
export class Table3DBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('3D table failed, switching to the Mobile table', error);
    setPref('view3d', false);
    notify('O modo Desktop não funcionou neste aparelho. Mudamos pro modo Mobile.', 'info');
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
