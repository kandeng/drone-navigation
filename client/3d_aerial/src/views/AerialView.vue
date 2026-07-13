<script setup>
import { ref, computed, onMounted, onUnmounted, watch, h } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import ViewComposer from '@shared/_ViewComposer.vue';
import CollisionWarning from '@/components/CollisionWarning.vue';
import StreetViewPane from '@/components/StreetViewPane.vue';
import { useDrone } from '@shared-composables/useDrone.js';
import { useAltitudeGate } from '@/composables/useAltitudeGate.js';
import { useFlightCommands } from '@shared-composables/useFlightCommands.js';
import { useCameraCommands } from '@shared-composables/useCameraCommands.js';
import { useFlightPhysics } from '@shared-composables/useFlightPhysics.js';
import { useCameraPhysics } from '@shared-composables/useCameraPhysics.js';
import { useDockRegistry } from '@shared-composables/useDockRegistry.js';
import { usePageRegistry } from '@shared-composables/usePageRegistry.js';
import DockMenuButton from '@shared/DockMenuButton.vue';

const { t } = useI18n();

const router = useRouter();

const { drone, gimbal } = useDrone();
const altitudeGate = useAltitudeGate(drone);
altitudeGate.isOnGround.value = drone.alt <= 15;

const isLowAltitude = computed(() => (drone.alt - altitudeGate.surfaceAlt.value) < 5);

const {
  flight,
  flightCmd,
  activeFlightMode,
  showFlight,
  toggleFlight,
  onFlightMove,
  onFlightStop,
  onFlightModeChange,
  startKeyboard: startFlightKeyboard,
  stopKeyboard: stopFlightKeyboard,
} = useFlightCommands();

const {
  camera,
  cameraCmd,
  activeCameraMode,
  showCamera,
  toggleCamera,
  onCameraMove,
  onCameraStop,
  onCameraModeChange,
  startKeyboard: startCameraKeyboard,
  stopKeyboard: stopCameraKeyboard,
} = useCameraCommands();

const { computeDesiredEnuMove, applyEnuMove, updateTelemetry: updateFlightTelemetry } = useFlightPhysics();
const { step: stepCameraPhysics } = useCameraPhysics();
const { leftItems, rightItems, registerLeft, registerRight, clear } = useDockRegistry();
const { pages, registerPage, unregisterPage } = usePageRegistry();

const isCollisionFrozen = ref(false);
const collisionSurfaceNormal = ref(null);
const MIN_SAFETY_BUFFER = 2.0; // meters
const LOOK_AHEAD_TIME = 2.0; // seconds

const cesiumContainer = ref(null);

const isTakeoffLanding = computed(() => altitudeGate.isTransitioning.value);
const showStreetView = computed(() => altitudeGate.isOnGround.value);
const takeoffLandingLabel = computed(() => {
  if (altitudeGate.isAutoTakingOff.value) return t('aerialview.taking_off');
  if (altitudeGate.isAutoLanding.value) return t('aerialview.landing_in_progress');
  return altitudeGate.isOnGround.value ? t('aerialview.takeoff') : t('aerialview.landing');
});

function goToChat() {
  router.push('/chat');
}

function hideAllDisks() {
  showFlight.value = false;
  showCamera.value = false;
}

function toggleTakeoffLanding() {
  const viewer = window.cesiumViewer;
  if (altitudeGate.isOnGround.value) {
    altitudeGate.startTakeoff(viewer);
  } else {
    altitudeGate.startLanding(viewer);
  }
}

watch(showStreetView, (onGround) => {
  const viewer = window.cesiumViewer;
  if (viewer) {
    viewer.scene.globe.show = !onGround;
  }
  if (cesiumContainer.value) {
    cesiumContainer.value.classList.toggle('cesium-hidden', onGround);
  }
});

function getFlightCommandSpeed() {
  if (activeFlightMode.value === 'M') {
    const cmdMag = Math.hypot(flightCmd.vx, flightCmd.vy);
    return cmdMag * 0.0002 * 111320;
  }
  if (activeFlightMode.value === 'H') {
    return Math.abs(flightCmd.vz) * 20.0;
  }
  return 0;
}

function getFlightCommandDirection() {
  const viewer = window.cesiumViewer;
  if (!viewer) return null;

  const position = Cesium.Cartesian3.fromDegrees(drone.lon, drone.lat, drone.alt);
  const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(position);

  if (activeFlightMode.value === 'M') {
    const mag = Math.hypot(flightCmd.vx, flightCmd.vy) || 1;
    const headingRad = Cesium.Math.toRadians(drone.heading);
    const enuDir = new Cesium.Cartesian3(
      (flightCmd.vy * Math.sin(headingRad) + flightCmd.vx * Math.cos(headingRad)) / mag,
      (flightCmd.vy * Math.cos(headingRad) - flightCmd.vx * Math.sin(headingRad)) / mag,
      0
    );
    const worldDir = Cesium.Matrix4.multiplyByPointAsVector(enuTransform, enuDir, new Cesium.Cartesian3());
    return Cesium.Cartesian3.normalize(worldDir, worldDir);
  }

  if (activeFlightMode.value === 'H') {
    const enuUp = new Cesium.Cartesian3(0, 0, flightCmd.vz >= 0 ? 1 : -1);
    const worldDir = Cesium.Matrix4.multiplyByPointAsVector(enuTransform, enuUp, new Cesium.Cartesian3());
    return Cesium.Cartesian3.normalize(worldDir, worldDir);
  }

  return null;
}

function checkCollisionAhead() {
  const viewer = window.cesiumViewer;
  const tileset = window.getGoogleTileset ? window.getGoogleTileset() : null;
  if (!viewer || !tileset || !showFlight.value) return null;

  const speed = getFlightCommandSpeed();
  if (speed <= 0) return null;

  const direction = getFlightCommandDirection();
  if (!direction) return null;

  const position = Cesium.Cartesian3.fromDegrees(drone.lon, drone.lat, drone.alt);
  const ray = new Cesium.Ray(position, direction);
  const result = viewer.scene.pickFromRay(ray);

  if (!result || !result.position) return null;

  const hitObject = result.object;
  const isTilesetHit =
    hitObject === tileset ||
    (hitObject && hitObject.tileset === tileset) ||
    (hitObject && hitObject.primitive === tileset);
  if (!isTilesetHit) return null;

  const distance = Cesium.Cartesian3.distance(position, result.position);
  const buffer = MIN_SAFETY_BUFFER + speed * LOOK_AHEAD_TIME;
  if (distance > buffer) return null;

  const normal = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(position, result.position, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  return { distance, position: result.position, normal };
}

function projectEnuMove(enuMove, collision) {
  const position = Cesium.Cartesian3.fromDegrees(drone.lon, drone.lat, drone.alt);
  const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(position);
  const invTransform = Cesium.Matrix4.inverse(enuTransform, new Cesium.Matrix4());
  const enuNormal = Cesium.Matrix4.multiplyByPointAsVector(invTransform, collision.normal, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(enuNormal, enuNormal);

  const dot = Cesium.Cartesian3.dot(enuMove, enuNormal);
  if (dot >= 0) return enuMove;

  const normalComponent = Cesium.Cartesian3.multiplyByScalar(enuNormal, dot, new Cesium.Cartesian3());
  return Cesium.Cartesian3.subtract(enuMove, normalComponent, new Cesium.Cartesian3());
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

function getStreetViewPov() {
  const headingRad = ((drone.heading + gimbal.yaw) * Math.PI) / 180;
  const pitchRad = (gimbal.pitch * Math.PI) / 180;
  const relativeAlt = Math.max(0, drone.alt - altitudeGate.surfaceAlt.value);
  return { headingRad, pitchRad, relativeAlt };
}

let rafId = null;

function updateDroneState() {
  const dt = 1 / 60;
  const viewer = window.cesiumViewer;

  altitudeGate.update(viewer);

  if (isTakeoffLanding.value) {
    altitudeGate.stepAuto(dt, viewer);
    onFlightStop();
    onCameraStop();
    return;
  }

  const allowAltitude = !altitudeGate.isOnGround.value;
  let enuMove = null;

  if (showFlight.value) {
    enuMove = computeDesiredEnuMove(dt, allowAltitude);
  }

  const collision = checkCollisionAhead();
  if (collision && enuMove) {
    enuMove = projectEnuMove(enuMove, collision);
    isCollisionFrozen.value = true;
    collisionSurfaceNormal.value = collision.normal;
  } else {
    isCollisionFrozen.value = false;
    collisionSurfaceNormal.value = null;
  }

  if (showFlight.value) {
    applyEnuMove(enuMove);
    updateFlightTelemetry(allowAltitude);
  }

  if (altitudeGate.isOnGround.value) {
    altitudeGate.snapToGround();
    if (activeFlightMode.value === 'H') {
      onFlightModeChange('M');
    }
    flightCmd.vz = 0;
  }

  if (showCamera.value) {
    stepCameraPhysics(dt, { applyMovement: true });
  }
}

function loop() {
  updateDroneState();
  syncCesiumCamera();
  rafId = requestAnimationFrame(loop);
}

onMounted(() => {
  cesiumContainer.value = document.getElementById('cesiumContainer');
  startFlightKeyboard();
  startCameraKeyboard();
  syncCesiumCamera();

  // Register pages for the router menu
  registerPage({ id: 'aerial', nameKey: 'aerialview.page_aerial', route: '/' });
  registerPage({ id: 'map', nameKey: 'aerialview.page_map', route: '/map' });
  registerPage({ id: 'satellite', nameKey: 'aerialview.page_satellite', route: '/satellite' });
  registerPage({ id: 'chat', nameKey: 'aerialview.page_chat', route: '/chat' });
  registerPage({ id: 'settings', nameKey: 'aerialview.page_settings', route: '/settings' });
  registerPage({ id: 'myspace', nameKey: 'aerialview.page_myspace', route: '/myspace' });
  registerPage({ id: 'extensions', nameKey: 'aerialview.page_extensions', route: '/extensions' });

  registerLeft({
    id: 'router',
    render: () => h(DockMenuButton, {
      icon: 'MENU_ROUTER',
      titleKey: 'aerialview.pages',
      pages,
      onBeforeOpen: hideAllDisks,
    }),
  });
  registerLeft({
    id: 'chat',
    icon: 'MENU_CHAT',
    titleKey: 'aerialview.chat',
    onClick: goToChat,
  });
  registerLeft({
    id: 'camera',
    icon: 'MENU_CAMERA',
    titleKey: 'aerialview.camera',
    active: showCamera.value,
    onClick: toggleCamera,
  });
  registerLeft({
    id: 'recorder',
    icon: 'MENU_RECORDER',
    titleKey: 'aerialview.recorder',
    onClick: () => {},
  });

  registerRight({
    id: 'steer',
    icon: 'MENU_CONTROL_STICK',
    titleKey: 'aerialview.steer',
    active: showFlight.value,
    onClick: toggleFlight,
  });
  registerRight({
    id: 'takeoff',
    icon: isLowAltitude.value ? 'MENU_TAKEOFF' : 'MENU_LANDING',
    titleKey: isLowAltitude.value ? 'aerialview.takeoff' : 'aerialview.landing',
    onClick: toggleTakeoffLanding,
  });

  // Sync dock button active states with toggle state
  watch(showFlight, (val) => {
    const item = rightItems.find((i) => i.id === 'steer');
    if (item) item.active = val;
  });
  watch(showCamera, (val) => {
    const item = leftItems.find((i) => i.id === 'camera');
    if (item) item.active = val;
  });

  // Sync takeoff/landing button icon and label with altitude (< 5m above ground)
  watch(isLowAltitude, (low) => {
    const item = rightItems.find((i) => i.id === 'takeoff');
    if (item) {
      item.icon = low ? 'MENU_TAKEOFF' : 'MENU_LANDING';
      item.titleKey = low ? 'aerialview.takeoff' : 'aerialview.landing';
    }
  });

  rafId = requestAnimationFrame(loop);
});

onUnmounted(() => {
  stopFlightKeyboard();
  stopCameraKeyboard();
  if (rafId) cancelAnimationFrame(rafId);
  clear();
  unregisterPage('aerial');
  unregisterPage('map');
  unregisterPage('satellite');
  unregisterPage('chat');
  unregisterPage('settings');
  unregisterPage('myspace');
  unregisterPage('extensions');
});
</script>

<template>
  <ViewComposer
    :left-items="leftItems"
    :right-items="rightItems"
    :show-flight="showFlight"
    :show-camera="showCamera"
    :flight="flight"
    :camera="camera"
    :disabled="isTakeoffLanding"
    @flightMove="onFlightMove"
    @flightStop="onFlightStop"
    @flightModeChange="onFlightModeChange"
    @cameraMove="onCameraMove"
    @cameraStop="onCameraStop"
    @cameraModeChange="onCameraModeChange"
  >
    <template #background>
      <StreetViewPane
        class="view-composer__background"
        :lat="drone.lat"
        :lon="drone.lon"
        :heading="getStreetViewPov().headingRad"
        :pitch="getStreetViewPov().pitchRad"
        :altitude="getStreetViewPov().relativeAlt"
        :visible="showStreetView"
      />
    </template>

    <template #top-overlay>
      <CollisionWarning :visible="isCollisionFrozen" />
    </template>
  </ViewComposer>
</template>

<style scoped>
:deep(.view-composer__background) {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

:deep(.view-composer__background.street-view-pane--visible) {
  pointer-events: auto;
}
</style>
