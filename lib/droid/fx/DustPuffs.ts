/**
 * Low-Gravity Lunar Dust Puff Particle System
 * Emits ballistic dust particles on foot touchdown following pure parabolic arcs
 * under celestial gravity (zero air resistance).
 */

import * as THREE from 'three';

interface DustParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  initialY: number;
}

export class LunarDustSystem {
  private readonly maxParticles = 128;
  private readonly particles: DustParticle[] = [];
  private readonly pointsMesh: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(0, -999, 0),
        vel: new THREE.Vector3(0, 0, 0),
        age: 0,
        maxAge: 1.2,
        initialY: 0,
      });
      // Cream-dim lunar regolith dust tint (#E8E6E0)
      this.colors[i * 3 + 0] = 0.91;
      this.colors[i * 3 + 1] = 0.90;
      this.colors[i * 3 + 2] = 0.88;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });

    this.pointsMesh = new THREE.Points(this.geometry, material);
    this.pointsMesh.name = 'lunar_dust_puffs';
    scene.add(this.pointsMesh);
  }

  /**
   * Emit a small burst of dust on foot touchdown.
   */
  public emit(pos: [number, number, number], count = 4) {
    let emitted = 0;
    for (let i = 0; i < this.maxParticles && emitted < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.pos.set(pos[0], pos[1] + 0.01, pos[2]);
        p.initialY = pos[1];
        p.age = 0;
        p.maxAge = 0.8 + Math.random() * 0.6; // Lunar flight duration

        // Outward radial velocity
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.15 + Math.random() * 0.35;
        // Upward ballistic launch speed
        const upwardSpeed = 0.35 + Math.random() * 0.45;

        p.vel.set(Math.cos(angle) * speed, upwardSpeed, Math.sin(angle) * speed);
        emitted++;
      }
    }
  }

  /**
   * Update particle positions under gravity g with zero atmospheric drag.
   */
  public update(dt: number, gravity = 1.62) {
    let activeCount = 0;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) {
        this.positions[i * 3 + 1] = -999;
        continue;
      }

      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        this.positions[i * 3 + 1] = -999;
        continue;
      }

      // Parabolic ballistic integration: dv/dt = -g (no air resistance on the Moon)
      p.vel.y -= gravity * dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;

      // Settle if particle falls below ground
      if (p.pos.y < p.initialY) {
        p.pos.y = p.initialY;
        p.active = false;
      }

      this.positions[i * 3 + 0] = p.pos.x;
      this.positions[i * 3 + 1] = p.pos.y;
      this.positions[i * 3 + 2] = p.pos.z;
      activeCount++;
    }

    if (activeCount > 0) {
      this.geometry.attributes.position.needsUpdate = true;
    }
  }

  public dispose() {
    if (this.pointsMesh.parent) {
      this.pointsMesh.parent.remove(this.pointsMesh);
    }
    this.geometry.dispose();
    (this.pointsMesh.material as THREE.Material).dispose();
  }
}
