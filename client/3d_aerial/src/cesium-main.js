import config from '../../config.json';

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
    const targetLatitude = 37.7937;
    const targetLongitude = -122.3965;
    const targetHeight = 300.0; // Clean view height altitude in meters
    const initialPosition = Cesium.Cartesian3.fromDegrees(targetLongitude, targetLatitude, targetHeight);

    try {
        // Attempt to load Google Photorealistic 3D Tiles.
        // This requires a valid Google API key with the Map Tiles API enabled and
        // a Cesium ion access token that is not expired.
        googleTileset = await Cesium.createGooglePhotorealistic3DTileset();
        viewer.scene.primitives.add(googleTileset);
        console.log('[Cesium] Google Photorealistic 3D Tileset loaded.');
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

    // Position the camera over downtown San Francisco.
    viewer.camera.setView({
        destination: initialPosition,
        orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-20.0), // Tilt downwards slightly
            roll: 0.0
        }
    });

    if (typeof initDroneControl === 'function') {
        initDroneControl(initialPosition);
    }
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
