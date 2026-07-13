import config from '../../config.json';

const CALLBACK_NAME = '__gmapsStreetViewInit';
const API_KEY = config.googleApiKey ?? '';

let mapsPromise = null;

/**
 * Dynamically load the Google Maps JavaScript API if it is not already present.
 * The same API key used for Google 3D Tiles can be reused, but the Maps JS API
 * must be enabled in the Google Cloud console.
 */
export function loadGoogleMaps() {
  if (mapsPromise) return mapsPromise;

  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only be loaded in a browser'));
  }

  if (window.google?.maps?.StreetViewPanorama) {
    mapsPromise = Promise.resolve(window.google.maps);
    return mapsPromise;
  }

  if (!API_KEY) {
    mapsPromise = Promise.reject(new Error('Missing googleApiKey in client/config.json'));
    return mapsPromise;
  }

  mapsPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      delete window[CALLBACK_NAME];
      reject(new Error('Google Maps JavaScript API load timed out. Check that the API key is valid and Maps JavaScript API is enabled.'));
    }, 15000);

    window[CALLBACK_NAME] = () => {
      clearTimeout(timeout);
      if (window.google?.maps?.StreetViewPanorama) {
        resolve(window.google.maps);
      } else {
        reject(new Error('Google Maps initialized but Street View is unavailable'));
      }
      delete window[CALLBACK_NAME];
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&callback=${CALLBACK_NAME}&loading=async`;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timeout);
      delete window[CALLBACK_NAME];
      reject(new Error('Failed to load Google Maps JavaScript API. Verify the API key and that Maps JavaScript API is enabled.'));
    };
    document.head.appendChild(script);
  });

  return mapsPromise;
}

/**
 * Convert a Cesium-style heading (radians clockwise from north) to a Google
 * Street View heading (degrees clockwise from north, 0..360).
 */
export function cesiumHeadingToStreetView(headingRad) {
  let deg = (headingRad * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return deg;
}

/**
 * Convert a Cesium-style pitch (radians from horizontal, positive up) to a
 * Google Street View pitch (degrees from horizontal, positive up).
 * Street View clamps the effective range to roughly +/- 80 degrees.
 */
export function cesiumPitchToStreetView(pitchRad) {
  let deg = (pitchRad * 180) / Math.PI;
  return Math.max(-80, Math.min(80, deg));
}

/**
 * Map drone altitude (0..15 m) to a Street View zoom level (0..3).
 * Higher zoom = narrower FOV = elevated feel.
 * Lower zoom = wider FOV = immersive ground-level feel.
 */
export function altitudeToStreetViewZoom(altitudeM) {
  const t = Math.max(0, Math.min(1, altitudeM / 15));
  return t * 3; // 0 at ground, 3 at 15 m
}

/**
 * Create a Street View panorama attached to the given container element.
 * Returns an object with helpers to update the view.
 */
export async function createStreetView(container, options = {}) {
  const maps = await loadGoogleMaps();
  const { lat, lon, heading = 0, pitch = 0, zoom = 0 } = options;

  const panorama = new maps.StreetViewPanorama(container, {
    position: { lat, lng: lon },
    pov: {
      heading: cesiumHeadingToStreetView(heading),
      pitch: cesiumPitchToStreetView(pitch),
    },
    zoom: zoom,
    // Hide default Street View UI so it feels like a drone camera feed.
    addressControl: false,
    clickToGo: false,
    disableDefaultUI: true,
    fullscreenControl: false,
    linksControl: false,
    motionTracking: false,
    motionTrackingControl: false,
    panControl: false,
    scrollwheel: false,
    showRoadLabels: false,
    streetViewControl: false,
    zoomControl: false,
    // Allow panning only if the caller opts in.
    enableCloseButton: false,
  });

  panorama.addListener('status_changed', () => {
    const status = panorama.getStatus();
    if (status === maps.StreetViewStatus.UNKNOWN_ERROR) {
      console.warn('[StreetView] Unknown error loading panorama');
    } else if (status === maps.StreetViewStatus.ZERO_RESULTS) {
      console.warn('[StreetView] No panorama found near', { lat, lon });
    }
  });

  return {
    panorama,
    setPosition(lat, lon) {
      panorama.setPosition({ lat, lng: lon });
    },
    setPov(headingRad, pitchRad) {
      panorama.setPov({
        heading: cesiumHeadingToStreetView(headingRad),
        pitch: cesiumPitchToStreetView(pitchRad),
      });
    },
    setZoom(zoom) {
      panorama.setZoom(Math.max(0, Math.min(5, zoom)));
    },
    setVisible(visible) {
      // Setting the container display is handled by the Vue wrapper;
      // this helper can force a resize if needed.
      if (visible && panorama) {
        maps.event.trigger(panorama, 'resize');
      }
    },
    destroy() {
      // There is no explicit destroy API; the panorama is garbage-collected
      // when the container is removed from the DOM.
    },
  };
}
