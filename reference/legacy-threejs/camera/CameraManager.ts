import * as THREE from 'three'
import { game, GameState } from '@/core/Game'
import { input } from '@/systems/InputSystem'
import type { PlayerManager } from './PlayerManager'
import type { VehicleManager } from './VehicleManager'

export enum CameraView {
  TOP_DOWN = 'top_down',
  DRONE_SIDE = 'drone_side',
  THIRD_PERSON = 'third_person',
  HOOD = 'hood',
  INTERIOR = 'interior',
}

const VIEW_CONFIG = {
  [CameraView.TOP_DOWN]: {
    offset: new THREE.Vector3(0, 28, -15),
    lookOffset: new THREE.Vector3(0, 0, 10),
    lerpSpeed: 0.08,
  },
  [CameraView.DRONE_SIDE]: {
    // Aerial side-rear establishing shot: the car stays readable while the
    // road, horizon, sky and roadside story props share the composition.
    // Default to the left shoulder because authored settlements, signs and
    // city facades preferentially expose their readable fronts to this bank.
    offset: new THREE.Vector3(-24, 12.5, -10.5),
    lookOffset: new THREE.Vector3(0, 2.4, 6.5),
    lerpSpeed: 0.055,
  },
  [CameraView.THIRD_PERSON]: {
    // Film-noir cinematic chase: low angle, horizon visible, sky ~40% of frame
    offset: new THREE.Vector3(0, 6.7, -14.5),
    lookOffset: new THREE.Vector3(0, 2.7, 13),
    lerpSpeed: 0.1,
  },
  [CameraView.HOOD]: {
    offset: new THREE.Vector3(0, 4.35, -6.2),
    lookOffset: new THREE.Vector3(0, 2.0, 12),
    lerpSpeed: 0.15,
  },
  [CameraView.INTERIOR]: {
    // Old procedural RV is left-hand drive; anchor the eye at its driver seat.
    offset: new THREE.Vector3(-0.57, 2.08, 2.38),
    lookOffset: new THREE.Vector3(-0.57, 1.98, 16),
    lerpSpeed: 0.3,
  },
}

export class CameraManager {
  private cam = game.camera
  private view: CameraView = CameraView.THIRD_PERSON
  private target = new THREE.Vector3(0, 0, 0)
  private targetRotation = 0

  private currentPos = new THREE.Vector3(0, 5.2, -10.5)
  private currentLook = new THREE.Vector3(0, 3.4, 14)

  private shakeIntensity = 0
  private shakeDuration = 0
  private shakeTimer = 0

  // Mouse look state — RMB drag owns camera yaw; no persistent pointer lock.
  private rightDragging = false
  private rightPointerId: number | null = null
  private walkPitch = 0
  // On-foot camera yaw is deliberately separate from PlayerManager.rotation.
  // CombatManager may turn the player toward an enemy; that must not rotate
  // the manually controlled camera or scramble WASD navigation.
  private walkYaw = 0
  // Driving orbit is camera-only. It never changes the vehicle's heading,
  // so the car can keep following the road while the player looks around.
  // The same yaw/pitch input is shared by every driving view. Exterior views
  // orbit around the vehicle; the cockpit keeps the driver's eye position
  // bolted to the chassis and only rotates the look direction.
  private driveOrbitYaw = 0
  private driveOrbitPitch = 0
  private readonly interiorLookLimit = THREE.MathUtils.degToRad(75)
  private readonly interiorPitchLimit = THREE.MathUtils.degToRad(58)
  private readonly exteriorMinElevation = THREE.MathUtils.degToRad(4)
  private readonly exteriorMaxElevation = THREE.MathUtils.degToRad(84)
  // Tactical camera yaw — mouse-owned in DUNGEON. The auto-aim spins the
  // PLAYER to track targets; the camera must never follow that spin,
  // or the whole screen whips around every time a target changes.
  private dungeonYaw = 0
  private lastState: GameState | null = null

  constructor() {
    this.cam.position.copy(this.currentPos)

    // Right mouse drag rotates the on-foot camera. It only starts on the
    // WebGL canvas, so inventory/HUD interactions never steer the camera.
    const canvas = game.renderer.domElement
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 2) return
      const s = game.getState()
      if (s !== GameState.WALKING && s !== GameState.DUNGEON && s !== GameState.DRIVING && s !== GameState.RV_INTERIOR) return
      e.preventDefault()
      this.rightDragging = true
      this.rightPointerId = e.pointerId
      canvas.setPointerCapture?.(e.pointerId)
    })
    canvas.addEventListener('pointerup', (e: PointerEvent) => {
      if (e.button !== 2 || e.pointerId !== this.rightPointerId) return
      this.rightDragging = false
      this.rightPointerId = null
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    })
    canvas.addEventListener('lostpointercapture', () => {
      this.rightDragging = false
      this.rightPointerId = null
    })

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.rightDragging || e.pointerId !== this.rightPointerId) return
      this.rotateBy(e.movementX, e.movementY)
    })

    game.registerManager('camera', this)
    console.log('[CameraManager] Initialized — top-down view')
  }

  setTarget(position: THREE.Vector3, rotationY: number): void {
    this.target.copy(position)
    this.targetRotation = rotationY
  }

  getView(): CameraView { return this.view }

  /** Shared look-rotation math — RMB drag (PC) and touch drag (mobile) both
   *  feed through here so the two control schemes never diverge. */
  rotateBy(movementX: number, movementY: number): void {
    const state = game.getState()

    // Dungeon: camera yaw only — auto-aim keeps the gun on target by itself.
    if (state === GameState.DUNGEON) {
      this.dungeonYaw -= movementX * 0.005
      return
    }

    if (state === GameState.DRIVING) {
      this.driveOrbitYaw -= movementX * 0.005
      this.driveOrbitPitch = THREE.MathUtils.clamp(
        this.driveOrbitPitch - movementY * 0.0038,
        -THREE.MathUtils.degToRad(78),
        THREE.MathUtils.degToRad(78),
      )
      if (this.view === CameraView.INTERIOR) {
        this.driveOrbitYaw = THREE.MathUtils.clamp(
          this.driveOrbitYaw,
          -this.interiorLookLimit,
          this.interiorLookLimit,
        )
        this.driveOrbitPitch = THREE.MathUtils.clamp(
          this.driveOrbitPitch,
          -this.interiorPitchLimit,
          this.interiorPitchLimit,
        )
      } else {
        // Keep the public value bounded while allowing unlimited full turns.
        this.driveOrbitYaw = THREE.MathUtils.euclideanModulo(this.driveOrbitYaw + Math.PI, Math.PI * 2) - Math.PI
      }
      return
    }

    if (state !== GameState.WALKING && state !== GameState.RV_INTERIOR) return

    const player = game.getManager<PlayerManager>('player') as PlayerManager | undefined
    if (!player || player.isInVehicleMode()) return

    this.walkYaw -= movementX * 0.005
    this.walkYaw = THREE.MathUtils.euclideanModulo(this.walkYaw + Math.PI, Math.PI * 2) - Math.PI
    // Third person deliberately stays level. First person retains a modest
    // vertical look range while the same drag gesture is held.
    if (this.view === CameraView.INTERIOR) {
      this.walkPitch = THREE.MathUtils.clamp(this.walkPitch - movementY * 0.0026, -1.1, 1.1)
    }
  }

  getWalkPitch(): number { return this.walkPitch }

  /** Manual on-foot camera yaw, independent from the player's aim/facing yaw. */
  getWalkYaw(): number { return this.walkYaw }

  /** Initialize the on-foot camera from the vehicle heading when disembarking. */
  setWalkYaw(yaw: number): void {
    this.walkYaw = THREE.MathUtils.euclideanModulo(yaw + Math.PI, Math.PI * 2) - Math.PI
  }

  getDungeonYaw(): number { return this.dungeonYaw }

  /** Camera-only horizontal look offset while driving, in radians. */
  getDriveOrbitYaw(): number { return this.driveOrbitYaw }

  /** Camera-only vertical look/orbit offset while driving, in radians. */
  getDriveOrbitPitch(): number { return this.driveOrbitPitch }

  /** Q-key recenter: restore the default view without changing body/car heading. */
  resetToDefault(): void {
    const state = game.getState()
    this.walkPitch = 0
    if (state === GameState.DRIVING) {
      this.driveOrbitYaw = 0
      this.driveOrbitPitch = 0
    } else if (state === GameState.DUNGEON) {
      this.dungeonYaw = 0
    } else if (state === GameState.RV_INTERIOR) {
      this.walkYaw = 0
    } else if (state === GameState.WALKING) {
      const player = game.getManager<PlayerManager>('player') as PlayerManager | undefined
      this.walkYaw = player?.mesh?.rotation?.y ?? 0
    }
  }

  isPointerLocked(): boolean { return false }

  isOrbitDragging(): boolean { return this.rightDragging }

  setView(view: CameraView): void {
    this.view = view
    if (view === CameraView.DRONE_SIDE && game.getState() === GameState.DRIVING) {
      const vehicle = game.getManager<VehicleManager>('vehicle') as VehicleManager | undefined
      if (vehicle) {
        this.target.copy(vehicle.position)
        this.targetRotation = vehicle.rotation
      }
      const config = VIEW_CONFIG[CameraView.DRONE_SIDE]
      const yaw = this.targetRotation + this.driveOrbitYaw
      this.currentPos.copy(this.getPitchedDrivingOffset(config.offset)).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(this.target)
      this.currentLook.copy(config.lookOffset).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(this.target)
      this.cam.position.copy(this.currentPos)
      this.cam.lookAt(this.currentLook)
      this.cam.fov = 49
      this.cam.updateProjectionMatrix()
    }
    console.log(`[CameraManager] View: ${view}`)
  }

  cycleView(): void {
    const views = game.getState() === GameState.RV_INTERIOR
      ? [CameraView.THIRD_PERSON, CameraView.INTERIOR]
      : [CameraView.TOP_DOWN, CameraView.DRONE_SIDE, CameraView.THIRD_PERSON, CameraView.HOOD, CameraView.INTERIOR]
    const idx = views.indexOf(this.view)
    this.setView(views[(idx + 1) % views.length])
  }

  shake(intensity: number, duration: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity)
    this.shakeDuration = Math.max(this.shakeDuration, duration)
    this.shakeTimer = 0
  }

  /**
   * Convert a view's authored offset to a spherical driving orbit. Vertical
   * mouse movement changes its elevation while preserving the view's radius
   * and horizontal composition. Absolute clamps stop the camera from rolling
   * under the road or flipping over the vehicle in high top-down views.
   */
  private getPitchedDrivingOffset(offset: THREE.Vector3): THREE.Vector3 {
    const radius = offset.length()
    const horizontal = Math.hypot(offset.x, offset.z)
    if (radius < 0.001 || horizontal < 0.001) return offset.clone()

    const baseElevation = Math.atan2(offset.y, horizontal)
    const elevation = THREE.MathUtils.clamp(
      baseElevation + this.driveOrbitPitch,
      this.exteriorMinElevation,
      this.exteriorMaxElevation,
    )
    const newHorizontal = Math.cos(elevation) * radius

    return new THREE.Vector3(
      offset.x / horizontal * newHorizontal,
      Math.sin(elevation) * radius,
      offset.z / horizontal * newHorizontal,
    )
  }

  update(delta: number): void {
    // The title screen is a composed live establishing shot, not a frozen
    // gameplay camera. Managers keep rendering while simulation remains off.
    if (game.getState() === GameState.MENU) {
      const vehicle = game.getManager<VehicleManager>('vehicle') as VehicleManager | undefined
      if (vehicle) {
        const t = performance.now() * 0.000035
        const look = vehicle.position.clone().add(new THREE.Vector3(0, 2.25, 46))
        const desired = vehicle.position.clone().add(new THREE.Vector3(18 + Math.sin(t) * 1.4, 10.2, -19.5))
        this.currentPos.lerp(desired, 1 - Math.exp(-delta * 1.8))
        this.currentLook.lerp(look, 1 - Math.exp(-delta * 2.1))
        this.cam.position.copy(this.currentPos)
        this.cam.lookAt(this.currentLook)
        this.cam.fov += (48 - this.cam.fov) * Math.min(1, delta * 5)
        this.cam.updateProjectionMatrix()
      }
      this.lastState = GameState.MENU
      return
    }
    if (input.wasPressed('KeyQ')) this.resetToDefault()
    if (input.wasPressed('Digit1')) this.setView(CameraView.TOP_DOWN)
    if (input.wasPressed('Digit2')) this.setView(CameraView.THIRD_PERSON)
    if (input.wasPressed('Digit3')) this.setView(CameraView.HOOD)
    if (input.wasPressed('KeyV')) this.cycleView()

    // ── RV living interior: one real space, two readable camera languages ──
    if (game.getState() === GameState.RV_INTERIOR) {
      const player = game.getManager<PlayerManager>('player') as PlayerManager | undefined
      const vehicle = game.getManager<VehicleManager>('vehicle') as VehicleManager | undefined
      if (player && vehicle) {
        if (this.view === CameraView.INTERIOR) {
          player.mesh.visible = false
          const head = player.position.clone().add(new THREE.Vector3(0, 1.68, 0))
          const yaw = vehicle.rotation + this.walkYaw
          const cp = Math.cos(this.walkPitch)
          const look = head.clone().add(new THREE.Vector3(
            Math.sin(yaw) * cp,
            Math.sin(this.walkPitch),
            Math.cos(yaw) * cp,
          ).multiplyScalar(7))
          this.currentPos.copy(head)
          this.currentLook.copy(look)
          this.cam.position.copy(head)
          this.cam.lookAt(look)
          if (Math.abs(this.cam.fov - 64) > 0.05) {
            this.cam.fov += (64 - this.cam.fov) * Math.min(1, delta * 7)
            this.cam.updateProjectionMatrix()
          }
        } else {
          player.mesh.visible = true
          // A high three-quarter dollhouse view makes the whole 2.4 × 5.3 m
          // living space readable. The previous low shoulder camera looked
          // into the far wall, hiding the floor plan and most facilities.
          const centre = vehicle.localPointToWorld(new THREE.Vector3(0, 1.32, -0.85))
          const orbitYaw = vehicle.rotation + this.walkYaw
          const offset = new THREE.Vector3(4.6, 9.35, -10.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitYaw)
          const desiredPos = vehicle.position.clone().add(offset)
          this.currentPos.lerp(desiredPos, 0.24)
          this.currentLook.lerp(centre, 0.28)
          this.cam.position.copy(this.currentPos)
          this.cam.lookAt(this.currentLook)
          if (Math.abs(this.cam.fov - 46) > 0.05) {
            this.cam.fov += (46 - this.cam.fov) * Math.min(1, delta * 7)
            this.cam.updateProjectionMatrix()
          }
        }
      }
      this.lastState = GameState.RV_INTERIOR
      return
    }

    // ── WALKING/DUNGEON mode: third-person behind player ──
    if (game.getState() === GameState.WALKING || game.getState() === GameState.DUNGEON) {
      const player = game.getManager<PlayerManager>('player') as PlayerManager | undefined
      if (player && !player.isInVehicleMode()) {
        // ── On-foot first person (V cycles to 车内/第一人称) ──
        if (this.view === CameraView.INTERIOR && game.getState() === GameState.WALKING) {
          const head = player.position.clone().add(new THREE.Vector3(0, 1.68, 0))
          const cp = Math.cos(this.walkPitch)
          const look = head.clone().add(new THREE.Vector3(
            Math.sin(this.walkYaw) * cp,
            Math.sin(this.walkPitch),
            Math.cos(this.walkYaw) * cp,
          ).multiplyScalar(10))
          this.currentPos.copy(head)
          this.currentLook.copy(look)
          this.cam.position.copy(this.currentPos)
          this.cam.lookAt(this.currentLook)
          return
        }
        // Combat breathing: camera rises to tactical view in dungeon, settles back outside
        const dungeon = game.getState() === GameState.DUNGEON
        if (dungeon && this.lastState !== GameState.DUNGEON) this.dungeonYaw = 0 // each room starts north-up
        const behind = dungeon ? new THREE.Vector3(0, 13.5, -7) : new THREE.Vector3(0, 6, -10)
        behind.applyAxisAngle(new THREE.Vector3(0, 1, 0), dungeon ? this.dungeonYaw : this.walkYaw)
        const desiredPos = player.position.clone().add(behind)
        const lookAhead = dungeon ? new THREE.Vector3(0, 0.5, 1) : new THREE.Vector3(0, 2, 0)
        if (dungeon) lookAhead.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.dungeonYaw)
        const desiredLook = player.position.clone().add(lookAhead)

        this.currentPos.lerp(desiredPos, 0.15)
        this.currentLook.lerp(desiredLook, 0.2)
      }

      this.lastState = game.getState()
      this.cam.position.copy(this.currentPos)
      this.cam.lookAt(this.currentLook)
      return // skip normal camera logic
    }

    // ── DRIVING mode: normal config-based camera ────────
    const config = VIEW_CONFIG[this.view]

    // ── INTERIOR: bolted to the chassis — no lerp, no sway, no drift ──
    if (this.view === CameraView.INTERIOR) {
      const pos = config.offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.targetRotation).add(this.target)
      // Keep the driver's seat bolted to the chassis. Only the look target
      // moves within the windshield arc; the camera itself never orbits.
      const lookYaw = THREE.MathUtils.clamp(this.driveOrbitYaw, -this.interiorLookLimit, this.interiorLookLimit)
      const lookDistance = Math.max(1, Math.hypot(
        config.lookOffset.x - config.offset.x,
        config.lookOffset.z - config.offset.z,
      ))
      const basePitch = Math.atan2(config.lookOffset.y - config.offset.y, lookDistance)
      const lookPitch = THREE.MathUtils.clamp(
        basePitch + this.driveOrbitPitch,
        -this.interiorPitchLimit,
        this.interiorPitchLimit,
      )
      const pitchCos = Math.cos(lookPitch)
      const lookLocal = config.offset.clone().add(new THREE.Vector3(
        Math.sin(lookYaw) * pitchCos,
        Math.sin(lookPitch),
        Math.cos(lookYaw) * pitchCos,
      ).multiplyScalar(lookDistance))
      const look = lookLocal.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.targetRotation).add(this.target)
      this.currentPos.copy(pos)
      this.currentLook.copy(look)
      this.cam.position.copy(pos)
      this.cam.lookAt(look)
      if (Math.abs(this.cam.fov - 62) > 0.01) {
        this.cam.fov = 62
        this.cam.updateProjectionMatrix()
      }
      return
    }

    const driveYaw = this.targetRotation + this.driveOrbitYaw
    const rotatedOffset = this.getPitchedDrivingOffset(config.offset).applyAxisAngle(new THREE.Vector3(0, 1, 0), driveYaw)

    const desiredPos = this.target.clone().add(rotatedOffset)

    const rotatedLook = config.lookOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), driveYaw)
    const desiredLook = this.target.clone().add(rotatedLook)

    const speed = config.lerpSpeed
    this.currentPos.lerp(desiredPos, speed)
    this.currentLook.lerp(desiredLook, speed * 1.2)

    // ── Cinematic feel: handheld sway + vibration + speed FOV ──
    const swayOffset = new THREE.Vector3()
    const swayLook = new THREE.Vector3()
    if (this.view === CameraView.THIRD_PERSON) {
      const vehicle = game.getManager('vehicle') as any
      const spdRatio = vehicle
        ? Math.min(Math.abs(vehicle.speed ?? 0) / (vehicle.stats?.maxSpeed ?? 20), 1.2)
        : 0
      const t = game.getElapsed()
      const amp = 0.05 + spdRatio * 0.09
      const sx = (Math.sin(t * 0.9) + Math.sin(t * 1.7 + 1.3) * 0.6) * amp
      const sy = (Math.sin(t * 1.3 + 0.7) + Math.sin(t * 2.3 + 2.1) * 0.5) * amp * 0.6
      const vib = Math.sin(t * 33) * 0.014 * spdRatio
      swayOffset.set(sx * 0.4, sy * 0.3 + vib, 0)
      swayLook.set(sx, sy, 0)

      const targetFov = 55 + spdRatio * 7
      if (Math.abs(this.cam.fov - targetFov) > 0.05) {
        this.cam.fov += (targetFov - this.cam.fov) * Math.min(1, 5 * delta)
        this.cam.updateProjectionMatrix()
      }
    } else {
      const targetFov = this.view === CameraView.DRONE_SIDE ? 49 : 58
      if (Math.abs(this.cam.fov - targetFov) > 0.05) {
        this.cam.fov += (targetFov - this.cam.fov) * Math.min(1, 5 * delta)
        this.cam.updateProjectionMatrix()
      }
    }

    let shakeOffset = new THREE.Vector3()
    if (this.shakeTimer < this.shakeDuration) {
      this.shakeTimer += delta
      const decay = 1 - this.shakeTimer / this.shakeDuration
      const intensity = this.shakeIntensity * decay
      shakeOffset.set(
        (Math.random() - 0.5) * intensity * 2,
        (Math.random() - 0.5) * intensity * 2,
        (Math.random() - 0.5) * intensity,
      )
    } else {
      this.shakeIntensity = 0
      this.shakeDuration = 0
    }

    this.cam.position.copy(this.currentPos).add(shakeOffset).add(swayOffset)
    this.cam.lookAt(this.currentLook.clone().add(swayLook))
  }
}
