/**
 * Flattened camera-relative wish on XZ.
 *
 * Y-up, right-handed: screen-right = up × look = (-lookZ, lookX).
 * Do not use (lookZ, -lookX). That inverts A/D.
 */
export function cameraRelativeWish(
  strafe: number,
  forward: number,
  lookX: number,
  lookZ: number,
): { x: number; z: number } {
  let fx = lookX
  let fz = lookZ
  const length = Math.hypot(fx, fz)
  if (length < 1e-4) {
    fx = 0
    fz = -1
  } else {
    fx /= length
    fz /= length
  }
  const rightX = -fz
  const rightZ = fx
  return {
    x: rightX * strafe + fx * forward,
    z: rightZ * strafe + fz * forward,
  }
}
