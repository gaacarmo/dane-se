import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { IDLE_INPUT, type PlayerInput } from '@dane-se/shared';

const SENSITIVITY = 0.0022;
const PITCH_LIMIT = 1.5;

export interface CsInput {
  /** Estado atual das teclas e da mira, no formato que o motor consome. */
  read(): PlayerInput;
  look(): { yaw: number; pitch: number };
  setLook(yaw: number, pitch: number): void;
  locked: boolean;
  requestLock(): void;
  releaseLock(): void;
}

/** Teclado e mouse (pointer lock) do modo CS no desktop. */
export function useCsInput(target: RefObject<HTMLElement | null>): CsInput {
  const keys = useRef(new Set<string>());
  const lookRef = useRef({ yaw: 0, pitch: 0 });
  const firing = useRef(false);
  const reloadEdge = useRef(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const isLocked = () => !!target.current && document.pointerLockElement === target.current;
    const clear = () => {
      keys.current.clear();
      firing.current = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || !isLocked()) return;
      keys.current.add(e.code);
      if (e.code === 'KeyR') reloadEdge.current = true;
      if (e.code === 'Space' || e.code === 'ControlLeft') e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked()) return;
      const look = lookRef.current;
      look.yaw -= e.movementX * SENSITIVITY;
      look.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, look.pitch - e.movementY * SENSITIVITY));
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && isLocked()) firing.current = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) firing.current = false;
    };
    const onLockChange = () => {
      setLocked(isLocked());
      if (!isLocked()) clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clear);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clear);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onLockChange);
      if (document.pointerLockElement === target.current) document.exitPointerLock();
    };
  }, [target]);

  return useMemo(
    () => ({
      read(): PlayerInput {
        const k = keys.current;
        const reload = reloadEdge.current;
        reloadEdge.current = false;
        return {
          ...IDLE_INPUT,
          moveX: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
          moveZ: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
          yaw: lookRef.current.yaw,
          pitch: lookRef.current.pitch,
          jump: k.has('Space'),
          crouch: k.has('ControlLeft') || k.has('KeyC'),
          fire: firing.current,
          reload,
          use: k.has('KeyE'),
        };
      },
      look: () => lookRef.current,
      setLook(yaw: number, pitch: number) {
        lookRef.current = { yaw, pitch };
      },
      locked,
      requestLock() {
        void target.current?.requestPointerLock();
      },
      releaseLock() {
        if (document.pointerLockElement) document.exitPointerLock();
      },
    }),
    [target, locked],
  );
}
