/**
 * Splash Screen Video Sequencer
 *
 * Plays sequential video clips from /splash/ while Cesium 3D tiles load.
 * Uses dual-video cross-fade to eliminate black screen between clips.
 * Dismissal is driven by tile readiness, checked every 500 ms:
 *   - When tiles become ready → fade out splash immediately (even mid-clip)
 *   - When a clip ends AND tiles NOT ready → play next clip (loop last)
 *   - Timeout fallback after 60 seconds regardless
 *
 * This is a plain script (not a Vue module) so it executes immediately,
 * before Vue or Cesium JS has finished loading.
 */

(function () {
  'use strict';

  // ── Clip playlist (config-driven, future-proof for per-user API) ──
  // In the future, this array will be fetched from an API endpoint:
  //   GET /api/splash/playlist?userId=xxx
  // For now, it's a local config that can be easily swapped.
  const clips = [
    '/splash/vantor_world3d.mp4',
    '/splash/kevtoe_worldview.mp4',
    '/splash/drone_earth_milkway_continent.mp4',
  ];

  // ── i18n translations (customizable, not standard translations) ──
  // Each language has its own custom slogan text.
  // In the future, this can be fetched from an API or config file.
  const i18n = {
    en: {
      slogan: 'The world is wide, let us take off.',
    },
    zh: {
      slogan: '世界很大，我们飞过去看看',
    },
  };

  // ── PWA install page URL (for QR code) ──
  // When scanned, opens this page with PWA download instructions.
  const pwaInstallUrl = window.location.origin + '/pwa-install.html';

  // ── Detect user language ──
  function detectLanguage() {
    // 1. Check localStorage (set by Settings page)
    const saved = localStorage.getItem('user-lang');
    if (saved && i18n[saved]) return saved;
    // 2. Check browser language
    const browserLang = (navigator.language || 'en').slice(0, 2);
    if (i18n[browserLang]) return browserLang;
    // 3. Default to English
    return 'en';
  }

  const lang = detectLanguage();

  // ── Populate slogan ──
  const sloganEl = document.getElementById('splash-slogan');
  if (sloganEl) {
    sloganEl.textContent = i18n[lang].slogan;
  }

  // ── Generate QR code ──
  // Uses qrserver.com free API. For production, consider self-hosted QR generation.
  const qrImg = document.getElementById('splash-qr-img');
  if (qrImg) {
    qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(pwaInstallUrl);
  }

  // Make QR clickable → open PWA install page in new tab
  const qrContainer = document.getElementById('splash-qr');
  if (qrContainer) {
    qrContainer.addEventListener('click', () => {
      window.open(pwaInstallUrl, '_blank');
    });
  }

  // ── State ──
  let currentClip = 0;
  let dismissed = false;
  let tilesReady = false;

  // ── Dual-video setup for seamless cross-fade ──
  // Two video elements: one visible (playing), one hidden (buffering next clip).
  const videoA = document.getElementById('splash-video');
  const overlay = document.getElementById('splash-overlay');
  if (!videoA || !overlay) return;

  // Create a second video element for cross-fade transitions
  const videoB = document.createElement('video');
  videoB.muted = true;
  videoB.playsInline = true;
  videoB.preload = 'auto';
  videoB.style.cssText = videoA.style.cssText;
  // Match the positioning of videoA
  videoB.className = 'splash-video-alt';
  videoB.style.opacity = '0'; // Start hidden
  overlay.insertBefore(videoB, videoA.nextSibling);

  // Track which video is currently playing
  let activeVideo = videoA;
  let standbyVideo = videoB;

  /**
   * Preload the next clip into the standby video element.
   * This starts buffering so the switch is instant.
   */
  function preloadNext(clipIndex) {
    if (clipIndex < clips.length) {
      standbyVideo.src = clips[clipIndex];
      standbyVideo.load();
    }
  }

  // ── Start the first clip and preload the second ──
  videoA.src = clips[0];
  videoA.play().catch(() => {});
  preloadNext(1); // Start buffering clip 2

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

  /**
   * Cross-fade from active video to standby video (which has next clip ready).
   */
  function crossFadeToNext() {
    // Swap visibility
    activeVideo.style.transition = 'opacity 0.4s ease';
    standbyVideo.style.transition = 'opacity 0.4s ease';
    activeVideo.style.opacity = '0';
    standbyVideo.style.opacity = '1';

    // Play the standby video
    standbyVideo.play().catch(() => {});

    // Swap references
    const temp = activeVideo;
    activeVideo = standbyVideo;
    standbyVideo = temp;

    // Preload the clip after next into the new standby
    preloadNext(currentClip + 1);

    // Re-attach ended listener to the new active video
    activeVideo.addEventListener('ended', onClipEnded);
  }

  // ── Clip boundary handler ──
  function onClipEnded() {
    if (dismissed) return;

    // Remove listener from current video to avoid duplicate calls
    activeVideo.removeEventListener('ended', onClipEnded);

    if (tilesReady) {
      // Tiles are loaded — dismiss now (at clip boundary)
      dismissSplash();
    } else if (currentClip < clips.length - 1) {
      // More clips available — cross-fade to next (already preloaded)
      currentClip++;
      crossFadeToNext();
    } else {
      // Last clip — loop it until tiles are ready
      activeVideo.currentTime = 0;
      activeVideo.play().catch(() => {});
      activeVideo.addEventListener('ended', onClipEnded);
    }
  }

  // Attach initial ended listener
  videoA.addEventListener('ended', onClipEnded);

  // ── Cesium readiness signal ──
  // cesium-main.js dispatches this when tile loading has settled.
  window.addEventListener('cesiumReady', () => {
    tilesReady = true;
    // The periodic readiness check (every 500 ms) will notice this and
    // dismiss the splash immediately, even if the current clip is still
    // playing, so the user reaches the 3D Aerial page as soon as possible.
  });

  // ── Periodic readiness check ──
  // Check at a constant time step whether Cesium tiles are ready.
  // If they are, dismiss the splash immediately (even mid-clip) so the
  // user reaches the 3D Aerial page as soon as possible.
  const CHECK_INTERVAL = 500; // ms
  const readyCheckTimer = setInterval(() => {
    if (tilesReady) {
      clearInterval(readyCheckTimer);
      // Pause the active video before fading out to free resources.
      activeVideo.pause();
      dismissSplash();
    }
  }, CHECK_INTERVAL);

  // ── Timeout fallback: dismiss after 60 seconds regardless ──
  setTimeout(() => {
    clearInterval(readyCheckTimer);
    dismissSplash();
  }, 60000);
})();
