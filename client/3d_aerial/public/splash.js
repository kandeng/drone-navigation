/**
 * Splash Screen Video Sequencer
 *
 * Plays sequential video clips from /splash/ while Cesium 3D tiles load.
 * When Cesium signals readiness via window 'cesiumReady' event, the overlay
 * fades out and removes itself from the DOM.
 *
 * This is a plain script (not a Vue module) so it executes immediately,
 * before Vue or Cesium JS has finished loading.
 */

(function () {
  'use strict';

  // Playlist of video clips to show in order.
  // When the last clip ends, it loops (replays) to avoid a blank screen.
  const clips = [
    '/splash/clip1.mp4',
    '/splash/clip2.mp4',
    '/splash/clip3.mp4',
  ];

  let currentClip = 0;
  let dismissed = false;

  const video = document.getElementById('splash-video');
  const overlay = document.getElementById('splash-overlay');

  if (!video || !overlay) return;

  // Start the first clip
  video.src = clips[0];
  video.play().catch(() => {
    // Autoplay may be blocked; user interaction will resume
  });

  // When a clip ends, advance to the next (loop last clip)
  video.addEventListener('ended', () => {
    if (dismissed) return;
    currentClip = Math.min(currentClip + 1, clips.length - 1);
    video.src = clips[currentClip];
    video.play().catch(() => {});
  });

  /**
   * Dismiss the splash overlay with a fade-out transition.
   * Safe to call multiple times; only the first call takes effect.
   */
  function dismissSplash() {
    if (dismissed) return;
    dismissed = true;
    overlay.classList.add('splash-fade-out');
    overlay.addEventListener('transitionend', () => {
      overlay.remove();
    });
  }

  // Listen for Cesium readiness signal from cesium-main.js
  window.addEventListener('cesiumReady', dismissSplash);

  // Timeout fallback: dismiss after 30 seconds even if Cesium never signals
  setTimeout(dismissSplash, 30000);
})();
