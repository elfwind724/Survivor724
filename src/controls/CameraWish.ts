/**
 * Flattened camera-relative wish on XZ.
 *
 * Y-up: screen-right = look × up = (-lookZ, lookX).
 * First person and top-down must both use this. A custom yaw matrix that
 * uses (lookZ, -lookX) will invert A/D.
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

export function lookXZ(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) }
}

export function firstPersonWish(strafe: number, forward: number, yaw: number): { x: number; z: number } {
  const look = lookXZ(yaw)
  return cameraRelativeWish(strafe, forward, look.x, look.z)
}

/** Mouse right must turn the look toward screen-right. */
export function turnYaw(yaw: number, mouseDeltaX: number, sensitivity = 0.005): number {
  return yaw - mouseDeltaX * sensitivity
}
