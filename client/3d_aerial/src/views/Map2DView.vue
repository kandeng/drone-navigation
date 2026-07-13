<script setup>
import { onMounted, onUnmounted, h } from 'vue';
import ViewComposer from '@shared/_ViewComposer.vue';
import { MapView } from '../../../2d_map/index.js';
import { useDrone } from '@shared-composables/useDrone.js';
import { useFlightCommands } from '@shared-composables/useFlightCommands.js';
import { useFlightPhysics } from '@shared-composables/useFlightPhysics.js';
import { useDockRegistry } from '@shared-composables/useDockRegistry.js';
import { usePageRegistry } from '@shared-composables/usePageRegistry.js';
import DockMenuButton from '@shared/DockMenuButton.vue';

const { drone } = useDrone();
const {
  flight,
  showFlight,
  toggleFlight,
  onFlightMove,
  onFlightStop,
  onFlightModeChange,
  startKeyboard,
  stopKeyboard,
} = useFlightCommands();
const { step: stepFlightPhysics } = useFlightPhysics();
const { leftItems, registerLeft, clear } = useDockRegistry();
const { pages, registerPage, unregisterPage } = usePageRegistry();

function onMapCenterChange({ lat, lng }) {
  drone.lat = lat;
  drone.lon = lng;
}

function onMapZoomChange(alt) {
  drone.alt = Math.max(0, Math.min(100000, alt));
}

let rafId = null;

const MIN_ALT = 10; // meters – matches Google Maps max zoom (z21 ≈ 10 m)
const MAX_ALT = 100000; // operational ceiling

function loop() {
  stepFlightPhysics(1 / 60, { allowAltitude: true, applyMovement: showFlight.value, exponentialAltitude: true });
  // Clamp altitude to the allowed [10 m, 100 000 m] range.
  drone.alt = Math.max(MIN_ALT, Math.min(MAX_ALT, drone.alt));
  rafId = requestAnimationFrame(loop);
}

onMounted(() => {
  startKeyboard();

  // Register pages for the router menu
  registerPage({ id: 'aerial', nameKey: 'aerialview.page_aerial', route: '/' });
  registerPage({ id: 'map', nameKey: 'aerialview.page_map', route: '/map' });
  registerPage({ id: 'satellite', nameKey: 'aerialview.page_satellite', route: '/satellite' });
  registerPage({ id: 'chat', nameKey: 'aerialview.page_chat', route: '/chat' });

  registerLeft({
    id: 'steer',
    icon: 'MENU_CONTROL_STICK',
    titleKey: 'aerialview.steer',
    active: false,
    onClick: toggleFlight,
  });
  registerLeft({
    id: 'router',
    render: () => h(DockMenuButton, {
      icon: 'MENU_ROUTER',
      titleKey: 'aerialview.pages',
      pages,
      onBeforeOpen: () => { showFlight.value = false; },
    }),
  });

  rafId = requestAnimationFrame(loop);
});

onUnmounted(() => {
  stopKeyboard();
  if (rafId) cancelAnimationFrame(rafId);
  clear();
  unregisterPage('aerial');
  unregisterPage('map');
  unregisterPage('satellite');
  unregisterPage('chat');
});
</script>

<template>
  <ViewComposer
    :left-items="leftItems"
    :right-items="[]"
    :show-flight="showFlight"
    :show-camera="false"
    :flight="flight"
    :camera="{ mode: '-', yaw: 0, pitch: 0, roll: 0 }"
    @flightMove="onFlightMove"
    @flightStop="onFlightStop"
    @flightModeChange="onFlightModeChange"
  >
    <template #background>
      <MapView
        class="view-composer__background"
        map-type-id="roadmap"
        :lat="drone.lat"
        :lon="drone.lon"
        :alt="drone.alt"
        :heading="drone.heading"
        @centerChange="onMapCenterChange"
        @zoomChange="onMapZoomChange"
      />
    </template>
  </ViewComposer>
</template>

<style scoped>
:deep(.view-composer__background) {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: auto;
}
</style>
