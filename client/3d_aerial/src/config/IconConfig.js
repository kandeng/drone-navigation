// Configurable icon mapping.
// All SVG source files live in client/asset/ and are imported as raw strings
// via Vite's import.meta.glob. Add or update keys here to change the icons
// used across the application without touching components.

const svgModules = import.meta.glob('../../../asset/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const pngModules = import.meta.glob('../../../asset/*.png', {
  import: 'default',
  eager: true,
});

export const IconMap = {
  // Sidebar menu icons
  MENU_CONTROL_STICK: '../../../asset/control-stick.svg',
  MENU_LOCATION: '../../../asset/location.svg',
  MENU_3D_VIEW: '../../../asset/drone.svg',
  MENU_SETTINGS: '../../../asset/settings.svg',
  MENU_CAMERA: '../../../asset/camera.svg',
  MENU_CHAT: '../../../asset/chat.svg',
  MENU_TAKEOFF: '../../../asset/takeoff.svg',
  MENU_LANDING: '../../../asset/landing.svg',
  // Legacy alias, kept for backward compatibility
  MENU_GAMEPAD: '../../../asset/control-stick.svg',

  // Joystick / flight control glyphs
  FLIGHT_MOVE: '../../../asset/flight-move.svg',
  FLIGHT_ROTATE: '../../../asset/flight-rotate.svg',
  FLIGHT_HEIGHT: '../../../asset/flight-height.svg',

  // Camera / gimbal control glyphs
  CAMERA_ROTATE: '../../../asset/camera-rotate.svg',
  CAMERA_PITCH: '../../../asset/pitch-indicator.svg',

  // Chat icons
  CHAT_BACK: '../../../asset/back.svg',
  CHAT_SEND: '../../../asset/send.svg',
  CHAT_ATTACHMENT: '../../../asset/attachment.svg',
};

/**
 * Resolve a configured icon key to its raw SVG markup.
 * @param {string} key - A key from IconMap.
 * @returns {string} The SVG markup, or an empty string if not found.
 */
export function getIconSvg(key) {
  const path = IconMap[key];
  return path && svgModules[path] ? svgModules[path] : '';
}

export function getIconImageUrl(key) {
  const path = IconMap[key];
  return path && pngModules[path] ? pngModules[path] : '';
}

/**
 * List all available icon keys. Useful for debugging or dynamic pickers.
 * @returns {string[]}
 */
export function getIconKeys() {
  return Object.keys(IconMap);
}
