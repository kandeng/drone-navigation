import { ref, computed } from 'vue';

/* global Cesium */

const DESCEND_THRESHOLD = 15.0; // meters: switch to street view
const ASCEND_THRESHOLD = 18.0;  // meters: switch back to aerial view
const AUTO_SPEED = 8.0;         // meters per second for auto takeoff/landing
const AUTO_TOLERANCE = 0.2;     // meters: stop auto when within this distance

/**
 * Composable that tracks the drone's altitude relative to the 3D tileset
 * surface, manages a hysteresis-based aerial/ground state, and drives
 * automatic takeoff/landing sequences.
 */
export function useAltitudeGate(drone) {
  const surfaceAlt = ref(0);
  const isOnGround = ref(true);
  const isAutoTakingOff = ref(false);
  const isAutoLanding = ref(false);
  const isTransitioning = computed(() => isAutoTakingOff.value || isAutoLanding.value);

  /**
   * Sample the 3D tileset surface directly beneath the drone.
   * Returns the surface altitude in meters above the ellipsoid, or null if
   * the scene is not ready or nothing was hit.
   */
  function sampleSurfaceAltitude(viewer) {
    if (!viewer) return null;
    const position = Cesium.Cartesian3.fromDegrees(drone.lon, drone.lat, drone.alt);
    const down = Cesium.Cartesian3.negate(
      Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(position, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    const ray = new Cesium.Ray(position, down);
    const hit = viewer.scene.pickFromRay(ray);
    if (hit && hit.position) {
      const cartographic = Cesium.Cartographic.fromCartesian(hit.position);
      return cartographic.height;
    }
    return null;
  }

  /**
   * Update the surface altitude estimate and the ground/airborne state.
   * Should be called once per frame before movement logic runs.
   */
  function update(viewer) {
    const sampled = sampleSurfaceAltitude(viewer);
    if (sampled !== null) {
      surfaceAlt.value = sampled;
    }

    const relativeAlt = drone.alt - surfaceAlt.value;

    // Hysteresis: only change state when crossing the appropriate threshold.
    if (relativeAlt <= DESCEND_THRESHOLD) {
      isOnGround.value = true;
    } else if (relativeAlt >= ASCEND_THRESHOLD) {
      isOnGround.value = false;
    }

    return {
      relativeAlt,
      surfaceAlt: surfaceAlt.value,
    };
  }

  /**
   * Move drone.alt toward a target altitude at AUTO_SPEED.
   * Returns true when the target is reached.
   */
  function stepToward(targetAlt, dt) {
    const delta = targetAlt - drone.alt;
    if (Math.abs(delta) <= AUTO_TOLERANCE) {
      drone.alt = targetAlt;
      return true;
    }
    const step = Math.sign(delta) * AUTO_SPEED * dt;
    drone.alt += Math.abs(step) > Math.abs(delta) ? delta : step;
    return false;
  }

  /**
   * Start an automatic takeoff to 15 m above the current surface.
   */
  function startTakeoff(viewer) {
    update(viewer); // refresh surfaceAlt first
    isAutoTakingOff.value = true;
    isAutoLanding.value = false;
  }

  /**
   * Start an automatic landing at the current surface altitude.
   */
  function startLanding(viewer) {
    update(viewer); // refresh surfaceAlt first
    isAutoLanding.value = true;
    isAutoTakingOff.value = false;
  }

  /**
   * Run the automatic takeoff/landing step. Returns true if the sequence
   * completed this frame.
   */
  function stepAuto(dt, viewer) {
    update(viewer);

    if (isAutoTakingOff.value) {
      const target = surfaceAlt.value + DESCEND_THRESHOLD;
      if (stepToward(target, dt)) {
        isAutoTakingOff.value = false;
        isOnGround.value = false;
        return true;
      }
      return false;
    }

    if (isAutoLanding.value) {
      const target = surfaceAlt.value;
      if (stepToward(target, dt)) {
        isAutoLanding.value = false;
        isOnGround.value = true;
        return true;
      }
      return false;
    }

    return false;
  }

  /**
   * Clamp the drone to the surface when it is on the ground. This keeps a
   * landed drone on a roof or slope when the user moves horizontally.
   */
  function snapToGround() {
    drone.alt = surfaceAlt.value;
  }

  function cancelAuto() {
    isAutoTakingOff.value = false;
    isAutoLanding.value = false;
  }

  return {
    surfaceAlt,
    isOnGround,
    isAutoTakingOff,
    isAutoLanding,
    isTransitioning,
    update,
    startTakeoff,
    startLanding,
    stepAuto,
    snapToGround,
    cancelAuto,
  };
}
