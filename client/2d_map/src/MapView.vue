<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { loadGoogleMaps } from './googleMaps.js';
import droneIconUrl from '../../asset/drone.svg';

const { t } = useI18n();

const props = defineProps({
  lat: { type: Number, required: true },
  lon: { type: Number, required: true },
  alt: { type: Number, default: 0 },
  heading: { type: Number, default: 0 },
  mapTypeId: { type: String, default: 'roadmap' },
});

const emit = defineEmits(['centerChange', 'zoomChange']);

const containerRef = ref(null);
const map = ref(null);
const error = ref(null);

const MIN_DRONE_SIZE = 24;
const MAX_DRONE_SIZE = 80;
const ALT_SIZE_RANGE = 500;

const droneSize = computed(() => {
  const ratio = Math.min(Math.max(props.alt / ALT_SIZE_RANGE, 0), 1);
  return Math.round(MAX_DRONE_SIZE - ratio * (MAX_DRONE_SIZE - MIN_DRONE_SIZE));
});

// Altitude (meters) ↔ Google Maps zoom level.
// Uses Google's exponential model: altitude ≈ 20 971 520 / 2^zoom.
//
//    z7 ≈ 163 840 m   z11 ≈ 10 240 m   z15 ≈   640 m   z19 ≈   40 m
//    z8 ≈  81 920 m   z12 ≈  5 120 m   z16 ≈   320 m   z20 ≈   20 m
//    z9 ≈  40 960 m   z13 ≈  2 560 m   z17 ≈   160 m   z21 ≈   10 m
//   z10 ≈  20 480 m   z14 ≈  1 280 m   z18 ≈    80 m
const MIN_ZOOM = 7;      // ~163 840 m
const MAX_ZOOM = 21;     // ~10 m
const MAX_ALT  = 100000; // operational ceiling (meters)
const MIN_ALT  = 10;     // matches Google Maps max zoom (z21 ≈ 10 m)
const ALT_ZOOM_K = 20971520; // exact: 10 m * 2^21

// Guard flags to distinguish programmatic changes from user-initiated gestures.
let lastProgrammaticCenter = null;
let lastProgrammaticZoom = null;
let lastZoomChangeTime = 0;  // timestamp (ms) of last user-initiated zoom
let listeners = [];
let wheelHandler = null;     // stored so we can removeEventListener on unmount

function altToZoom(alt) {
  const clamped = Math.max(MIN_ALT, Math.min(MAX_ALT, alt));
  const z = Math.log2(ALT_ZOOM_K / clamped);
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(z)));
}

function zoomToAlt(zoom) {
  const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  return Math.max(MIN_ALT, Math.min(MAX_ALT, ALT_ZOOM_K / Math.pow(2, clamped)));
}

function isSameCenter(a, b) {
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
}

function updateMapCenter(lat, lng) {
  if (!map.value) return;
  const current = map.value.getCenter();
  const target = { lat, lng };
  if (isSameCenter({ lat: current.lat(), lng: current.lng() }, target)) return;
  lastProgrammaticCenter = target;
  map.value.setCenter(target);
}

// ── Anchor-preserving zoom (reverse-engineered from Google Maps internals) ──
//
// Google Maps' native wheel-zoom pipeline:
//   1. Read cursor pixel position from the WheelEvent
//   2. Un-project that pixel to a geographic point (Web Mercator inverse)
//   3. Change the zoom level
//   4. Compute where that geo point lands at the new zoom (forward projection)
//   5. Shift the map center so the geo point stays under the cursor
//
// We replicate this exact pipeline using Google Maps' public Projection API
// (fromLatLngToPoint / fromPointToLatLng).  The same function is used for:
//   • Mouse wheel  – anchor = cursor pixel position  (cursor-anchored)
//   • H-mode       – anchor = map center              (center-anchored)
//
// Neither zoom_changed nor center_changed side-effects are emitted because all
// resulting state changes are guarded by lastProgrammaticZoom / lastProgrammaticCenter.
function anchoredZoom(zoomDelta, anchorX, anchorY, silent = false) {
  if (!map.value) return;
  const projection = map.value.getProjection();
  if (!projection) return;

  const curZoom = map.value.getZoom();
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, curZoom + zoomDelta));
  if (newZoom === curZoom) return;

  const scale0 = Math.pow(2, curZoom) * 256;
  const scale1 = Math.pow(2, newZoom) * 256;
  const center = map.value.getCenter();
  const centerWorld = projection.fromLatLngToPoint(center);
  const rect = map.value.getDiv().getBoundingClientRect();
  const halfW = rect.width / 2;
  const halfH = rect.height / 2;

  const ax0 = centerWorld.x + (anchorX - halfW) / scale0;
  const ay0 = centerWorld.y + (anchorY - halfH) / scale0;
  const ax1 = centerWorld.x + (anchorX - halfW) / scale1;
  const ay1 = centerWorld.y + (anchorY - halfH) / scale1;

  const newCx = centerWorld.x + (ax0 - ax1);
  const newCy = centerWorld.y + (ay0 - ay1);
  const newCenter = projection.fromPointToLatLng(new google.maps.Point(newCx, newCy));

  // Always guard the center_changed side effect of the zoom.
  lastProgrammaticCenter = { lat: newCenter.lat(), lng: newCenter.lng() };
  // For silent (programmatic/H-mode) zooms, also guard zoom_changed so the
  // altitude prop update doesn't trigger a feedback loop.
  if (silent) {
    lastProgrammaticZoom = newZoom;
  } else {
    // For user wheel zooms, record timestamp so the center_changed side effect
    // is suppressed regardless of event ordering.
    lastZoomChangeTime = Date.now();
  }

  map.value.setZoom(newZoom);
  map.value.setCenter(newCenter);
}

// H-mode: programmatic zoom always anchors at the map center (drone icon).
function updateMapZoom(alt) {
  if (!map.value) return;
  const rect = map.value.getDiv()?.getBoundingClientRect();
  if (!rect) return;
  anchoredZoom(altToZoom(alt) - map.value.getZoom(), rect.width / 2, rect.height / 2, true);
}

function handleCenterChanged() {
  if (!map.value) return;
  const center = map.value.getCenter();
  const target = { lat: center.lat(), lng: center.lng() };
  if (Date.now() - lastZoomChangeTime < 150) {
    return;
  }
  if (lastProgrammaticCenter && isSameCenter(target, lastProgrammaticCenter)) {
    lastProgrammaticCenter = null;
    return;
  }
  lastProgrammaticCenter = null;
  emit('centerChange', target);
}

function handleZoomChanged() {
  if (!map.value) return;
  const zoom = map.value.getZoom();
  if (lastProgrammaticZoom !== null && Math.abs(zoom - lastProgrammaticZoom) < 0.5) {
    lastProgrammaticZoom = null;
    return;
  }
  lastProgrammaticZoom = null;
  lastZoomChangeTime = Date.now();
  emit('zoomChange', zoomToAlt(zoom));
}

function onWheel(e) {
  if (!map.value) return;
  e.stopPropagation();
  const rect = map.value.getDiv().getBoundingClientRect();
  anchoredZoom(e.deltaY < 0 ? 1 : -1, e.clientX - rect.left, e.clientY - rect.top, false);
}

onMounted(async () => {
  try {
    const maps = await loadGoogleMaps();

    map.value = new maps.Map(containerRef.value, {
      center: { lat: props.lat, lng: props.lon },
      zoom: altToZoom(props.alt),
      mapTypeId: props.mapTypeId,
      disableDefaultUI: true,
      scrollwheel: false,     // we handle wheel events ourselves
      gestureHandling: 'auto',
      draggable: true,
      keyboardShortcuts: false,
      zoomControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      scaleControl: false,
      rotateControl: false,
    });

    listeners.push(maps.event.addListener(map.value, 'center_changed', handleCenterChanged));
    listeners.push(maps.event.addListener(map.value, 'zoom_changed', handleZoomChanged));

    // Capture-phase wheel listener: fires before any Google Maps listener.
    // passive: false avoids Chrome's passive-listener console warning.
    wheelHandler = onWheel;
    containerRef.value.addEventListener('wheel', wheelHandler, { capture: true, passive: false });
  } catch (e) {
    error.value = e.message;
    console.error('[2D Map]', e);
  }
});

onUnmounted(() => {
  listeners.forEach((listener) => listener?.remove());
  listeners = [];
  if (wheelHandler && containerRef.value) {
    containerRef.value.removeEventListener('wheel', wheelHandler, { capture: true });
  }
});

watch(() => [props.lat, props.lon], ([lat, lon]) => {
  updateMapCenter(lat, lon);
});

watch(() => props.alt, (alt) => {
  updateMapZoom(alt);
});
</script>

<template>
  <div class="map-view">
    <div ref="containerRef" class="map-container"></div>
    <img
      class="drone-marker"
      :src="droneIconUrl"
      alt="Drone"
      draggable="false"
      :width="droneSize"
      :height="droneSize"
      :style="{
        transform: `translate(-50%, -50%) rotate(${props.heading}deg)`,
      }"
    />
    <div v-if="error" class="map-error">
      <strong>{{ t('mapview.load_failed') }}</strong>
      <p>{{ error }}</p>
      <p class="map-error-hint">
        {{ t('mapview.api_hint') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.map-view {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #0b0b0b;
  overflow: hidden;
}

.map-container {
  width: 100%;
  height: 100%;
}

.drone-marker {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35));
}

/* Hide Google Maps UI widgets and bottom-right attribution links. */
.map-container :deep(.gmnoprint),
.map-container :deep(.gm-style-cc),
.map-container :deep(.gm-style a[href^="https://maps.google.com/maps?"]),
.map-container :deep(.gm-style a[href^="https://www.google.com/intl/"]),
.map-container :deep(.gm-style-cc a),
.map-container :deep(.gm-style .gm-style-cc span),
.map-container :deep(.gm-style > div > a),
.map-container :deep(.gm-style > div > div > a) {
  display: none !important;
}

.map-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.85);
  color: #f87171;
  text-align: center;
}

.map-error-hint {
  color: #aaaaaa;
  font-size: 0.85rem;
  max-width: 480px;
}
</style>
