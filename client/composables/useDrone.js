import { reactive } from 'vue';

const drone = reactive({
  lat: 37.7937,
  lon: -122.3965,
  alt: 300.0,
  heading: 0.0,
});

const gimbal = reactive({
  yaw: 0.0,
  pitch: -20.0,
  roll: 0.0,
});

export function useDrone() {
  function setDroneLocation(lat, lon, altitude = null) {
    drone.lat = lat;
    drone.lon = lon;
    if (altitude !== null) {
      drone.alt = altitude;
    }
  }

  return { drone, gimbal, setDroneLocation };
}
