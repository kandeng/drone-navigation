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

  // ── Splash media config ──
  // The first clip is always played. Remaining clips are shuffled and played
  // without repetition; once all have played, a new shuffle begins.
  const FIRST_CLIP = '/splash/video_00.mp4';
  const OTHER_CLIPS = [
    '/splash/vantor_world3d.mp4',
    '/splash/kevtoe_worldview.mp4',
  ];
  const MUSIC_URL = '/splash/background_music_00.mp3';
  const SETTINGS_KEY = 'app-settings';

  function loadAudioVolume() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const vol = Number(parsed.audioVolume);
        if (!isNaN(vol)) return Math.max(0, Math.min(1, vol));
      }
    } catch {
      // ignore
    }
    return 0.9;
  }

  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function buildPlaylist() {
    return [FIRST_CLIP, ...shuffleArray(OTHER_CLIPS)];
  }

  let playlist = buildPlaylist();
  let currentClip = 0;

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

  // ── Background music (loops continuously) ──
  const bgMusic = new Audio(MUSIC_URL);
  bgMusic.loop = true;
  bgMusic.volume = loadAudioVolume();
  bgMusic.play().catch(() => {
    // Browsers may block autoplay until user interaction.
    // The music will start once the user clicks or taps anywhere.
    const startMusic = () => {
      bgMusic.play().catch(() => {});
      document.removeEventListener('click', startMusic);
      document.removeEventListener('touchstart', startMusic);
    };
    document.addEventListener('click', startMusic);
    document.addEventListener('touchstart', startMusic);
  });

  /**
   * Fade out background music over the given duration (ms).
   */
  function fadeOutMusic(duration = 2000) {
    const startVolume = bgMusic.volume || loadAudioVolume();
    const startTime = performance.now();
    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      bgMusic.volume = Math.max(0, startVolume * (1 - progress));
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        bgMusic.pause();
        bgMusic.currentTime = 0;
      }
    }
    requestAnimationFrame(step);
  }

  /**
   * Preload the next clip into the standby video element.
   * This starts buffering so the switch is instant.
   */
  function logVideoState(label, video) {
    console.log(
      `[splash] ${label}: src=${video.src?.split('/').pop()}, readyState=${video.readyState}, currentTime=${video.currentTime.toFixed(2)}, paused=${video.paused}, ended=${video.ended}`
    );
  }

  function preloadNext(clipIndex) {
    if (clipIndex < playlist.length) {
      console.log('[splash] preloading clip', clipIndex, playlist[clipIndex]);
      // Fully reset the standby element before loading the next clip,
      // so any stale ended/seek state from the previous clip is cleared.
      standbyVideo.pause();
      standbyVideo.removeAttribute('src');
      standbyVideo.load();
      standbyVideo.src = playlist[clipIndex];
      standbyVideo.load();
      standbyVideo.addEventListener(
        'loadedmetadata',
        function onMeta() {
          standbyVideo.currentTime = 0;
          logVideoState('preload metadata', standbyVideo);
          standbyVideo.removeEventListener('loadedmetadata', onMeta);
        },
        { once: true }
      );
      standbyVideo.addEventListener(
        'canplaythrough',
        function onCanPlayThrough() {
          logVideoState('preload canplaythrough', standbyVideo);
          standbyVideo.removeEventListener('canplaythrough', onCanPlayThrough);
        },
        { once: true }
      );
      standbyVideo.addEventListener(
        'error',
        function onErr(e) {
          console.error('[splash] preload error for', playlist[clipIndex], e);
          standbyVideo.removeEventListener('error', onErr);
        },
        { once: true }
      );
    }
  }

  // ── Start the first clip and preload the second ──
  videoA.src = playlist[0];
  videoA.play().catch(() => {});
  preloadNext(1); // Start buffering clip 2

  /**
   * Dismiss the splash overlay with a fade-out transition.
   * Safe to call multiple times; only the first call takes effect.
   */
  function dismissSplash() {
    if (dismissed) return;
    dismissed = true;
    fadeOutMusic(2000); // Gradually mute music over 2 seconds
    overlay.classList.add('splash-fade-out');
    overlay.addEventListener('transitionend', () => {
      overlay.remove();
    });
  }

  function logEvent(name, video, detail) {
    console.log(
      `[splash] event ${name} on ${video.src?.split('/').pop()}`,
      `readyState=${video.readyState}`,
      `currentTime=${video.currentTime.toFixed(2)}`,
      detail || ''
    );
  }

  function onTimeUpdate(e) {
    const video = e.target;
    const remaining = video.duration - video.currentTime;
    // Log near-end and once per 2 seconds to show progress.
    if (!isNaN(remaining) && remaining < 0.5) {
      console.log(
        `[splash] near end: ${video.src?.split('/').pop()} currentTime=${video.currentTime.toFixed(2)} duration=${video.duration?.toFixed(2)} remaining=${remaining.toFixed(2)}`
      );
    } else if (Math.floor(video.currentTime) % 2 === 0) {
      if (video.lastLoggedSecond !== Math.floor(video.currentTime)) {
        video.lastLoggedSecond = Math.floor(video.currentTime);
        console.log(
          `[splash] progress: ${video.src?.split('/').pop()} currentTime=${video.currentTime.toFixed(2)} duration=${video.duration?.toFixed(2)}`
        );
      }
    }
  }

  function onWaiting(e) { logEvent('waiting', e.target); }
  function onStalled(e) { logEvent('stalled', e.target); }
  function onSuspend(e) { logEvent('suspend', e.target); }
  function onError(e) { logEvent('error', e.target, e); }

  function attachActiveListeners(video) {
    video.addEventListener('ended', onClipEnded);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onStalled);
    video.addEventListener('suspend', onSuspend);
    video.addEventListener('error', onError);
  }

  function detachActiveListeners(video) {
    video.removeEventListener('ended', onClipEnded);
    video.removeEventListener('timeupdate', onTimeUpdate);
    video.removeEventListener('waiting', onWaiting);
    video.removeEventListener('stalled', onStalled);
    video.removeEventListener('suspend', onSuspend);
    video.removeEventListener('error', onError);
  }

  /**
   * Cross-fade from active video to standby video (which has next clip ready).
   */
  function crossFadeToNext() {
    logVideoState('crossfade standby', standbyVideo);

    function doFade() {
      // Ensure the next clip always starts from the very beginning.
      standbyVideo.currentTime = 0;

      // Swap visibility
      activeVideo.style.transition = 'opacity 0.4s ease';
      standbyVideo.style.transition = 'opacity 0.4s ease';
      activeVideo.style.opacity = '0';
      standbyVideo.style.opacity = '1';

      // Play the standby video
      console.log('[splash] playing standby clip', standbyVideo.src?.split('/').pop());
      const playPromise = standbyVideo.play();
      if (playPromise) {
        playPromise.catch((err) => {
          console.error('[splash] standby play failed:', err);
        });
      }

      // Swap references so activeVideo points to the clip we just started playing.
      const temp = activeVideo;
      activeVideo = standbyVideo;
      standbyVideo = temp;

      // Attach listeners to the new active video.
      attachActiveListeners(activeVideo);

      // Preload the clip after next into the new standby
      preloadNext(currentClip + 1);

      if (playPromise) {
        playPromise.then(() => {
          console.log('[splash] standby play started');
        });
      }
    }

    // Wait until the standby clip is ready to play without stalling.
    if (standbyVideo.readyState >= 3) {
      doFade();
    } else {
      console.log('[splash] waiting for standby canplay...');
      standbyVideo.addEventListener(
        'canplay',
        function onCanPlay() {
          standbyVideo.removeEventListener('canplay', onCanPlay);
          doFade();
        },
        { once: true }
      );
      // Safety timeout: fade anyway after 3s so we don't hang forever.
      setTimeout(() => {
        if (standbyVideo.readyState < 3) {
          console.warn('[splash] standby canplay timeout, fading anyway');
          doFade();
        }
      }, 3000);
    }
  }

  // ── Clip boundary handler ──
  function onClipEnded(e) {
    if (dismissed) return;
    const video = e.target;
    console.log('[splash] clip ended. currentClip=', currentClip, 'playlist length=', playlist.length);
    logVideoState('active ended', activeVideo);

    // Remove listeners from current video to avoid duplicate calls
    detachActiveListeners(video);

    if (tilesReady) {
      // Tiles are loaded — dismiss now (at clip boundary)
      dismissSplash();
    } else if (currentClip < playlist.length - 1) {
      // More clips available — cross-fade to next (already preloaded)
      currentClip++;
      crossFadeToNext();
    } else {
      // End of playlist — build a new shuffle (always starting with FIRST_CLIP)
      playlist = buildPlaylist();
      currentClip = 1; // Skip FIRST_CLIP; it already played
      preloadNext(currentClip);
      crossFadeToNext();
    }
  }

  // Attach initial active-video listeners
  attachActiveListeners(videoA);

  // Heartbeat log so we can see the active video state even if events stall.
  setInterval(() => {
    if (!dismissed) {
      logVideoState('heartbeat', activeVideo);
    }
  }, 2000);

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
