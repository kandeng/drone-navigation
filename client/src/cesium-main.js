import config from '../config.json';
import { useAppSettings } from '@shared-composables/useAppSettings.js';

Cesium.GoogleMaps.defaultApiKey = config.googleApiKey;
Cesium.Ion.defaultAccessToken = config.cesiumIonToken;

// Initialize with standard terrain mapping configuration profiles
let googleTileset = null;
const viewer = new Cesium.Viewer('cesiumContainer', {
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    infoBox: false,
    selectionIndicator: false,
    // Hide default Cesium toolbar widgets
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    // Provide baseline imagery mapping vectors to map standard ground heights
    imageryProvider: new Cesium.TileMapServiceImageryProvider({
        url: Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')
    })
});

// Explicitly hide the underlying base globe surface to expose clean Google Meshes.
// If the photorealistic tileset fails to load, we re-enable the globe as a fallback.
viewer.scene.globe.show = false;

async function loadArena() {
    const { settings } = useAppSettings();
    const targetLatitude = settings.defaultLat;
    const targetLongitude = settings.defaultLon;
    const targetHeight = settings.defaultAlt;
    const initialPosition = Cesium.Cartesian3.fromDegrees(targetLongitude, targetLatitude, targetHeight);

    // Apply default direction from settings (yaw → heading, pitch, roll)
    const initialHeading = Cesium.Math.toRadians(settings.defaultYaw);
    const initialPitch = Cesium.Math.toRadians(settings.defaultPitch);
    const initialRoll = Cesium.Math.toRadians(settings.defaultRoll);

    // Position the camera at the default location and direction immediately
    // so that tiles for the correct viewport begin downloading.
    viewer.camera.setView({
        destination: initialPosition,
        orientation: {
            heading: initialHeading,
            pitch: initialPitch,
            roll: initialRoll
        }
    });

    try {
        // Attempt to load Google Photorealistic 3D Tiles.
        // This requires a valid Google API key with the Map Tiles API enabled and
        // a Cesium ion access token that is not expired.
        googleTileset = await Cesium.createGooglePhotorealistic3DTileset();
        viewer.scene.primitives.add(googleTileset);
        console.log('[Cesium] Google Photorealistic 3D Tileset created.');
    } catch (error) {
        console.warn('[Cesium] Google Photorealistic 3D Tileset failed to load:', error);
        console.warn('[Cesium] Falling back to Cesium World Terrain + OSM Buildings.');

        // Re-enable the base globe so the map is not blank.
        viewer.scene.globe.show = true;

        // Add Cesium World Terrain for elevation data.
        try {
            const terrain = await Cesium.createWorldTerrainAsync();
            viewer.terrainProvider = terrain;
            console.log('[Cesium] Cesium World Terrain loaded.');
        } catch (terrainError) {
            console.warn('[Cesium] Cesium World Terrain failed to load:', terrainError);
        }

        // Add OSM Buildings as a fallback 3D dataset.
        try {
            const osmBuildings = await Cesium.createOsmBuildingsAsync();
            viewer.scene.primitives.add(osmBuildings);
            console.log('[Cesium] OSM Buildings loaded.');
        } catch (osmError) {
            console.warn('[Cesium] OSM Buildings failed to load:', osmError);
        }
    }

    if (typeof initDroneControl === 'function') {
        try {
            initDroneControl(initialPosition);
        } catch (e) {
            console.warn('[Cesium] initDroneControl failed:', e);
        }
    }

    // ── Wait for actual tile downloads to settle ──
    // tileLoadProgressEvent fires with the number of tiles currently loading.
    // We wait until the queue reaches 0 (all visible tiles downloaded).
    // If tileLoadProgressEvent is unavailable (e.g. partial Cesium init),
    // we proceed immediately after a short delay.
    const tileLoadProgress = viewer.scene?.tileLoadProgressEvent;

    await new Promise((resolve) => {
        let settled = false;

        if (!tileLoadProgress) {
            console.warn('[Cesium] tileLoadProgressEvent unavailable, waiting 3s.');
            setTimeout(() => resolve(), 3000);
            return;
        }

        function onProgress(queueLength) {
            if (queueLength === 0 && !settled) {
                settled = true;
                tileLoadProgress.removeEventListener(onProgress);
                console.log('[Cesium] All visible tiles downloaded.');
                resolve();
            }
        }

        tileLoadProgress.addEventListener(onProgress);

        // If the queue is already 0 (e.g., cached), resolve immediately
        // after one frame to give Cesium a chance to start loading.
        setTimeout(() => {
            if (!settled) {
                // Check once more after a brief delay
                setTimeout(() => {
                    if (!settled) {
                        // Force resolve after 15s even if tiles never finish
                        settled = true;
                        tileLoadProgress.removeEventListener(onProgress);
                        console.warn('[Cesium] Tile load timeout (15s), proceeding.');
                        resolve();
                    }
                }, 15000);
            }
        }, 500);
    });

    // Signal splash screen that Cesium 3D scene is ready with tiles loaded
    window.dispatchEvent(new CustomEvent('cesiumReady'));
}

/**
 * Update the Cesium camera to match the drone state and gimbal angles.
 * Called from the Vue dashboard on every animation frame.
 */
// Expose the viewer and tileset so the Vue dashboard can run collision raycasts.
window.cesiumViewer = viewer;
window.getGoogleTileset = function() {
    return googleTileset;
};

window.updateCesiumCamera = function(state) {
    if (!viewer) return;
    const position = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, state.alt);
    const heading = Cesium.Math.toRadians(((state.heading + state.gimbalYaw) % 360 + 360) % 360);
    const pitch = Cesium.Math.toRadians(state.gimbalPitch);
    const roll = Cesium.Math.toRadians(state.gimbalRoll);

    viewer.camera.setView({
        destination: position,
        orientation: { heading, pitch, roll }
    });
};

window.addEventListener('load', loadArena);
