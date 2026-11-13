/**
 * Zero-Allocation Rig Applier for Omni-Kinetic Droid
 * 
 * Applies interpolated kinematic transforms (root position, root quaternion,
 * joint rotations, foot contacts) directly to Three.js Object3D hierarchies
 * without per-frame object or vector constructions.
 */

import { Group, Vector3, Quaternion } from 'three';
import { DroidKinematicState } from '../types';

export class RigApplier {
  private readonly _tmpPos = new Vector3();
  private readonly _tmpQuat = new Quaternion();

  /**
   * Apply interpolated kinematic state to robot visual group.
   * 
   * @param robotGroup Root Three.js Group of the robot
   * @param jointGroups Map of joint group nodes
   * @param state Current interpolated kinematic state
   */
  public apply(
    robotGroup: Group,
    jointGroups: Record<string, Group>,
    state: DroidKinematicState
  ): void {
    // 1. Root Chassis Transform
    robotGroup.position.set(state.bodyPos[0], state.bodyPos[1], state.bodyPos[2]);
    robotGroup.quaternion.set(
      state.bodyQuat[0],
      state.bodyQuat[1],
      state.bodyQuat[2],
      state.bodyQuat[3]
    );

    // 2. Articulated Joint Rotations
    // Roll along X for hip; pitch along Z for thigh and calf
    for (let i = 0; i < state.joints.length; i++) {
      const j = state.joints[i];
      const group = jointGroups[j.name];
      if (group) {
        if (j.name.includes('hip')) {
          group.rotation.x = j.angle;
        } else if (j.name.includes('thigh')) {
          group.rotation.z = -j.angle;
        } else if (j.name.includes('calf')) {
          group.rotation.z = j.angle;
        }
      }
    }
  }
}
