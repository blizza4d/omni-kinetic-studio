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
import { LunarDustSystem } from '@/lib/droid/fx/DustPuffs';
import { TelemetryJitterBuffer, InterpolatedFrame } from '@/lib/telemetry/jitter_buffer';
import { FramePacer } from '@/lib/sim/framePacer';
import { FollowCameraRig } from '@/lib/camera/follow_camera';

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
  isNewAnimation?: boolean;
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
  isNewAnimation = true,
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

  // Preallocated contiguous trail buffer (max 300 points sampled on distance traveled)
  const maxTrailPoints = 300;
  const trailBufferRef = useRef<Float32Array>(new Float32Array(maxTrailPoints * 3));
  const trailCountRef = useRef(0);
  const lastRecordedTrailPosRef = useRef<[number, number, number] | null>(null);

  // Dynamic references
  const latestTeleopRef = useRef<TeleopCommand | null>(teleopCommand ?? null);
  const latestSpecRef = useRef<EnvironmentSpec>(envSpec);
  const currentTerrainSeedRef = useRef<number>(envSpec.terrain?.seed ?? 42);
  const cameraPresetRef = useRef<CameraPreset>(cameraPreset);
  const qualityTierRef = useRef<QualityTier>(qualityTier);
  const lunarDustRef = useRef<LunarDustSystem | null>(null);
  const prevFootContactsRef = useRef<boolean[]>([true, true, true, true]);
  const showRadarRef = useRef(showRadar);
  const showOverlaysRef = useRef(showOverlays);
  const showGhostComparisonRef = useRef(showGhostComparison);
  const showColliderDebugRef = useRef(showColliderDebug);
  const currentFrameRef = useRef(currentFrame);
  const isNewAnimationRef = useRef(isNewAnimation);
  const onBoundaryWarningRef = useRef(onBoundaryWarning);
  const onCollisionDetectedRef = useRef(onCollisionDetected);
  const onEpisodeResetRef = useRef(onEpisodeReset);

  // Keep references updated with zero React re-render churn
  useEffect(() => {
    isNewAnimationRef.current = isNewAnimation;
  }, [isNewAnimation]);

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
    currentFrameRef.current = currentFrame;
  }, [currentFrame]);

  useEffect(() => {
    showRadarRef.current = showRadar;
  }, [showRadar]);

  useEffect(() => {
    showOverlaysRef.current = showOverlays;
  }, [showOverlays]);

  useEffect(() => {
    showGhostComparisonRef.current = showGhostComparison;
  }, [showGhostComparison]);

  useEffect(() => {
    showColliderDebugRef.current = showColliderDebug;
    if (colliderSphereRef.current) {
      colliderSphereRef.current.visible = showColliderDebug;
    }
  }, [showColliderDebug]);

  useEffect(() => {
    onBoundaryWarningRef.current = onBoundaryWarning;
    onCollisionDetectedRef.current = onCollisionDetected;
    onEpisodeResetRef.current = onEpisodeReset;
  }, [onBoundaryWarning, onCollisionDetected, onEpisodeReset]);

  useEffect(() => {
    qualityTierRef.current = qualityTier;
    PerfProbe.getInstance().setTier(qualityTier);
  }, [qualityTier]);

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
    buildCanonicalTerrainMesh(scene, newField, effectiveTier, terrainUniformsRef);

    const debrisCount = envSpec.debris?.count ?? (effectiveTier === 'ultra' ? 1800 : 1200);
    const debris = generateDebrisField(
      debrisCount,
      [40, 40],
      terrainSeed,
      (x, z) => newField.sampleHeight(x, z)
    );
    debrisDataRef.current = debris;
    debrisChunksRef.current = buildChunkedDebris(scene, debris, shadowsEnabled);

    // Rebuild goal beacon with accurate terrain clamping
    if (goalBeaconRef.current) {
      scene.remove(goalBeaconRef.current);
    }
    const goalY = newField.sampleHeight(14.0, -10.0);
    const newBeacon = buildGoalMarker(scene, [14.0, goalY, -10.0]);
    goalBeaconRef.current = newBeacon;
    newBeacon.visible = showOverlaysRef.current;

    // Refresh radar
    initOffscreenRadar(offscreenRadarRef, debris, 18.0, newField);
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

    // 1. Scene, Camera, Renderer (Authentic Lunar Space Background & Tone Mapping)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0c0c); // Deep lunar space
    scene.fog = new THREE.Fog(0x0c0c0c, 45, 95); // Linear distance fog
    sceneRef.current = scene;

    // Distant Starfield in Lunar Sky
    const starfield = buildStarfield();
    scene.add(starfield);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 120);
    camera.position.set(-2.5, 1.8, 3.2);
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
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

    // 2. Calibrated Lighting (Low-angle directional key + regolith bounce hemisphere fill)
    const ambientLight = new THREE.AmbientLight(0xfdfbf7, 0.25);
    scene.add(ambientLight);

    // Key directional light: ~22 deg elevation
    const dirLight = new THREE.DirectionalLight(0xfdfbf7, 1.55);
    dirLight.position.set(8, 14, 10);
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
    dirLight.shadow.bias = -0.0004;
    dirLight.shadow.normalBias = 0.02;
    scene.add(dirLight);
    scene.add(dirLight.target);
    dirLightRef.current = dirLight;

    // Regolith bounce light: cool sky + charcoal ground bounce
    const hemiLight = new THREE.HemisphereLight(0x6b705c, 0x2a2a2a, 0.45);
    scene.add(hemiLight);

    const fillLight = new THREE.DirectionalLight(0x6b705c, 0.25);
    fillLight.position.set(-14, 8, -12);
    scene.add(fillLight);

    // 3. Canonical TerrainField v1 (257x257 Int16 grid with regolith shading, contours, and anti-aliased rim)
    const terrainSeed = latestSpecRef.current.terrain.seed || 42;
    const terrainField = generateCanonicalTerrain(terrainSeed);
    canonicalFieldRef.current = terrainField;
    buildCanonicalTerrainMesh(scene, terrainField, effectiveTier, terrainUniformsRef);

    // 4. Ground Contact Blobs for quadruped feet (Clamped to terrain, polygon-offset, sage when planted)
    const footBlobs = buildFootContactBlobs(scene);
    footBlobsRef.current = footBlobs;

    // 5. Fallback Floor Catch Plane at y = -5.0m
    buildFloorCatchPlane(scene, 48, 48, -5.0);

    // 6. 4x4 Chunked Instanced Debris Boulders (with accurate chunk bounding spheres, pure white base, zero pyramids)
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

    // 7. Low-Gravity Drifting Dust
    if (effectiveTier !== 'potato') {
      const dust = buildDustParticles(scene, 40, 40);
      dustParticlesRef.current = dust;

      // 7b. Dynamic Lunar Dust Puffs (Ballistic zero-drag arcs on foot touchdown)
      const lunarDust = new LunarDustSystem(scene);
      lunarDustRef.current = lunarDust;
    }

    // 8. Goal Marker (Base raycasted directly onto terrain surface, compact 0.6m ring)
    const goalY = terrainField.sampleHeight(14.0, -10.0);
    const beacon = buildGoalMarker(scene, [14.0, goalY, -10.0]);
    goalBeaconRef.current = beacon;
    beacon.visible = showOverlaysRef.current;

    // 9. Articulated 12-DOF Quadruped
    const { robotGroup, jointGroups, colliderSphere } = build12DOFQuadruped(false);
    scene.add(robotGroup);
    robotGroupRef.current = robotGroup;
    jointMeshesRef.current = jointGroups;
    colliderSphereRef.current = colliderSphere;
    colliderSphere.visible = showColliderDebugRef.current;

    // Ghost Quadruped
    const { robotGroup: ghostGroup, jointGroups: ghostJoints } = build12DOFQuadruped(true);
    ghostGroup.visible = Boolean(showGhostComparisonRef.current);
    scene.add(ghostGroup);
    ghostRobotGroupRef.current = ghostGroup;
    ghostJointMeshesRef.current = ghostJoints;

    // 10. Motion Trail Ribbon (Draped on terrain surface, distance-sampled, zero wrap jumps)
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailBufferRef.current, 3));
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0x6b705c, // Sage
      transparent: true,
      opacity: 0.45,
      linewidth: 2,
    });
    const trailLine = new THREE.Line(trailGeometry, trailMaterial);
    trailLine.frustumCulled = false;
    scene.add(trailLine);
    trailLineRef.current = trailLine;
    trailLine.visible = showOverlaysRef.current;

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

    // 12. Pre-render Static Radar Canvas Layer (with Canonical Terrain Hillshade & Filtered Obstacles)
    initOffscreenRadar(offscreenRadarRef, debris, 18.0, terrainField);

    // Camera Rig angles (Default framed for rule-of-thirds: dist 3.5m, pitch ~18 deg)
    let isMouseDown = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let targetCameraAngle = { yaw: -0.40, pitch: 0.32, dist: 3.5 };
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
      targetCameraAngle.dist = Math.max(1.8, Math.min(10.0, targetCameraAngle.dist + e.deltaY * 0.005));
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

    // --- FLUID ANIMATION FOUNDATION INSTANCES ---
    const pacer = new FramePacer();
    const jitterBuffer = new TelemetryJitterBuffer();
    const cameraRig = new FollowCameraRig();
    const interpFrame: InterpolatedFrame = {
      time: 0,
      pos: [0, 0.45, 0],
      quat: [0, 0, 0, 1],
      joints: {},
      feet: [
        { id: 'FL', pos: [0.24, 0, -0.15], contact: true },
        { id: 'FR', pos: [0.24, 0, 0.15], contact: true },
        { id: 'RL', pos: [-0.24, 0, -0.15], contact: true },
        { id: 'RR', pos: [-0.24, 0, 0.15], contact: true },
      ],
      isHold: false,
    };

    // Pre-populate jitter buffer with historical frames from store
    const existingHistory = store.getHistory();
    if (existingHistory && existingHistory.length > 0) {
      jitterBuffer.pushFrames(existingHistory.slice(-30) as TelemetryFrame[]);
    }

    // Subscribe to incoming stream batches
    const unsubStore = store.onBatch((frames) => {
      jitterBuffer.pushFrames(frames);
    });

    // Pre-warm shaders
    try {
      if ((renderer as any).compileAsync) {
        (renderer as any).compileAsync(scene, camera).catch(() => {});
      } else {
        renderer.compile(scene, camera);
      }
    } catch {}

    // Register test hook
    if (typeof window !== 'undefined') {
      (window as any).__omniDebug = {
        getJitterBuffer: () => jitterBuffer,
        getPacer: () => pacer,
        getCameraRig: () => cameraRig,
        toggleAnimation: () => {
          isNewAnimationRef.current = !isNewAnimationRef.current;
          return isNewAnimationRef.current;
        },
        isNewAnimation: () => isNewAnimationRef.current,
      };
    }

    // Single Animation Scheduler Loop
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const now = performance.now();
      lastTime = now;
      const dt = pacer.tick(now);

      // Record frame timing in PerfProbe
      probe.recordFrame(now);

      // Rotate goal beacon softly
      if (beacon) {
        beacon.rotation.y += dt * 0.8;
      }

      // Update ballistic lunar dust puffs
      if (lunarDustRef.current) {
        const gravY = Math.abs(latestSpecRef.current.gravity?.[1] ?? 1.62);
        lunarDustRef.current.update(dt, gravY);
      }

      // GPU dust particle offset
      if (dustParticlesRef.current) {
        dustParticlesRef.current.position.y = (now * 0.00018) % 3.0;
      }

      const preset = cameraPresetRef.current;
      const isNewAnim = isNewAnimationRef.current;
      const robotPos = new THREE.Vector3(0, 0.45, 0);
      const robotVel: [number, number, number] = [0, 0, 0];
      let robotYaw = 0;
      let frameCollisions: any[] | undefined = undefined;

      if (isNewAnim) {
        // --- NEW FLUID ANIMATION PIPELINE ---
        jitterBuffer.advance(dt, 1.0);
        const hasInterp = jitterBuffer.sample(interpFrame);

        if (robotGroupRef.current && hasInterp) {
          const sanitized = sanitizeViewerPosition(
            [interpFrame.pos[0], interpFrame.pos[1], interpFrame.pos[2]],
            DEFAULT_ARENA
          );
          robotGroupRef.current.position.set(sanitized.pos[0], sanitized.pos[1], sanitized.pos[2]);
          robotGroupRef.current.quaternion.set(
            interpFrame.quat[0],
            interpFrame.quat[1],
            interpFrame.quat[2],
            interpFrame.quat[3]
          );
          robotPos.copy(robotGroupRef.current.position);

          // Compute yaw from quaternion for radar alignment
          const q = robotGroupRef.current.quaternion;
          robotYaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));

          // Update terrain rim shader proximity uniform
          const robotDistToEdge = Math.max(
            0,
            DEFAULT_ARENA.halfExtent - Math.max(Math.abs(robotPos.x), Math.abs(robotPos.z))
          );
          if (terrainUniformsRef.current) {
            terrainUniformsRef.current.uEdgeDistance.value = robotDistToEdge;
          }

          // Articulated joints update (Corrected signs for Single Frame Convention)
          const joints = jointMeshesRef.current;
          for (const [name, angle] of Object.entries(interpFrame.joints)) {
            const group = joints[name];
            if (group) {
              if (name.includes('hip')) group.rotation.x = -angle;
              if (name.includes('thigh')) group.rotation.z = angle;
              if (name.includes('calf')) group.rotation.z = angle;
            }
          }

          // Feet & Contact Blobs update (Clamped directly to terrain surface)
          if (interpFrame.feet && interpFrame.feet.length > 0 && footBlobsRef.current.length === 4) {
            for (let fi = 0; fi < interpFrame.feet.length; fi++) {
              const foot = interpFrame.feet[fi];
              const blob = footBlobsRef.current[fi];
              if (blob) {
                const groundY = canonicalFieldRef.current
                  ? canonicalFieldRef.current.sampleHeight(foot.pos[0], foot.pos[2])
                  : foot.pos[1];
                blob.position.set(foot.pos[0], groundY + 0.003, foot.pos[2]);
                const clearance = Math.max(0, foot.pos[1] - groundY);
                const bMat = blob.material as THREE.MeshBasicMaterial;
                bMat.color.setHex(foot.contact ? 0x6b705c : 0xfdfbf7);
                bMat.opacity = foot.contact ? 0.85 : Math.max(0, Math.min(0.25, 0.25 * (1 - clearance / 0.12)));
              }

              const wasContact = prevFootContactsRef.current[fi];
              if (foot.contact && !wasContact && lunarDustRef.current) {
                lunarDustRef.current.emit(foot.pos, 5);
              }
              prevFootContactsRef.current[fi] = foot.contact;
            }
          }

          // Translucent Ghost comparison
          if (showGhostComparisonRef.current && ghostRobotGroupRef.current) {
            ghostRobotGroupRef.current.position.set(robotPos.x * 0.86, robotPos.y, robotPos.z);
            for (const [name, angle] of Object.entries(interpFrame.joints)) {
              const group = ghostJointMeshesRef.current[name];
              if (group) {
                if (name.includes('hip')) group.rotation.x = -angle * 0.85;
                if (name.includes('thigh')) group.rotation.z = angle * 0.85;
                if (name.includes('calf')) group.rotation.z = angle * 0.85;
              }
            }
          }

          // Draped Terrain Trail update (Distance sampled, zero wrap jumps)
          const lastPos = lastRecordedTrailPosRef.current;
          const distMoved = lastPos ? Math.hypot(robotPos.x - lastPos[0], robotPos.z - lastPos[2]) : 1.0;
          if (distMoved >= 0.10 && trailCountRef.current < maxTrailPoints) {
            const trailBuf = trailBufferRef.current;
            const idx = trailCountRef.current;
            const groundY = canonicalFieldRef.current
              ? canonicalFieldRef.current.sampleHeight(robotPos.x, robotPos.z)
              : robotPos.y;
            trailBuf[idx * 3] = robotPos.x;
            trailBuf[idx * 3 + 1] = groundY + 0.012;
            trailBuf[idx * 3 + 2] = robotPos.z;
            trailCountRef.current++;
            lastRecordedTrailPosRef.current = [robotPos.x, robotPos.y, robotPos.z];

            if (trailLineRef.current) {
              const attr = trailLineRef.current.geometry.attributes.position as THREE.BufferAttribute;
              attr.needsUpdate = true;
              trailLineRef.current.geometry.setDrawRange(0, trailCountRef.current);
            }
          }

          // Boundary Warning & Rim Pulse
          const distFromCenter = Math.hypot(robotPos.x, robotPos.z);
          if (distFromCenter > 16.0 && boundaryRimMatRef.current) {
            const pulse = (Math.sin(now * 0.005) + 1.0) * 0.5;
            boundaryRimMatRef.current.color.setRGB(0.72 + pulse * 0.28, 0.23, 0.18);
            if (onBoundaryWarningRef.current) {
              onBoundaryWarningRef.current(
                distFromCenter > 20.0 ? 'out' : 'soft',
                Math.max(0, 18.0 - distFromCenter)
              );
            }
          } else if (boundaryRimMatRef.current) {
            boundaryRimMatRef.current.color.set(0xfdfbf7);
          }

          // Episode Resets
          if (interpFrame.episodeEvent && onEpisodeResetRef.current) {
            onEpisodeResetRef.current(interpFrame.episodeEvent);
          }

          // Collision Flash
          frameCollisions = interpFrame.collisions;
          if (frameCollisions && frameCollisions.length > 0) {
            const col = frameCollisions[0];
            if (collisionFlashRef.current) {
              collisionFlashRef.current.position.set(col.point[0], 0.05, -col.point[1]);
              (collisionFlashRef.current.material as THREE.MeshBasicMaterial).opacity = 0.95;
            }
            if (onCollisionDetectedRef.current) onCollisionDetectedRef.current(col);
          } else if (collisionFlashRef.current) {
            const mat = collisionFlashRef.current.material as THREE.MeshBasicMaterial;
            mat.opacity = Math.max(0, mat.opacity - dt * 2.8);
          }
        }
      } else {
        // --- LEGACY BASELINE PIPELINE ---
        const frame = store.getLatestFrame() || currentFrameRef.current;

        if (robotGroupRef.current && frame?.bodies && frame.bodies.length > 0) {
          const torso = frame.bodies.find((b) => b.id === 'torso') || frame.bodies[0];

          const sanitized = sanitizeViewerPosition([torso.pos[0], torso.pos[1], torso.pos[2]], DEFAULT_ARENA);
          robotGroupRef.current.position.set(sanitized.pos[0], sanitized.pos[1], sanitized.pos[2]);
          robotGroupRef.current.quaternion.set(torso.quat[0], torso.quat[1], torso.quat[2], torso.quat[3]);
          robotPos.copy(robotGroupRef.current.position);

          const q = robotGroupRef.current.quaternion;
          robotYaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));

          const robotDistToEdge = Math.max(0, DEFAULT_ARENA.halfExtent - Math.max(Math.abs(robotPos.x), Math.abs(robotPos.z)));
          if (terrainUniformsRef.current) {
            terrainUniformsRef.current.uEdgeDistance.value = robotDistToEdge;
          }

          const joints = jointMeshesRef.current;
          for (const j of frame.joints) {
            const group = joints[j.name];
            if (group) {
              if (j.name.includes('hip')) group.rotation.x = -j.angle;
              if (j.name.includes('thigh')) group.rotation.z = j.angle;
              if (j.name.includes('calf')) group.rotation.z = j.angle;
            }
          }

          if (frame.feet && frame.feet.length > 0 && footBlobsRef.current.length === 4) {
            for (let fi = 0; fi < frame.feet.length; fi++) {
              const foot = frame.feet[fi];
              const blob = footBlobsRef.current[fi];
              if (blob) {
                const groundY = canonicalFieldRef.current
                  ? canonicalFieldRef.current.sampleHeight(foot.pos[0], foot.pos[2])
                  : foot.pos[1];
                blob.position.set(foot.pos[0], groundY + 0.003, foot.pos[2]);
                const clearance = Math.max(0, foot.pos[1] - groundY);
                const bMat = blob.material as THREE.MeshBasicMaterial;
                bMat.color.setHex(foot.contact ? 0x6b705c : 0xfdfbf7);
                bMat.opacity = foot.contact ? 0.85 : Math.max(0, Math.min(0.25, 0.25 * (1 - clearance / 0.12)));
              }

              const wasContact = prevFootContactsRef.current[fi];
              if (foot.contact && !wasContact && lunarDustRef.current) {
                lunarDustRef.current.emit(foot.pos, 5);
              }
              prevFootContactsRef.current[fi] = foot.contact;
            }
          }

          if (showGhostComparisonRef.current && ghostRobotGroupRef.current) {
            ghostRobotGroupRef.current.position.set(robotPos.x * 0.86, robotPos.y, robotPos.z);
            for (const j of frame.joints) {
              const group = ghostJointMeshesRef.current[j.name];
              if (group) {
                if (j.name.includes('hip')) group.rotation.x = -j.angle * 0.85;
                if (j.name.includes('thigh')) group.rotation.z = j.angle * 0.85;
                if (j.name.includes('calf')) group.rotation.z = j.angle * 0.85;
              }
            }
          }

          const lastPos = lastRecordedTrailPosRef.current;
          const distMoved = lastPos ? Math.hypot(robotPos.x - lastPos[0], robotPos.z - lastPos[2]) : 1.0;
          if (distMoved >= 0.10 && trailCountRef.current < maxTrailPoints) {
            const trailBuf = trailBufferRef.current;
            const idx = trailCountRef.current;
            const groundY = canonicalFieldRef.current
              ? canonicalFieldRef.current.sampleHeight(robotPos.x, robotPos.z)
              : robotPos.y;
            trailBuf[idx * 3] = robotPos.x;
            trailBuf[idx * 3 + 1] = groundY + 0.012;
            trailBuf[idx * 3 + 2] = robotPos.z;
            trailCountRef.current++;
            lastRecordedTrailPosRef.current = [robotPos.x, robotPos.y, robotPos.z];

            if (trailLineRef.current) {
              const attr = trailLineRef.current.geometry.attributes.position as THREE.BufferAttribute;
              attr.needsUpdate = true;
              trailLineRef.current.geometry.setDrawRange(0, trailCountRef.current);
            }
          }

          const distFromCenter = Math.hypot(robotPos.x, robotPos.z);
          if (distFromCenter > 16.0 && boundaryRimMatRef.current) {
            const pulse = (Math.sin(now * 0.005) + 1.0) * 0.5;
            boundaryRimMatRef.current.color.setRGB(0.72 + pulse * 0.28, 0.23, 0.18);
            if (onBoundaryWarningRef.current) onBoundaryWarningRef.current(distFromCenter > 20.0 ? 'out' : 'soft', Math.max(0, 18.0 - distFromCenter));
          } else if (boundaryRimMatRef.current) {
            boundaryRimMatRef.current.color.set(0xfdfbf7);
          }

          if (frame.episodeEvent && onEpisodeResetRef.current) {
            onEpisodeResetRef.current(frame.episodeEvent);
          }

          frameCollisions = frame.collisions;
          if (frameCollisions && frameCollisions.length > 0) {
            const col = frameCollisions[0];
            if (collisionFlashRef.current) {
              collisionFlashRef.current.position.set(col.point[0], 0.05, -col.point[1]);
              (collisionFlashRef.current.material as THREE.MeshBasicMaterial).opacity = 0.95;
            }
            if (onCollisionDetectedRef.current) onCollisionDetectedRef.current(col);
          } else if (collisionFlashRef.current) {
            const mat = collisionFlashRef.current.material as THREE.MeshBasicMaterial;
            mat.opacity = Math.max(0, mat.opacity - dt * 2.8);
          }
        }
      }

      // Camera Rig & Target Clamping
      const maxCameraEnvelope = DEFAULT_ARENA.halfExtent + 1.0;
      const clampedLookX = Math.max(-maxCameraEnvelope, Math.min(maxCameraEnvelope, robotPos.x));
      const clampedLookZ = Math.max(-maxCameraEnvelope, Math.min(maxCameraEnvelope, robotPos.z));

      if (isNewAnim) {
        // --- NEW FLUID CAMERA RIG (Critically damped springs, rule-of-thirds framing, roll-locked) ---
        cameraRig.update(
          camera,
          [clampedLookX, robotPos.y, clampedLookZ],
          robotVel,
          preset === 'side' ? 'side' : preset === 'top' ? 'top' : 'chase',
          canonicalFieldRef.current,
          dt,
          targetCameraAngle
        );
      } else {
        // --- LEGACY CAMERA LERP ---
        camera.up.set(0, 1, 0);

        if (preset === 'top') {
          camera.position.set(clampedLookX, robotPos.y + 8.5, clampedLookZ);
          camera.lookAt(clampedLookX, robotPos.y, clampedLookZ);
        } else if (preset === 'side') {
          camera.position.set(clampedLookX, robotPos.y + 1.2, clampedLookZ + 4.5);
          camera.lookAt(clampedLookX, robotPos.y + 0.3, clampedLookZ);
        } else {
          currentCameraAngle.yaw += (targetCameraAngle.yaw - currentCameraAngle.yaw) * 0.12;
          currentCameraAngle.pitch += (targetCameraAngle.pitch - currentCameraAngle.pitch) * 0.12;
          currentCameraAngle.dist += (targetCameraAngle.dist - currentCameraAngle.dist) * 0.12;

          const camX = clampedLookX + Math.sin(currentCameraAngle.yaw) * Math.cos(currentCameraAngle.pitch) * currentCameraAngle.dist;
          const rawCamY = robotPos.y + Math.sin(currentCameraAngle.pitch) * currentCameraAngle.dist + 0.35;
          const camZ = clampedLookZ + Math.cos(currentCameraAngle.yaw) * Math.cos(currentCameraAngle.pitch) * currentCameraAngle.dist;
          
          const groundAtCam = canonicalFieldRef.current ? canonicalFieldRef.current.sampleHeight(camX, camZ) : 0;
          const clampedCamY = Math.max(groundAtCam + 0.45, rawCamY);

          camera.position.set(camX, clampedCamY, camZ);
          camera.lookAt(clampedLookX, robotPos.y + 0.25, clampedLookZ);
        }
      }

      // Tight Following Shadow Camera updates (Throttled to 30 Hz)
      shadowUpdateFrame++;
      if (dirLightRef.current && shadowsEnabled && shadowUpdateFrame % 2 === 0) {
        dirLightRef.current.position.set(robotPos.x + 8, robotPos.y + 14, robotPos.z + 10);
        dirLightRef.current.target.position.set(robotPos.x, robotPos.y, robotPos.z);
        dirLightRef.current.target.updateMatrixWorld();
      }

      // Render Three.js WebGL Scene
      renderer.render(scene, camera);

      // Record Renderer Draw Calls & Triangles
      probe.updateRendererInfo(renderer.info);

      // 15 Hz Cached Radar Render
      if (now - lastRadarUpdate >= 66 && showRadarRef.current) {
        const radarStart = performance.now();
        radarSweepAngle = (radarSweepAngle + dt * 2.5) % (Math.PI * 2);
        renderCachedTerrainRadar(
          radarCanvasRef.current,
          offscreenRadarRef.current,
          robotPos,
          robotYaw,
          debrisDataRef.current,
          radarSweepAngle,
          frameCollisions
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
      unsubStore();
      if (typeof window !== 'undefined' && (window as any).__omniDebug) {
        delete (window as any).__omniDebug;
      }
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);

      lunarDustRef.current?.dispose();
      lunarDustRef.current = null;

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
  }, [qualityTier]);

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
 * Builds distant background starfield points for airless lunar sky.
 */
function buildStarfield(): THREE.Points {
  const count = 350;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.85); // Upper hemisphere only
    const r = 90.0;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi) + 10.0;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xfdfbf7,
    size: 1.2,
    transparent: true,
    opacity: 0.55,
    sizeAttenuation: false,
  });
  return new THREE.Points(geo, mat);
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
 * Builds canonical 257x257 TerrainField mesh with slope tinting, contours, and anti-aliased surface-draped rim.
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

    // Pre-fog injection: Shading, contours, and anti-aliased proximity rim
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

       // 4. Square Arena Boundary Rim (Surface-draped, anti-aliased fwidth, distance fade, <= 35% opacity)
       float distArena = max(abs(vWorldPos.x), abs(vWorldPos.z));
       float rimDist = abs(distArena - 18.0);
       float rimWidth = max(0.04, fwidth(distArena) * 1.5);
       float rimAlpha = 1.0 - smoothstep(0.0, rimWidth, rimDist);
       float rimFade = 1.0 - smoothstep(18.0, 32.0, camDist);
       float dash = fract((vWorldPos.x + vWorldPos.z) * 1.0); // 0.5m on / 0.5m off
       if (dash < 0.5 && rimAlpha > 0.01 && rimFade > 0.01) {
         gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.99, 0.98, 0.97), 0.28 * rimAlpha * rimFade);
       }

       // 5. Proximity boundary alert glow (Gated strictly by uEdgeDistance < 2.5m)
       if (uEdgeDistance < 2.5) {
         float alertIntensity = smoothstep(2.5, 0.0, uEdgeDistance) * 0.45;
         gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.72, 0.23, 0.18), alertIntensity);
       }
       #include <fog_fragment>`
    );
  };

  const mesh = new THREE.Mesh(terrainGeo, terrainMat);
  mesh.name = 'canonical_terrain_mesh';
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/**
 * Builds ground contact shadow blobs under planted quadruped feet with polygon offset.
 */
function buildFootContactBlobs(scene: THREE.Scene): THREE.Mesh[] {
  const blobs: THREE.Mesh[] = [];
  const geo = new THREE.CircleGeometry(0.07, 16);
  geo.rotateX(-Math.PI / 2);

  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x6b705c, // Sage token
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
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
 * Builds 4x4 spatial chunked instanced debris boulders with pure white base material and authentic geological tones.
 */
function buildChunkedDebris(scene: THREE.Scene, debris: DebrisInstance[], enableShadows = true): THREE.InstancedMesh[] {
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

  // Base material MUST be pure white (0xffffff) so instanceColor applies true luminance
  const debrisMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.90,
    metalness: 0.05,
    flatShading: false,
  });

  const colorVariation = [
    new THREE.Color(0x52524b),
    new THREE.Color(0x4a4a44),
    new THREE.Color(0x3e3e38),
    new THREE.Color(0x56564e),
    new THREE.Color(0x44443e),
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
 * Builds low-gravity drifting dust particles with soft circular alpha mask.
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
 * Builds goal marker: terrain-grounded ring (0.6m radius) plus soft column of light (height 2.5m).
 */
function buildGoalMarker(scene: THREE.Scene, position: [number, number, number]): THREE.Group {
  const beaconGroup = new THREE.Group();
  beaconGroup.position.set(position[0], position[1] + 0.02, position[2]);

  // Ground ring: cream-dim, 0.6m radius
  const ringGeo = new THREE.TorusGeometry(0.6, 0.03, 8, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfdfbf7,
    transparent: true,
    opacity: 0.60,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  beaconGroup.add(ring);

  // Soft translucent light column (height 2.5m)
  const beamGeo = new THREE.CylinderGeometry(0.45, 0.65, 2.5, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x6b705c,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 1.25;
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
 * Initializes offscreen cached background for Radar (Canonical hillshade, square arena outline, filtered obstacles).
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
        const shade = Math.max(0, Math.min(255, Math.floor(34 + (gx * 32 - gz * 20))));
        imgData.data[idx] = shade;
        imgData.data[idx + 1] = shade + 2;
        imgData.data[idx + 2] = shade;
        imgData.data[idx + 3] = 140;
      }
    }
    ctx.putImageData(imgData, cx - 58, cy - 58);
  }

  // 2. Square Arena Boundary Outline (18m x 18m)
  const sqHalf = (18.0 / 20.0) * rangeRadius;
  ctx.strokeStyle = 'rgba(253, 251, 247, 0.40)';
  ctx.lineWidth = 1.0;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(cx - sqHalf, cy - sqHalf, sqHalf * 2, sqHalf * 2);
  ctx.setLineDash([]);

  // 3. Range Rings (Subtle reference circles at 5m and 10m)
  ctx.strokeStyle = 'rgba(253, 251, 247, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, (10.0 / 20.0) * rangeRadius, 0, Math.PI * 2);
  ctx.arc(cx, cy, (5.0 / 20.0) * rangeRadius, 0, Math.PI * 2);
  ctx.stroke();

  // 4. Debris Dots: Filtered to prominent hazard boulders (scale >= 0.44) to prevent white-noise clutter
  const obstacles = debris.filter((d) => d.scale >= 0.44);
  for (const d of obstacles) {
    const dx = cx + d.x * scale;
    const dy = cy + d.z * scale;
    const dist = Math.hypot(dx - cx, dy - cy);
    if (dist <= rangeRadius) {
      ctx.fillStyle = 'rgba(253, 251, 247, 0.40)';
      ctx.beginPath();
      ctx.arc(dx, dy, 1.2, 0, Math.PI * 2);
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

  // 5. 10m Scale Bar Legend in corner
  const scaleBarPx = 10.0 * scale;
  ctx.strokeStyle = 'rgba(253, 251, 247, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(12, 120);
  ctx.lineTo(12 + scaleBarPx, 120);
  ctx.stroke();
  ctx.font = '8px monospace';
  ctx.fillStyle = 'rgba(253, 251, 247, 0.45)';
  ctx.fillText('10m', 14, 116);

  offscreenRef.current = canvas;
}

/**
 * 2-Layer Radar Rendering (Robot-centered, real heading rotation, goal indicator).
 */
function renderCachedTerrainRadar(
  canvas: HTMLCanvasElement | null,
  offscreenBg: HTMLCanvasElement | null,
  robotPos: THREE.Vector3,
  robotYaw: number,
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

  // 1. Draw pre-rendered static background offset relative to robot position
  if (offscreenBg) {
    const offsetX = -robotPos.x * scale;
    const offsetY = -robotPos.z * scale;
    ctx.save();
    // Clip to radar circular aperture
    ctx.beginPath();
    ctx.arc(cx, cy, rangeRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(offscreenBg, offsetX, offsetY);
    ctx.restore();
  }

  // 2. Rotating sweep line
  ctx.strokeStyle = 'rgba(107, 112, 92, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweepAngle) * rangeRadius, cy + Math.sin(sweepAngle) * rangeRadius);
  ctx.stroke();

  // 3. Goal Marker at (14m, -10m) relative to robot
  const gx = cx + (14.0 - robotPos.x) * scale;
  const gy = cy + (-10.0 - robotPos.z) * scale;
  const distToGoal = Math.hypot(gx - cx, gy - cy);

  if (distToGoal < rangeRadius - 4) {
    ctx.fillStyle = '#6B705C';
    ctx.beginPath();
    ctx.arc(gx, gy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FDFBF7';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    // Off-screen edge arrow indicator
    const angleToGoal = Math.atan2(gy - cy, gx - cx);
    const edgeX = cx + Math.cos(angleToGoal) * (rangeRadius - 4);
    const edgeY = cy + Math.sin(angleToGoal) * (rangeRadius - 4);
    ctx.fillStyle = '#6B705C';
    ctx.beginPath();
    ctx.arc(edgeX, edgeY, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Robot Heading Arrow at Center (Rotates truthfully with robotYaw, size >= 14px)
  ctx.save();
  ctx.translate(cx, cy);
  // In Single Frame Convention: yaw angle from +X (East). Canvas: -Y is North.
  // rot = atan2(vz, vx) + PI/2 = -yaw + PI/2 (with Three.js yaw)
  ctx.rotate(-robotYaw + Math.PI / 2);
  ctx.fillStyle = '#FDFBF7';
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();

  // Sage center position indicator dot
  ctx.fillStyle = '#6B705C';
  ctx.beginPath();
  ctx.arc(0, 1, 1.8, 0, Math.PI * 2);
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
