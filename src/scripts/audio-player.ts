// audio-player.ts - Enhanced Version
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('audio-player-container');
  if (!container) return;

  // Core Elements
  const audioElement = document.getElementById('audio-element') as HTMLAudioElement;
  const playPauseBtn = document.getElementById('play-pause');
  const playIcon = document.getElementById('play-icon');
  const pauseIcon = document.getElementById('pause-icon');
  const currentTimeEl = document.getElementById('current-time');
  const durationEl = document.getElementById('duration');
  const progressBar = document.getElementById('progress-bar');
  const seekSlider = document.getElementById('seek-slider') as HTMLInputElement;
  const volumeBtn = document.getElementById('mute-button');
  const volumeIcon = document.getElementById('volume-icon');
  const muteIcon = document.getElementById('mute-icon');
  const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
  const shortcutsBtn = document.getElementById('shortcuts-button');
  const shortcutsDialog = document.getElementById('shortcuts-dialog');
  const closeShortcutsBtn = document.getElementById('close-shortcuts');
  const feedbackEl = document.getElementById('player-feedback');
  const feedbackText = document.getElementById('feedback-text');

  // New Elements for Speed Control
  const speedControlHtml = `
    <div class="relative group">
      <button id="speed-button" class="flex h-8 w-8 items-center justify-center rounded-lg bg-his-green/10 text-his-green transition-all duration-200 hover:bg-his-green/20 hover:opacity-80 focus:outline-none text-xs font-medium" aria-label="Playback Speed" title="Playback Speed">
        1x
      </button>
      <div id="speed-menu" class="absolute hidden group-hover:block hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 w-28 bg-his-hover/95 backdrop-blur-sm border border-his-text-tertiary/50 rounded-lg shadow-lg z-50">
        <div class="py-1">
          ${[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => `
            <button class="speed-option w-full text-left px-3 py-2 text-sm text-his-text hover:bg-his-green/20 transition-colors ${speed === 1 ? 'bg-his-green/30 text-his-green' : ''}" data-speed="${speed}">
              ${speed}x
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Insert speed control before the shortcuts button
  if (shortcutsBtn && shortcutsBtn.parentNode) {
    shortcutsBtn.insertAdjacentHTML('beforebegin', speedControlHtml);
  }
  const speedButton = document.getElementById('speed-button');
  const speedMenu = document.getElementById('speed-menu');

  // State
  let isSeeking = false;
  const SEEK_JUMP = 10; // seconds for j/k keys
  const VOLUME_JUMP = 0.05; // 5% volume change for up/down arrows

  // Initialize Audio
  const audioSrc = container?.dataset.src;
  if (audioSrc && audioElement) {
    audioElement.src = audioSrc;
    audioElement.volume = parseInt(volumeSlider?.value || '50') / 100;
  }

  // --- CORE PLAYBACK FUNCTIONS ---
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function updateProgress() {
    if (!audioElement || isSeeking) return;
    const currentTime = audioElement.currentTime;
    const duration = audioElement.duration || 0;
    const progressPercent = duration ? (currentTime / duration) * 100 : 0;

    if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
    if (progressBar) progressBar.style.width = `${progressPercent}%`;
    if (seekSlider) seekSlider.value = progressPercent.toString();
  }

  function updateDuration() {
    if (audioElement && durationEl) {
      durationEl.textContent = formatTime(audioElement.duration || 0);
      seekSlider.disabled = !audioElement.duration;
    }
  }

  function togglePlayPause() {
    if (!audioElement) return;
    if (audioElement.paused) {
      audioElement.play();
    } else {
      audioElement.paused;
    }
    updatePlayPauseIcon();
  }

  function updatePlayPauseIcon() {
    if (!audioElement || !playIcon || !pauseIcon) return;
    if (audioElement.paused) {
      playIcon.classList.remove('hidden');
      pauseIcon.classList.add('hidden');
    } else {
      playIcon.classList.add('hidden');
      pauseIcon.classList.remove('hidden');
    }
  }

  function showFeedback(message: string) {
    if (!feedbackEl || !feedbackText) return;
    feedbackText.textContent = message;
    feedbackEl.style.opacity = '1';
    setTimeout(() => {
      feedbackEl.style.opacity = '0';
    }, 1500);
  }

  // --- EVENT LISTENERS ---
  // Play/Pause
  playPauseBtn?.addEventListener('click', togglePlayPause);
  audioElement?.addEventListener('play', updatePlayPauseIcon);
  audioElement?.addEventListener('pause', updatePlayPauseIcon);
  audioElement?.addEventListener('timeupdate', updateProgress);
  audioElement?.addEventListener('loadedmetadata', updateDuration);

  // Seeking
  seekSlider?.addEventListener('input', () => {
    if (!audioElement) return;
    isSeeking = true;
    const value = parseFloat(seekSlider.value);
    const duration = audioElement.duration || 0;
    const currentTime = (value / 100) * duration;
    if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
    if (progressBar) progressBar.style.width = `${value}%`;
  });

  seekSlider?.addEventListener('change', () => {
    if (!audioElement) return;
    const value = parseFloat(seekSlider.value);
    const duration = audioElement.duration || 0;
    audioElement.currentTime = (value / 100) * duration;
    isSeeking = false;
    showFeedback(`Jumped to ${formatTime(audioElement.currentTime)}`);
  });

  // Volume
  volumeBtn?.addEventListener('click', () => {
    if (!audioElement || !volumeIcon || !muteIcon) return;
    audioElement.muted = !audioElement.muted;
    volumeIcon.classList.toggle('hidden', audioElement.muted);
    muteIcon.classList.toggle('hidden', !audioElement.muted);
    showFeedback(audioElement.muted ? 'Muted' : 'Unmuted');
  });

  volumeSlider?.addEventListener('input', () => {
    if (!audioElement) return;
    const volume = parseInt(volumeSlider.value) / 100;
    audioElement.volume = volume;
    audioElement.muted = volume === 0;
    if (volumeIcon && muteIcon) {
      volumeIcon.classList.toggle('hidden', volume === 0);
      muteIcon.classList.toggle('hidden', volume !== 0);
    }
    // Update slider background
    volumeSlider.style.background = `linear-gradient(to right, rgba(255, 255, 255, 0.4) ${volumeSlider.value}%, rgba(255, 255, 255, 0.2) ${volumeSlider.value}%)`;
  });

  // Speed Control
  document.querySelectorAll('.speed-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const speed = parseFloat((e.target as HTMLElement).dataset.speed || '1');
      if (audioElement) {
        audioElement.playbackRate = speed;
        if (speedButton) speedButton.textContent = `${speed}x`;
        // Update active state
        document.querySelectorAll('.speed-option').forEach(opt => {
          opt.classList.toggle('bg-his-green/30', parseFloat((opt as HTMLElement).dataset.speed || '0') === speed);
          opt.classList.toggle('text-his-green', parseFloat((opt as HTMLElement).dataset.speed || '0') === speed);
        });
        showFeedback(`Speed: ${speed}x`);
        if (speedMenu) speedMenu.classList.add('hidden');
      }
    });
  });

  // Close speed menu when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (speedMenu && !(e.target as Element).closest('#speed-button, #speed-menu')) {
      speedMenu.classList.add('hidden');
    }
  });

  // Shortcuts Dialog
  shortcutsBtn?.addEventListener('click', () => {
    if (shortcutsDialog) shortcutsDialog.classList.remove('hidden');
  });
  closeShortcutsBtn?.addEventListener('click', () => {
    if (shortcutsDialog) shortcutsDialog.classList.add('hidden');
  });
  shortcutsDialog?.addEventListener('click', (e) => {
    if (e.target === shortcutsDialog) {
      shortcutsDialog.classList.add('hidden');
    }
  });

  // --- KEYBOARD SHORTCUTS (GLOBAL) ---
  document.addEventListener('keydown', (e) => {
    // Ignore shortcuts if user is typing in an input/textarea
    if ((e.target as Element).tagName === 'INPUT' || (e.target as Element).tagName === 'TEXTAREA') return;

    switch (e.key.toLowerCase()) {
      case ' ': // Spacebar - Play/Pause
        e.preventDefault();
        togglePlayPause();
        showFeedback(audioElement?.paused ? 'Paused' : 'Playing');
        break;
      case 'm': // M - Mute/Unmute
        e.preventDefault();
        volumeBtn?.click();
        break;
      case 'j': // J - Back 10 seconds
        e.preventDefault();
        if (audioElement) {
          audioElement.currentTime = Math.max(0, audioElement.currentTime - SEEK_JUMP);
          showFeedback(`-${SEEK_JUMP}s (${formatTime(audioElement.currentTime)})`);
        }
        break;
      case 'k': // K - Forward 10 seconds
        e.preventDefault();
        if (audioElement) {
          audioElement.currentTime = Math.min(audioElement.duration, audioElement.currentTime + SEEK_JUMP);
          showFeedback(`+${SEEK_JUMP}s (${formatTime(audioElement.currentTime)})`);
        }
        break;
      case 'l': // L - Toggle speed menu (new)
        e.preventDefault();
        if (speedMenu) {
          speedMenu.classList.toggle('hidden');
          showFeedback(speedMenu.classList.contains('hidden') ? 'Speed menu closed' : 'Speed menu open');
        }
        break;
      case 'arrowup': // Volume Up
        e.preventDefault();
        if (audioElement && volumeSlider) {
          let newVolume = Math.min(100, Math.round((audioElement.volume + VOLUME_JUMP) * 100));
          volumeSlider.value = newVolume.toString();
          volumeSlider.dispatchEvent(new Event('input'));
          showFeedback(`Volume: ${newVolume}%`);
        }
        break;
      case 'arrowdown': // Volume Down
        e.preventDefault();
        if (audioElement && volumeSlider) {
          let newVolume = Math.max(0, Math.round((audioElement.volume - VOLUME_JUMP) * 100));
          volumeSlider.value = newVolume.toString();
          volumeSlider.dispatchEvent(new Event('input'));
          showFeedback(`Volume: ${newVolume}%`);
        }
        break;
    }
  });

  // Initialize
  updateDuration();
  updatePlayPauseIcon();
  if (volumeSlider) {
    volumeSlider.dispatchEvent(new Event('input'));
  }
});