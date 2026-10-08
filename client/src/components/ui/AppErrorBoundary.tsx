import { Component, type ReactNode } from 'react';
import { setPref } from '../../lib/prefs';
import { Button } from './Button';

/** Last resort: instead of a black page, show what failed and a way to keep playing. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('The app crashed:', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="room-bg flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-3xl gold-text">Algo deu errado</h1>
        <p className="max-w-sm text-stone-300">
          O jogo não conseguiu abrir direito. Tente o modo Mobile, que funciona em qualquer navegador.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              setPref('view3d', false);
              location.reload();
            }}
          >
            Jogar no modo Mobile
          </Button>
          <Button variant="secondary" onClick={() => location.reload()}>
            Recarregar
          </Button>
        </div>
        <pre className="max-w-md overflow-x-auto rounded-lg bg-black/40 p-3 text-left text-xs text-stone-400">
          {error.message}
        </pre>
      </main>
    );
  }
}
