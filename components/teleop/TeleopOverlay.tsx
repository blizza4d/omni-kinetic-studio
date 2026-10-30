'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  Zap,
  CheckCircle2,
  RotateCcw,
  Play,
  Square,
  UploadCloud,
  Eye,
  Keyboard,
  AlertTriangle,
  Sliders,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Vector3OneEuroFilter, OneEuroFilter } from '@/lib/filters/one_euro';
import { solveLegIK, computePinchDistance, computeWristRoll, computeFacePose } from '@/lib/ik/fabrik';
import { TeleopCommand } from '@/contracts';
import { DAggerRecorder } from './Recorder';

interface TeleopOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onTeleopCommand?: (cmd: TeleopCommand) => void;
  onCommand?: (cmd: any) => void;
  onOpenDatasetPanel?: (episodes: any[]) => void;
  onSaveEpisode?: (ep: any) => void;
  currentRobotState?: {
    pos: [number, number, number];
    quat: [number, number, number, number];
    joints: Record<string, number>;
  };
  currentFrame?: any;
}

export default function TeleopOverlay({
  isOpen,
  onClose,
  onTeleopCommand,
  onCommand,
  onOpenDatasetPanel,
  onSaveEpisode,
  currentRobotState,
  currentFrame,
}: TeleopOverlayProps) {
  const dispatchCommand = onTeleopCommand || onCommand || (() => {});
  const effectiveRobotState = currentRobotState || (currentFrame?.bodies?.[0] ? {
    pos: currentFrame.bodies[0].pos as [number, number, number],
    quat: currentFrame.bodies[0].quat as [number, number, number, number],
    joints: (currentFrame.joints || []).reduce((acc: Record<string, number>, j: any) => {
      acc[j.name] = j.angle;
      return acc;
    }, {}),
  } : undefined);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const [streamActive, setStreamActive] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);
  const [delegate, setDelegate] = useState<'GPU' | 'CPU' | 'SYNTHETIC_OFFLINE'>('GPU');
  const [latencyMs, setLatencyMs] = useState(0);
  const [latencyP50, setLatencyP50] = useState(38);
  const [latencyP95, setLatencyP95] = useState(58);
  const latencyHistoryRef = useRef<number[]>([]);

  const [isCalibrating, setIsCalibrating] = useState(true);
  const [calibrationCountdown, setCalibrationCountdown] = useState(5);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState(0);
  const [recordedEpisodes, setRecordedEpisodes] = useState(0);
  const [activeLimb, setActiveLimb] = useState<'FL' | 'FR' | 'RL' | 'RR'>('FL');

  // Virtual keyboard tip position
  const keyboardTipRef = useRef<[number, number, number]>([0.0, 0.0, -0.25]);
  const keyboardStiffnessRef = useRef(0.85);

  const recorderRef = useRef(new DAggerRecorder());
  const filterRef = useRef(new Vector3OneEuroFilter(1.2, 0.015));
  const pinchFilterRef = useRef(new OneEuroFilter(1.0, 0.01));
  const calibrationOriginRef = useRef<[number, number, number] | null>(null);
  const animationFrameId = useRef<number | null>(null);

  // Load saved calibration origin from localStorage if present
  useEffect(() => {
    try {
      const saved = localStorage.getItem('omnikinetic_teleop_calibration');
      if (saved) {
        calibrationOriginRef.current = JSON.parse(saved);
        setIsCalibrating(false);
      }
    } catch {}
  }, []);

  // Initialize Worker
  useEffect(() => {
    if (!isOpen) return;

    try {
      const worker = new Worker(new URL('../../workers/vision/vision.worker.ts', import.meta.url), {
        type: 'module',
      });

      worker.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (data.type === 'READY') {
          setDelegate(data.delegate || 'GPU');
        } else if (data.type === 'RESULTS') {
          handleVisionResults(data);
        }
      };

      workerRef.current = worker;
    } catch (err) {
      console.warn('[TeleopOverlay] Worker creation failed, vision will run in mock/standby mode:', err);
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [isOpen]);

  // Start Webcam
  useEffect(() => {
    if (!isOpen || isKeyboardMode) {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      setStreamActive(false);
      return;
    }

    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 480, height: 360, frameRate: { ideal: 60, min: 30 } },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setStreamActive(true);
          setPermissionDenied(false);
        }
      } catch (err) {
        console.warn('[TeleopOverlay] Webcam access unavailable or denied:', err);
        setStreamActive(false);
        setPermissionDenied(true);
        setIsKeyboardMode(true);
      }
    }

    initCamera();
  }, [isOpen, isKeyboardMode]);

  // Calibration Countdown Timer
  useEffect(() => {
    if (!isOpen || !isCalibrating || isKeyboardMode) return;

    const timer = setInterval(() => {
      setCalibrationCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsCalibrating(false);
          // Persist calibration
          if (calibrationOriginRef.current) {
            try {
              localStorage.setItem(
                'omnikinetic_teleop_calibration',
                JSON.stringify(calibrationOriginRef.current)
              );
            } catch {}
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, isCalibrating, isKeyboardMode]);

  // Keyboard Teleoperation Event Listeners
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift + T: Re-trigger calibration
      if (e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setIsCalibrating(true);
        setCalibrationCountdown(5);
        return;
      }

      // 1-4: Switch limb
      if (e.key === '1') setActiveLimb('FL');
      if (e.key === '2') setActiveLimb('FR');
      if (e.key === '3') setActiveLimb('RL');
      if (e.key === '4') setActiveLimb('RR');

      // WASD + QE for tip movement in Keyboard Mode
      const step = 0.03;
      if (isKeyboardMode) {
        let [x, y, z] = keyboardTipRef.current;
        if (e.key.toLowerCase() === 'w') x += step;
        if (e.key.toLowerCase() === 's') x -= step;
        if (e.key.toLowerCase() === 'a') y -= step;
        if (e.key.toLowerCase() === 'd') y += step;
        if (e.key.toLowerCase() === 'q') z += step;
        if (e.key.toLowerCase() === 'e') z -= step;
        if (e.key.toLowerCase() === 'p') {
          keyboardStiffnessRef.current = keyboardStiffnessRef.current > 0.5 ? 0.2 : 0.85;
        }

        keyboardTipRef.current = [
          Math.max(-0.25, Math.min(0.25, x)),
          Math.max(-0.25, Math.min(0.25, y)),
          Math.max(-0.38, Math.min(-0.12, z)),
        ];

        // Solve IK for keyboard command
        const legIK = solveLegIK(keyboardTipRef.current);
        const jointTargets = {
          [`${activeLimb}_hip_joint`]: legIK.hip,
          [`${activeLimb}_thigh_joint`]: legIK.thigh,
          [`${activeLimb}_calf_joint`]: legIK.calf,
        };

        const now = performance.now();
        const cmd: TeleopCommand = {
          t: Number((now / 1000).toFixed(4)),
          limb: activeLimb,
          activeLimb,
          jointTargets,
          confidence: 1.0,
          stiffness: keyboardStiffnessRef.current,
          source: 'keyboard_fallback',
        };

        dispatchCommand(cmd);

        if (isRecording && effectiveRobotState) {
          recorderRef.current.recordStep(
            effectiveRobotState.pos,
            effectiveRobotState.quat,
            effectiveRobotState.joints,
            jointTargets
          );
          setRecordedSteps(recorderRef.current.getRecordedStepCount());
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isKeyboardMode, activeLimb, isRecording, effectiveRobotState, dispatchCommand]);

  // Main Webcam Capture & Inference Loop
  useEffect(() => {
    if (!isOpen || !streamActive || isKeyboardMode) return;

    let isProcessing = false;

    function processFrame() {
      if (!videoRef.current || !workerRef.current || isProcessing) {
        animationFrameId.current = requestAnimationFrame(processFrame);
        return;
      }

      if (videoRef.current.readyState >= 2 && !videoRef.current.paused) {
        isProcessing = true;
        createImageBitmap(videoRef.current)
          .then((bitmap) => {
            if (workerRef.current) {
              const now = performance.now();
              workerRef.current.postMessage({ frame: bitmap, timestamp: now }, [bitmap]);
            }
          })
          .catch(() => {})
          .finally(() => {
            isProcessing = false;
          });
      }

      animationFrameId.current = requestAnimationFrame(processFrame);
    }

    animationFrameId.current = requestAnimationFrame(processFrame);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isOpen, streamActive, isKeyboardMode]);

  // Process Vision Results from Worker
  const handleVisionResults = useCallback(
    (data: any) => {
      if (isKeyboardMode) return;

      const now = performance.now();
      const { landmarks, latencyMs: workerLatency } = data;
      setLatencyMs(workerLatency);

      // Rolling p50/p95 latency calculation
      const hist = latencyHistoryRef.current;
      hist.push(workerLatency);
      if (hist.length > 30) hist.shift();
      const sorted = [...hist].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)] || 38;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || 58;
      setLatencyP50(p50);
      setLatencyP95(p95);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      let jointTargets: Record<string, number> = {};
      let cameraPose = { yaw: 0, pitch: 0 };
      let stiffness = 0.8;
      let confidence = 0.95;

      // 1. Process Hand Landmarks
      if (landmarks.hands && landmarks.hands.length > 0) {
        const hand = landmarks.hands[0];
        const thumbTip = hand[4];
        const indexTip = hand[8];

        // Draw Skeleton on Preview Canvas
        if (ctx && canvas) {
          ctx.strokeStyle = '#6B705C';
          ctx.lineWidth = 2;
          ctx.fillStyle = '#FDFBF7';

          for (const pt of hand) {
            const px = (1 - pt.x) * canvas.width;
            const py = pt.y * canvas.height;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, 2 * Math.PI);
            ctx.fill();
          }

          // Highlight fingertip
          const ix = (1 - indexTip.x) * canvas.width;
          const iy = indexTip.y * canvas.height;
          ctx.fillStyle = '#B83B2F';
          ctx.beginPath();
          ctx.arc(ix, iy, 6, 0, 2 * Math.PI);
          ctx.fill();
        }

        // Target coordinates with origin calibration offset
        const rawTarget: [number, number, number] = [
          (indexTip.x - 0.5) * 0.4,
          (0.5 - indexTip.y) * 0.4,
          (indexTip.z ?? 0) * 0.4 - 0.25,
        ];

        if (isCalibrating) {
          calibrationOriginRef.current = rawTarget;
        }

        // Apply One Euro Filter to target coordinates
        const smoothed = filterRef.current.filter(rawTarget, now / 1000);

        // Solve IK for the active leg
        const legIK = solveLegIK([smoothed[0], smoothed[1], smoothed[2]]);

        // Pinch for stiffness
        const rawPinch = computePinchDistance(thumbTip, indexTip);
        stiffness = pinchFilterRef.current.filter(rawPinch, now / 1000);

        jointTargets = {
          [`${activeLimb}_hip_joint`]: legIK.hip,
          [`${activeLimb}_thigh_joint`]: legIK.thigh,
          [`${activeLimb}_calf_joint`]: legIK.calf,
        };
      }

      // 2. Process Face Landmarks for Camera Orbit
      if (landmarks.faces && landmarks.faces.length > 0) {
        const face = landmarks.faces[0];
        const noseTip = face[1];
        const leftCheek = face[234];
        const rightCheek = face[454];

        if (noseTip && leftCheek && rightCheek) {
          cameraPose = computeFacePose(noseTip, leftCheek, rightCheek);
        }
      }

      // 3. Emit Teleop Command
      const cmd: TeleopCommand = {
        t: Number((now / 1000).toFixed(4)),
        limb: activeLimb,
        activeLimb,
        jointTargets,
        cameraPose,
        confidence,
        stiffness,
        source: 'camera_mediapipe',
      };

      dispatchCommand(cmd);

      // 4. Record DAgger Demonstration if active
      if (isRecording && effectiveRobotState) {
        recorderRef.current.recordStep(
          effectiveRobotState.pos,
          effectiveRobotState.quat,
          effectiveRobotState.joints,
          jointTargets
        );
        setRecordedSteps(recorderRef.current.getRecordedStepCount());
      }
    },
    [isCalibrating, activeLimb, isRecording, effectiveRobotState, dispatchCommand, isKeyboardMode]
  );

  const toggleRecording = () => {
    if (isRecording) {
      const finished = recorderRef.current.stopRecording();
      setIsRecording(false);
      setRecordedEpisodes(recorderRef.current.getActiveEpisodeCount());
      const dataset = recorderRef.current.exportDataset();
      if (onSaveEpisode && finished) {
        onSaveEpisode(finished);
      }
      if (onOpenDatasetPanel) {
        onOpenDatasetPanel(dataset.episodes);
      }
    } else {
      recorderRef.current.startRecording();
      setIsRecording(true);
      setRecordedSteps(0);
    }
  };

  const handleOpenDataset = () => {
    if (onOpenDatasetPanel) {
      onOpenDatasetPanel(recorderRef.current.exportDataset().episodes);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex flex-col justify-between p-6">
      {/* Top Teleop HUD Header */}
      <div className="pointer-events-auto flex items-center justify-between analog-glass-elevated px-4 py-3 rounded-xl max-w-4xl mx-auto w-full border border-cream/15 shadow-2xl">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-brick animate-ping" />
          <span className="font-mono text-sm tracking-wider uppercase text-cream font-bold">
            Human-in-the-Loop Teleoperation
          </span>
          <span className="text-xs bg-charcoal-deep px-2 py-0.5 rounded border border-cream/20 font-mono text-cream-dim">
            [T] Toggle
          </span>
          <span className="text-xs bg-charcoal-deep px-2 py-0.5 rounded border border-cream/20 font-mono text-cream-dim">
            [Shift+T] Calibrate
          </span>
        </div>

        {/* Latency & Mode Controls */}
        <div className="flex items-center space-x-3 font-mono text-xs">
          {/* Latency Readout */}
          <div className="flex items-center space-x-1.5 bg-charcoal px-2.5 py-1 rounded border border-cream/10">
            <Zap className={`w-3.5 h-3.5 ${latencyP95 < 80 ? 'text-sage' : 'text-brick'}`} />
            <span className="text-cream-dim">p50:</span>
            <span className="text-sage font-bold">{latencyP50}ms</span>
            <span className="text-cream-dim ml-1">p95:</span>
            <span className="text-cream font-bold">{latencyP95}ms</span>
          </div>

          {/* Engine / Delegate */}
          <div className="flex items-center space-x-1.5 bg-charcoal px-2.5 py-1 rounded border border-cream/10">
            <span className="text-cream-dim">Engine:</span>
            <span className="text-cream font-semibold">
              {isKeyboardMode ? 'Keyboard Fallback' : delegate}
            </span>
          </div>

          {/* Mode Switcher */}
          <button
            onClick={() => setIsKeyboardMode(!isKeyboardMode)}
            className={`px-2.5 py-1 rounded border flex items-center space-x-1 transition-colors ${
              isKeyboardMode
                ? 'bg-sage/20 border-sage/50 text-sage'
                : 'bg-charcoal border-cream/10 text-cream-dim hover:text-cream'
            }`}
          >
            {isKeyboardMode ? <Keyboard className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
            <span>{isKeyboardMode ? 'Keyboard Active' : 'Use Keyboard'}</span>
          </button>

          <button
            onClick={onClose}
            className="text-xs px-2.5 py-1 rounded bg-charcoal hover:bg-charcoal-light border border-cream/20 text-cream"
          >
            Exit [Esc]
          </button>
        </div>
      </div>

      {/* Floating PIP Panel (Webcam or Keyboard Controls) */}
      <div className="pointer-events-auto self-end analog-glass-elevated p-3 rounded-xl flex flex-col space-y-3 w-80 shadow-2xl border border-cream/15">
        <div className="flex items-center justify-between border-b border-cream/10 pb-2">
          <div className="flex items-center space-x-2">
            {isKeyboardMode ? (
              <Keyboard className="w-4 h-4 text-sage" />
            ) : (
              <Camera className="w-4 h-4 text-sage" />
            )}
            <span className="text-xs font-mono uppercase text-cream font-bold">
              {isKeyboardMode ? 'Keyboard Control' : 'Vision PIP Feed'}
            </span>
          </div>

          {!isKeyboardMode && (
            isCalibrating ? (
              <span className="text-[11px] font-mono text-brick font-bold flex items-center space-x-1">
                <RotateCcw className="w-3 h-3 animate-spin" />
                <span>Calibrating: {calibrationCountdown}s</span>
              </span>
            ) : (
              <button
                onClick={() => {
                  setIsCalibrating(true);
                  setCalibrationCountdown(5);
                }}
                className="text-[10px] font-mono text-sage hover:underline flex items-center space-x-1"
                title="Recalibrate neutral posture [Shift+T]"
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Recalibrate</span>
              </button>
            )
          )}
        </div>

        {/* Video / Keyboard Canvas Display */}
        {isKeyboardMode ? (
          <div className="p-3 bg-charcoal-deep rounded-lg border border-cream/10 font-mono text-[11px] space-y-2">
            <div className="text-cream font-semibold flex items-center justify-between">
              <span>Direct Actuator Keys</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-sage/20 text-sage uppercase">
                Active
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[10px] text-cream-dim">
              <div><kbd className="bg-charcoal px-1 rounded text-cream">W/S</kbd> Forward/Back</div>
              <div><kbd className="bg-charcoal px-1 rounded text-cream">A/D</kbd> Left/Right</div>
              <div><kbd className="bg-charcoal px-1 rounded text-cream">Q/E</kbd> Height Up/Down</div>
              <div><kbd className="bg-charcoal px-1 rounded text-cream">P</kbd> Pinch Stiffness</div>
            </div>
            <div className="text-[10px] text-sage pt-1 border-t border-cream/5">
              Tip: [{keyboardTipRef.current.map((v) => v.toFixed(2)).join(', ')}]
            </div>
          </div>
        ) : (
          <div className="relative w-full h-48 bg-charcoal-deep rounded-lg overflow-hidden border border-cream/10">
            {permissionDenied ? (
              <div className="h-full flex flex-col items-center justify-center p-4 text-center space-y-2">
                <AlertTriangle className="w-6 h-6 text-brick" />
                <div className="text-[11px] font-mono text-cream font-semibold">Webcam Unavailable</div>
                <div className="text-[10px] font-mono text-cream-dim">
                  Camera permission denied or camera offline.
                </div>
                <button
                  onClick={() => setIsKeyboardMode(true)}
                  className="px-2.5 py-1 rounded bg-sage text-cream text-[10px] font-mono font-semibold"
                >
                  Switch to Keyboard Mode
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
                <canvas
                  ref={canvasRef}
                  width={320}
                  height={240}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />

                {isCalibrating && (
                  <div className="absolute inset-0 bg-charcoal-deep/85 flex flex-col items-center justify-center text-center p-4">
                    <p className="text-xs font-mono text-cream mb-1">Hold open palm at center</p>
                    <div className="text-2xl font-mono font-bold text-sage">{calibrationCountdown}</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Active Limb Selector */}
        <div className="flex flex-col space-y-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-cream-dim">
            <span>TARGET QUADRUPED LIMB:</span>
            <span>[1-4]</span>
          </div>
          <div className="grid grid-cols-4 gap-1 font-mono text-xs">
            {(['FL', 'FR', 'RL', 'RR'] as const).map((limb) => (
              <button
                key={limb}
                onClick={() => setActiveLimb(limb)}
                className={`py-1 rounded text-center border transition-colors ${
                  activeLimb === limb
                    ? 'bg-sage text-cream border-sage font-bold shadow-sm'
                    : 'bg-charcoal text-cream-dim border-cream/10 hover:border-cream/30'
                }`}
              >
                {limb}
              </button>
            ))}
          </div>
        </div>

        {/* DAgger Demonstration Recorder Controls */}
        <div className="border-t border-cream/10 pt-2 flex flex-col space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-cream-dim">DAgger Steps:</span>
            <span className="text-cream font-bold">{recordedSteps}</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleRecording}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-mono font-medium flex items-center justify-center space-x-1.5 transition-colors ${
                isRecording
                  ? 'bg-brick hover:bg-brick-light text-cream animate-pulse shadow-lg shadow-brick/20'
                  : 'bg-charcoal hover:bg-charcoal-light border border-cream/20 text-cream'
              }`}
            >
              {isRecording ? (
                <>
                  <Square className="w-3.5 h-3.5" />
                  <span>Stop Recording</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-sage" />
                  <span>Record Correction</span>
                </>
              )}
            </button>

            {recordedEpisodes > 0 && (
              <button
                onClick={handleOpenDataset}
                title="Open DAgger Dataset Panel"
                className="py-1.5 px-3 rounded-lg text-xs font-mono bg-sage hover:bg-sage-light text-cream flex items-center space-x-1 shadow-sm"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Dataset ({recordedEpisodes})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
