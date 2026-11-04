import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { WorldEvent } from '@dane-se/shared';
import { glowTexture, holeTexture } from './fxTextures';

type ShotEvent = Extract<WorldEvent, { type: 'shot' }>;

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const TRACER_SPEED = 240;
const TRACER_LENGTH = 3;
const TRACER_WIDTH = 0.03;
const MAX_TRACERS = 40;
const MAX_FLASHES = 16;
const MAX_DECALS = 80;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

interface Tracer {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  start: THREE.Vector3;
  dir: THREE.Vector3;
  dist: number;
  len: number;
  t: number;
}

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  grow: number;
  gravity: number;
  color: [number, number, number];
}

/** Partículas como quadros voltados para a câmera, desenhadas numa única malha instanciada. */
class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private items: Particle[] = [];
  private dummy = new THREE.Object3D();
  private tint = new THREE.Color();

  constructor(
    private capacity: number,
    material: THREE.Material,
  ) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  spawn(p: Particle): void {
    if (this.items.length < this.capacity) this.items.push(p);
  }

  update(dt: number, camera: THREE.Camera): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        this.items[i] = this.items[this.items.length - 1]!;
        this.items.pop();
      }
    }
    let n = 0;
    for (const p of this.items) {
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const t = p.age / p.life;
      this.dummy.position.copy(p.pos);
      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.scale.setScalar(Math.max(0.001, p.size * (1 + p.grow * t) * (1 - t * t)));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, this.tint.setRGB(p.color[0], p.color[1], p.color[2]));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

function createEffects() {
  const root = new THREE.Group();

  const tracerGeometry = new THREE.BoxGeometry(1, 1, 1);
  const tracers: Tracer[] = Array.from({ length: MAX_TRACERS }, () => {
    const material = new THREE.MeshBasicMaterial({
      color: '#ffe3a0',
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(tracerGeometry, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    root.add(mesh);
    return { mesh, material, active: false, start: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, len: 0, t: 0 };
  });
  let nextTracer = 0;

  const flashMaterial = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: '#ffd9a0',
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const flashes = Array.from({ length: MAX_FLASHES }, () => {
    const sprite = new THREE.Sprite(flashMaterial);
    sprite.visible = false;
    root.add(sprite);
    return { sprite, life: 0 };
  });
  let nextFlash = 0;

  const holeMaterial = new THREE.MeshBasicMaterial({
    map: holeTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    fog: false,
  });
  const holeGeometry = new THREE.PlaneGeometry(0.13, 0.13);
  const decals: THREE.Mesh[] = [];
  let nextDecal = 0;

  const sparks = new ParticlePool(
    256,
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  const soft = new ParticlePool(
    256,
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, fog: false }),
  );
  root.add(sparks.mesh, soft.mesh);

  function spawnTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const dist = from.distanceTo(to);
    if (dist < 0.8) return;
    const tracer = tracers[nextTracer]!;
    nextTracer = (nextTracer + 1) % MAX_TRACERS;
    tracer.active = true;
    tracer.start.copy(from);
    tracer.dir.copy(to).sub(from).normalize();
    tracer.dist = dist;
    tracer.len = Math.min(TRACER_LENGTH, dist * 0.6);
    tracer.t = 0;
    tracer.mesh.quaternion.setFromUnitVectors(Z_AXIS, tracer.dir);
  }

  function spawnFlash(at: THREE.Vector3): void {
    const flash = flashes[nextFlash]!;
    nextFlash = (nextFlash + 1) % MAX_FLASHES;
    flash.sprite.position.copy(at);
    flash.sprite.scale.setScalar(rand(0.28, 0.45));
    flash.sprite.material.rotation = rand(0, Math.PI * 2);
    flash.sprite.visible = true;
    flash.life = 0.06;
  }

  function impactWall(to: THREE.Vector3, normal: THREE.Vector3): void {
    if (normal.lengthSq() < 1e-6) return;
    let decal = decals[nextDecal];
    if (!decal) {
      decal = new THREE.Mesh(holeGeometry, holeMaterial);
      decals[nextDecal] = decal;
      root.add(decal);
    }
    nextDecal = (nextDecal + 1) % MAX_DECALS;
    decal.position.copy(to).addScaledVector(normal, 0.012);
    decal.quaternion.setFromUnitVectors(Z_AXIS, normal);
    decal.rotateZ(rand(0, Math.PI * 2));

    for (let i = 0; i < 7; i++) {
      const vel = normal.clone().multiplyScalar(rand(1.5, 4)).add(new THREE.Vector3(rand(-1.3, 1.3), rand(-0.5, 1.5), rand(-1.3, 1.3)));
      sparks.spawn({
        pos: to.clone().addScaledVector(normal, 0.02),
        vel,
        age: 0,
        life: rand(0.16, 0.3),
        size: 0.05,
        grow: -0.2,
        gravity: 9,
        color: [1, rand(0.65, 0.85), 0.35],
      });
    }
    for (let i = 0; i < 3; i++) {
      soft.spawn({
        pos: to.clone().addScaledVector(normal, 0.03),
        vel: normal.clone().multiplyScalar(0.5).add(new THREE.Vector3(rand(-0.4, 0.4), rand(0, 0.5), rand(-0.4, 0.4))),
        age: 0,
        life: rand(0.45, 0.7),
        size: 0.13,
        grow: 2.2,
        gravity: -0.3,
        color: [0.55, 0.55, 0.52],
      });
    }
  }

  function blood(to: THREE.Vector3, dir: THREE.Vector3): void {
    for (let i = 0; i < 9; i++) {
      soft.spawn({
        pos: to.clone(),
        vel: dir.clone().multiplyScalar(rand(0.8, 3)).add(new THREE.Vector3(rand(-1.2, 1.2), rand(0, 1.6), rand(-1.2, 1.2))),
        age: 0,
        life: rand(0.3, 0.55),
        size: rand(0.05, 0.1),
        grow: 0.6,
        gravity: 5,
        color: [0.5, 0.04, 0.04],
      });
    }
  }

  return {
    root,
    onShot(e: ShotEvent, muzzle: THREE.Vector3, meId: string): void {
      const to = new THREE.Vector3(e.to.x, e.to.y, e.to.z);
      const from = new THREE.Vector3(e.from.x, e.from.y, e.from.z);
      let start: THREE.Vector3;
      if (e.shooter === meId) {
        start = muzzle.clone();
      } else {
        const dir = to.clone().sub(from).normalize();
        const side = new THREE.Vector3().crossVectors(dir, UP);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize();
        start = from.clone().addScaledVector(dir, 0.55).addScaledVector(side, 0.2);
        start.y -= 0.3;
        spawnFlash(start);
      }
      spawnTracer(start, to);
      const travel = to.clone().sub(start).normalize();
      if (e.hit === 'wall' && e.normal) impactWall(to, new THREE.Vector3(e.normal.x, e.normal.y, e.normal.z));
      else if (e.hit === 'player') blood(to, travel);
    },
    update(dt: number, camera: THREE.Camera): void {
      for (const tracer of tracers) {
        if (!tracer.active) continue;
        tracer.t += dt;
        const travelled = TRACER_SPEED * tracer.t;
        const head = Math.min(travelled, tracer.dist);
        const tail = Math.max(0, travelled - tracer.len);
        if (tail >= tracer.dist) {
          tracer.active = false;
          tracer.mesh.visible = false;
          continue;
        }
        const length = head - tail;
        tracer.mesh.visible = length > 0.01;
        tracer.mesh.position.copy(tracer.start).addScaledVector(tracer.dir, tail + length / 2);
        tracer.mesh.scale.set(TRACER_WIDTH, TRACER_WIDTH, Math.max(length, 0.01));
        tracer.material.opacity = 1 - 0.55 * (head / tracer.dist);
      }
      for (const flash of flashes) {
        if (flash.life <= 0) continue;
        flash.life -= dt;
        if (flash.life <= 0) flash.sprite.visible = false;
      }
      sparks.update(dt, camera);
      soft.update(dt, camera);
    },
    dispose(): void {
      tracerGeometry.dispose();
      for (const tracer of tracers) tracer.material.dispose();
      flashMaterial.dispose();
      holeMaterial.dispose();
      holeGeometry.dispose();
      sparks.dispose();
      soft.dispose();
    },
  };
}

/** Traçantes, flashes, faíscas, furos de bala e sangue, alimentados pelos eventos `shot` do motor. */
export function CsEffects({
  fx,
  meId,
  muzzle,
}: {
  fx: MutableRefObject<WorldEvent[]>;
  meId: string;
  muzzle: MutableRefObject<THREE.Vector3>;
}) {
  const { camera } = useThree();
  const effects = useMemo(createEffects, []);
  useEffect(() => () => effects.dispose(), [effects]);

  useFrame((_, rawDt) => {
    const queue = fx.current;
    if (queue.length > 0) {
      for (const e of queue.splice(0)) if (e.type === 'shot') effects.onShot(e, muzzle.current, meId);
    }
    effects.update(Math.min(rawDt, 0.05), camera);
  });

  return <primitive object={effects.root} />;
}
