let droneState = {
    position: null, // Cartesian3
    velocity: new Cesium.Cartesian3(0, 0, 0),
    heading: 0.0,   // Pointing Straight North
    pitch: 0.0,     // CRITICAL FIX: Change from -0.2 to 0.0 to look dead ahead at the buildings
    speed: 0.0
};

const keys = { w: false, s: false, a: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

window.addEventListener('keydown', (e) => { if (e.key in keys) keys[e.key] = true; });
window.addEventListener('keyup', (e) => { if (e.key in keys) keys[e.key] = false; });

function initDroneControl(startPosition) {
    droneState.position = startPosition;

    // Hook into Cesium's frame clock update rendering ticker
    if (!window.cesiumViewer) {
        console.warn('[dronePhysics] cesiumViewer not yet available, deferring.');
        return;
    }
    window.cesiumViewer.scene.preRender.addEventListener(updateDroneFrame);
}

function updateDroneFrame(scene, time) {
    const dt = 0.016; // ~60fps simulation step

    // 1. Handle Rotations
    if (keys.a) droneState.heading -= 1.5 * dt;
    if (keys.d) droneState.heading += 1.5 * dt;

    if (keys.ArrowUp) droneState.pitch += 1.0 * dt;
    if (keys.ArrowDown) droneState.pitch -= 1.0 * dt;

    // 2. Handle Speed / Throttle
    const acceleration = 20.0;
    const drag = 0.5;
    if (keys.w) {
        droneState.speed += acceleration * dt;
    } else if (keys.s) {
        droneState.speed -= acceleration * dt;
    } else {
        droneState.speed -= droneState.speed * drag * dt;
    }
    droneState.speed = Math.max(-10, Math.min(50, droneState.speed));

    // --- CRITICAL FIX: CALCULATE LOCAL DIRECTION VECTORS ---

    // Create a local reference frame at the drone's current position
    const localFrame = Cesium.Transforms.eastNorthUpToFixedFrame(droneState.position);

    // Calculate local forward direction based on Heading and Pitch
    // Local: X = East, Y = North, Z = Up
    const localForward = new Cesium.Cartesian3(
        Math.sin(droneState.heading) * Math.cos(droneState.pitch),
        Math.cos(droneState.heading) * Math.cos(droneState.pitch),
        Math.sin(droneState.pitch)
    );

    // Transform the local movement direction into global ECEF coordinates
    const globalDirection = Cesium.Matrix4.multiplyByPointAsVector(localFrame, localForward, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(globalDirection, globalDirection);

    // Multiply global direction vector by scalar velocity speed
    const moveOffset = Cesium.Cartesian3.multiplyByScalar(globalDirection, droneState.speed * dt, new Cesium.Cartesian3());

    // Update drone position coordinate position
    Cesium.Cartesian3.add(droneState.position, moveOffset, droneState.position);

    // 4. Update Camera view matrix
    if (!window.cesiumViewer || !window.cesiumViewer.camera) return;
    window.cesiumViewer.camera.setView({
        destination: droneState.position,
        orientation: {
            heading: droneState.heading,
            pitch: droneState.pitch,
            roll: 0.0
        }
    });

    // 5. Update Telemetry displays safely (HUD elements are optional)
    const speedEl = document.getElementById("speedTxt");
    if (speedEl) speedEl.innerText = Math.round(droneState.speed);

    // Safely check if coordinates can convert back to surface Cartographic elements
    try {
        const cartographic = Cesium.Cartographic.fromCartesian(droneState.position);
        if (cartographic) {
            const altEl = document.getElementById("altTxt");
            if (altEl) altEl.innerText = Math.round(cartographic.height);
        }
    } catch(e) {
        const altEl = document.getElementById("altTxt");
        if (altEl) altEl.innerText = "ERR";
    }
}