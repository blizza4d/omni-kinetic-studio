import * as CANNON from 'cannon-es';

// State and Cannon world instance
let world: CANNON.World | null = null;
let torsoBody: CANNON.Body | null = null;
let debrisBodies: Map<number, CANNON.Body> = new Map();
let groundBody: CANNON.Body | null = null;
let floorCatchPlane: CANNON.Body | null = null;

// Reusable transferable Float32Array: [torsoX, torsoY, torsoZ, qx, qy, qz, qw, ...]
let stateBuffer: Float32Array = new Float32Array(14 * 7); // torso + up to 12 joints + meta

interface InitPayload {
  gravity: [number, number, number];
  terrain: {
    heights: Float32Array;
    width: number;
    length: number;
    segments: number;
  };
  debris: Array<{ id: number; x: number; y: number; z: number; scale: number }>;
}

function initPhysics(data: InitPayload) {
  world = new CANNON.World({
    gravity: new CANNON.Vec3(data.gravity[0], data.gravity[1], data.gravity[2]),
    allowSleep: true,
  });

  // Solver tuning for fast, stable 60 FPS stepping
  (world.solver as CANNON.GSSolver).iterations = 7;
  (world.solver as CANNON.GSSolver).tolerance = 0.001;

  // 1. Static Floor Catch Plane at y = -5.0m
  const catchShape = new CANNON.Plane();
  floorCatchPlane = new CANNON.Body({
    mass: 0, // static
    shape: catchShape,
    position: new CANNON.Vec3(0, -5.0, 0),
  });
  floorCatchPlane.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floorCatchPlane);

  // 2. Robot Torso Chassis (Box ~0.6m x 0.16m x 0.3m)
  const torsoShape = new CANNON.Box(new CANNON.Vec3(0.3, 0.08, 0.15));
  torsoBody = new CANNON.Body({
    mass: 14.5, // kg
    shape: torsoShape,
    position: new CANNON.Vec3(0, 0.6, 0),
    linearDamping: 0.15,
    angularDamping: 0.35,
  });
  world.addBody(torsoBody);

  // 3. Populate spatial debris bodies near origin
  debrisBodies.clear();
  for (const d of data.debris) {
    // Only simulate physical colliders for boulders within 16m of origin
    if (Math.hypot(d.x, d.z) < 16.0) {
      const radius = d.scale * 0.45;
      const sphere = new CANNON.Sphere(radius);
      const body = new CANNON.Body({
        mass: 0, // kinematic / static obstacles
        shape: sphere,
        position: new CANNON.Vec3(d.x, d.y, d.z),
      });
      body.sleep();
      world.addBody(body);
      debrisBodies.set(d.id, body);
    }
  }
}

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'INIT') {
    initPhysics(payload);
    self.postMessage({ type: 'INIT_DONE' });
  } else if (type === 'STEP') {
    if (!world || !torsoBody) return;

    const start = performance.now();
    const fixedDt = 1.0 / 60.0;

    // Apply teleoperation or trajectory kinematic impulse
    if (payload.targetX !== undefined && payload.targetZ !== undefined) {
      const dx = payload.targetX - torsoBody.position.x;
      const dz = payload.targetZ - torsoBody.position.z;
      torsoBody.velocity.x = dx * 10;
      torsoBody.velocity.z = dz * 10;
      torsoBody.position.y = payload.targetY ?? torsoBody.position.y;
    }

    world.step(fixedDt);

    // Pack torso transform
    stateBuffer[0] = torsoBody.position.x;
    stateBuffer[1] = torsoBody.position.y;
    stateBuffer[2] = torsoBody.position.z;
    stateBuffer[3] = torsoBody.quaternion.x;
    stateBuffer[4] = torsoBody.quaternion.y;
    stateBuffer[5] = torsoBody.quaternion.z;
    stateBuffer[6] = torsoBody.quaternion.w;

    const stepTimeMs = Number((performance.now() - start).toFixed(2));

    // Zero-copy state transfer back to main thread
    self.postMessage(
      {
        type: 'STEP_RESULT',
        stepTimeMs,
        torso: [torsoBody.position.x, torsoBody.position.y, torsoBody.position.z],
        quat: [torsoBody.quaternion.x, torsoBody.quaternion.y, torsoBody.quaternion.z, torsoBody.quaternion.w],
      }
    );
  }
};
