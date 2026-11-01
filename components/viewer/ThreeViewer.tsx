'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { EnvironmentSpec, TelemetryFrame, TeleopCommand } from '@/contracts';
import { getTerrainHeight, DEFAULT_TERRAIN_CONFIG } from '@/lib/world/terrain';
import { generateCanonicalTerrain } from '@/lib/world/terrain/generator';
import { TerrainField } from '@/lib/world/terrain/field';
import { generateDebrisField, DebrisInstance } from '@/lib/world/debris';
import { evaluateBoundary, sanitizeViewerPosition, DEFAULT_ARENA } from '@/lib/world/bounds';
import { PerfProbe } from '@/lib/perf/probe';
import { parseFeatureToggles } from '@/lib/perf/toggles';
import { TelemetryStore } from '@/lib/telemetry/store';
import { formatGravityDisplay } from '@/lib/spec/gravity';

export type CameraPreset = 'chase' | 'top' | 'side' | 'free';
export type QualityTier = 'ultra' | 'high' | 'medium' | 'low' | 'potato';

interface ThreeViewerProps {
  envSpec: EnvironmentSpec;
  currentFrame?: TelemetryFrame | null;
  teleopCommand?: TeleopCommand | null;
  cameraPreset?: CameraPreset;
  qualityTier?: QualityTier;
  showColliderDebug?: boolean;
  showOverlays?: boolean;
  showRadar?: boolean;
  showDustParticles?: boolean;
  showGhostComparison?: boolean;
  adaptiveQuality?: boolean;
  onCollisionDetected?: (collision: any) => void;
  onFpsUpdate?: (fps: number, frameTimeMs: number) => void;
  onBoundaryWarning?: (state: 'soft' | 'hard' | 'out', distToEdge: number) => void;
  onEpisodeReset?: (reason: string) => void;
}

export default function ThreeViewer({
  envSpec,
  currentFrame,
  teleopCommand,
  cameraPreset = 'chase',
  qualityTier = 'high',
  showColliderDebug = false,
  showOverlays = true,
  showRadar = true,
  showDustParticles = true,
  showGhostComparison = false,
  adaptiveQuality = true,
  onCollisionDetected,
  onFpsUpdate,
  onBoundaryWarning,
  onEpisodeReset,
}: ThreeViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRadarRef = useRef<HTMLCanvasElement | null>(null);

  // References for imperative Three.js lifecycle
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const robotGroupRef = useRef<THREE.Group | null>(null);
  const ghostRobotGroupRef = useRef<THREE.Group | null>(null);
  const ghostJointMeshesRef = useRef<Record<string, THREE.Group>>({});
  const colliderSphereRef = useRef<THREE.Mesh | null>(null);
  const jointMeshesRef = useRef<Record<string, THREE.Group>>({});
  const debrisChunksRef = useRef<THREE.InstancedMesh[]>([]);
  const debrisDataRef = useRef<DebrisInstance[]>([]);
  const dustParticlesRef = useRef<THREE.Points | null>(null);
  const trailLineRef = useRef<THREE.Line | null>(null);
  const collisionFlashRef = useRef<THREE.Mesh | null>(null);
  const goalBeaconRef = useRef<THREE.Group | null>(null);
  const boundaryRimRef = useRef<THREE.Line | null>(null);
  const boundaryRimMatRef = useRef<THREE.LineDashedMaterial | null>(null);
  const footBlobsRef = useRef<THREE.Mesh[]>([]);
  const canonicalFieldRef = useRef<TerrainField | null>(null);
  const terrainUniformsRef = useRef<{ uEdgeDistance: { value: number } } | null>(null);

  // Preallocated trail buffer (max 180 points)
  const maxTrailPoints = 180;
  const trailBufferRef = useRef<Float32Array>(new Float32Array(maxTrailPoints * 3));
  const trailCountRef = useRef(0);
  const trailHeadRef = useRef(0);

  // Dynamic references
  const latestTeleopRef = useRef<TeleopCommand | null>(teleopCommand ?? null);
  const latestSpecRef = useRef<EnvironmentSpec>(envSpec);
  const currentTerrainSeedRef = useRef<number>(envSpec.terrain?.seed ?? 42);
  const cameraPresetRef = useRef<CameraPreset>(cameraPreset);
  const qualityTierRef = useRef<QualityTier>(qualityTier);

  // Keep references updated with zero React re-render churn
  useEffect(() => {
    latestTeleopRef.current = teleopCommand ?? null;
  }, [teleopCommand]);

  useEffect(() => {
    latestSpecRef.current = envSpec;
  }, [envSpec]);

  useEffect(() => {
    cameraPresetRef.current = cameraPreset;
  }, [cameraPreset]);

  useEffect(() => {
    qualityTierRef.current = qualityTier;
    PerfProbe.getInstance().setTier(qualityTier);
  }, [qualityTier]);

  useEffect(() => {
    if (colliderSphereRef.current) {
      colliderSphereRef.current.visible = showColliderDebug;
    }
  }, [showColliderDebug]);

  useEffect(() => {
    if (dustParticlesRef.current) {
      dustParticlesRef.current.visible = showDustParticles && qualityTier !== 'potato';
    }
  }, [showDustParticles, qualityTier]);

  useEffect(() => {
    if (ghostRobotGroupRef.current) {
      ghostRobotGroupRef.current.visible = Boolean(showGhostComparison);
    }
  }, [showGhostComparison]);

  useEffect(() => {
    if (trailLineRef.current) trailLineRef.current.visible = showOverlays;
    if (goalBeaconRef.current) goalBeaconRef.current.visible = showOverlays;
    if (boundaryRimRef.current) boundaryRimRef.current.visible = showOverlays;
  }, [showOverlays]);

  // Dynamic World Rebuild when EnvironmentSpec changes (e.g. Moon vs Mars approved)
  useEffect(() => {
    if (!sceneRef.current) return;
    const terrainSeed = envSpec.terrain?.seed ?? 42;
    if (canonicalFieldRef.current && currentTerrainSeedRef.current === terrainSeed) {
      return;
    }
    currentTerrainSeedRef.current = terrainSeed;
    const scene = sceneRef.current;
    const oldTerrain = scene.getObjectByName('canonical_terrain_mesh');
    if (oldTerrain) {
      scene.remove(oldTerrain);
      if ((oldTerrain as any).geometry) (oldTerrain as any).geometry.dispose();
    }
    debrisChunksRef.current.forEach((mesh) => {
      scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
    });
    debrisChunksRef.current = [];

    const effectiveTier = qualityTierRef.current;
    const shadowsEnabled = effectiveTier !== 'low' && effectiveTier !== 'potato';
    const newField = generateCanonicalTerrain(terrainSeed);
    canonicalFieldRef.current = newField;
    buildCanonicalTerrainMesh(scene, newField, effectiveTier);

    const debrisCount = envSpec.debris?.count ?? (effectiveTier === 'ultra' ? 1800 : 1200);
    const debris = generateDebrisField(
      debrisCount,
      [40, 40],
      terrainSeed,
      (x, z) => newField.sampleHeight(x, z)
    );
    debrisDataRef.current = debris;
    debrisChunksRef.current = buildChunkedDebris(scene, debris, shadowsEnabled);
  }, [envSpec.terrain?.seed, envSpec.taskId, envSpec.debris?.count]);

  // Main Three.js Scene Setup & Loop
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const toggles = parseFeatureToggles();
    const probe = PerfProbe.getInstance();
    const store = TelemetryStore.getInstance();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a2a2a);
    scene.fog = new THREE.FogExp2(0x2a2a2a, 0.022);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 120);
    camera.position.set(-3.2, 2.4, 3.8);
    cameraRef.current = camera;

    const effectiveTier = qualityTierRef.current;
    const dprCap = effectiveTier === 'potato' || effectiveTier === 'low' ? 1.0 : toggles.dpr;

    const renderer = new THREE.WebGLRenderer({
      antialias: effectiveTier !== 'potato',
      powerPreference: 'high-performance',
      precision: effectiveTier === 'potato' ? 'mediump' : 'highp',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));

    const shadowsEnabled = toggles.shadows && effectiveTier !== 'low' && effectiveTier !== 'potato';
    renderer.shadowMap.enabled = shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // Query GPU Renderer string
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        probe.setGpuInfo(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL), gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));
      }
    } catch {}

    // 2. Lighting (24m expanded shadow frustum & calibrated contrast)
    const ambientLight = new THREE.AmbientLight(0xfdfbf7, 0.35);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfdfbf7, 1.55);
    dirLight.position.set(8, 16, 10);
    dirLight.castShadow = shadowsEnabled;
    dirLight.shadow.mapSize.width = effectiveTier === 'ultra' ? 2048 : effectiveTier === 'high' ? 1024 : 512;
    dirLight.shadow.mapSize.height = dirLight.shadow.mapSize.width;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 48;
    // 24m shadow frustum envelope around robot
    dirLight.shadow.camera.left = -12.0;
    dirLight.shadow.camera.right = 12.0;
    dirLight.shadow.camera.top = 12.0;
    dirLight.shadow.camera.bottom = -12.0;
    dirLight.shadow.bias = -0.0006;
    dirLight.shadow.normalBias = 0.02;
    scene.add(dirLight);
    scene.add(dirLight.target);
    dirLightRef.current = dirLight;

    const fillLight = new THREE.DirectionalLight(0x6b705c, 0.30);
    fillLight.position.set(-14, 8, -12);
    scene.add(fillLight);

    // 3. Canonical TerrainField v1 (257x257 Int16 grid with regolith shading, contours, and shader rim)
    const terrainSeed = latestSpecRef.current.terrain.seed || 42;
    const terrainField = generateCanonicalTerrain(terrainSeed);
    canonicalFieldRef.current = terrainField;
    buildCanonicalTerrainMesh(scene, terrainField, effectiveTier, terrainUniformsRef);

    // 4. Ground Contact Blobs for quadruped feet (Sage when planted, cream-dim when swinging)
    const footBlobs = buildFootContactBlobs(scene);
    footBlobsRef.current = footBlobs;

    // 5. Fallback Floor Catch Plane at y = -5.0m
    const catchPlane = buildFloorCatchPlane(scene, 48, 48, -5.0);

    // 6. 4x4 Chunked Instanced Debris Boulders (with accurate chunk bounding spheres & zero pyramids)
    const targetDebrisCount = effectiveTier === 'ultra' ? 1800 : effectiveTier === 'high' ? 1200 : effectiveTier === 'medium' ? 800 : 400;
    const debris = generateDebrisField(
      targetDebrisCount,
      [40, 40],
      terrainSeed,
      (x, z) => terrainField.sampleHeight(x, z)
    );
    debrisDataRef.current = debris;
    const chunks = buildChunkedDebris(scene, debris, shadowsEnabled);
    debrisChunksRef.current = chunks;

    // 7. Low-Gravity Drifting Dust (Static drift buffer, 0 CPU mutations)
    if (effectiveTier !== 'potato') {
      const dust = buildDustParticles(scene, 40, 40);
      dustParticlesRef.current = dust;
    }

    // 8. Goal Marker (V4: Ground ring + soft column of light)
    const beacon = buildGoalMarker(scene, [14.0, 0, -10.0]);
    goalBeaconRef.current = beacon;

    // 9. Articulated 12-DOF Quadruped
    const { robotGroup, jointGroups, colliderSphere } = build12DOFQuadruped(false);
    scene.add(robotGroup);
    robotGroupRef.current = robotGroup;
    jointMeshesRef.current = jointGroups;
    colliderSphereRef.current = colliderSphere;
    colliderSphere.visible = showColliderDebug;

    // Ghost Quadruped
    const { robotGroup: ghostGroup, jointGroups: ghostJoints } = build12DOFQuadruped(true);
    ghostGroup.visible = Boolean(showGhostComparison);
    scene.add(ghostGroup);
    ghostRobotGroupRef.current = ghostGroup;
    ghostJointMeshesRef.current = ghostJoints;

    // 10. Motion Trail Ribbon (Preallocated Buffer)
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailBufferRef.current, 3));
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0x6b705c,
      transparent: true,
      opacity: 0.7,
      linewidth: 2,
    });
    const trailLine = new THREE.Line(trailGeometry, trailMaterial);
    scene.add(trailLine);
    trailLineRef.current = trailLine;

    // 11. Collision Flash Ring
    const flashGeo = new THREE.RingGeometry(0.2, 0.6, 24);
    flashGeo.rotateX(-Math.PI / 2);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xb83b2f,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const flashMesh = new THREE.Mesh(flashGeo, flashMat);
    scene.add(flashMesh);
    collisionFlashRef.current = flashMesh;

    // 12. Pre-render Static Radar Canvas Layer (with Canonical Terrain Hillshade & Square Arena Outline)
    initOffscreenRadar(offscreenRadarRef, debris, 18.0, terrainField);

    // Camera Rig angles (Framed with pitch ~30 deg, robot in lower-center third)
    let isMouseDown = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let targetCameraAngle = { yaw: -0.85, pitch: 0.52, dist: 4.5 };
    let currentCameraAngle = { ...targetCameraAngle };

    const onMouseDown = (e: MouseEvent) => {
      isMouseDown = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isMouseDown) return;
      const dx = e.clientX - prevMouseX;
      const dy = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
      targetCameraAngle.yaw -= dx * 0.006;
      targetCameraAngle.pitch = Math.max(0.08, Math.min(1.45, targetCameraAngle.pitch + dy * 0.006));
    };
    const onMouseUp = () => { isMouseDown = false; };
    const onWheel = (e: WheelEvent) => {
      targetCameraAngle.dist = Math.max(1.8, Math.min(14.0, targetCameraAngle.dist + e.deltaY * 0.005));
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel);

    let animationFrameId: number;
    let lastTime = performance.now();
    let lastRadarUpdate = 0;
    let radarSweepAngle = 0;
    let shadowUpdateFrame = 0;

    // Single Animation Scheduler Loop
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      // Record frame timing in PerfProbe
      probe.recordFrame(now);

      // Rotate goal beacon softly
      if (beacon) {
        beacon.rotation.y += dt * 0.8;
      }

      // GPU dust particle offset
      if (dustParticlesRef.current) {
        dustParticlesRef.current.position.y = (now * 0.00018) % 3.0;
      }

      // Read latest frame directly from TelemetryStore (Zero React Re-render!)
      const frame = store.getLatestFrame() || currentFrame;
      const teleop = latestTeleopRef.current;
      const preset = cameraPresetRef.current;

      const robotPos = new THREE.Vector3(0, 0.45, 0);

      if (robotGroupRef.current && frame?.bodies && frame.bodies.length > 0) {
        const torso = frame.bodies.find((b) => b.id === 'torso') || frame.bodies[0];

        // 1. Ingestion Sanitization: clamp viewer position to arena envelope
        const sanitized = sanitizeViewerPosition([torso.pos[0], torso.pos[1], torso.pos[2]], DEFAULT_ARENA);
        robotGroupRef.current.position.set(sanitized.pos[0], sanitized.pos[1], sanitized.pos[2]);
        robotGroupRef.current.quaternion.set(torso.quat[0], torso.quat[1], torso.quat[2], torso.quat[3]);
        robotPos.copy(robotGroupRef.current.position);

        // Update terrain rim shader proximity uniform
        const robotDistToEdge = Math.max(0, DEFAULT_ARENA.halfExtent - Math.max(Math.abs(robotPos.x), Math.abs(robotPos.z)));
        if (terrainUniformsRef.current) {
          terrainUniformsRef.current.uEdgeDistance.value = robotDistToEdge;
        }

        // 2. Articulated joints update (Correct pitch axis along Z; roll along X)
        const joints = jointMeshesRef.current;
        for (const j of frame.joints) {
          const group = joints[j.name];
          if (group) {
            if (j.name.includes('hip')) group.rotation.x = j.angle; // Lateral roll
            if (j.name.includes('thigh')) group.rotation.z = -j.angle; // Sagittal pitch swing forward/back
            if (j.name.includes('calf')) group.rotation.z = j.angle; // Sagittal pitch knee flexion
          }
        }

        // Foot Contact Blobs update (Sage when planted, cream-dim when swinging)
        if (frame.feet && frame.feet.length > 0 && footBlobsRef.current.length === 4) {
          for (let fi = 0; fi < frame.feet.length; fi++) {
            const foot = frame.feet[fi];
            const blob = footBlobsRef.current[fi];
            if (blob) {
              blob.position.set(foot.pos[0], foot.pos[1] + 0.012, foot.pos[2]);
              const bMat = blob.material as THREE.MeshBasicMaterial;
              bMat.color.setHex(foot.contact ? 0x6b705c : 0xfdfbf7);
              bMat.opacity = foot.contact ? 0.85 : 0.22;
            }
          }
        }

        // 3. Translucent Ghost comparison
        if (showGhostComparison && ghostRobotGroupRef.current) {
          ghostRobotGroupRef.current.position.set(robotPos.x * 0.86, robotPos.y, robotPos.z);
          for (const j of frame.joints) {
            const group = ghostJointMeshesRef.current[j.name];
            if (group) {
              if (j.name.includes('hip')) group.rotation.x = j.angle * 0.85;
              if (j.name.includes('thigh')) group.rotation.z = -j.angle * 0.85;
              if (j.name.includes('calf')) group.rotation.z = j.angle * 0.85;
            }
          }
        }

        // 4. Preallocated Trail update
        const trailBuf = trailBufferRef.current;
        const head = trailHeadRef.current;
        trailBuf[head * 3] = robotPos.x;
        trailBuf[head * 3 + 1] = robotPos.y + 0.05;
        trailBuf[head * 3 + 2] = robotPos.z;
        trailHeadRef.current = (head + 1) % maxTrailPoints;
        if (trailCountRef.current < maxTrailPoints) trailCountRef.current++;

        if (trailLineRef.current) {
          const attr = trailLineRef.current.geometry.attributes.position as THREE.BufferAttribute;
          attr.needsUpdate = true;
          trailLineRef.current.geometry.setDrawRange(0, trailCountRef.current);
        }

        // 5. Boundary Warning & Rim Pulse
        const distFromCenter = Math.hypot(robotPos.x, robotPos.z);
        if (distFromCenter > 16.0 && boundaryRimMatRef.current) {
          const pulse = (Math.sin(now * 0.005) + 1.0) * 0.5;
          boundaryRimMatRef.current.color.setRGB(0.72 + pulse * 0.28, 0.23, 0.18); // brick glow
          if (onBoundaryWarning) onBoundaryWarning(distFromCenter > 20.0 ? 'out' : 'soft', Math.max(0, 18.0 - distFromCenter));
        } else if (boundaryRimMatRef.current) {
          boundaryRimMatRef.current.color.set(0xfdfbf7); // cream default
        }

        // 6. Handle Episode Resets
        if (frame.episodeEvent && onEpisodeReset) {
          onEpisodeReset(frame.episodeEvent);
        }

        // 7. Collision Flash
        if (frame.collisions && frame.collisions.length > 0) {
          const col = frame.collisions[0];
          if (collisionFlashRef.current) {
            collisionFlashRef.current.position.set(col.point[0], 0.05, -col.point[1]);
            (collisionFlashRef.current.material as THREE.MeshBasicMaterial).opacity = 0.95;
          }
          if (onCollisionDetected) onCollisionDetected(col);
        } else if (collisionFlashRef.current) {
          const mat = collisionFlashRef.current.material as THREE.MeshBasicMaterial;
          mat.opacity = Math.max(0, mat.opacity - dt * 2.8);
        }
      }

      // Camera Rig & Target Clamping (Camera never looks into void!)
      const maxCameraEnvelope = DEFAULT_ARENA.halfExtent + 1.0;
      const clampedLookX = Math.max(-maxCameraEnvelope, Math.min(maxCameraEnvelope, robotPos.x));
      const clampedLookZ = Math.max(-maxCameraEnvelope, Math.min(maxCameraEnvelope, robotPos.z));

      camera.up.set(0, 1, 0); // Strict roll lock to World Y-up: horizon is always level

      if (preset === 'top') {
        camera.position.set(clampedLookX, robotPos.y + 8.5, clampedLookZ);
        camera.lookAt(clampedLookX, robotPos.y, clampedLookZ);
      } else if (preset === 'side') {
        camera.position.set(clampedLookX, robotPos.y + 1.2, clampedLookZ + 4.5);
        camera.lookAt(clampedLookX, robotPos.y + 0.3, clampedLookZ);
      } else {
        // Chase & Orbit
        currentCameraAngle.yaw += (targetCameraAngle.yaw - currentCameraAngle.yaw) * 0.12;
        currentCameraAngle.pitch += (targetCameraAngle.pitch - currentCameraAngle.pitch) * 0.12;
        currentCameraAngle.dist += (targetCameraAngle.dist - currentCameraAngle.dist) * 0.12;

        const camX = clampedLookX + Math.sin(currentCameraAngle.yaw) * Math.cos(currentCameraAngle.pitch) * currentCameraAngle.dist;
        const rawCamY = robotPos.y + Math.sin(currentCameraAngle.pitch) * currentCameraAngle.dist + 0.4;
        const camZ = clampedLookZ + Math.cos(currentCameraAngle.yaw) * Math.cos(currentCameraAngle.pitch) * currentCameraAngle.dist;
        
        // Terrain clearance clamping (never clip through ground)
        const groundAtCam = canonicalFieldRef.current ? canonicalFieldRef.current.sampleHeight(camX, camZ) : 0;
        const clampedCamY = Math.max(groundAtCam + 0.45, rawCamY);

        camera.position.set(camX, clampedCamY, camZ);
        camera.lookAt(clampedLookX, robotPos.y + 0.2, clampedLookZ);
      }

      // Tight Following Shadow Camera updates (Throttled to 30 Hz)
      shadowUpdateFrame++;
      if (dirLightRef.current && shadowsEnabled && shadowUpdateFrame % 2 === 0) {
        dirLightRef.current.position.set(robotPos.x + 8, robotPos.y + 16, robotPos.z + 10);
        dirLightRef.current.target.position.set(robotPos.x, robotPos.y, robotPos.z);
        dirLightRef.current.target.updateMatrixWorld();
      }

      // Render Three.js WebGL Scene
      renderer.render(scene, camera);

      // Record Renderer Draw Calls & Triangles
      probe.updateRendererInfo(renderer.info);

      // 15 Hz Cached Radar Render
      if (now - lastRadarUpdate >= 66 && showRadar) {
        const radarStart = performance.now();
        radarSweepAngle = (radarSweepAngle + dt * 2.5) % (Math.PI * 2);
        renderCachedTerrainRadar(
          radarCanvasRef.current,
          offscreenRadarRef.current,
          robotPos,
          debrisDataRef.current,
          radarSweepAngle,
          frame?.collisions
        );
        probe.recordSubsystemTime('radar', Number((performance.now() - radarStart).toFixed(2)));
        lastRadarUpdate = now;
      }
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material?.dispose();
          }
        }
      });

      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [qualityTier, showColliderDebug, showDustParticles, showGhostComparison, showOverlays, showRadar]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-charcoal">
      <div ref={mountRef} className="w-full h-full" />

      {/* Low Gravity & Scale HUD Chip */}
      <div className="absolute top-4 left-4 z-20 flex items-center space-x-2 pointer-events-none">
        <div className="analog-glass px-2.5 py-1 text-[11px] font-mono text-cream flex items-center space-x-1.5 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-sage animate-pulse" />
          <span className="text-cream-dim">GRAVITY:</span>
          <span className="font-bold text-cream">
            {formatGravityDisplay(envSpec.gravity)}
          </span>
        </div>
      </div>

      {/* Radar Overlay (Top-Right) */}
      {showRadar && (
        <div className="absolute top-4 right-4 z-20 pointer-events-none">
          <div className="analog-glass p-2 rounded-xl border border-cream/15 shadow-2xl">
            <div className="flex items-center justify-between font-mono text-[9px] text-cream-dim uppercase mb-1 px-0.5">
              <div className="flex items-center gap-1.5 text-sage">
                <span className="w-1.5 h-1.5 rounded-full bg-sage inline-block animate-pulse" />
                <span className="font-bold text-cream">RADAR 40×40 m</span>
              </div>
              <span className="text-[8px] text-cream-dim">LIVE</span>
            </div>
            <canvas
              ref={radarCanvasRef}
              width={130}
              height={130}
              className="rounded-lg bg-charcoal-deep border border-cream/10"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Creates subdivided noise-perturbed icosahedron boulder (>= 80 triangles, zero pyramids).
 */
function createDisplacedIcosahedron(radius: number, detail = 1, seed = 0): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail); // 80 triangles
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const len = Math.hypot(vx, vy, vz) || 1.0;
    const disp = 1.0 + 0.18 * Math.sin(vx * 15.0 + seed) * Math.cos(vz * 15.0);
    pos.setXYZ(i, (vx / len) * radius * disp, (vy / len) * radius * disp * 0.9, (vz / len) * radius * disp);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds canonical 257x257 TerrainField mesh with slope tinting, contours, and surface-draped rim.
 */
function buildCanonicalTerrainMesh(
  scene: THREE.Scene,
  field: TerrainField,
  effectiveTier: string,
  uniformsRef?: React.MutableRefObject<{ uEdgeDistance: { value: number } } | null>
): THREE.Mesh {
  const segments = effectiveTier === 'ultra' ? 256 : effectiveTier === 'high' ? 128 : effectiveTier === 'medium' ? 96 : 64;
  const terrainGeo = new THREE.PlaneGeometry(48.0, 48.0, segments, segments);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = field.sampleHeight(x, z);
    posAttr.setY(i, y);
  }
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0x2e2e2e,
    roughness: 0.88,
    metalness: 0.12,
    flatShading: false,
  });

  terrainMat.onBeforeCompile = (shader) => {
    const uniforms = {
      uEdgeDistance: { value: 18.0 },
    };
    if (uniformsRef) {
      uniformsRef.current = uniforms;
    }
    shader.uniforms.uEdgeDistance = uniforms.uEdgeDistance;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vWorldPos;
       varying vec3 vWorldNormal;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
       vWorldNormal = normalize(mat3(modelMatrix) * normal);`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vWorldPos;
       varying vec3 vWorldNormal;
       uniform float uEdgeDistance;`
    );

    // Pre-fog injection: Shading, contours, and proximity rim are evaluated before fog,
    // ensuring natural atmospheric fog falloff toward the horizon
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `// 1. Slope-tinted shading (sage for flat plains, darker charcoal for steep slopes)
       float slope = 1.0 - max(0.0, vWorldNormal.y);
       vec3 slopeTint = mix(vec3(0.18, 0.18, 0.18), vec3(0.11, 0.11, 0.11), smoothstep(0.1, 0.4, slope));
       gl_FragColor.rgb = mix(gl_FragColor.rgb, slopeTint, 0.35);

       // 2. Regolith subtle sage tone for low flat terrain
       float flatT = smoothstep(0.15, 0.02, slope);
       gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.42, 0.44, 0.36), flatT * 0.22);

       // 3. Elevation Contour Lines: 1.0m bold, 0.25m subtle (anti-aliased & distance-fading beyond 22m)
       float camDist = length(vWorldPos - cameraPosition);
       float distFade = 1.0 - smoothstep(12.0, 22.0, camDist);
       float fMajor = abs(fract(vWorldPos.y / 1.0 - 0.5) - 0.5) / max(0.001, fwidth(vWorldPos.y));
       float fMinor = abs(fract(vWorldPos.y / 0.25 - 0.5) - 0.5) / max(0.001, fwidth(vWorldPos.y));
       if (distFade > 0.001) {
         if (fMajor < 1.0) {
           gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.99, 0.98, 0.97), 0.08 * distFade);
         } else if (fMinor < 0.7) {
           gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.99, 0.98, 0.97), 0.04 * distFade);
         }
       }

       // 4. Square Arena Boundary Rim (Surface-Draped at 18m)
       float distArena = max(abs(vWorldPos.x), abs(vWorldPos.z));
       if (distArena >= 17.88 && distArena <= 18.08) {
         float dash = fract((vWorldPos.x + vWorldPos.z) * 0.75);
         if (dash > 0.35) {
           gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.99, 0.98, 0.97), 0.75);
         }
       }

       // 5. Soft margin proximity warning: brick red glow band ONLY when robot is close (uEdgeDistance <= 2.5m)
       float robotProximity = smoothstep(2.5, 0.0, uEdgeDistance);
       if (robotProximity > 0.001 && distArena >= 16.5 && distArena < 17.88) {
         float warnT = smoothstep(16.5, 17.88, distArena);
         gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.72, 0.23, 0.18), warnT * robotProximity * 0.45);
       }

       #include <fog_fragment>`
    );
  };

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.name = 'canonical_terrain_mesh';
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);
  return terrainMesh;
}

/**
 * Builds ground contact blob shadows under quadruped feet (Sage when planted, cream-dim when swinging).
 */
function buildFootContactBlobs(scene: THREE.Scene): THREE.Mesh[] {
  const blobs: THREE.Mesh[] = [];
  const geo = new THREE.CircleGeometry(0.08, 16);
  geo.rotateX(-Math.PI / 2);

  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x6b705c, // Sage token
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, -10, 0); // initial off-screen
    scene.add(mesh);
    blobs.push(mesh);
  }
  return blobs;
}

/**
 * Builds Fallback Floor Catch Plane at y = -5.0m.
 */
function buildFloorCatchPlane(scene: THREE.Scene, width: number, length: number, y: number) {
  const geo = new THREE.PlaneGeometry(width * 1.5, length * 1.5);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x1f1f1f,
    wireframe: true,
    transparent: true,
    opacity: 0.15,
  });
  const plane = new THREE.Mesh(geo, mat);
  plane.position.y = y;
  scene.add(plane);
  return plane;
}

/**
 * Builds 4x4 spatial chunked instanced debris boulders with accurate chunk bounding spheres & zero pyramids.
 */
function buildChunkedDebris(scene: THREE.Scene, debris: DebrisInstance[], enableShadows = true): THREE.InstancedMesh[] {
  // Partition debris by 4x4 chunkId (0 to 15)
  const chunks: DebrisInstance[][] = Array.from({ length: 16 }, () => []);
  for (const d of debris) {
    const cid = d.chunkId ?? 0;
    chunks[cid].push(d);
  }

  // 3 shared displaced icosahedrons (>= 80 triangles, ZERO pyramids)
  const boulderGeo1 = createDisplacedIcosahedron(0.28, 1, 101);
  const boulderGeo2 = createDisplacedIcosahedron(0.24, 1, 202);
  const boulderGeo3 = createDisplacedIcosahedron(0.20, 1, 303);
  const sharedGeos = [boulderGeo1, boulderGeo2, boulderGeo3];

  const debrisMat = new THREE.MeshStandardMaterial({
    color: 0x4a4a44, // Token --rock-top
    roughness: 0.82,
    metalness: 0.15,
    flatShading: true,
  });

  const colorVariation = [
    new THREE.Color(0x4a4a44),
    new THREE.Color(0x56564e),
    new THREE.Color(0x3e3e38),
    new THREE.Color(0x50524a),
    new THREE.Color(0x42443e),
  ];

  const dummy = new THREE.Object3D();
  const createdMeshes: THREE.InstancedMesh[] = [];

  for (let c = 0; c < 16; c++) {
    const chunkDebris = chunks[c];
    if (chunkDebris.length === 0) continue;

    const geo = sharedGeos[c % 3];
    const instancedMesh = new THREE.InstancedMesh(geo, debrisMat, chunkDebris.length);
    instancedMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const chunkBox = new THREE.Box3();

    for (let i = 0; i < chunkDebris.length; i++) {
      const d = chunkDebris[i];
      dummy.position.set(d.x, d.y, d.z);
      dummy.scale.set(d.scale, d.scale * 0.95, d.scale);
      dummy.rotation.set(d.rotation[0], d.rotation[1], d.rotation[2]);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      chunkBox.expandByPoint(dummy.position);

      const col = colorVariation[(d.id + c) % colorVariation.length];
      instancedMesh.setColorAt(i, col);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) {
      instancedMesh.instanceColor.needsUpdate = true;
    }

    // Accurate spatial chunk bounding sphere for reliable frustum culling
    const chunkSphere = new THREE.Sphere();
    chunkBox.getBoundingSphere(chunkSphere);
    chunkSphere.radius += 0.8;
    instancedMesh.boundingSphere = chunkSphere;

    instancedMesh.castShadow = enableShadows;
    instancedMesh.receiveShadow = true;

    scene.add(instancedMesh);
    createdMeshes.push(instancedMesh);
  }

  return createdMeshes;
}

/**
 * Builds low-gravity drifting dust particles with soft circular alpha mask (zero square artifacts).
 */
function buildDustParticles(scene: THREE.Scene, width: number, length: number): THREE.Points {
  const particleCount = 400;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * width;
    positions[i * 3 + 1] = 0.2 + Math.random() * 4.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * length;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Circular particle texture eliminates square gl_PointSize artifacts
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const rad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    rad.addColorStop(0, 'rgba(253, 251, 247, 0.85)');
    rad.addColorStop(0.35, 'rgba(107, 112, 92, 0.45)');
    rad.addColorStop(1, 'rgba(107, 112, 92, 0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, 32, 32);
  }
  const circleTexture = new THREE.CanvasTexture(canvas);

  const material = new THREE.PointsMaterial({
    map: circleTexture,
    size: 0.025,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return points;
}

/**
 * Builds goal marker: ring on the ground plus soft column of light (V4).
 */
function buildGoalMarker(scene: THREE.Scene, position: [number, number, number]): THREE.Group {
  const beaconGroup = new THREE.Group();
  beaconGroup.position.set(position[0], position[1] + 0.05, position[2]);

  // Ground ring
  const ringGeo = new THREE.TorusGeometry(1.2, 0.04, 8, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x6b705c, transparent: true, opacity: 0.9 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  beaconGroup.add(ring);

  // Soft translucent light column
  const beamGeo = new THREE.CylinderGeometry(0.8, 1.2, 3.5, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x6b705c,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 1.75;
  beaconGroup.add(beam);

  scene.add(beaconGroup);
  return beaconGroup;
}

/**
 * Builds the articulated 12-DOF Quadruped Hierarchy.
 */
function build12DOFQuadruped(isGhost = false) {
  const robotGroup = new THREE.Group();
  const jointGroups: Record<string, THREE.Group> = {};

  const torsoGeo = new THREE.BoxGeometry(0.6, 0.16, 0.3);
  const torsoMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.38, roughness: 0.5 })
    : new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.38, metalness: 0.55 });
  const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
  torsoMesh.castShadow = !isGhost;
  torsoMesh.receiveShadow = !isGhost;
  robotGroup.add(torsoMesh);

  // High-contrast cream top stripe
  const stripeGeo = new THREE.BoxGeometry(0.61, 0.025, 0.07);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfdfbf7 });
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.position.y = 0.07;
  robotGroup.add(stripe);

  // Cream lower edge highlight bevel for >= 2.0:1 contrast
  const bevelGeo = new THREE.BoxGeometry(0.605, 0.015, 0.305);
  const bevelMat = new THREE.MeshBasicMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.35 });
  const bevel = new THREE.Mesh(bevelGeo, bevelMat);
  bevel.position.y = -0.075;
  robotGroup.add(bevel);

  const colliderGeo = new THREE.SphereGeometry(0.55, 16, 16);
  const colliderMat = new THREE.MeshBasicMaterial({ color: 0xb83b2f, wireframe: true, transparent: true, opacity: 0.3 });
  const colliderSphere = new THREE.Mesh(colliderGeo, colliderMat);
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

  // Cream-dim bones (#E8E6E0) and sage joint markers (#6B705C)
  const boneMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.35, roughness: 0.5 })
    : new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.42, metalness: 0.4 });
  const jointMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.45 })
    : new THREE.MeshStandardMaterial({ color: 0x6b705c, roughness: 0.25, metalness: 0.85 });

  for (const cfg of legConfigs) {
    const hipGroup = new THREE.Group();
    hipGroup.position.set(cfg.x, 0, cfg.z);
    robotGroup.add(hipGroup);
    jointGroups[`${cfg.name}_hip_joint`] = hipGroup;

    const hipPivotMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 16), jointMat);
    hipPivotMesh.rotateZ(Math.PI / 2);
    hipGroup.add(hipPivotMesh);

    const thighGroup = new THREE.Group();
    hipGroup.add(thighGroup);
    jointGroups[`${cfg.name}_thigh_joint`] = thighGroup;

    const thighMesh = new THREE.Mesh(new THREE.BoxGeometry(0.045, thighLen, 0.045), boneMat);
    thighMesh.position.y = -thighLen / 2;
    thighMesh.castShadow = true;
    thighGroup.add(thighMesh);

    const calfGroup = new THREE.Group();
    calfGroup.position.y = -thighLen;
    thighGroup.add(calfGroup);
    jointGroups[`${cfg.name}_calf_joint`] = calfGroup;

    const kneePivot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), jointMat);
    calfGroup.add(kneePivot);

    const calfMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, calfLen, 0.04), boneMat);
    calfMesh.position.y = -calfLen / 2;
    calfMesh.castShadow = true;
    calfGroup.add(calfMesh);

    const footMesh = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 16), jointMat);
    footMesh.position.y = -calfLen;
    footMesh.castShadow = true;
    calfGroup.add(footMesh);
  }

  return { robotGroup, jointGroups, colliderSphere };
}

/**
 * Initializes offscreen cached background for Radar (Canonical hillshade, square arena outline, debris dots).
 */
function initOffscreenRadar(
  offscreenRef: React.MutableRefObject<HTMLCanvasElement | null>,
  debris: DebrisInstance[],
  arenaRadius = 18.0,
  field: TerrainField | null = null
) {
  const canvas = document.createElement('canvas');
  canvas.width = 130;
  canvas.height = 130;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cx = 65;
  const cy = 65;
  const rangeRadius = 58;
  const scale = 58 / 20.0;

  // 1. Subtle Hillshade of Canonical TerrainField
  if (field) {
    const hillSize = 116;
    const imgData = ctx.createImageData(hillSize, hillSize);
    const step = 40.0 / hillSize;
    for (let py = 0; py < hillSize; py++) {
      const wz = -20.0 + py * step;
      for (let px = 0; px < hillSize; px++) {
        const wx = -20.0 + px * step;
        const idx = (py * hillSize + px) * 4;
        const h0 = field.sampleHeight(wx, wz);
        const hx = field.sampleHeight(wx + 0.3, wz);
        const hz = field.sampleHeight(wx, wz + 0.3);
        const gx = (hx - h0) / 0.3;
        const gz = (hz - h0) / 0.3;
        const shade = Math.max(0, Math.min(255, Math.floor(38 + (gx * 38 - gz * 25))));
        imgData.data[idx] = shade;
        imgData.data[idx + 1] = shade + 3;
        imgData.data[idx + 2] = shade;
        imgData.data[idx + 3] = 160;
      }
    }
    ctx.putImageData(imgData, cx - 58, cy - 58);
  }

  // 2. Square Arena Boundary Outline (18m x 18m)
  const sqHalf = (18.0 / 20.0) * rangeRadius;
  ctx.strokeStyle = 'rgba(253, 251, 247, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(cx - sqHalf, cy - sqHalf, sqHalf * 2, sqHalf * 2);

  // Soft Margin Alert Boundary (16m x 16m)
  const softHalf = (16.0 / 20.0) * rangeRadius;
  ctx.strokeStyle = 'rgba(184, 59, 47, 0.35)';
  ctx.strokeRect(cx - softHalf, cy - softHalf, softHalf * 2, softHalf * 2);
  ctx.setLineDash([]);

  // 3. Range Rings (Subtle reference circles)
  ctx.strokeStyle = 'rgba(253, 251, 247, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, rangeRadius * 0.65, 0, Math.PI * 2);
  ctx.arc(cx, cy, rangeRadius * 0.35, 0, Math.PI * 2);
  ctx.stroke();

  // 4. Debris Dots (Bold obstacles, faint pebbles)
  for (const d of debris) {
    const dx = cx + d.x * scale;
    const dy = cy + d.z * scale;
    const dist = Math.hypot(dx - cx, dy - cy);
    if (dist <= rangeRadius) {
      ctx.fillStyle = d.scale > 0.35 ? 'rgba(253, 251, 247, 0.45)' : 'rgba(107, 112, 92, 0.35)';
      ctx.beginPath();
      ctx.arc(dx, dy, d.scale > 0.35 ? 1.5 : 1.0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Crosshairs
  ctx.strokeStyle = 'rgba(253, 251, 247, 0.06)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - rangeRadius);
  ctx.lineTo(cx, cy + rangeRadius);
  ctx.moveTo(cx - rangeRadius, cy);
  ctx.lineTo(cx + rangeRadius, cy);
  ctx.stroke();

  offscreenRef.current = canvas;
}

/**
 * Fast 2-Layer Radar Rendering (Cached static background + dynamic sweep line & arrow).
 */
function renderCachedTerrainRadar(
  canvas: HTMLCanvasElement | null,
  offscreenBg: HTMLCanvasElement | null,
  robotPos: THREE.Vector3,
  debris: DebrisInstance[],
  sweepAngle: number,
  collisions?: any[]
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const rangeRadius = 58;
  const scale = 58 / 20.0;

  ctx.clearRect(0, 0, w, h);

  // 1. Draw pre-rendered static background
  if (offscreenBg) {
    ctx.drawImage(offscreenBg, 0, 0);
  }

  // 2. Rotating sweep line
  ctx.strokeStyle = 'rgba(107, 112, 92, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweepAngle) * rangeRadius, cy + Math.sin(sweepAngle) * rangeRadius);
  ctx.stroke();

  // 3. Goal Marker at (14m, -10m)
  const gx = cx + (14.0 - robotPos.x) * scale;
  const gy = cy + (-10.0 - robotPos.z) * scale;
  const distToGoal = Math.hypot(gx - cx, gy - cy);

  if (distToGoal < rangeRadius) {
    ctx.fillStyle = '#6B705C';
    ctx.beginPath();
    ctx.arc(gx, gy, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Off-screen edge arrow
    const angleToGoal = Math.atan2(gy - cy, gx - cx);
    const edgeX = cx + Math.cos(angleToGoal) * (rangeRadius - 4);
    const edgeY = cy + Math.sin(angleToGoal) * (rangeRadius - 4);
    ctx.fillStyle = '#6B705C';
    ctx.beginPath();
    ctx.arc(edgeX, edgeY, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Robot Heading Arrow at Center
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#FDFBF7';
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(3.5, 3.5);
  ctx.lineTo(0, 1.5);
  ctx.lineTo(-3.5, 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 5. Collision Highlights
  if (collisions && collisions.length > 0) {
    ctx.strokeStyle = '#B83B2F';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.stroke();
  }
}
