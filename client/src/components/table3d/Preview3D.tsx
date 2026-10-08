import { CHARACTER_IDS } from '@dane-se/shared';
import { Scene3D } from './Scene3D';

/** Dev-only page (`?preview3d`): all characters around the table, no server needed. */
export function Preview3D() {
  const params = new URLSearchParams(location.search);
  const n = Math.min(6, Math.max(2, Number(params.get('n') ?? 6)));
  const seats = CHARACTER_IDS.slice(0, n).map((character) => ({ id: character, character }));
  const you = Math.min(n - 1, Number(params.get('you') ?? 0));
  return (
    <div className="h-dvh w-full">
      <Scene3D seats={seats} youIndex={you} focusId={seats[(you + 2) % n]?.id} />
    </div>
  );
}
