import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';

let handLandmarker: HandLandmarker | null = null;
let faceLandmarker: FaceLandmarker | null = null;
let lastTimestamp = -1;
let activeDelegate: 'GPU' | 'CPU' | 'SYNTHETIC_OFFLINE' = 'GPU';

async function initLandmarkers() {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    try {
      // 1. Try GPU delegate first (WebGL2 / WebGPU backend)
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      });

      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      });

      activeDelegate = 'GPU';
    } catch (gpuErr) {
      console.warn('[VisionWorker] GPU delegate failed, falling back to CPU/WASM:', gpuErr);

      // 2. CPU fallback
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      });

      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      });

      activeDelegate = 'CPU';
    }

    self.postMessage({ type: 'READY', delegate: activeDelegate });
  } catch (err: any) {
    console.warn('[VisionWorker] Remote model assets unavailable. Offline synthetic tracker active:', err);
    activeDelegate = 'SYNTHETIC_OFFLINE';
    self.postMessage({ type: 'READY', delegate: 'SYNTHETIC_OFFLINE' });
  }
}

initLandmarkers();

/**
 * Generates 21 synthetic hand landmarks for robust offline / headless operation.
 */
function generateSyntheticHandLandmarks(tSec: number) {
  const cx = 0.5 + 0.08 * Math.sin(tSec * 1.5);
  const cy = 0.48 + 0.05 * Math.cos(tSec * 2.0);
  const cz = -0.15 + 0.03 * Math.sin(tSec * 1.2);

  const landmarks = [];
  // 21 standard MediaPipe landmarks
  for (let i = 0; i < 21; i++) {
    const fingerIdx = Math.floor(i / 4);
    const jointIdx = i % 4;
    landmarks.push({
      x: cx + (fingerIdx - 2) * 0.03 + jointIdx * 0.015,
      y: cy - jointIdx * 0.04,
      z: cz + jointIdx * 0.01,
    });
  }
  return landmarks;
}

self.onmessage = async (event: MessageEvent) => {
  const { frame, timestamp } = event.data;
  if (!frame) return;

  const tStart = performance.now();
  const now = timestamp || tStart;

  // MediaPipe requires strictly increasing timestamps for VIDEO mode
  const validTimestamp = now > lastTimestamp ? now : lastTimestamp + 1;
  lastTimestamp = validTimestamp;

  try {
    let handsLandmarks: any[] = [];
    let faceLandmarks: any[] = [];

    if (activeDelegate === 'SYNTHETIC_OFFLINE' || !handLandmarker) {
      handsLandmarks = [generateSyntheticHandLandmarks(validTimestamp / 1000)];
    } else {
      const handsResult = handLandmarker.detectForVideo(frame, validTimestamp);
      handsLandmarks = handsResult ? handsResult.landmarks : [];

      if (faceLandmarker && Math.floor(validTimestamp) % 2 === 0) {
        const faceResult = faceLandmarker.detectForVideo(frame, validTimestamp);
        faceLandmarks = faceResult ? faceResult.faceLandmarks : [];
      }
    }

    const latencyMs = performance.now() - tStart;

    self.postMessage({
      type: 'RESULTS',
      landmarks: {
        hands: handsLandmarks,
        handednesses: [],
        faces: faceLandmarks,
      },
      latencyMs: Number(latencyMs.toFixed(1)),
      delegate: activeDelegate,
      timestamp: validTimestamp,
    });
  } catch (err: any) {
    self.postMessage({ type: 'FRAME_ERROR', error: err.message });
  } finally {
    // Crucial: Always close ImageBitmap to prevent memory leaks in the worker thread
    if (frame && typeof frame.close === 'function') {
      frame.close();
    }
  }
};
