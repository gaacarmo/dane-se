import { Component, type ReactNode } from 'react';
import { setPref } from '../../lib/prefs';
import { notify } from '../../lib/store';
import { SCENE_FAILED_EVENT, SCENE_READY_EVENT } from '../../lib/webgl';

/** If the scene hasn't finished loading by then, give up and use the Mobile table. */
const LOAD_TIMEOUT_MS = 20000;

/**
 * If the 3D table crashes (no WebGL, lost graphics context, an old device), switch to the Mobile table
 * instead of leaving a blank screen.
 */
export class Table3DBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  private timer: ReturnType<typeof setTimeout> | undefined;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidMount() {
    this.timer = setTimeout(() => this.fail('timeout loading the 3D scene'), LOAD_TIMEOUT_MS);
    window.addEventListener(SCENE_READY_EVENT, this.onReady);
    window.addEventListener(SCENE_FAILED_EVENT, this.onFailed);
  }

  componentWillUnmount() {
    clearTimeout(this.timer);
    window.removeEventListener(SCENE_READY_EVENT, this.onReady);
    window.removeEventListener(SCENE_FAILED_EVENT, this.onFailed);
  }

  componentDidCatch(error: unknown) {
    this.fail(error);
  }

  private onReady = () => clearTimeout(this.timer);
  private onFailed = () => this.fail('WebGL context lost');

  private fail(reason: unknown) {
    clearTimeout(this.timer);
    if (!this.state.failed) this.setState({ failed: true });
    console.error('3D table failed, switching to the Mobile table:', reason);
    setPref('view3d', false);
    notify('O modo Desktop não funcionou neste aparelho. Mudamos pro modo Mobile.', 'info');
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
