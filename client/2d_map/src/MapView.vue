<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { loadGoogleMaps } from './googleMaps.js';

const props = defineProps({
  lat: {
    type: Number,
    required: true,
  },
  lon: {
    type: Number,
    required: true,
  },
  heading: {
    type: Number,
    default: 0,
  },
});

const containerRef = ref(null);
const map = ref(null);
const marker = ref(null);
const mapsApi = ref(null);
const error = ref(null);

onMounted(async () => {
  try {
    const maps = await loadGoogleMaps();
    mapsApi.value = maps;

    map.value = new maps.Map(containerRef.value, {
      center: { lat: props.lat, lng: props.lon },
      zoom: 18,
      mapTypeId: 'roadmap',
      mapTypeControl: true,
      fullscreenControl: false,
      streetViewControl: false,
      zoomControl: true,
    });

    marker.value = new maps.Marker({
      position: { lat: props.lat, lng: props.lon },
      map: map.value,
      title: 'Drone',
      icon: {
        path: 'M12 2 L22 20 L12 16 L2 20 Z',
        fillColor: '#3b82f6',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 1.5,
        anchor: new maps.Point(12, 12),
        rotation: props.heading,
      },
    });
  } catch (e) {
    error.value = e.message;
    console.error('[2D Map]', e);
  }
});

onUnmounted(() => {
  if (marker.value) {
    marker.value.setMap(null);
  }
});

watch(
  () => [props.lat, props.lon, props.heading],
  () => {
    if (!map.value || !mapsApi.value) return;
    const position = { lat: props.lat, lng: props.lon };
    map.value.setCenter(position);
    if (marker.value) {
      marker.value.setPosition(position);
      marker.value.setIcon({
        path: 'M12 2 L22 20 L12 16 L2 20 Z',
        fillColor: '#3b82f6',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 1.5,
        anchor: new mapsApi.value.Point(12, 12),
        rotation: props.heading,
      });
    }
  }
);
</script>

<template>
  <div class="map-view">
    <div ref="containerRef" class="map-container"></div>
    <div v-if="error" class="map-error">
      <strong>Could not load Google Map</strong>
      <p>{{ error }}</p>
      <p class="map-error-hint">
        Verify that Maps JavaScript API is enabled for your API key.
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
}

.map-container {
  width: 100%;
  height: 100%;
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
