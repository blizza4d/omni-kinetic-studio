/**
 * Minimum-Jerk Trajectory Profiles
 * 
 * Polynomial profile ensuring C^2 boundary conditions:
 * Zero velocity and zero acceleration at both ends (tau = 0 and tau = 1).
 */

/**
 * Minimum jerk position profile s(tau), tau in [0, 1].
 * Formula: 10 * tau^3 - 15 * tau^4 + 6 * tau^5
 */
export function minJerk(tau: number): number {
  const t = tau < 0 ? 0 : tau > 1 ? 1 : tau;
  return t * t * t * (10.0 + t * (-15.0 + 6.0 * t));
}

/**
 * Minimum jerk velocity derivative ds/dtau.
 * Formula: 30 * tau^2 * (1 - tau)^2
 */
export function minJerkVel(tau: number): number {
  const t = tau < 0 ? 0 : tau > 1 ? 1 : tau;
  const u = 1.0 - t;
  return 30.0 * t * t * u * u;
}
