<script setup>
import { reactive, ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import ConfigurableIcon from '@/components/ConfigurableIcon.vue';
import Joystick from '@/components/Joystick.vue';
import CollisionWarning from '@/components/CollisionWarning.vue';

const router = useRouter();

const flight = reactive({ mode: 'M', vx: 0, vy: 0, yaw: 0, vz: 0 });
const camera = reactive({ mode: 'Z', yaw: 0, pitch: 0, roll: 0 });
const showFlight = ref(true);
const showCamera = ref(true);
const isLanded = ref(true);

// Active joystick sub-modes, updated immediately when the center knob is pressed.
const activeFlightMode = ref('M');
const activeCameraMode = ref('Z');

// Drone geographic state and gimbal angles, synced to the Cesium camera.
const drone = reactive({ lat: 37.7937, lon: -122.3965, alt: 300.0, heading: 0.0 });
const gimbal = reactive({ yaw: 0.0, pitch: -20.0, roll: 0.0 });

// Current joystick command values, applied each animation frame.
const flightCmd = reactive({ mode: 'M', vx: 0, vy: 0, yaw: 0, vz: 0 });
const cameraCmd = reactive({ mode: 'Z', yaw: 0, pitch: 0, roll: 0 });

// Collision avoidance state.
const isCollisionFrozen = ref(false);
const collisionSurfaceNormal = ref(null);
const MIN_SAFETY_BUFFER = 2.0; // meters
const LOOK_AHEAD_TIME = 2.0; // seconds

function toggleFlight() {
  showFlight.value = !showFlight.value;
}

function toggleCamera() {
  showCamera.value = !showCamera.value;
}

function toggleTakeoffLanding() {
  isLanded.value = !isLanded.value;
}

function onFlightModeChange(mode) {
  activeFlightMode.value = mode;
  flight.mode = mode;
  flightCmd.mode = mode;
}

function onCameraModeChange(mode) {
  activeCameraMode.value = mode;
  camera.mode = mode;
  cameraCmd.mode = mode;
}

function onFlightMove(payload) {
  if (typeof payload === 'object' && payload.mode) {
    activeFlightMode.value = payload.mode;
    flight.mode = payload.mode;
    flightCmd.mode = payload.mode;
    if (payload.mode === 'M') {
      flightCmd.vx = payload.vx ?? 0;
      flightCmd.vy = payload.vy ?? 0;
      flightCmd.yaw = 0;
      flightCmd.vz = 0;
    } else if (payload.mode === 'R') {
      flightCmd.vx = 0;
      flightCmd.vy = 0;
      flightCmd.yaw = payload.yaw ?? 0;
      flightCmd.vz = 0;
    } else if (payload.mode === 'H') {
      flightCmd.vx = 0;
      flightCmd.vy = 0;
      flightCmd.yaw = 0;
      flightCmd.vz = payload.vz ?? 0;
    }
  } else {
    // Fallback for non-cycling emission.
    flightCmd.vx = payload ?? 0;
    flightCmd.vy = 0;
  }
}

function onFlightStop() {
  flightCmd.vx = 0;
  flightCmd.vy = 0;
  flightCmd.yaw = 0;
  flightCmd.vz = 0;
  flight.vx = 0;
  flight.vy = 0;
  flight.yaw = 0;
  flight.vz = 0;
}

function onCameraMove(payload) {
  if (typeof payload === 'object' && payload.mode) {
    activeCameraMode.value = payload.mode;
    camera.mode = payload.mode;
    cameraCmd.mode = payload.mode;
    cameraCmd.yaw = payload.yaw ?? 0;
    cameraCmd.pitch = payload.pitch ?? 0;
    cameraCmd.roll = payload.roll ?? 0;
  } else {
    // Fallback for non-cycling emission.
    cameraCmd.yaw = payload ?? 0;
    cameraCmd.pitch = 0;
  }
}

function onCameraStop() {
  cameraCmd.yaw = 0;
  cameraCmd.pitch = 0;
  cameraCmd.roll = 0;
  camera.yaw = 0;
  camera.pitch = 0;
  camera.roll = 0;
}

function goToChat() {
  router.push('/chat');
}

// Keyboard control: WASD for flight, arrow keys for gimbal.
const pressedKeys = new Set();
const FLIGHT_SENSITIVITY = 3;
const CAMERA_SENSITIVITY = 1;

function isControlKey(key) {
  return ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key);
}

function updateKeyboardInput() {
  const w = pressedKeys.has('w');
  const a = pressedKeys.has('a');
  const s = pressedKeys.has('s');
  const d = pressedKeys.has('d');
  const up = pressedKeys.has('arrowup');
  const down = pressedKeys.has('arrowdown');
  const left = pressedKeys.has('arrowleft');
  const right = pressedKeys.has('arrowright');

  if (showFlight.value) {
    if (activeFlightMode.value === 'M') {
      const vx = ((a ? -1 : 0) + (d ? 1 : 0)) * FLIGHT_SENSITIVITY;
      const vy = ((s ? -1 : 0) + (w ? 1 : 0)) * FLIGHT_SENSITIVITY;
      onFlightMove({ mode: 'M', vx, vy });
    } else if (activeFlightMode.value === 'R') {
      const yaw = (((w || a) ? -1 : 0) + ((s || d) ? 1 : 0)) * FLIGHT_SENSITIVITY;
      onFlightMove({ mode: 'R', yaw });
    } else if (activeFlightMode.value === 'H') {
      const vz = ((s ? -1 : 0) + (w ? 1 : 0)) * FLIGHT_SENSITIVITY;
      onFlightMove({ mode: 'H', vz });
    }
  }

  if (showCamera.value) {
    const value = (((up || left) ? -1 : 0) + ((down || right) ? 1 : 0)) * CAMERA_SENSITIVITY;
    // Z -> yaw, Y -> pitch (inverted so up/left looks up), X -> roll.
    if (activeCameraMode.value === 'Z') {
      onCameraMove({ mode: 'Z', yaw: value });
    } else if (activeCameraMode.value === 'Y') {
      onCameraMove({ mode: 'Y', pitch: -value });
    } else if (activeCameraMode.value === 'X') {
      onCameraMove({ mode: 'X', roll: value });
    }
  }
}

function handleKeyDown(e) {
  const key = e.key.toLowerCase();
  if (!isControlKey(key)) return;
  e.preventDefault();
  if (pressedKeys.has(key)) return;
  pressedKeys.add(key);
  updateKeyboardInput();
}

function handleKeyUp(e) {
  const key = e.key.toLowerCase();
  if (!isControlKey(key)) return;
  e.preventDefault();
  pressedKeys.delete(key);

  const flightKeys = ['w', 'a', 's', 'd'];
  const cameraKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  const hasFlightKeys = flightKeys.some((k) => pressedKeys.has(k));
  const hasCameraKeys = cameraKeys.some((k) => pressedKeys.has(k));

  if (!hasFlightKeys) onFlightStop();
  if (!hasCameraKeys) onCameraStop();
  updateKeyboardInput();
}

const MOVEMENT_SPEED = 0.0002; // degrees per frame at full deflection
const ALTITUDE_SPEED = 20.0; // meters per second at full deflection
const ROTATION_SPEED = 60.0; // degrees per second at full deflection

let rafId = null;

/**
 * Compute the drone's intended world-space speed (m/s) from the current
 * flight command, taking the active flight mode into account.
 */
function getFlightCommandSpeed() {
  if (activeFlightMode.value === 'M') {
    // Convert lat/lon command magnitude to an approximate meters/second value.
    const cmdMag = Math.hypot(flightCmd.vx, flightCmd.vy);
    // MOVEMENT_SPEED is in degrees/second at full deflection; approximate m/deg.
    return cmdMag * MOVEMENT_SPEED * 111320;
  }
  if (activeFlightMode.value === 'H') {
    return Math.abs(flightCmd.vz) * ALTITUDE_SPEED;
  }
  return 0;
}

/**
 * Build the drone's intended world-space direction vector (ECEF) from the
 * current flight command. Returns a normalized Cartesian3 or null.
 */
function getFlightCommandDirection() {
  const viewer = window.cesiumViewer;
  if (!viewer) return null;

  const position = Cesium.Cartesian3.fromDegrees(drone.lon, drone.lat, drone.alt);
  const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(position);

  if (activeFlightMode.value === 'M') {
    const mag = Math.hypot(flightCmd.vx, flightCmd.vy) || 1;
    // vx is east, vy is north in our local command convention.
    const enuDir = new Cesium.Cartesian3(flightCmd.vx / mag, flightCmd.vy / mag, 0);
    const worldDir = Cesium.Matrix4.multiplyByPointAsVector(
      enuTransform,
      enuDir,
      new Cesium.Cartesian3()
    );
    return Cesium.Cartesian3.normalize(worldDir, worldDir);
  }

  if (activeFlightMode.value === 'H') {
    const enuUp = new Cesium.Cartesian3(0, 0, flightCmd.vz >= 0 ? 1 : -1);
    const worldDir = Cesium.Matrix4.multiplyByPointAsVector(
      enuTransform,
      enuUp,
      new Cesium.Cartesian3()
    );
    return Cesium.Cartesian3.normalize(worldDir, worldDir);
  }

  return null;
}

/**
 * Cast a single forward ray from the drone and check whether the Google
 * Photorealistic 3D Tileset is within the dynamic safety buffer.
 * Returns null when no collision is imminent.
 */
function checkCollisionAhead() {
  const viewer = window.cesiumViewer;
  const tileset = window.getGoogleTileset ? window.getGoogleTileset() : null;
  if (!viewer || !tileset || !showFlight.value) return null;

  const speed = getFlightCommandSpeed();
  if (speed <= 0 && !isCollisionFrozen.value) return null;

  const direction = getFlightCommandDirection();
  if (!direction) return null;

  const position = Cesium.Cartesian3.fromDegrees(drone.lon, drone.lat, drone.alt);
  const ray = new Cesium.Ray(position, direction);
  const result = viewer.scene.pickFromRay(ray);

  if (!result || !result.position) return null;

  // Restrict the hit to the Google tileset primitive or its features.
  const hitObject = result.object;
  const isTilesetHit =
    hitObject === tileset ||
    (hitObject && hitObject.tileset === tileset) ||
    (hitObject && hitObject.primitive === tileset);
  if (!isTilesetHit) return null;

  const distance = Cesium.Cartesian3.distance(position, result.position);
  const buffer = MIN_SAFETY_BUFFER + speed * LOOK_AHEAD_TIME;
  if (distance > buffer) return null;

  // Surface normal points away from the mesh toward the drone.
  const normal = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(position, result.position, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  return { distance, position: result.position, normal };
}

function updateDroneState() {
  const dt = 1 / 60;

  // Predictive collision avoidance: single forward raycast against the tileset.
  const collision = checkCollisionAhead();
  if (collision) {
    const inputDir = getFlightCommandDirection();
    // The surface normal points away from the mesh toward the drone. If the
    // input direction also points away (dot product positive), allow retreat.
    const movingAway = inputDir && Cesium.Cartesian3.dot(inputDir, collision.normal) > 0;

    if (!movingAway) {
      isCollisionFrozen.value = true;
      collisionSurfaceNormal.value = collision.normal;

      // Halt all movement commands and telemetry values.
      flightCmd.vx = 0;
      flightCmd.vy = 0;
      flightCmd.vz = 0;
      flightCmd.yaw = 0;
      flight.vx = 0;
      flight.vy = 0;
      flight.vz = 0;
      flight.yaw = 0;
      return;
    }
  }

  // Safe to move: clear any previous freeze state.
  isCollisionFrozen.value = false;
  collisionSurfaceNormal.value = null;

  if (showFlight.value) {
    if (activeFlightMode.value === 'M') {
      const headingRad = (drone.heading * Math.PI) / 180;
      const forward = flightCmd.vy * MOVEMENT_SPEED * dt;
      const right = flightCmd.vx * MOVEMENT_SPEED * dt;
      const latRad = (drone.lat * Math.PI) / 180;
      drone.lat += forward * Math.cos(headingRad) + right * Math.sin(headingRad);
      drone.lon += (-forward * Math.sin(headingRad) + right * Math.cos(headingRad)) / Math.cos(latRad);
      flight.vx = flightCmd.vx;
      flight.vy = flightCmd.vy;
      flight.yaw = 0;
      flight.vz = 0;
    } else if (activeFlightMode.value === 'R') {
      drone.heading += flightCmd.yaw * ROTATION_SPEED * dt;
      flight.vx = 0;
      flight.vy = 0;
      flight.yaw = flightCmd.yaw;
      flight.vz = 0;
    } else if (activeFlightMode.value === 'H') {
      drone.alt += flightCmd.vz * ALTITUDE_SPEED * dt;
      flight.vx = 0;
      flight.vy = 0;
      flight.yaw = 0;
      flight.vz = flightCmd.vz;
    }
  }

  if (showCamera.value) {
    // Z -> yaw, Y -> pitch, X -> roll.
    if (activeCameraMode.value === 'Z') {
      gimbal.yaw += cameraCmd.yaw * ROTATION_SPEED * dt;
      camera.yaw = cameraCmd.yaw;
      camera.pitch = 0;
      camera.roll = 0;
    } else if (activeCameraMode.value === 'Y') {
      gimbal.pitch += cameraCmd.pitch * ROTATION_SPEED * dt;
      camera.yaw = 0;
      camera.pitch = cameraCmd.pitch;
      camera.roll = 0;
    } else if (activeCameraMode.value === 'X') {
      gimbal.roll += cameraCmd.roll * ROTATION_SPEED * dt;
      camera.yaw = 0;
      camera.pitch = 0;
      camera.roll = cameraCmd.roll;
    }
  }
}

function syncCesiumCamera() {
  if (typeof window.updateCesiumCamera === 'function') {
    window.updateCesiumCamera({
      lat: drone.lat,
      lon: drone.lon,
      alt: drone.alt,
      heading: drone.heading,
      gimbalYaw: gimbal.yaw,
      gimbalPitch: gimbal.pitch,
      gimbalRoll: gimbal.roll,
    });
  }
}

function loop() {
  updateDroneState();
  syncCesiumCamera();
  rafId = requestAnimationFrame(loop);
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  syncCesiumCamera();
  rafId = requestAnimationFrame(loop);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  if (rafId) cancelAnimationFrame(rafId);
});
</script>

<template>
  <div class="dashboard">
    <!-- Top-center collision warning overlay -->
    <CollisionWarning :visible="isCollisionFrozen" />

    <!-- Left sidebar menu -->
    <aside class="sidebar sidebar-left">
      <div class="sidebar-middle">
        <button
          class="menu-btn"
          :class="{ 'menu-btn--active': showFlight }"
          title="Control Stick"
          @click="toggleFlight"
        >
          <ConfigurableIcon name="MENU_CONTROL_STICK" :size="32" />
        </button>
        <button class="menu-btn" title="2D Map">
          <ConfigurableIcon name="MENU_LOCATION" :size="32" />
        </button>
        <button
          class="menu-btn"
          :class="{ 'menu-btn--active': !isLanded }"
          :title="isLanded ? 'Takeoff' : 'Landing'"
          @click="toggleTakeoffLanding"
        >
          <ConfigurableIcon :name="isLanded ? 'MENU_TAKEOFF' : 'MENU_LANDING'" :size="32" />
        </button>
      </div>
    </aside>

    <!-- Center control area -->
    <main class="control-area">
      <div class="joystick-pair">
        <div
          class="joystick-group"
          :class="{ 'joystick-group--hidden': !showFlight }"
        >
          <Joystick
            mode="flight"
            :size="224"
            :sensitivity="3"
            enable-mode-cycle
            @move="onFlightMove"
            @stop="onFlightStop"
            @modeChange="onFlightModeChange"
          />
          <span class="joystick-label">Flight</span>
        </div>

        <div
          class="joystick-group"
          :class="{ 'joystick-group--hidden': !showCamera }"
        >
          <Joystick
            mode="camera"
            :size="224"
            :sensitivity="1"
            enable-mode-cycle
            @move="onCameraMove"
            @stop="onCameraStop"
            @modeChange="onCameraModeChange"
          />
          <span class="joystick-label">Gimbal</span>
        </div>
      </div>

      <!-- Live telemetry readout -->
      <div class="telemetry">
        <div class="telemetry-row">
          <span class="telemetry-key">Flight</span>
          <span class="telemetry-value">
            Mode: {{ flight.mode }}
            <template v-if="flight.mode === 'M'">| vx: {{ flight.vx.toFixed(2) }}, vy: {{ flight.vy.toFixed(2) }}</template>
            <template v-if="flight.mode === 'R'">| yaw: {{ flight.yaw.toFixed(2) }}</template>
            <template v-if="flight.mode === 'H'">| vz: {{ flight.vz.toFixed(2) }}</template>
          </span>
        </div>
        <div class="telemetry-row">
          <span class="telemetry-key">Camera</span>
          <span class="telemetry-value">
            Mode: {{ camera.mode }}
            <template v-if="camera.mode === 'Z'">| yaw: {{ camera.yaw.toFixed(2) }}</template>
            <template v-if="camera.mode === 'Y'">| pitch: {{ camera.pitch.toFixed(2) }}</template>
            <template v-if="camera.mode === 'X'">| roll: {{ camera.roll.toFixed(2) }}</template>
          </span>
        </div>
        <div class="telemetry-row">
          <span class="telemetry-key">Drone</span>
          <span class="telemetry-value">
            lat: {{ drone.lat.toFixed(4) }} | lon: {{ drone.lon.toFixed(4) }} | alt: {{ drone.alt.toFixed(4) }}
          </span>
        </div>
        <div class="telemetry-row">
          <span class="telemetry-key">Gimbal</span>
          <span class="telemetry-value">
            Z (yaw): {{ gimbal.yaw.toFixed(1) }} | Y (pitch): {{ gimbal.pitch.toFixed(1) }} | X (roll): {{ gimbal.roll.toFixed(1) }}
          </span>
        </div>
      </div>
    </main>

    <!-- Right sidebar menu -->
    <aside class="sidebar sidebar-right">
      <div class="sidebar-middle">
        <button
          class="menu-btn"
          :class="{ 'menu-btn--active': showCamera }"
          title="Camera"
          @click="toggleCamera"
        >
          <ConfigurableIcon name="MENU_CAMERA" :size="32" />
        </button>
        <button class="menu-btn" title="Configuration">
          <ConfigurableIcon name="MENU_SETTINGS" :size="32" />
        </button>
        <button class="menu-btn" title="Chat" @click="goToChat">
          <ConfigurableIcon name="MENU_CHAT" :size="32" />
        </button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  width: 100%;
  height: 100%;
  padding: 24px;
  box-sizing: border-box;
  position: relative;
  pointer-events: none; /* let clicks pass through empty areas to Cesium */
}

.dashboard > * {
  pointer-events: auto;
}

.sidebar {
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 72px;
  padding: 8px 0;
}

.sidebar-left {
  align-items: flex-start;
}

.sidebar-right {
  align-items: flex-end;
}

.sidebar-middle {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.menu-btn {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  border: 1px solid rgba(156, 163, 175, 0.4);
  background: rgba(255, 255, 255, 1);
  backdrop-filter: blur(8px);
  color: rgba(55, 65, 81, 0.9);
  opacity: 0.5;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.15s ease, background 0.15s ease, transform 0.1s ease, border-color 0.15s ease, color 0.15s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.menu-btn:hover {
  opacity: 0.7;
}

.menu-btn--active {
  background: rgba(59, 130, 246, 1);
  border-color: #2563eb;
  color: #2563eb;
  opacity: 0.6;
}

.menu-btn:active {
  transform: scale(0.96);
}

.control-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 0;
  pointer-events: none; /* only the joysticks/telemetry should capture input */
}

.joystick-pair {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 40px;
  width: 100%;
  max-width: 1400px;
  padding: 0 clamp(24px, 8vw, 100px);
  box-sizing: border-box;
}

.joystick-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  pointer-events: auto;
}

.joystick-group--hidden {
  visibility: hidden;
  pointer-events: none;
}

.joystick-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(75, 85, 99, 0.8);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.telemetry {
  position: absolute;
  bottom: 64px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 20px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  color: #4ade80;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: auto;
  box-sizing: border-box;
  min-width: 520px;
  width: max-content;
  max-width: 100%;
}

.telemetry-row {
  display: flex;
  gap: 16px;
  white-space: nowrap;
}

.telemetry-key {
  min-width: 56px;
  color: #86efac;
}

@media (max-width: 768px) {
  .joystick-pair {
    gap: 24px;
    padding: 0 16px;
  }

  .sidebar {
    width: 56px;
  }

  .menu-btn {
    width: 48px;
    height: 48px;
  }
}
</style>
