'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EnvironmentSpec, TelemetryFrame, TeleopCommand } from '@/contracts';
import { TerrainField } from '@/lib/world/terrain/field';
import { DebrisInstance } from '@/lib/world/debris';
import { sanitizeViewerPosition, DEFAULT_ARENA } from '@/lib/world/bounds';
import { PerfProbe } from '@/lib/perf/probe';
import { formatGravityDisplay } from '@/lib/spec/gravity';
import { LunarDustSystem } from '@/lib/droid/fx/DustPuffs';
import { FramePacer } from '@/lib/sim/framePacer';
import { FollowCameraRig } from '@/lib/camera/follow_camera';
import { minJerk } from '@/lib/anim/math/minJerk';
import { SimEngine, InterpolatedDroidRenderState } from '@/lib/sim/SimEngine';
import { CameraMode, RadarSize } from '@/lib/storage/settings';
import { SensorOverlayFlags } from '@/components/control/ControlHUD';
import { EditorToolMode } from '@/components/missions/MissionPanels';
import RadarPanel from '@/components/radar/RadarPanel';
import { MissionMarker } from '@/lib/missions/missions';
import { Waypoint } from '@/lib/control/types';
import { globalAudioSynthesizer } from '@/lib/audio/synthesizer';

export type CameraPreset = 'chase' | 'top' | 'side' | 'free';
export type QualityTier = 'ultra' | 'high' | 'medium' | 'low' | 'potato';

interface ThreeViewerProps {
  engine: SimEngine;
  envSpec: EnvironmentSpec;
  currentFrame?: TelemetryFrame | null;
  teleopCommand?: TeleopCommand | null;
  cameraPreset?: CameraPreset;
  cameraMode?: CameraMode;
  qualityTier?: QualityTier;
  fov?: number;
  sunElevationDeg?: number;
  sunAzimuthDeg?: number;
  showColliderDebug?: boolean;
  showOverlays?: boolean;
  showRadar?: boolean;
  radarSize?: RadarSize;
  onRadarSizeChange?: (size: RadarSize) => void;
  showDustParticles?: boolean;
  showGhostComparison?: boolean;
  showContours?: boolean;
  showTrail?: boolean;
  pipEnabled?: boolean;
  sensors?: SensorOverlayFlags;
  cameraShakeEnabled?: boolean;
  autoRecenterOrbit?: boolean;
  reducedMotion?: boolean;
  colorblindSafe?: boolean;
  editorTool?: EditorToolMode;
  terrainVersion?: number;
  frameTrigger?: number;
  missionMarkers?: readonly MissionMarker[];
  completedMarkerIds?: readonly string[];
  waypoints?: readonly Waypoint[];
  onTerrainClick?: (x: number, z: number, shiftKey: boolean, altKey: boolean) => void;
  onPointerDriveUpdate?: (active: boolean, x: number, z: number) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  onUiSync?: () => void;
  onCollisionDetected?: (collision: any) => void;
  onFpsUpdate?: (fps: number, frameTimeMs: number) => void;
  onBoundaryWarning?: (state: 'soft' | 'hard' | 'out', distToEdge: number) => void;
  onEpisodeReset?: (reason: string) => void;
  isNewAnimation?: boolean;
  adaptiveQuality?: boolean;
}

const DEFAULT_SENSORS: SensorOverlayFlags = {
  lidar: false,
  contacts: false,
  stability: false,
  path: false,
};

export default function ThreeViewer({
  engine,
  envSpec,
  cameraMode = 'follow',
  qualityTier = 'high',
  fov = 55,
  sunElevationDeg = 22,
  sunAzimuthDeg = 52,
  showColliderDebug = false,
  showOverlays = true,
  showRadar = true,
  radarSize = 'medium',
  onRadarSizeChange = () => {},
  showDustParticles = true,
  showGhostComparison = false,
  showContours = true,
  showTrail = true,
  pipEnabled = false,
  sensors = DEFAULT_SENSORS,
  cameraShakeEnabled = true,
  autoRecenterOrbit = true,
  reducedMotion = false,
  colorblindSafe = false,
  editorTool = 'none',
  terrainVersion = 1,
  frameTrigger = 0,
  missionMarkers = [],
  completedMarkerIds = [],
  waypoints = [],
  onTerrainClick,
  onPointerDriveUpdate,
  onCanvasReady,
  onUiSync,
  onBoundaryWarning,
}: ThreeViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);

  // Throttled radar pose state (15 Hz) to avoid per-frame React commits
  const [radarState, setRadarState] = useState<{
    pos: [number, number, number];
    yaw: number;
    trail: [number, number][];
  }>({ pos: [0, 0.385, 0], yaw: 0.62, trail: [] });

  // Live imperative refs
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  const prevCameraModeRef = useRef<CameraMode>(cameraMode);
  const cameraBlendRef = useRef({ active: false, elapsed: 0, duration: 0.35, fromPos: new THREE.Vector3(), fromLook: new THREE.Vector3() });

  const fovRef = useRef(fov);
  fovRef.current = fov;
  const sunRef = useRef({ elev: sunElevationDeg, azim: sunAzimuthDeg });
  sunRef.current = { elev: sunElevationDeg, azim: sunAzimuthDeg };
  const showContoursRef = useRef(showContours);
  showContoursRef.current = showContours;
  const showTrailRef = useRef(showTrail);
  showTrailRef.current = showTrail;
  const pipEnabledRef = useRef(pipEnabled);
  pipEnabledRef.current = pipEnabled;
  const sensorsRef = useRef(sensors);
  sensorsRef.current = sensors;
  const shakeEnabledRef = useRef(cameraShakeEnabled);
  shakeEnabledRef.current = cameraShakeEnabled;
  const autoRecenterRef = useRef(autoRecenterOrbit);
  autoRecenterRef.current = autoRecenterOrbit;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const colorblindRef = useRef(colorblindSafe);
  colorblindRef.current = colorblindSafe;
  const showGhostRef = useRef(showGhostComparison);
  showGhostRef.current = showGhostComparison;
  const showColliderRef = useRef(showColliderDebug);
  showColliderRef.current = showColliderDebug;
  const showOverlaysRef = useRef(showOverlays);
  showOverlaysRef.current = showOverlays;
  const showDustRef = useRef(showDustParticles);
  showDustRef.current = showDustParticles;
  const editorToolRef = useRef(editorTool);
  editorToolRef.current = editorTool;
  const missionMarkersRef = useRef(missionMarkers);
  missionMarkersRef.current = missionMarkers;
  const completedIdsRef = useRef(completedMarkerIds);
  completedIdsRef.current = completedMarkerIds;
  const waypointsRef = useRef(waypoints);
  waypointsRef.current = waypoints;

  const onTerrainClickRef = useRef(onTerrainClick);
  onTerrainClickRef.current = onTerrainClick;
  const onPointerDriveRef = useRef(onPointerDriveUpdate);
  onPointerDriveRef.current = onPointerDriveUpdate;
  const onUiSyncRef = useRef(onUiSync);
  onUiSyncRef.current = onUiSync;
  const onBoundaryWarnRef = useRef(onBoundaryWarning);
  onBoundaryWarnRef.current = onBoundaryWarning;
  const onCanvasReadyRef = useRef(onCanvasReady);
  onCanvasReadyRef.current = onCanvasReady;

  // Three.js scene objects refs
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const terrainUniformsRef = useRef<{
    uEdgeDistance: { value: number };
    uShowContours: { value: number };
  } | null>(null);
  const debrisMeshesRef = useRef<THREE.InstancedMesh[]>([]);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitAnglesRef = useRef({ theta: 0.72, phi: 0.34, dist: 3.6, offsetYaw: 0, lastDragSec: -10 });

  // Trigger smooth 0.35s min-jerk blend on camera mode switch
  useEffect(() => {
    if (cameraMode !== prevCameraModeRef.current && cameraRef.current) {
      cameraBlendRef.current.active = !reducedMotionRef.current;
      cameraBlendRef.current.elapsed = 0;
      cameraBlendRef.current.fromPos.copy(cameraRef.current.position);
      prevCameraModeRef.current = cameraMode;
    }
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  // Frame droid hotkey [F] resets orbit offset
  useEffect(() => {
    if (frameTrigger > 0) {
      orbitAnglesRef.current.offsetYaw = 0;
      orbitAnglesRef.current.phi = 0.34;
      orbitAnglesRef.current.dist = 3.6;
    }
  }, [frameTrigger]);

  // Synchronize live terrain mesh + boulders whenever terrainVersion increments (seed change or terrain brush)
  useEffect(() => {
    const mesh = terrainMeshRef.current;
    const scene = sceneRef.current;
    if (!mesh || !scene) return;
    const field = engineRef.current.terrain.getField();
    const posAttr = mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      posAttr.setY(i, field.sampleHeight(x, z));
    }
    posAttr.needsUpdate = true;
    mesh.geometry.computeVertexNormals();

    // Rebuild instanced boulders on updated heightfield
    for (const dm of debrisMeshesRef.current) {
      scene.remove(dm);
      dm.geometry.dispose();
    }
    debrisMeshesRef.current = buildChunkedDebris(
      scene,
      engineRef.current.getDebris(),
      qualityTier !== 'low' && qualityTier !== 'potato'
    );
  }, [terrainVersion, qualityTier]);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0c0c); // Dark airless lunar sky (Lock-In W0)
    scene.fog = new THREE.Fog(0x0c0c0c, 48, 100);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(fovRef.current, width / height, 0.1, 200);
    camera.up.set(0, 1, 0);
    camera.position.set(-2.6, 2.0, 2.6);
    cameraRef.current = camera;

    // PiP droid camera (first-person stabilized head cam)
    const pipCamera = new THREE.PerspectiveCamera(68, 16 / 9, 0.08, 120);
    pipCamera.up.set(0, 1, 0);

    const isLow = qualityTier === 'low' || qualityTier === 'potato';
    const shadowsEnabled = !isLow;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isLow,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true, // Required for crisp 2x screenshot capture
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isLow ? 1 : 2));
    renderer.shadowMap.enabled = shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    container.appendChild(renderer.domElement);
    onCanvasReadyRef.current?.(renderer.domElement);

    // WebGL Context Loss & Restore Handlers (Phase W12.3)
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored, false);

    // Lighting: HemisphereLight ambient fill + Low-angle Directional key light + Rim light
    const hemiLight = new THREE.HemisphereLight(0x888d7c, 0x262624, 0.55);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfdfbf7, 2.3);
    dirLight.castShadow = shadowsEnabled;
    dirLight.shadow.mapSize.width = qualityTier === 'ultra' ? 2048 : 1024;
    dirLight.shadow.mapSize.height = qualityTier === 'ultra' ? 2048 : 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -12;
    dirLight.shadow.camera.right = 12;
    dirLight.shadow.camera.top = 12;
    dirLight.shadow.camera.bottom = -12;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.025;
    scene.add(dirLight);
    scene.add(dirLight.target);

    const rimLight = new THREE.DirectionalLight(0x9ca3af, 0.45);
    rimLight.position.set(-10, 6, -12);
    scene.add(rimLight);

    // Starfield
    const starfield = buildStarfield();
    scene.add(starfield);

    // Canonical Terrain Mesh directly from engine.terrain (ZERO height divergence!)
    const terrainField = engineRef.current.terrain.getField();
    const terrainMesh = buildCanonicalTerrainMesh(scene, terrainField, qualityTier, terrainUniformsRef);
    terrainMeshRef.current = terrainMesh;

    // Instanced Debris Boulders (white base material 0xffffff for true lit/shadow shading)
    debrisMeshesRef.current = buildChunkedDebris(scene, engineRef.current.getDebris(), shadowsEnabled);

    // Upgraded Detailed 12-DOF Quadruped Droid + Ghost Droid
    const { robotGroup, jointGroups, colliderSphere, antennaGroup, actuatorLeds } = buildDetailedQuadruped(false);
    scene.add(robotGroup);
    const { robotGroup: ghostGroup, jointGroups: ghostJoints } = buildDetailedQuadruped(true);
    ghostGroup.visible = false;
    scene.add(ghostGroup);

    // Subtle Ground Contact Shadows (shrinking & fading cleanly during flight — R-03 fixed!)
    const footShadows = buildFootContactShadows(scene);

    // Subtle Fading Trail Line (clamped to canonical terrain)
    const maxTrailPoints = 240;
    const trailPositions = new Float32Array(maxTrailPoints * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.LineDashedMaterial({
      color: 0xfdfbf7,
      transparent: true,
      opacity: 0.28,
      dashSize: 0.28,
      gapSize: 0.18,
    });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    trailLine.frustumCulled = false;
    scene.add(trailLine);
    let trailCount = 0;
    const trailHistory2D: [number, number][] = [];
    let lastTrailX = 9999;
    let lastTrailZ = 9999;

    // Mission Objective Beacons & User Waypoint Marker Group
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);
    let lastMarkerSig = '';

    // Sensor Overlays Group (LiDAR rays, GRF arrows, Support Polygon, Planned Path — Phase W9.1)
    const lidarMaxVerts = 64;
    const lidarPositions = new Float32Array(lidarMaxVerts * 3);
    const lidarColors = new Float32Array(lidarMaxVerts * 3);
    const lidarGeo = new THREE.BufferGeometry();
    lidarGeo.setAttribute('position', new THREE.BufferAttribute(lidarPositions, 3));
    lidarGeo.setAttribute('color', new THREE.BufferAttribute(lidarColors, 3));
    const lidarMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72 });
    const lidarLines = new THREE.LineSegments(lidarGeo, lidarMat);
    lidarLines.visible = false;
    lidarLines.frustumCulled = false;
    scene.add(lidarLines);

    const grfPositions = new Float32Array(4 * 2 * 3);
    const grfGeo = new THREE.BufferGeometry();
    grfGeo.setAttribute('position', new THREE.BufferAttribute(grfPositions, 3));
    const grfMat = new THREE.LineBasicMaterial({ color: 0x8ea48c, transparent: true, opacity: 0.9 });
    const grfLines = new THREE.LineSegments(grfGeo, grfMat);
    grfLines.visible = false;
    grfLines.frustumCulled = false;
    scene.add(grfLines);

    const polyPositions = new Float32Array(5 * 3);
    const polyGeo = new THREE.BufferGeometry();
    polyGeo.setAttribute('position', new THREE.BufferAttribute(polyPositions, 3));
    const polyMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 });
    const polyLine = new THREE.Line(polyGeo, polyMat);
    polyLine.visible = false;
    polyLine.frustumCulled = false;
    scene.add(polyLine);

    const pathPositions = new Float32Array(32 * 3);
    const pathGeo = new THREE.BufferGeometry();
    pathGeo.setAttribute('position', new THREE.BufferAttribute(pathPositions, 3));
    const pathMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.7 });
    const pathLine = new THREE.Line(pathGeo, pathMat);
    pathLine.visible = false;
    pathLine.frustumCulled = false;
    scene.add(pathLine);

    // Ballistic Lunar Dust Puffs (pooled, disabled on lowest tier or reduced motion)
    const lunarDust = new LunarDustSystem(scene);
    const prevContacts = [true, true, true, true];

    // Pre-warm shaders
    try {
      if ((renderer as any).compileAsync) {
        (renderer as any).compileAsync(scene, camera).catch(() => {});
      } else {
        renderer.compile(scene, camera);
      }
    } catch {}

    // Pointer Interaction: Click-to-Move Waypoint, Terrain Brush, Orbit Drag, Wheel Zoom, Right-Click Pointer Drive
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let isLeftDragging = false;
    let isRightDragging = false;
    let pointerDownPos = { x: 0, y: 0 };
    let prevPointer = { x: 0, y: 0 };

    const pickTerrainPoint = (clientX: number, clientY: number): THREE.Vector3 | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(terrainMesh, false);
      if (hits.length > 0) return hits[0].point;
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      prevPointer = { x: e.clientX, y: e.clientY };
      if (e.button === 0) {
        isLeftDragging = true;
      } else if (e.button === 2) {
        isRightDragging = true;
        const pt = pickTerrainPoint(e.clientX, e.clientY);
        if (pt) onPointerDriveRef.current?.(true, pt.x, pt.z);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (isLeftDragging) {
        const dx = e.clientX - prevPointer.x;
        const dy = e.clientY - prevPointer.y;
        prevPointer = { x: e.clientX, y: e.clientY };
        if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 4) {
          orbitAnglesRef.current.theta -= dx * 0.006;
          orbitAnglesRef.current.offsetYaw -= dx * 0.006;
          orbitAnglesRef.current.phi = Math.max(0.08, Math.min(1.25, orbitAnglesRef.current.phi + dy * 0.005));
          orbitAnglesRef.current.lastDragSec = performance.now() / 1000;
        }
      } else if (isRightDragging) {
        const pt = pickTerrainPoint(e.clientX, e.clientY);
        if (pt) onPointerDriveRef.current?.(true, pt.x, pt.z);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (e.button === 0 && isLeftDragging && moved < 6) {
        const pt = pickTerrainPoint(e.clientX, e.clientY);
        if (pt && Math.abs(pt.x) <= 17.5 && Math.abs(pt.z) <= 17.5) {
          onTerrainClickRef.current?.(pt.x, pt.z, e.shiftKey, e.altKey);
        }
      }
      if (e.button === 0) isLeftDragging = false;
      if (e.button === 2) {
        isRightDragging = false;
        onPointerDriveRef.current?.(false, 0, 0);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitAnglesRef.current.dist = Math.max(2.0, Math.min(20.0, orbitAnglesRef.current.dist + e.deltaY * 0.004));
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // Animation loop primitives (zero per-frame allocations)
    const pacer = new FramePacer();
    const cameraRig = new FollowCameraRig({
      posHalfLife: 0.16,
      lookHalfLife: 0.11,
      lookAheadSec: 0.25,
    });
    const probe = PerfProbe.getInstance();
    const renderState: InterpolatedDroidRenderState = {
      time: 0,
      step: 0,
      pos: [0, 0.385, 0],
      quat: [0, 0, 0, 1],
      vel: [0, 0, 0],
      yaw: 0,
      speed: 0,
      cmdSpeed: 0,
      joints: {},
      jointTorques: {},
      feet: [],
      antennaAngles: [0, 0],
      gaitState: 'stand',
      gaitPattern: 'trot',
      froudeNumber: 0,
      hopActive: false,
      justLanded: false,
      landingImpactSpeed: 0,
      stabilityMargin: 1.0,
      tiltDeg: 0,
      distanceToEdge: 18,
      boundaryState: 'inside',
    };

    const tmpCamTargetPos = new THREE.Vector3();
    const tmpCamTargetLook = new THREE.Vector3();
    const tmpFpvDir = new THREE.Vector3();
    let shakeIntensity = 0;
    let shakeSeed = 1337;
    let lastRadarSyncMs = 0;
    let lastUiSyncMs = 0;
    let lastLidarMs = 0;
    let lastEdgeWarnMs = 0;
    let animId = 0;

    // Debug accessor for Playwright & automated trace verification (Phase E0.3)
    if (typeof window !== 'undefined') {
      (window as any).__omniDebug = {
        getEngine: () => engineRef.current,
        getClock: () => engineRef.current.getClockSnapshot(),
        getState: () => ({ ...renderState }),
        getLatencyMs: () => engineRef.current.getLastInputLatencyMs(),
        runScript: (steps: any[]) => engineRef.current.runScript(steps),
        setCameraMode: (m: CameraMode) => {
          cameraModeRef.current = m;
        },
        getEpisodeInfo: () => {
          const eng = engineRef.current;
          const clk = eng.getClockSnapshot();
          const arb = eng.getArbiterSnapshot();
          const viz = eng.getInputVisualizer();
          const kin = eng.getLatestKinematic();
          return {
            episodeId: clk.episodeNumber,
            phase: clk.ended ? 'ended' : clk.paused ? 'paused' : 'running',
            t: clk.elapsed,
            progress: clk.progress,
            controlMode: arb.isManual ? 'manual' : 'autonomous',
            activeSource: arb.activeSource,
            stopLatch: arb.emergencyStop,
            heldKeys: [...viz.keysHeld],
            droid: {
              id: `droid-${clk.episodeNumber}`,
              position: {
                x: renderState.pos[0],
                y: renderState.pos[1],
                z: renderState.pos[2],
              },
              isSleeping: false,
            },
            listenersCount: 1,
            loopsCount: 1,
            meshCount: robotGroup.children.length,
          };
        },
        finishEpisode: () => {
          const eng = engineRef.current;
          eng.clock.seekToStep(Math.round(eng.clock.getEpisodeLength() * 60));
          eng.tick(1 / 60);
        },
        restartEpisode: () => {
          const eng = engineRef.current;
          eng.resetEpisode(true);
          document.getElementById('viewport-container')?.focus({ preventScroll: true });
        },
        sendKeys: (keys: string[], ms = 100) => {
          if (typeof window === 'undefined') return;
          for (const k of keys) {
            window.dispatchEvent(
              new KeyboardEvent('keydown', {
                code: k,
                key: k.replace(/^Key/, '').toLowerCase(),
                bubbles: true,
              })
            );
          }
          setTimeout(() => {
            for (const k of keys) {
              window.dispatchEvent(
                new KeyboardEvent('keyup', {
                  code: k,
                  key: k.replace(/^Key/, '').toLowerCase(),
                  bubbles: true,
                })
              );
            }
          }, ms);
        },
      };
    }

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = pacer.tick(now);
      probe.recordFrame(now);

      const eng = engineRef.current;
      const { alpha } = eng.tick(dt);
      eng.sampleRenderState(alpha, renderState);

      // 1. Update Droid Root Transform (strictly on canonical terrain heightfield — ZERO floating!)
      const sanitized = sanitizeViewerPosition(renderState.pos, DEFAULT_ARENA);
      robotGroup.position.set(sanitized.pos[0], sanitized.pos[1], sanitized.pos[2]);
      robotGroup.quaternion.set(renderState.quat[0], renderState.quat[1], renderState.quat[2], renderState.quat[3]);

      // 2. Update Articulated Joint Rotations + Torque-Driven Actuator LEDs
      for (const name in renderState.joints) {
        const g = jointGroups[name];
        const angle = renderState.joints[name];
        if (g) {
          if (name.includes('hip')) g.rotation.x = -angle;
          else if (name.includes('thigh')) g.rotation.z = angle;
          else if (name.includes('calf')) g.rotation.z = angle;
        }
        const led = actuatorLeds[name];
        if (led) {
          const tq = renderState.jointTorques[name] ?? 0;
          const intensity = Math.min(1.6, 0.25 + tq * 0.22);
          (led.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
        }
      }

      // Secondary-motion antenna sway
      if (antennaGroup) {
        antennaGroup.rotation.z = renderState.antennaAngles[0] * 0.8;
        antennaGroup.rotation.x = renderState.antennaAngles[1] * 0.8;
      }

      // Collider debug wireframe
      colliderSphere.visible = showColliderRef.current;

      // 3. Ghost Droid Overlay (from saved replay or comparison)
      const ghostPose = showGhostRef.current || eng.hasGhost() ? eng.getCurrentGhostPose() : null;
      if (ghostPose) {
        ghostGroup.visible = true;
        ghostGroup.position.set(ghostPose.pos[0], ghostPose.pos[1], ghostPose.pos[2]);
        ghostGroup.quaternion.set(ghostPose.quat[0], ghostPose.quat[1], ghostPose.quat[2], ghostPose.quat[3]);
        for (const name in renderState.joints) {
          const gg = ghostJoints[name];
          if (gg) {
            const ang = renderState.joints[name];
            if (name.includes('hip')) gg.rotation.x = -ang;
            else if (name.includes('thigh') || name.includes('calf')) gg.rotation.z = ang;
          }
        }
      } else {
        ghostGroup.visible = false;
      }

      // 4. Subtle Contact Shadows under actual footfalls + Ballistic Dust Puffs
      const field = eng.terrain.getField();
      for (let i = 0; i < renderState.feet.length && i < footShadows.length; i++) {
        const f = renderState.feet[i];
        const sh = footShadows[i];
        const gy = field.sampleHeight(f.pos[0], f.pos[2]);
        const clearance = Math.max(0, f.pos[1] - gy);
        sh.position.set(f.pos[0], gy + 0.004, f.pos[2]);
        const scale = Math.max(0.3, 1.0 - clearance * 2.5);
        sh.scale.set(scale, 1, scale);
        const sMat = sh.material as THREE.MeshBasicMaterial;
        sMat.opacity = f.contact ? 0.42 : Math.max(0, 0.22 * (1 - clearance / 0.28));

        if (f.contact && !prevContacts[i]) {
          globalAudioSynthesizer.triggerFootThump(0.4);
          if (showDustRef.current && !isLow && !reducedMotionRef.current) {
            lunarDust.emit(f.pos, 4);
          }
        }
        prevContacts[i] = f.contact;
      }

      // Landing impact dust burst & seeded camera shake
      if (renderState.justLanded) {
        globalAudioSynthesizer.triggerHopThud(0.7);
        if (showDustRef.current && !isLow && !reducedMotionRef.current) {
          lunarDust.emit([sanitized.pos[0], field.sampleHeight(sanitized.pos[0], sanitized.pos[2]) + 0.02, sanitized.pos[2]], 14);
        }
        if (shakeEnabledRef.current && !reducedMotionRef.current) {
          shakeIntensity = Math.min(0.14, 0.04 + renderState.landingImpactSpeed * 0.05);
        }
      }
      lunarDust.update(dt, eng.getScenario().gravity);

      // 5. Terrain shader uniforms (edge proximity glow & smooth contour toggle)
      if (terrainUniformsRef.current) {
        terrainUniformsRef.current.uEdgeDistance.value = renderState.distanceToEdge;
        terrainUniformsRef.current.uShowContours.value = showContoursRef.current ? 1.0 : 0.0;
      }
      if (renderState.boundaryState !== 'inside' && now - lastEdgeWarnMs > 1500) {
        lastEdgeWarnMs = now;
        onBoundaryWarnRef.current?.(renderState.boundaryState, renderState.distanceToEdge);
      }

      // 6. Subtle Fading Trail Line (sampled every 15cm along ground)
      trailLine.visible = showTrailRef.current && showOverlaysRef.current;
      const distMoved = Math.hypot(sanitized.pos[0] - lastTrailX, sanitized.pos[2] - lastTrailZ);
      if (distMoved > 0.15) {
        if (trailCount >= maxTrailPoints) {
          // Shift ring smoothly without drawing a cross-screen jump cord
          trailPositions.copyWithin(0, 3, maxTrailPoints * 3);
          trailCount = maxTrailPoints - 1;
          trailHistory2D.shift();
        }
        const gy = field.sampleHeight(sanitized.pos[0], sanitized.pos[2]) + 0.015;
        trailPositions[trailCount * 3] = sanitized.pos[0];
        trailPositions[trailCount * 3 + 1] = gy;
        trailPositions[trailCount * 3 + 2] = sanitized.pos[2];
        trailCount++;
        trailHistory2D.push([sanitized.pos[0], sanitized.pos[2]]);
        lastTrailX = sanitized.pos[0];
        lastTrailZ = sanitized.pos[2];
        trailGeo.attributes.position.needsUpdate = true;
        trailGeo.setDrawRange(0, trailCount);
        trailLine.computeLineDistances();
      }

      // 7. Rebuild Mission Beacons & Waypoints when changed
      const activeMarkers = missionMarkersRef.current;
      const doneIds = completedIdsRef.current;
      const wps = waypointsRef.current;
      const markerSig = `${activeMarkers.map((m) => m.id).join(',')}|${doneIds.join(',')}|${wps.map((w) => `${w.x.toFixed(1)},${w.z.toFixed(1)}`).join(';')}|${colorblindRef.current}`;
      if (markerSig !== lastMarkerSig) {
        lastMarkerSig = markerSig;
        while (markerGroup.children.length > 0) {
          const child = markerGroup.children[0];
          markerGroup.remove(child);
        }
        const objColor = colorblindRef.current ? 0x38bdf8 : 0x8ea48c;
        const wpColor = colorblindRef.current ? 0xfbbf24 : 0xf59e0b;

        for (const m of activeMarkers) {
          if (doneIds.includes(m.id)) continue;
          const gy = field.sampleHeight(m.x, m.z);
          const beacon = buildTerrainBeacon(m.x, gy, m.z, m.radius * 0.5, objColor, m.kind === 'trench' ? 1.8 : 2.6, m.label);
          markerGroup.add(beacon);
        }
        for (const wp of wps) {
          const gy = field.sampleHeight(wp.x, wp.z);
          const wpBeacon = buildTerrainBeacon(wp.x, gy, wp.z, 0.42, wp.reachable === false ? 0xb83b2f : wpColor, 1.5, wp.label);
          markerGroup.add(wpBeacon);
        }
      }
      markerGroup.visible = showOverlaysRef.current;

      // 8. Sensor Overlays (LiDAR, GRF Arrows, Support Polygon, Planned Path — Phase W9.1)
      const sFlags = sensorsRef.current;
      lidarLines.visible = sFlags.lidar && !isLow;
      if (lidarLines.visible && now - lastLidarMs > 50) {
        lastLidarMs = now;
        const rays = eng.computeLidarScan(24, 14.0);
        let idx = 0;
        for (let i = 0; i < rays.length && idx + 1 < lidarMaxVerts; i++) {
          const r = rays[i];
          lidarPositions[idx * 3] = r.origin[0];
          lidarPositions[idx * 3 + 1] = r.origin[1];
          lidarPositions[idx * 3 + 2] = r.origin[2];
          lidarPositions[(idx + 1) * 3] = r.hitPoint[0];
          lidarPositions[(idx + 1) * 3 + 1] = r.hitPoint[1];
          lidarPositions[(idx + 1) * 3 + 2] = r.hitPoint[2];
          const cr = r.isObstacle ? 0.96 : 0.42;
          const cg = r.isObstacle ? 0.35 : 0.72;
          const cb = r.isObstacle ? 0.25 : 0.55;
          lidarColors[idx * 3] = cr; lidarColors[idx * 3 + 1] = cg; lidarColors[idx * 3 + 2] = cb;
          lidarColors[(idx + 1) * 3] = cr; lidarColors[(idx + 1) * 3 + 1] = cg; lidarColors[(idx + 1) * 3 + 2] = cb;
          idx += 2;
        }
        lidarGeo.attributes.position.needsUpdate = true;
        lidarGeo.attributes.color.needsUpdate = true;
        lidarGeo.setDrawRange(0, idx);
      }

      grfLines.visible = sFlags.contacts;
      if (grfLines.visible) {
        let idx = 0;
        for (let i = 0; i < renderState.feet.length; i++) {
          const f = renderState.feet[i];
          const gy = field.sampleHeight(f.pos[0], f.pos[2]);
          const h = f.contact ? 0.35 : 0.0;
          grfPositions[idx * 3] = f.pos[0]; grfPositions[idx * 3 + 1] = gy + 0.01; grfPositions[idx * 3 + 2] = f.pos[2];
          grfPositions[(idx + 1) * 3] = f.pos[0]; grfPositions[(idx + 1) * 3 + 1] = gy + 0.01 + h; grfPositions[(idx + 1) * 3 + 2] = f.pos[2];
          idx += 2;
        }
        grfGeo.attributes.position.needsUpdate = true;
        grfGeo.setDrawRange(0, idx);
      }

      polyLine.visible = sFlags.stability;
      if (polyLine.visible) {
        const planted = renderState.feet.filter((f) => f.contact);
        if (planted.length >= 2) {
          for (let i = 0; i < planted.length; i++) {
            const f = planted[i];
            polyPositions[i * 3] = f.pos[0];
            polyPositions[i * 3 + 1] = field.sampleHeight(f.pos[0], f.pos[2]) + 0.02;
            polyPositions[i * 3 + 2] = f.pos[2];
          }
          polyPositions[planted.length * 3] = planted[0].pos[0];
          polyPositions[planted.length * 3 + 1] = field.sampleHeight(planted[0].pos[0], planted[0].pos[2]) + 0.02;
          polyPositions[planted.length * 3 + 2] = planted[0].pos[2];
          polyGeo.attributes.position.needsUpdate = true;
          polyGeo.setDrawRange(0, planted.length + 1);
        } else {
          polyGeo.setDrawRange(0, 0);
        }
      }

      pathLine.visible = sFlags.path || wps.length > 0;
      if (pathLine.visible) {
        let pCount = 0;
        pathPositions[0] = sanitized.pos[0];
        pathPositions[1] = field.sampleHeight(sanitized.pos[0], sanitized.pos[2]) + 0.04;
        pathPositions[2] = sanitized.pos[2];
        pCount = 1;
        const targets = wps.length > 0
          ? wps
          : activeMarkers.filter((m) => !doneIds.includes(m.id)).slice(0, 1);
        for (let i = 0; i < targets.length && pCount < 32; i++) {
          const t = targets[i];
          pathPositions[pCount * 3] = t.x;
          pathPositions[pCount * 3 + 1] = field.sampleHeight(t.x, t.z) + 0.04;
          pathPositions[pCount * 3 + 2] = t.z;
          pCount++;
        }
        pathGeo.attributes.position.needsUpdate = true;
        pathGeo.setDrawRange(0, pCount);
      }

      // 9. Camera Rig (Follow, Orbit, Top-Down, FPV, Free-Fly + 0.35s Min-Jerk Blend + Landing Shake)
      if (Math.abs(camera.fov - fovRef.current) > 0.1) {
        camera.fov = fovRef.current;
        camera.updateProjectionMatrix();
      }

      // Auto-recenter follow orbit offset after 3s idle
      const nowSec = now / 1000;
      if (
        cameraModeRef.current === 'follow' &&
        autoRecenterRef.current &&
        !isLeftDragging &&
        nowSec - orbitAnglesRef.current.lastDragSec > 3.0
      ) {
        if (reducedMotionRef.current) {
          orbitAnglesRef.current.offsetYaw = 0;
        } else {
          orbitAnglesRef.current.offsetYaw *= Math.exp(-2.2 * dt);
        }
      }

      // Apply gamepad right-stick pitch delta smoothly
      if (Math.abs(eng.inputs.gamepadCameraPitchDelta) > 0.01) {
        orbitAnglesRef.current.phi = Math.max(
          0.12,
          Math.min(1.15, orbitAnglesRef.current.phi + eng.inputs.gamepadCameraPitchDelta * dt * 1.4)
        );
      }

      const mode = cameraModeRef.current;
      const rx = sanitized.pos[0];
      const ry = sanitized.pos[1];
      const rz = sanitized.pos[2];

      if (mode === 'follow') {
        if (Math.abs(orbitAnglesRef.current.offsetYaw) > 0.03) {
          const ang = renderState.yaw + Math.PI + orbitAnglesRef.current.offsetYaw;
          const d = orbitAnglesRef.current.dist;
          const cx = rx + Math.cos(ang) * d;
          const cz = rz - Math.sin(ang) * d;
          const cy = Math.max(field.sampleHeight(cx, cz) + 0.55, ry + Math.sin(orbitAnglesRef.current.phi) * d + 0.35);
          tmpCamTargetPos.set(cx, cy, cz);
          tmpCamTargetLook.set(rx, ry + 0.12, rz);
        } else {
          cameraRig.update(
            camera,
            [rx, ry, rz],
            renderState.vel,
            'chase',
            field,
            dt
          );
          tmpCamTargetPos.copy(camera.position);
          tmpCamTargetLook.set(rx + renderState.vel[0] * 0.25, ry + 0.15, rz + renderState.vel[2] * 0.25);
        }
      } else if (mode === 'orbit' || mode === 'freefly') {
        const d = orbitAnglesRef.current.dist;
        const th = orbitAnglesRef.current.theta;
        const ph = orbitAnglesRef.current.phi;
        const cx = rx + Math.sin(th) * Math.cos(ph) * d;
        const cz = rz + Math.cos(th) * Math.cos(ph) * d;
        const cy = Math.max(field.sampleHeight(cx, cz) + 0.4, ry + Math.sin(ph) * d + 0.3);
        tmpCamTargetPos.set(cx, cy, cz);
        tmpCamTargetLook.set(rx, ry + 0.18, rz);
      } else if (mode === 'topdown') {
        const topH = Math.max(10.0, orbitAnglesRef.current.dist * 3.2);
        tmpCamTargetPos.set(rx, ry + topH, rz + 0.01);
        tmpCamTargetLook.set(rx, ry, rz);
      } else if (mode === 'fpv') {
        const fwdX = Math.cos(renderState.yaw);
        const fwdZ = -Math.sin(renderState.yaw);
        tmpCamTargetPos.set(rx + fwdX * 0.34, ry + 0.20, rz + fwdZ * 0.34);
        tmpCamTargetLook.set(rx + fwdX * 5.0, ry + 0.05, rz + fwdZ * 5.0);
      }

      if (cameraBlendRef.current.active) {
        cameraBlendRef.current.elapsed += dt;
        const tau = Math.min(1, cameraBlendRef.current.elapsed / cameraBlendRef.current.duration);
        const blend = minJerk(tau);
        camera.position.lerpVectors(cameraBlendRef.current.fromPos, tmpCamTargetPos, blend);
        if (tau >= 1) cameraBlendRef.current.active = false;
      } else {
        camera.position.copy(tmpCamTargetPos);
      }

      // Seeded exponential landing shake
      if (shakeIntensity > 0.001 && !reducedMotionRef.current) {
        shakeSeed = (shakeSeed * 1664525 + 1013904223) >>> 0;
        const sx = ((shakeSeed & 0xff) / 255 - 0.5) * 2 * shakeIntensity;
        const sy = (((shakeSeed >> 8) & 0xff) / 255 - 0.5) * 2 * shakeIntensity;
        camera.position.x += sx;
        camera.position.y += sy;
        shakeIntensity *= Math.exp(-10 * dt);
      } else {
        shakeIntensity = 0;
      }

      camera.up.set(0, 1, 0);
      camera.lookAt(tmpCamTargetLook);

      // 10. Sun Directional Light tracking robot with texel-snapped shadow frustum
      const elevRad = (sunRef.current.elev * Math.PI) / 180;
      const azimRad = (sunRef.current.azim * Math.PI) / 180;
      const sunDist = 18;
      dirLight.position.set(
        rx + Math.cos(elevRad) * Math.cos(azimRad) * sunDist,
        ry + Math.sin(elevRad) * sunDist,
        rz + Math.cos(elevRad) * Math.sin(azimRad) * sunDist
      );
      dirLight.target.position.set(rx, ry, rz);
      dirLight.target.updateMatrixWorld();

      // 11. Main WebGL Render Pass
      const curW = container.clientWidth || width;
      const curH = container.clientHeight || height;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, curW, curH);
      renderer.render(scene, camera);

      // 12. Optional Picture-in-Picture (PiP) Droid Head Camera (rendered ONLY when visible!)
      if (pipEnabledRef.current && mode !== 'fpv') {
        const pipW = Math.min(240, Math.round(curW * 0.22));
        const pipH = Math.round(pipW * (9 / 16));
        const margin = 16;
        const px = curW - pipW - margin;
        const py = 86; // Above bottom scrubber

        const fwdX = Math.cos(renderState.yaw);
        const fwdZ = -Math.sin(renderState.yaw);
        pipCamera.position.set(rx + fwdX * 0.34, ry + 0.19, rz + fwdZ * 0.34);
        tmpFpvDir.set(rx + fwdX * 6.0, ry + 0.02, rz + fwdZ * 6.0);
        pipCamera.lookAt(tmpFpvDir);
        pipCamera.aspect = pipW / pipH;
        pipCamera.updateProjectionMatrix();

        renderer.setScissorTest(true);
        renderer.setScissor(px, py, pipW, pipH);
        renderer.setViewport(px, py, pipW, pipH);
        renderer.render(scene, pipCamera);
        renderer.setScissorTest(false);
      }

      // 13. Throttled Radar & HUD Sync (10 Hz — zero per-frame React state churn!)
      if (now - lastRadarSyncMs > 100) {
        lastRadarSyncMs = now;
        setRadarState({
          pos: [sanitized.pos[0], sanitized.pos[1], sanitized.pos[2]],
          yaw: renderState.yaw,
          trail: trailHistory2D.slice(-120),
        });
      }
      if (now - lastUiSyncMs > 100) {
        lastUiSyncMs = now;
        onUiSyncRef.current?.();
      }
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      onCanvasReadyRef.current?.(null);
      lunarDust.dispose();
      lidarGeo.dispose(); lidarMat.dispose();
      grfGeo.dispose(); grfMat.dispose();
      polyGeo.dispose(); polyMat.dispose();
      pathGeo.dispose(); pathMat.dispose();
      trailGeo.dispose(); trailMat.dispose();

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else m.material?.dispose();
        }
      });

      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [qualityTier]);

  return (
    <div
      id="viewport-container"
      tabIndex={-1}
      className="relative w-full h-full overflow-hidden select-none bg-charcoal outline-none focus:outline-none"
    >
      <div
        ref={mountRef}
        className={`w-full h-full ${editorTool !== 'none' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
      />

      {/* WebGL Context Lost Recovery Overlay (Phase W12.3) */}
      {contextLost && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-charcoal-deep/95 font-mono text-xs text-cream">
          <div className="p-6 rounded-2xl border border-amber-400/50 bg-charcoal space-y-2 text-center max-w-sm">
            <div className="font-bold text-amber-300">WebGL Context Lost</div>
            <p className="text-cream-dim text-[11px]">
              GPU context was interrupted. Simulation state is preserved and will resume automatically upon restore.
            </p>
          </div>
        </div>
      )}

      {/* Top-Left Gravity Telemetry Chip */}
      <div className="absolute top-3 left-3 z-20 flex items-center space-x-2 pointer-events-none">
        <div className="analog-glass px-2.5 py-1 text-[11px] font-mono text-cream flex items-center space-x-1.5 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-sage animate-pulse" />
          <span className="text-cream-dim">GRAVITY:</span>
          <span className="font-bold text-cream tabular-nums">
            {formatGravityDisplay([0, -engine.getScenario().gravity, 0])}
          </span>
        </div>
      </div>

      {/* Upgraded Top-Right Radar Panel (Phase W1.5 — R-05) */}
      {showRadar && (
        <div className="absolute top-3 right-3 z-20 pointer-events-auto">
          <RadarPanel
            size={radarSize}
            onSizeChange={onRadarSizeChange}
            field={engine.terrain.getField()}
            terrainVersion={terrainVersion}
            debris={engine.getDebris()}
            robotPos={radarState.pos}
            robotYaw={radarState.yaw}
            trailPoints={radarState.trail}
            waypoints={waypoints}
            missionMarkers={missionMarkers}
            completedMarkerIds={completedMarkerIds}
            colorblindSafe={colorblindSafe}
          />
        </div>
      )}

      {/* Picture-in-Picture Droid Camera Frame Badge */}
      {pipEnabled && cameraMode !== 'fpv' && (
        <div className="pointer-events-none absolute bottom-[86px] right-4 z-20 px-2 py-0.5 rounded-t bg-charcoal-deep/85 border border-cream/25 font-mono text-[9px] text-sage font-bold">
          DROID FPV CAM
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SCENE & MODEL BUILDERS
// ============================================================================

function buildStarfield(): THREE.Points {
  const count = 350;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  let s = 918273;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(rand() * 0.85);
    const r = 95.0;
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

function createDisplacedIcosahedron(radius: number, detail = 1, seed = 0): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
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

function buildCanonicalTerrainMesh(
  scene: THREE.Scene,
  field: TerrainField,
  effectiveTier: string,
  uniformsRef?: React.MutableRefObject<{
    uEdgeDistance: { value: number };
    uShowContours: { value: number };
  } | null>
): THREE.Mesh {
  const segments = effectiveTier === 'ultra' ? 256 : effectiveTier === 'high' ? 128 : effectiveTier === 'medium' ? 96 : 64;
  const terrainGeo = new THREE.PlaneGeometry(48.0, 48.0, segments, segments);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    posAttr.setY(i, field.sampleHeight(x, z));
  }
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0x2e2e2e,
    roughness: 0.88,
    metalness: 0.10,
    flatShading: false,
  });

  terrainMat.onBeforeCompile = (shader) => {
    const uniforms = {
      uEdgeDistance: { value: 18.0 },
      uShowContours: { value: 1.0 },
    };
    if (uniformsRef) uniformsRef.current = uniforms;
    shader.uniforms.uEdgeDistance = uniforms.uEdgeDistance;
    shader.uniforms.uShowContours = uniforms.uShowContours;

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
       uniform float uEdgeDistance;
       uniform float uShowContours;`
    );

    // Smooth anti-aliased contours (R-04 fix) & surface-draped arena boundary rim
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `float slope = 1.0 - max(0.0, vWorldNormal.y);
       vec3 slopeTint = mix(vec3(0.18, 0.18, 0.18), vec3(0.11, 0.11, 0.11), smoothstep(0.1, 0.4, slope));
       gl_FragColor.rgb = mix(gl_FragColor.rgb, slopeTint, 0.35);

       float flatT = smoothstep(0.15, 0.02, slope);
       gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.42, 0.44, 0.36), flatT * 0.22);

       // Smooth fragment-space fwidth anti-aliased elevation isolines (zero jagged squiggles)
       float camDist = length(vWorldPos - cameraPosition);
       if (uShowContours > 0.5) {
         float distFade = 1.0 - smoothstep(10.0, 24.0, camDist);
         float dyFw = max(0.003, fwidth(vWorldPos.y));
         float fMajor = abs(fract(vWorldPos.y / 1.0 - 0.5) - 0.5) / dyFw;
         float majorLine = 1.0 - smoothstep(0.35, 1.35, fMajor);
         gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.99, 0.98, 0.97), majorLine * 0.065 * distFade);
       }

       // Square Arena Boundary Rim (18m half-extent)
       float distArena = max(abs(vWorldPos.x), abs(vWorldPos.z));
       float rimDist = abs(distArena - 18.0);
       float rimWidth = max(0.04, fwidth(distArena) * 1.5);
       float rimAlpha = 1.0 - smoothstep(0.0, rimWidth, rimDist);
       float rimFade = 1.0 - smoothstep(18.0, 32.0, camDist);
       float dash = fract((vWorldPos.x + vWorldPos.z) * 1.0);
       if (dash < 0.5 && rimAlpha > 0.01 && rimFade > 0.01) {
         gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.99, 0.98, 0.97), 0.28 * rimAlpha * rimFade);
       }

       if (uEdgeDistance < 2.5) {
         float alertIntensity = smoothstep(2.5, 0.0, uEdgeDistance) * 0.42;
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

function buildFootContactShadows(scene: THREE.Scene): THREE.Mesh[] {
  const shadows: THREE.Mesh[] = [];
  const geo = new THREE.CircleGeometry(0.055, 16);
  geo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0c0c0a,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, -10, 0);
    scene.add(m);
    shadows.push(m);
  }
  return shadows;
}

function buildTerrainBeacon(
  x: number,
  groundY: number,
  z: number,
  radius: number,
  colorHex: number,
  beamHeight: number,
  label?: string
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, groundY + 0.02, z);

  // Outer Ground Landing Ring
  const ringGeo = new THREE.TorusGeometry(radius, 0.032, 8, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  g.add(new THREE.Mesh(ringGeo, ringMat));

  // Inner Concentric Target Ring
  const innerRingGeo = new THREE.TorusGeometry(radius * 0.45, 0.022, 8, 24);
  innerRingGeo.rotateX(-Math.PI / 2);
  const innerRingMat = new THREE.MeshBasicMaterial({
    color: 0xfdfbf7,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  g.add(new THREE.Mesh(innerRingGeo, innerRingMat));

  // Central Vertical Core Beam
  const coreGeo = new THREE.CylinderGeometry(0.025, 0.025, beamHeight, 8);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xfdfbf7,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = beamHeight * 0.5;
  g.add(core);

  // Holographic Light Shaft
  const beamGeo = new THREE.CylinderGeometry(radius * 0.45, radius * 0.85, beamHeight, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = beamHeight * 0.5;
  g.add(beam);

  // Floating Diamond Head at Top
  const headGeo = new THREE.OctahedronGeometry(radius * 0.28, 0);
  const headMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    wireframe: false,
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = beamHeight + radius * 0.28;
  g.add(head);

  // Optional Canvas Sprite Label
  if (label && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(26, 26, 24, 0.82)';
      ctx.strokeStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      if ((ctx as any).roundRect) {
        (ctx as any).roundRect(4, 4, 248, 56, 10);
      } else {
        ctx.rect(4, 4, 248, 56);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FDFBF7';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 128, 32);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.y = beamHeight + radius * 0.28 + 0.35;
      sprite.scale.set(1.4, 0.35, 1);
      g.add(sprite);
    }
  }

  return g;
}

function buildChunkedDebris(
  scene: THREE.Scene,
  debris: readonly DebrisInstance[],
  enableShadows = true
): THREE.InstancedMesh[] {
  const chunks: DebrisInstance[][] = Array.from({ length: 16 }, () => []);
  for (const d of debris) {
    chunks[d.chunkId ?? 0].push(d);
  }

  const sharedGeos = [
    createDisplacedIcosahedron(0.28, 1, 101),
    createDisplacedIcosahedron(0.24, 1, 202),
    createDisplacedIcosahedron(0.20, 1, 303),
  ];

  // Pure white base material (0xffffff) preserves true lit & shadowed boulder luminance
  const debrisMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.90,
    metalness: 0.05,
    flatShading: false,
  });

  const palette = [
    new THREE.Color(0x56564f),
    new THREE.Color(0x4a4a44),
    new THREE.Color(0x40403a),
    new THREE.Color(0x5c5c54),
    new THREE.Color(0x464640),
  ];

  const dummy = new THREE.Object3D();
  const created: THREE.InstancedMesh[] = [];

  for (let c = 0; c < 16; c++) {
    const chunkDebris = chunks[c];
    if (chunkDebris.length === 0) continue;
    const mesh = new THREE.InstancedMesh(sharedGeos[c % 3].clone(), debrisMat, chunkDebris.length);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const box = new THREE.Box3();
    for (let i = 0; i < chunkDebris.length; i++) {
      const d = chunkDebris[i];
      dummy.position.set(d.x, d.y, d.z);
      dummy.scale.set(d.scale, d.scale * 0.95, d.scale);
      dummy.rotation.set(d.rotation[0], d.rotation[1], d.rotation[2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      box.expandByPoint(dummy.position);
      mesh.setColorAt(i, palette[(d.id + c) % palette.length]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    sphere.radius += 0.8;
    mesh.boundingSphere = sphere;
    mesh.castShadow = enableShadows;
    mesh.receiveShadow = true;
    scene.add(mesh);
    created.push(mesh);
  }
  return created;
}

/**
 * Upgraded 12-DOF Quadruped Model (R-09 fix):
 * - Chamfered multi-part torso chassis + sensor head visor (+X forward)
 * - Articulated shoulder brackets & servo housings visibly joining hips to torso
 * - Tapered thighs/calves + rubber foot pads + torque-driven actuator LEDs
 * - Secondary-motion damped telemetry antenna
 */
function buildDetailedQuadruped(isGhost = false) {
  const robotGroup = new THREE.Group();
  const jointGroups: Record<string, THREE.Group> = {};
  const actuatorLeds: Record<string, THREE.Mesh> = {};

  const chassisMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.3, roughness: 0.5 })
    : new THREE.MeshStandardMaterial({ color: 0x383836, roughness: 0.36, metalness: 0.58 });
  const armorMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.25 })
    : new THREE.MeshStandardMaterial({ color: 0x4b4c46, roughness: 0.42, metalness: 0.45 });
  const boneMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.3 })
    : new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.38, metalness: 0.35 });
  const jointMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.35 })
    : new THREE.MeshStandardMaterial({ color: 0x6b705c, roughness: 0.28, metalness: 0.78 });
  const padMat = isGhost
    ? new THREE.MeshStandardMaterial({ color: 0xfdfbf7, transparent: true, opacity: 0.3 })
    : new THREE.MeshStandardMaterial({ color: 0x1e1e1c, roughness: 0.9, metalness: 0.1 });

  // Main chassis core
  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.24), chassisMat);
  torsoMesh.castShadow = !isGhost;
  torsoMesh.receiveShadow = !isGhost;
  robotGroup.add(torsoMesh);

  // Upper armor deck + cream spine stripe
  const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 0.20), armorMat);
  upperDeck.position.y = 0.085;
  upperDeck.castShadow = !isGhost;
  robotGroup.add(upperDeck);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.014, 0.055), new THREE.MeshBasicMaterial({ color: 0xfdfbf7 }));
  stripe.position.y = 0.105;
  robotGroup.add(stripe);

  // Forward Sensor Head / Stereo Camera Visor (+X front)
  const headPod = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.095, 0.16), armorMat);
  headPod.position.set(0.31, 0.015, 0);
  headPod.castShadow = !isGhost;
  robotGroup.add(headPod);

  if (!isGhost) {
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x8ea48c,
      emissive: 0x6b705c,
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
    new THREE.SphereGeometry(0.55, 16, 16),
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
    // Structural hip mounting strut connecting torso to hip servo housing
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, Math.abs(cfg.z) * 0.9), armorMat);
    strut.position.set(cfg.x, 0, cfg.z * 0.55);
    robotGroup.add(strut);

    const hipGroup = new THREE.Group();
    hipGroup.position.set(cfg.x, 0, cfg.z);
    robotGroup.add(hipGroup);
    jointGroups[`${cfg.name}_hip_joint`] = hipGroup;

    // Shoulder servo cylinder
    const hipServo = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.075, 16), jointMat);
    hipServo.rotateX(Math.PI / 2);
    hipServo.castShadow = !isGhost;
    hipGroup.add(hipServo);

    const thighGroup = new THREE.Group();
    hipGroup.add(thighGroup);
    jointGroups[`${cfg.name}_thigh_joint`] = thighGroup;

    // Torque-reactive actuator status LED ring on thigh servo
    if (!isGhost) {
      const ledMat = new THREE.MeshStandardMaterial({
        color: 0x8ea48c,
        emissive: 0x8ea48c,
        emissiveIntensity: 0.4,
      });
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, 0.082), ledMat);
      led.position.set(0, -0.02, 0);
      thighGroup.add(led);
      actuatorLeds[`${cfg.name}_thigh_joint`] = led;
    }

    // Tapered thigh armor limb
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

    // Rubberized hemispherical lunar foot pad (exact bottom contact at -calfLen)
    const footPad = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 14), padMat);
    footPad.position.y = -calfLen + 0.024;
    footPad.scale.set(1.1, 0.85, 1.1);
    footPad.castShadow = !isGhost;
    calfGroup.add(footPad);
  }

  return { robotGroup, jointGroups, colliderSphere, antennaGroup, actuatorLeds };
}
