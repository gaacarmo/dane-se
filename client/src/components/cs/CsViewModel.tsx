import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useState, type MutableRefObject, type RefObject } from 'react';
import * as THREE from 'three';
import { WEAPONS, eyePos, type Match, type WeaponCategory } from '@dane-se/shared';
import { CHARACTER_SPECS } from '../table3d/characterSpecs';
import { glowTexture } from './fxTextures';
import type { CsInput } from './useCsInput';
import { MUZZLE_Z, WeaponModel } from './weaponModels';

const BASE: Record<WeaponCategory, [number, number, number]> = {
  pistol: [0.15, -0.17, -0.36],
  smg: [0.17, -0.19, -0.4],
  rifle: [0.18, -0.2, -0.44],
  sniper: [0.19, -0.2, -0.48],
};

const { damp, clamp } = THREE.MathUtils;

function wrap(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

interface RigState {
  init: boolean;
  category: WeaponCategory;
  weapon: string;
  ammo: number;
  hp: number;
  bomb: string;
  onGround: boolean;
  vy: number;
  eyeY: number;
  bob: number;
  bobAmp: number;
  dip: number;
  roll: number;
  kick: number;
  flash: number;
  flashRoll: number;
  swayX: number;
  swayY: number;
  prevYaw: number;
  prevPitch: number;
  flinchP: number;
  flinchY: number;
  shake: number;
}

/**
 * Câmera no olho do jogador e arma na mão. A câmera soma o recuo do motor ao olhar do mouse e ganha balanço ao
 * andar, queda ao pousar e tranco ao levar dano. A arma segue a câmera com coice, balanço, recarga e saque animados.
 */
export function FirstPersonRig({
  matchRef,
  meId,
  input,
  muzzle,
  spectateRef,
}: {
  matchRef: MutableRefObject<Match>;
  meId: string;
  input: CsInput;
  /** Posição do cano no mundo, atualizada por quadro; os traçantes dos seus tiros partem dela. */
  muzzle: MutableRefObject<THREE.Vector3>;
  /** Colega vivo que a câmera acompanha enquanto você está morto. */
  spectateRef: RefObject<string | null>;
}) {
  const { camera } = useThree();
  const root = useRef<THREE.Group>(null);
  const rig = useRef<THREE.Group>(null);
  const tip = useRef<THREE.Object3D>(null);
  const flash = useRef<THREE.Sprite>(null);
  const light = useRef<THREE.PointLight>(null);

  const me0 = matchRef.current.world.players.find((p) => p.id === meId)!;
  const spec = CHARACTER_SPECS[matchRef.current.roster.find((r) => r.id === meId)!.character];
  const [category, setCategory] = useState<WeaponCategory>(WEAPONS[me0.weapon].category);
  const st = useRef<RigState>({
    init: false,
    category: WEAPONS[me0.weapon].category,
    weapon: me0.weapon,
    ammo: me0.ammo,
    hp: me0.hp,
    bomb: 'carried',
    onGround: true,
    vy: 0,
    eyeY: 0,
    bob: 0,
    bobAmp: 0,
    dip: 0,
    roll: 0,
    kick: 0,
    flash: 0,
    flashRoll: 0,
    swayX: 0,
    swayY: 0,
    prevYaw: 0,
    prevPitch: 0,
    flinchP: 0,
    flinchY: 0,
    shake: 0,
  });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const match = matchRef.current;
    const me = match.world.players.find((p) => p.id === meId);
    if (!me) return;
    const s = st.current;
    const weapon = WEAPONS[me.weapon];
    if (weapon.category !== s.category) {
      s.category = weapon.category;
      setCategory(weapon.category);
    }
    const watched = me.alive ? undefined : match.world.players.find((p) => p.id === spectateRef.current && p.alive);
    const subject = watched ?? me;
    const look = me.alive ? input.look() : { yaw: subject.yaw, pitch: subject.pitch };
    const bomb = match.world.bomb;

    if (s.init) {
      if (me.alive && me.weapon === s.weapon && me.ammo < s.ammo) {
        s.kick = 1;
        s.flash = 1;
        s.flashRoll = Math.random() * Math.PI * 2;
      }
      if (me.hp < s.hp) {
        const amount = (s.hp - me.hp) / 100;
        s.flinchP = Math.min(0.12, 0.03 + amount * 0.12);
        s.flinchY = (Math.random() - 0.5) * 0.1;
      }
      if (bomb.status === 'exploded' && s.bomb !== 'exploded' && bomb.pos) {
        const distance = Math.hypot(me.body.pos.x - bomb.pos.x, me.body.pos.z - bomb.pos.z);
        s.shake = clamp(1.2 - distance / 30, 0.2, 1);
      }
      if (!s.onGround && me.body.onGround && s.vy < -2.5) s.dip = Math.min(0.14, -s.vy * 0.014);
    } else {
      s.prevYaw = look.yaw;
      s.prevPitch = look.pitch;
    }
    s.weapon = me.weapon;
    s.ammo = me.ammo;
    s.hp = me.hp;
    s.bomb = bomb.status;
    s.onGround = me.body.onGround;
    s.vy = me.body.vel.y;

    const eye = eyePos(subject.body);
    s.eyeY = watched || !s.init || !me.body.onGround || Math.abs(s.eyeY - eye.y) > 0.8 ? eye.y : damp(s.eyeY, eye.y, 18, dt);
    s.init = true;

    const speed = Math.hypot(me.body.vel.x, me.body.vel.z);
    const moving = me.alive && me.body.onGround && speed > 0.6;
    s.bobAmp = damp(s.bobAmp, moving ? Math.min(1, speed / 5.5) : 0, 10, dt);
    if (moving) s.bob += dt * speed * 2.3;
    const bobY = Math.sin(s.bob * 2) * 0.022 * s.bobAmp;
    const bobX = Math.cos(s.bob) * 0.011 * s.bobAmp;
    s.dip = damp(s.dip, 0, 9, dt);
    s.flinchP = damp(s.flinchP, 0, 9, dt);
    s.flinchY = damp(s.flinchY, 0, 9, dt);
    s.shake *= Math.exp(-3 * dt);
    const t = performance.now() / 1000;

    const yaw = look.yaw + (me.alive ? me.punchYaw : 0) + s.flinchY + Math.sin(t * 29 + 1) * 0.03 * s.shake;
    const pitch = clamp(
      look.pitch + (me.alive ? me.punchPitch : 0) + s.flinchP + Math.sin(t * 37) * 0.03 * s.shake,
      -1.55,
      1.55,
    );
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    s.roll = damp(s.roll, -(me.body.vel.x * rightX + me.body.vel.z * rightZ) * 0.0024, 10, dt);

    camera.position.set(eye.x + rightX * bobX, s.eyeY + bobY - s.dip, eye.z + rightZ * bobX);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, s.roll);

    const r = root.current;
    const g = rig.current;
    if (!r || !g) return;
    r.visible = me.alive;
    r.position.copy(camera.position);
    r.quaternion.copy(camera.quaternion);

    const invDt = 1 / Math.max(dt, 1e-3);
    s.swayX = damp(s.swayX, clamp(wrap(look.yaw - s.prevYaw) * invDt * 0.012, -0.05, 0.05), 12, dt);
    s.swayY = damp(s.swayY, clamp(-(look.pitch - s.prevPitch) * invDt * 0.012, -0.04, 0.04), 12, dt);
    s.prevYaw = look.yaw;
    s.prevPitch = look.pitch;
    s.kick *= Math.exp(-16 * dt);

    const base = BASE[weapon.category];
    let px = base[0] + bobX * 0.5 + s.swayX;
    let py = base[1] + bobY * 0.6 + s.swayY - s.dip * 0.4;
    const pz = base[2] + s.kick * 0.06;
    let rx = s.kick * 0.1 + s.swayY * 1.5;
    const ry = s.swayX * 2.2;
    let rz = -s.swayX * 1.2;
    const equip = me.equipLeftMs > 0 ? me.equipLeftMs / weapon.equipMs : 0;
    if (equip > 0) {
      py -= equip * equip * 0.42;
      rx -= equip * equip * 0.8;
    }
    if (me.reloadLeftMs > 0) {
      const curve = Math.sin(Math.PI * clamp(1 - me.reloadLeftMs / weapon.reloadMs, 0, 1));
      py -= curve * 0.17;
      rx -= curve * 0.6;
      rz += curve * 0.35;
      px -= curve * 0.05;
    }
    g.position.set(px, py, pz);
    g.rotation.set(rx, ry, rz);

    tip.current?.getWorldPosition(muzzle.current);

    s.flash = Math.max(0, s.flash - dt / 0.05);
    if (flash.current) {
      flash.current.visible = me.alive && s.flash > 0;
      const size = 0.06 + s.flash * 0.07;
      flash.current.scale.set(size, size, 1);
      flash.current.material.rotation = s.flashRoll;
    }
    if (light.current) light.current.intensity = me.alive ? s.flash * 7 : 0;
  });

  const z = MUZZLE_Z[category];
  return (
    <group ref={root}>
      <group ref={rig}>
        <WeaponModel category={category} skin={spec.skin} sleeve={spec.shirt.base} />
        <object3D ref={tip} position={[0, 0.012, z]} />
        <sprite ref={flash} position={[0, 0.012, z - 0.02]} visible={false}>
          <spriteMaterial
            map={glowTexture()}
            color="#ffbe6e"
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            fog={false}
          />
        </sprite>
        <pointLight ref={light} position={[0, 0.03, z - 0.08]} color="#ffb870" distance={9} intensity={0} decay={1.6} />
      </group>
    </group>
  );
}
