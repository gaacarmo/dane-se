import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { IDLE_INPUT, type PlayerInput } from '@dane-se/shared';
import { getPrefs } from '../../lib/prefs';

const PITCH_LIMIT = 1.5;
const WHEEL_COOLDOWN_MS = 150;

export interface CsInputHandlers {
  onLock(locked: boolean): void;
  onLockError(): void;
}

export interface CsInput {
  /** Estado atual das teclas e da mira, no formato que o motor consome. */
  read(): PlayerInput;
  look(): { yaw: number; pitch: number };
  setLook(yaw: number, pitch: number): void;
  isLocked(): boolean;
  requestLock(): void;
  releaseLock(): void;
  /** Só para teste visual em DEV: força campos do input até receber `null`. */
  debugOverride(patch: Partial<PlayerInput> | null): void;
  /** Controles de toque (celular): alimentam o mesmo `read()` do teclado e do mouse. */
  touch: TouchApi;
}

export interface TouchApi {
  setMove(x: number, z: number): void;
  addLook(dxPx: number, dyPx: number): void;
  setFire(down: boolean): void;
  setUse(down: boolean): void;
  jump(): void;
  toggleCrouch(): void;
  reload(): void;
  switchWeapon(): void;
}

/** Aparelho de toque como entrada principal (celular e tablet). */
export function isTouchDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/** Sensibilidade do dedo em relação à do mouse: um pixel de tela gira mais que um contador do mouse. */
const TOUCH_LOOK_GAIN = 1.8;

function typingInField(e: Event): boolean {
  const el = e.target;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

/**
 * Teclado e mouse (pointer lock) do modo CS no desktop. O objeto devolvido é estável; quem decide o que fazer com o
 * lock (abrir menu, pausar) é a máquina de estados do chamador, avisada por `handlers`.
 */
export function useCsInput(target: RefObject<HTMLElement | null>, handlers: RefObject<CsInputHandlers>): CsInput {
  const keys = useRef(new Set<string>());
  const lookRef = useRef({ yaw: 0, pitch: 0 });
  const firing = useRef(false);
  /** Um clique mais curto que um passo da simulação ainda vale um disparo. */
  const fireTap = useRef(false);
  const reloadEdge = useRef(false);
  const slotEdge = useRef<0 | 1 | 2 | 3>(0);
  const lastWheel = useRef(0);
  const override = useRef<Partial<PlayerInput> | null>(null);
  const touchState = useRef({ x: 0, z: 0, fire: false, use: false, jump: false, crouch: false });
  const touchLocked = useRef(false);

  const api = useMemo<CsInput>(() => {
    const touchMode = isTouchDevice();
    const isLocked = () => (touchMode ? touchLocked.current : !!target.current && document.pointerLockElement === target.current);
    const fail = () => handlers.current?.onLockError();
    /** O toque no botão de pulo vale por um passo da simulação, como o clique curto do tiro. */
    const consumeJump = () => {
      const pressed = touchState.current.jump;
      touchState.current.jump = false;
      return pressed;
    };
    return {
      read(): PlayerInput {
        const k = keys.current;
        const locked = isLocked();
        const reload = locked && reloadEdge.current;
        const slot = locked ? slotEdge.current : 0;
        reloadEdge.current = false;
        slotEdge.current = 0;
        const fireNow = fireTap.current;
        fireTap.current = false;
        const base: PlayerInput = {
          ...IDLE_INPUT,
          moveX: Math.max(-1, Math.min(1, (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + touchState.current.x)),
          moveZ: Math.max(-1, Math.min(1, (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + touchState.current.z)),
          yaw: lookRef.current.yaw,
          pitch: lookRef.current.pitch,
          jump: k.has('Space') || consumeJump(),
          crouch: k.has('KeyC') || touchState.current.crouch,
          walk: k.has('ShiftLeft') || k.has('ShiftRight'),
          fire: locked && (firing.current || fireNow || touchState.current.fire),
          reload,
          use: locked && (k.has('KeyE') || touchState.current.use),
          slot,
        };
        return override.current ? { ...base, ...override.current } : base;
      },
      look: () => lookRef.current,
      setLook(yaw: number, pitch: number) {
        lookRef.current = { yaw, pitch };
      },
      isLocked,
      requestLock() {
        const el = target.current;
        if (!el) return;
        if (touchMode) {
          // Sem pointer lock no toque: tela cheia e paisagem, e o jogo segue como se o mouse estivesse travado.
          void document.documentElement.requestFullscreen?.().catch(() => {});
          void (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')?.catch(() => {});
          touchLocked.current = true;
          handlers.current?.onLock(true);
          return;
        }
        const plain = () => {
          try {
            const result: unknown = el.requestPointerLock();
            if (result instanceof Promise) result.catch(fail);
          } catch {
            fail();
          }
        };
        try {
          // Sem aceleração do sistema, como nos FPS; se a plataforma não suporta, cai para o pedido simples.
          const result: unknown = (el.requestPointerLock as (options?: object) => unknown).call(el, { unadjustedMovement: true });
          if (result instanceof Promise) result.catch(plain);
        } catch {
          plain();
        }
      },
      releaseLock() {
        if (touchMode) {
          if (touchLocked.current) {
            touchLocked.current = false;
            touchState.current = { ...touchState.current, x: 0, z: 0, fire: false, use: false };
            handlers.current?.onLock(false);
          }
          return;
        }
        if (document.pointerLockElement) document.exitPointerLock();
      },
      debugOverride(patch) {
        override.current = patch;
      },
      touch: {
        setMove(x, z) {
          touchState.current.x = x;
          touchState.current.z = z;
        },
        addLook(dxPx, dyPx) {
          const look = lookRef.current;
          const sensitivity = getPrefs().csSensitivity * TOUCH_LOOK_GAIN;
          look.yaw -= dxPx * sensitivity;
          look.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, look.pitch - dyPx * sensitivity));
        },
        setFire(down) {
          touchState.current.fire = down;
          if (down) fireTap.current = true;
        },
        setUse(down) {
          touchState.current.use = down;
        },
        jump() {
          touchState.current.jump = true;
        },
        toggleCrouch() {
          touchState.current.crouch = !touchState.current.crouch;
        },
        reload() {
          reloadEdge.current = true;
        },
        switchWeapon() {
          slotEdge.current = 3;
        },
      },
    };
  }, [target, handlers]);

  useEffect(() => {
    const clear = () => {
      keys.current.clear();
      firing.current = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || typingInField(e)) return;
      keys.current.add(e.code);
      if (!api.isLocked()) return;
      if (e.code === 'KeyR') reloadEdge.current = true;
      if (e.code === 'Digit1') slotEdge.current = 1;
      if (e.code === 'Digit2') slotEdge.current = 2;
      if (e.code === 'Space') e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onMouseMove = (e: MouseEvent) => {
      if (!api.isLocked()) return;
      const look = lookRef.current;
      const sensitivity = getPrefs().csSensitivity;
      look.yaw -= e.movementX * sensitivity;
      look.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, look.pitch - e.movementY * sensitivity));
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && api.isLocked()) {
        firing.current = true;
        fireTap.current = true;
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) firing.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (!api.isLocked() || e.timeStamp - lastWheel.current < WHEEL_COOLDOWN_MS) return;
      lastWheel.current = e.timeStamp;
      slotEdge.current = 3;
    };
    const onLockChange = () => {
      const locked = api.isLocked();
      if (!locked) clear();
      handlers.current?.onLock(locked);
    };
    const onLockError = () => handlers.current?.onLockError();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clear);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', onLockError);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clear);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
      if (document.pointerLockElement === target.current) document.exitPointerLock();
    };
  }, [api, target, handlers]);

  return api;
}
