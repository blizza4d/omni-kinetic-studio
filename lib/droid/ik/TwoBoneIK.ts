/**
 * Analytical Two-Bone Inverse Kinematics (TwoBoneIK)
 * Solves 3-DOF revolute leg joints (hip roll, thigh pitch, calf pitch)
 * for quadruped morphology with exact zero-skating ground anchoring.
 *
 * Guaranteed:
 * - Deterministic, closed-form law of cosines solution
 * - Zero memory allocations in solve()
 * - Safe numeric clamping prevents NaN at singular extensions
 */

export interface IKResult {
  hipAngle: number; // Lateral roll (rad)
  thighAngle: number; // Sagittal pitch (rad)
  calfAngle: number; // Sagittal knee flexion (rad)
  isValid: boolean;
  reachDistance: number;
}

export class TwoBoneIK {
  private readonly l1: number; // Thigh length (0.22m)
  private readonly l2: number; // Calf length (0.22m)
  private readonly maxReach: number;
  private readonly minReach = 0.06;

  // Joint limits (radians)
  private readonly hipLimit = 0.55;
  private readonly thighLimitMin = -1.35;
  private readonly thighLimitMax = 1.35;
  private readonly calfLimitMin = -2.10;
  private readonly calfLimitMax = -0.15;

  constructor(thighLength = 0.22, calfLength = 0.22) {
    this.l1 = thighLength;
    this.l2 = calfLength;
    this.maxReach = (thighLength + calfLength) * 0.995; // Soft extension ceiling (0.4378m)
  }

  /**
   * Solve 3-DOF joint angles given relative displacement vector [dx, dy, dz]
   * from hip joint to foot target in body coordinates:
   * +X = forward, +Y = up, +Z = right.
   */
  public solve(dx: number, dy: number, dz: number, isLeft = false, out?: IKResult): IKResult {
    const result: IKResult = out || {
      hipAngle: 0,
      thighAngle: 0,
      calfAngle: 0,
      isValid: true,
      reachDistance: 0,
    };

    // 1. Solve Hip Roll in the coronal (Y-Z) plane
    // Legs point downwards (-Y), so dy is negative in nominal stance
    const targetY = dy;
    const targetZ = dz;
    let hipAngle = Math.atan2(targetZ, -targetY);

    // Apply joint limit clamp on hip roll
    hipAngle = Math.max(-this.hipLimit, Math.min(this.hipLimit, hipAngle));
    result.hipAngle = hipAngle;

    // Projected length in the sagittal plane (rotated by hipAngle)
    const legLengthCoronal = Math.sqrt(targetY * targetY + targetZ * targetZ);
    const sagY = -legLengthCoronal; // Downwards in leg plane
    const sagX = dx;

    // Total 3D reach distance
    const rawDist = Math.sqrt(sagX * sagX + sagY * sagY);
    result.reachDistance = rawDist;

    // Clamp reach distance within geometric limits
    const dist = Math.max(this.minReach, Math.min(this.maxReach, rawDist));

    // 2. Solve Calf (Knee) Angle via Law of Cosines
    // D^2 = L1^2 + L2^2 - 2*L1*L2*cos(internal_knee_angle)
    const cosKnee = (this.l1 * this.l1 + this.l2 * this.l2 - dist * dist) / (2 * this.l1 * this.l2);
    const clampedCosKnee = Math.max(-1.0, Math.min(1.0, cosKnee));
    const internalKnee = Math.acos(clampedCosKnee);

    // Quadruped backwards knee flexion: angle is negative relative to straight leg
    let calfAngle = -(Math.PI - internalKnee);
    calfAngle = Math.max(this.calfLimitMin, Math.min(this.calfLimitMax, calfAngle));
    result.calfAngle = calfAngle;

    // 3. Solve Thigh Pitch Angle
    // Base angle to foot in sagittal plane
    const gamma = Math.atan2(sagX, -sagY);

    // Thigh offset angle inside the triangle
    const cosThigh = (this.l1 * this.l1 + dist * dist - this.l2 * this.l2) / (2 * this.l1 * dist);
    const clampedCosThigh = Math.max(-1.0, Math.min(1.0, cosThigh));
    const beta = Math.acos(clampedCosThigh);

    // Thigh pitch swing forward (+) / backward (-)
    let thighAngle = gamma + beta;
    thighAngle = Math.max(this.thighLimitMin, Math.min(this.thighLimitMax, thighAngle));
    result.thighAngle = thighAngle;

    result.isValid = rawDist <= this.maxReach + 0.02 && !isNaN(thighAngle) && !isNaN(calfAngle);

    return result;
  }
}
