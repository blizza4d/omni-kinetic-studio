/**
 * Multi-Robot 3D Rig Builders & Resource Disposal Utilities
 *
 * Dynamically constructs WebGL geometry for:
 * - Omni-Quadruped Scout (12-DOF Baseline — golden-gait faithful)
 * - Lunar Rover (4WD Differential Rocker-Bogie + Spinning Lugged Wheels)
 * - Agile Lab Bot (Compact Indoor Platform with Safety Trim & Dome LiDAR)
 *
 * Every mesh/material tree supports deterministic disposal to ensure zero WebGL leaks.
 */

import * as THREE from 'three';
import { RobotProfile } from '@/lib/robotics/profiles';

export interface BuiltRobotRig {
  robotGroup: THREE.Group;
  jointGroups: Record<string, THREE.Group>;
  wheelMeshes: THREE.Object3D[]; // [FL, FR, RL, RR] for 4WD spinning
  colliderSphere: THREE.Mesh;
  antennaGroup: THREE.Group | null;
  actuatorLeds: Record<string, THREE.Mesh>;
}

/**
 * Recursively disposes geometries, materials, and textures on a detached Three.js subtree.
 */
export function disposeObjectTree(root: THREE.Object3D | null | undefined): void {
  if (!root) return;
  root.traverse((obj) => {
    const anyObj = obj as any;
    if (anyObj.geometry && typeof anyObj.geometry.dispose === 'function') {
      anyObj.geometry.dispose();
    }
    const mat = anyObj.material;
    if (mat) {
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        if (!m) continue;
        if (m.map && typeof m.map.dispose === 'function') m.map.dispose();
        if (typeof m.dispose === 'function') m.dispose();
      }
    }
  });
}

export function buildRobotForProfile(profile: RobotProfile, isGhost = false): BuiltRobotRig {
  if (profile.locomotionType === 'differential_4wd') {
    return buildLunarRover4WD(profile, isGhost);
  }
  return buildQuadrupedRig(profile, isGhost);
}

function buildQuadrupedRig(profile: RobotProfile, isGhost: boolean): BuiltRobotRig {
  const robotGroup = new THREE.Group();
  const jointGroups: Record<string, THREE.Group> = {};
  const actuatorLeds: Record<string, THREE.Mesh> = {};
  const scale = profile.visualStyle.scaleFactor;

  const chassisMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.3, roughness: 0.5 })
    : new THREE.MeshStandardMaterial({ color: profile.visualStyle.chassisColor, roughness: 0.36, metalness: 0.58 });
  const armorMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.25 })
    : new THREE.MeshStandardMaterial({ color: 0x4b4c46, roughness: 0.42, metalness: 0.45 });
  const boneMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.3 })
    : new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.38, metalness: 0.35 });
  const jointMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.35 })
    : new THREE.MeshStandardMaterial({ color: profile.visualStyle.accentColor, roughness: 0.28, metalness: 0.78 });
  const padMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.3 })
    : new THREE.MeshStandardMaterial({ color: 0x1e1e1c, roughness: 0.9, metalness: 0.1 });

  // Main chassis core
  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.24), chassisMat);
  torsoMesh.castShadow = !isGhost;
  torsoMesh.receiveShadow = !isGhost;
  robotGroup.add(torsoMesh);

  // Upper armor deck + cream/accent spine stripe
  const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 0.20), armorMat);
  upperDeck.position.y = 0.085;
  upperDeck.castShadow = !isGhost;
  robotGroup.add(upperDeck);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.50, 0.014, 0.055),
    new THREE.MeshBasicMaterial({ color: profile.id === 'agile_lab_bot' ? profile.visualStyle.accentColor : 0xfdfbf7 })
  );
  stripe.position.y = 0.105;
  robotGroup.add(stripe);

  // Top LiDAR dome on compact lab bot
  if (profile.id === 'agile_lab_bot' && !isGhost) {
    const lidarBase = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.045, 16), jointMat);
    lidarBase.position.set(0.14, 0.125, 0);
    robotGroup.add(lidarBase);
  }

  // Forward Sensor Head / Stereo Camera Visor (+X front)
  const headPod = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.095, 0.16), armorMat);
  headPod.position.set(0.31, 0.015, 0);
  headPod.castShadow = !isGhost;
  robotGroup.add(headPod);

  if (!isGhost) {
    const visorMat = new THREE.MeshStandardMaterial({
      color: profile.visualStyle.visorColor,
      emissive: profile.visualStyle.accentColor,
      emissiveIntensity: 0.9,
      roughness: 0.15,
    });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.032, 0.11), visorMat);
    visor.position.set(0.365, 0.02, 0);
    robotGroup.add(visor);
  }

  // Secondary-motion damped telemetry antenna mast (rear top)
  const antennaGroup = new THREE.Group();
  antennaGroup.position.set(-0.22, 0.10, 0.05);
  robotGroup.add(antennaGroup);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.22, 8), boneMat);
  mast.position.y = 0.11;
  antennaGroup.add(mast);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b })
  );
  tip.position.y = 0.225;
  antennaGroup.add(tip);

  const colliderSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.55 * scale, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xb83b2f, wireframe: true, transparent: true, opacity: 0.3 })
  );
  colliderSphere.visible = false;
  if (!isGhost) robotGroup.add(colliderSphere);

  const legConfigs = [
    { name: 'FL', x: 0.24, z: -0.15 },
    { name: 'FR', x: 0.24, z: 0.15 },
    { name: 'RL', x: -0.24, z: -0.15 },
    { name: 'RR', x: -0.24, z: 0.15 },
  ];
  const thighLen = 0.22;
  const calfLen = 0.22;

  for (const cfg of legConfigs) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, Math.abs(cfg.z) * 0.9), armorMat);
    strut.position.set(cfg.x, 0, cfg.z * 0.55);
    robotGroup.add(strut);

    const hipGroup = new THREE.Group();
    hipGroup.position.set(cfg.x, 0, cfg.z);
    robotGroup.add(hipGroup);
    jointGroups[`${cfg.name}_hip_joint`] = hipGroup;

    const hipServo = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.075, 16), jointMat);
    hipServo.rotateX(Math.PI / 2);
    hipServo.castShadow = !isGhost;
    hipGroup.add(hipServo);

    const thighGroup = new THREE.Group();
    hipGroup.add(thighGroup);
    jointGroups[`${cfg.name}_thigh_joint`] = thighGroup;

    if (!isGhost) {
      const ledMat = new THREE.MeshStandardMaterial({
        color: profile.visualStyle.visorColor,
        emissive: profile.visualStyle.visorColor,
        emissiveIntensity: 0.4,
      });
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, 0.082), ledMat);
      led.position.set(0, -0.02, 0);
      thighGroup.add(led);
      actuatorLeds[`${cfg.name}_thigh_joint`] = led;
    }

    const thighMesh = new THREE.Mesh(new THREE.BoxGeometry(0.052, thighLen * 0.94, 0.044), boneMat);
    thighMesh.position.y = -thighLen / 2;
    thighMesh.castShadow = !isGhost;
    thighGroup.add(thighMesh);

    const calfGroup = new THREE.Group();
    calfGroup.position.y = -thighLen;
    thighGroup.add(calfGroup);
    jointGroups[`${cfg.name}_calf_joint`] = calfGroup;

    const kneeServo = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.056, 14), jointMat);
    kneeServo.rotateX(Math.PI / 2);
    calfGroup.add(kneeServo);

    const calfMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.016, calfLen * 0.95, 10), boneMat);
    calfMesh.position.y = -calfLen / 2;
    calfMesh.castShadow = !isGhost;
    calfGroup.add(calfMesh);

    const footPad = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 14), padMat);
    footPad.position.y = -calfLen + 0.024;
    footPad.scale.set(1.1, 0.85, 1.1);
    footPad.castShadow = !isGhost;
    calfGroup.add(footPad);
  }

  if (scale !== 1.0) {
    robotGroup.scale.setScalar(scale);
  }

  return {
    robotGroup,
    jointGroups,
    wheelMeshes: [],
    colliderSphere,
    antennaGroup,
    actuatorLeds,
  };
}

function buildLunarRover4WD(profile: RobotProfile, isGhost: boolean): BuiltRobotRig {
  const robotGroup = new THREE.Group();
  const wheelMeshes: THREE.Object3D[] = [];
  const actuatorLeds: Record<string, THREE.Mesh> = {};

  const deckMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.25 })
    : new THREE.MeshStandardMaterial({ color: profile.visualStyle.chassisColor, roughness: 0.35, metalness: 0.55 });
  const goldFoilMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.25 })
    : new THREE.MeshStandardMaterial({ color: profile.visualStyle.accentColor, roughness: 0.28, metalness: 0.72 });
  const darkFrameMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.25 })
    : new THREE.MeshStandardMaterial({ color: 0x262624, roughness: 0.5, metalness: 0.65 });
  const tireMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.28 })
    : new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.88, metalness: 0.15 });
  const hubMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.3 })
    : new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.25, metalness: 0.8 });

  // Warm electronics box + gold MLI thermal wrap
  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.13, 0.34), goldFoilMat);
  lowerHull.position.y = -0.05;
  lowerHull.castShadow = !isGhost;
  lowerHull.receiveShadow = !isGhost;
  robotGroup.add(lowerHull);

  const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.04, 0.40), deckMat);
  upperDeck.position.y = 0.04;
  upperDeck.castShadow = !isGhost;
  robotGroup.add(upperDeck);

  // Solar / thermal radiator wing deck strips
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.22, metalness: 0.45 });
  const solarDeck = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.015, 0.34), panelMat);
  solarDeck.position.set(-0.12, 0.068, 0);
  robotGroup.add(solarDeck);

  // Elevated Mast Camera Tower (+X front)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.28, 12), darkFrameMat);
  mast.position.set(0.24, 0.18, 0);
  mast.castShadow = !isGhost;
  robotGroup.add(mast);

  const camHead = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, 0.18), deckMat);
  camHead.position.set(0.26, 0.34, 0);
  camHead.castShadow = !isGhost;
  robotGroup.add(camHead);

  if (!isGhost) {
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.03, 0.13),
      new THREE.MeshStandardMaterial({
        color: profile.visualStyle.visorColor,
        emissive: profile.visualStyle.visorColor,
        emissiveIntensity: 0.9,
      })
    );
    visor.position.set(0.32, 0.34, 0);
    robotGroup.add(visor);
  }

  // Spinning 3D LiDAR puck mounted on forward deck
  const lidarTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.055, 16), hubMat);
  lidarTurret.position.set(0.22, 0.09, 0.12);
  robotGroup.add(lidarTurret);

  // Rear telemetry antenna
  const antennaGroup = new THREE.Group();
  antennaGroup.position.set(-0.31, 0.06, -0.14);
  robotGroup.add(antennaGroup);
  const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.28, 8), hubMat);
  whip.position.y = 0.14;
  antennaGroup.add(whip);
  const whipTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.016, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b })
  );
  whipTip.position.y = 0.29;
  antennaGroup.add(whipTip);

  const colliderSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xb83b2f, wireframe: true, transparent: true, opacity: 0.3 })
  );
  colliderSphere.visible = false;
  if (!isGhost) robotGroup.add(colliderSphere);

  // 4 Rocker-Bogie Wheels [FL, FR, RL, RR] positioned cleanly so tire bottoms align near -0.28
  const halfWb = profile.wheelbaseM * 0.5;
  const halfTrack = profile.trackWidthM * 0.5;
  const wheelY = -0.14;
  const wr = profile.wheelRadiusM;
  const wheelCoords = [
    { name: 'FL', x: halfWb, z: -halfTrack },
    { name: 'FR', x: halfWb, z: halfTrack },
    { name: 'RL', x: -halfWb, z: -halfTrack },
    { name: 'RR', x: -halfWb, z: halfTrack },
  ];

  // Cross rocker bars
  for (const sideZ of [-halfTrack * 0.72, halfTrack * 0.72]) {
    const rockerBar = new THREE.Mesh(new THREE.BoxGeometry(profile.wheelbaseM * 0.96, 0.032, 0.032), darkFrameMat);
    rockerBar.position.set(0, -0.09, sideZ);
    rockerBar.castShadow = !isGhost;
    robotGroup.add(rockerBar);
  }

  for (const w of wheelCoords) {
    // Axle stub
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.10, 10), darkFrameMat);
    axle.rotateX(Math.PI / 2);
    axle.position.set(w.x, wheelY, w.z * 0.82);
    robotGroup.add(axle);

    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(w.x, wheelY, w.z);
    robotGroup.add(wheelGroup);
    wheelMeshes.push(wheelGroup);

    // Rugged tire cylinder rotated around X so cylinder axis is Z (spin axis is local Z!)
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, 0.095, 20), tireMat);
    tire.rotateX(Math.PI / 2);
    tire.castShadow = !isGhost;
    wheelGroup.add(tire);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(wr * 0.58, wr * 0.58, 0.102, 12), hubMat);
    hub.rotateX(Math.PI / 2);
    wheelGroup.add(hub);

    // Visual grouser spokes so rotation speed is immediately legible
    for (let s = 0; s < 4; s++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(wr * 1.92, 0.018, 0.104), goldFoilMat);
      spoke.rotation.z = (s * Math.PI) / 4;
      wheelGroup.add(spoke);
    }
  }

  return {
    robotGroup,
    jointGroups: {},
    wheelMeshes,
    colliderSphere,
    antennaGroup,
    actuatorLeds,
  };
}
