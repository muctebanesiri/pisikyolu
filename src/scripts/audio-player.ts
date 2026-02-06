// audio-player.ts - Enhanced Version
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('audio-player-container');
  if (!container) {
    console.error('Audio player container not found');
    return;
  }

  // ============== DOM ELEMENTS ==============
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

  // Validate essential elements
  if (!audioElement || !playPauseBtn) {
    console.error('Essential audio player elements not found');
    return;
  }

  // ============== STATE MANAGEMENT ==============
  interface PlayerState {
    isPlaying: boolean;
    isMuted: boolean;
    volume: number;
    playbackRate: number;
    isSeeking: boolean;
    lastVolume: number;
  }

  const state: PlayerState = {
    isPlaying: false,
    isMuted: false,
    volume: parseInt(volumeSlider?.value || '50') / 100,
    playbackRate: 1,
    isSeeking: false,
    lastVolume: 0.5 // Default fallback volume
  };

  // Constants
  const SEEK_JUMP = 10; // seconds for j/k keys
  const VOLUME_JUMP = 0.05; // 5% volume change
  const SUPPORTED_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const FEEDBACK_DURATION = 1500; // ms

  // ============== SPEED CONTROL ==============
  function createSpeedControl(): HTMLElement {
    const speedContainer = document.createElement('div');
    speedContainer.className = 'relative group';
    speedContainer.innerHTML = `
      <button id="speed-button" 
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-his-green/10 text-his-green transition-all duration-200 hover:bg-his-green/20 hover:opacity-80 focus:outline-none text-xs font-medium"
              aria-label="Playback Speed"
              title="Playback Speed"
              aria-haspopup="true"
              aria-expanded="false">
        1x
      </button>
      <div id="speed-menu" 
           class="absolute hidden group-hover:block hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 w-28 bg-his-hover/95 backdrop-blur-sm border border-his-text-tertiary/50 rounded-lg shadow-lg z-50"
           role="menu">
        <div class="py-1">
          ${SUPPORTED_SPEEDS.map(speed => `
            <button class="speed-option w-full text-left px-3 py-2 text-sm text-his-text hover:bg-his-green/20 transition-colors ${speed === 1 ? 'bg-his-green/30 text-his-green' : ''}"
                    data-speed="${speed}"
                    role="menuitemradio"
                    aria-checked="${speed === 1}"
                    tabindex="-1">
              ${speed}x
            </button>
          `).join('')}
        </div>
      </div>
    `;
    return speedContainer;
  }

  // Insert speed control before shortcuts button
  if (shortcutsBtn && shortcutsBtn.parentNode) {
    const speedControl = createSpeedControl();
    shortcutsBtn.parentNode.insertBefore(speedControl, shortcutsBtn);
  }

  const speedButton = document.getElementById('speed-button');
  const speedMenu = document.getElementById('speed-menu');

  // ============== UTILITY FUNCTIONS ==============
  function formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function debounce<T extends (...args: any[]) => void>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  }

  // ============== PLAYER FUNCTIONS ==============
  function updateProgress() {
    if (!audioElement || state.isSeeking) return;
    
    const currentTime = audioElement.currentTime;
    const duration = audioElement.duration || 0;
    const progressPercent = duration ? (currentTime / duration) * 100 : 0;

    if (currentTimeEl) {
      currentTimeEl.textContent = formatTime(currentTime);
      currentTimeEl.setAttribute('datetime', `PT${currentTime}S`);
    }
    
    if (progressBar) {
      progressBar.style.width = `${progressPercent}%`;
      progressBar.setAttribute('aria-valuenow', progressPercent.toString());
    }
    
    if (seekSlider) {
      seekSlider.value = progressPercent.toString();
    }
  }

  function updateDuration() {
    if (!audioElement || !durationEl) return;
    
    const duration = audioElement.duration;
    if (!isNaN(duration) && isFinite(duration)) {
      durationEl.textContent = formatTime(duration);
      durationEl.setAttribute('datetime', `PT${duration}S`);
      
      if (seekSlider) {
        seekSlider.disabled = false;
        seekSlider.setAttribute('aria-valuemax', duration.toString());
      }
    }
  }

  function togglePlayPause() {
    if (!audioElement) return;
    
    try {
      if (audioElement.paused) {
        audioElement.play().catch(error => {
          console.error('Playback failed:', error);
          showFeedback('Playback failed', 'error');
        });
      } else {
        audioElement.pause();
      }
      updatePlayPauseIcon();
    } catch (error) {
      console.error('Playback error:', error);
    }
  }

  function updatePlayPauseIcon() {
    if (!audioElement || !playIcon || !pauseIcon) return;
    
    const isPlaying = !audioElement.paused;
    state.isPlaying = isPlaying;
    
    playIcon.classList.toggle('hidden', !audioElement.paused);
    pauseIcon.classList.toggle('hidden', audioElement.paused);
    
    // Update ARIA label
    playPauseBtn?.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  }

  function showFeedback(message: string, type: 'info' | 'error' = 'info') {
    if (!feedbackEl || !feedbackText) return;
    
    feedbackText.textContent = message;
    feedbackEl.className = `absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg backdrop-blur-sm transition-opacity duration-300 ${type === 'error' ? 'bg-red-500/20 text-red-300' : 'bg-his-hover/90 text-his-text'}`;
    feedbackEl.style.opacity = '1';
    
    // Clear any existing timeout
    const existingTimeout = feedbackEl.dataset.timeout;
    if (existingTimeout) clearTimeout(parseInt(existingTimeout));
    
    const timeoutId = setTimeout(() => {
      feedbackEl.style.opacity = '0';
    }, FEEDBACK_DURATION);
    
    feedbackEl.dataset.timeout = timeoutId.toString();
  }

  function setPlaybackSpeed(speed: number) {
    if (!audioElement || !SUPPORTED_SPEEDS.includes(speed)) return;
    
    audioElement.playbackRate = speed;
    state.playbackRate = speed;
    
    if (speedButton) {
      speedButton.textContent = `${speed}x`;
      speedButton.setAttribute('aria-label', `Playback speed: ${speed}x`);
    }
    
    // Update active state in menu
    document.querySelectorAll('.speed-option').forEach(option => {
      const optionSpeed = parseFloat(option.getAttribute('data-speed') || '1');
      const isActive = optionSpeed === speed;
      
      option.classList.toggle('bg-his-green/30', isActive);
      option.classList.toggle('text-his-green', isActive);
      option.setAttribute('aria-checked', isActive.toString());
    });
    
    showFeedback(`Speed: ${speed}x`);
    
    // Close menu
    if (speedMenu) {
      speedMenu.classList.add('hidden');
      speedButton?.setAttribute('aria-expanded', 'false');
    }
  }

  function updateVolumeSliderBackground() {
    if (!volumeSlider) return;
    const value = volumeSlider.value;
    volumeSlider.style.background = `linear-gradient(to right, rgba(255, 255, 255, 0.4) ${value}%, rgba(255, 255, 255, 0.2) ${value}%)`;
  }

  function updateVolume(volume: number) {
    if (!audioElement) return;
    
    const clampedVolume = Math.max(0, Math.min(1, volume));
    audioElement.volume = clampedVolume;
    state.volume = clampedVolume;
    
    // Update mute state if volume is 0
    const isMuted = clampedVolume === 0;
    audioElement.muted = isMuted;
    state.isMuted = isMuted;
    
    // Update UI
    if (volumeIcon && muteIcon) {
      volumeIcon.classList.toggle('hidden', isMuted);
      muteIcon.classList.toggle('hidden', !isMuted);
    }
    
    if (volumeSlider) {
      volumeSlider.value = (clampedVolume * 100).toString();
      updateVolumeSliderBackground();
    }
    
    volumeBtn?.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
  }

  // ============== EVENT LISTENERS ==============
  // Play/Pause
  playPauseBtn?.addEventListener('click', togglePlayPause);
  audioElement?.addEventListener('play', updatePlayPauseIcon);
  audioElement?.addEventListener('pause', updatePlayPauseIcon);
  audioElement?.addEventListener('timeupdate', updateProgress);
  audioElement?.addEventListener('loadedmetadata', updateDuration);
  audioElement?.addEventListener('ended', () => {
    showFeedback('Playback completed');
    updatePlayPauseIcon();
  });

  // Buffering indicator
  audioElement?.addEventListener('waiting', () => {
    showFeedback('Buffering...');
  });

  audioElement?.addEventListener('canplay', () => {
    // Hide buffering message
    if (feedbackEl && feedbackText?.textContent === 'Buffering...') {
      feedbackEl.style.opacity = '0';
    }
  });

  // Error handling
  audioElement?.addEventListener('error', (e) => {
    console.error('Audio error:', audioElement.error);
    showFeedback('Failed to load audio', 'error');
  });

  // Seeking
  seekSlider?.addEventListener('input', debounce(() => {
    if (!audioElement) return;
    state.isSeeking = true;
    const value = parseFloat(seekSlider.value);
    const duration = audioElement.duration || 0;
    const currentTime = (value / 100) * duration;
    
    if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
    if (progressBar) progressBar.style.width = `${value}%`;
  }, 100));

  seekSlider?.addEventListener('change', () => {
    if (!audioElement) return;
    const value = parseFloat(seekSlider.value);
    const duration = audioElement.duration || 0;
    audioElement.currentTime = (value / 100) * duration;
    state.isSeeking = false;
    showFeedback(`Jumped to ${formatTime(audioElement.currentTime)}`);
  });

  // Volume
  volumeBtn?.addEventListener('click', () => {
    if (!audioElement) return;
    
    if (state.isMuted) {
      // Unmute and restore to last volume
      updateVolume(state.lastVolume || 0.5);
    } else {
      // Mute and store current volume
      state.lastVolume = audioElement.volume;
      updateVolume(0);
    }
    state.isMuted = !state.isMuted;
  });

  volumeSlider?.addEventListener('input', () => {
    const volume = parseInt(volumeSlider.value) / 100;
    updateVolume(volume);
  });

  // Speed Control
  speedButton?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (speedMenu) {
      const isExpanded = speedMenu.classList.toggle('hidden');
      speedButton.setAttribute('aria-expanded', (!isExpanded).toString());
    }
  });

  // Event delegation for speed options
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    
    // Speed options
    if (target.classList.contains('speed-option')) {
      const speed = parseFloat(target.dataset.speed || '1');
      setPlaybackSpeed(speed);
      return;
    }
    
    // Close speed menu when clicking elsewhere
    if (speedMenu && !speedMenu.contains(target) && !speedButton?.contains(target)) {
      speedMenu.classList.add('hidden');
      speedButton?.setAttribute('aria-expanded', 'false');
    }
  });

  // Shortcuts Dialog
  shortcutsBtn?.addEventListener('click', () => {
    if (shortcutsDialog) {
      shortcutsDialog.classList.remove('hidden');
      shortcutsDialog.setAttribute('aria-hidden', 'false');
    }
  });

  closeShortcutsBtn?.addEventListener('click', () => {
    if (shortcutsDialog) {
      shortcutsDialog.classList.add('hidden');
      shortcutsDialog.setAttribute('aria-hidden', 'true');
    }
  });

  shortcutsDialog?.addEventListener('click', (e) => {
    if (e.target === shortcutsDialog) {
      shortcutsDialog.classList.add('hidden');
      shortcutsDialog.setAttribute('aria-hidden', 'true');
    }
  });

  // Close dialog with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && shortcutsDialog && !shortcutsDialog.classList.contains('hidden')) {
      shortcutsDialog.classList.add('hidden');
      shortcutsDialog.setAttribute('aria-hidden', 'true');
    }
  });

  // ============== KEYBOARD SHORTCUTS ==============
  document.addEventListener('keydown', (e) => {
    // Ignore if user is typing in an input/textarea/contenteditable
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable ||
        (target.closest('[role="textbox"]'))) {
      return;
    }

    // Only handle shortcuts if player is focused or document has focus
    if (!document.hasFocus()) return;

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
          audioElement.currentTime = Math.min(audioElement.duration || 0, audioElement.currentTime + SEEK_JUMP);
          showFeedback(`+${SEEK_JUMP}s (${formatTime(audioElement.currentTime)})`);
        }
        break;
        
      case 'l': // L - Toggle speed menu
        e.preventDefault();
        speedButton?.click();
        break;
        
      case 'arrowup': // Volume Up
        e.preventDefault();
        if (audioElement && volumeSlider) {
          const newVolume = Math.min(1, audioElement.volume + VOLUME_JUMP);
          updateVolume(newVolume);
          showFeedback(`Volume: ${Math.round(newVolume * 100)}%`);
        }
        break;
        
      case 'arrowdown': // Volume Down
        e.preventDefault();
        if (audioElement && volumeSlider) {
          const newVolume = Math.max(0, audioElement.volume - VOLUME_JUMP);
          updateVolume(newVolume);
          showFeedback(`Volume: ${Math.round(newVolume * 100)}%`);
        }
        break;
        
      case 'home': // Home - Go to start
        e.preventDefault();
        if (audioElement) {
          audioElement.currentTime = 0;
          showFeedback('Start');
        }
        break;
        
      case 'end': // End - Go to end
        e.preventDefault();
        if (audioElement && !isNaN(audioElement.duration)) {
          audioElement.currentTime = audioElement.duration;
          showFeedback('End');
        }
        break;
    }
  });

  // ============== INITIALIZATION ==============
  function initialize() {
    // Load audio source
    const audioSrc = container.dataset.src;
    if (audioSrc && audioElement) {
      audioElement.src = audioSrc;
      audioElement.load(); // Load the audio file
    }

    // Set initial volume
    updateVolume(state.volume);
    
    // Initialize duration display
    if (audioElement.readyState >= 1) {
      updateDuration();
    }
    
    // Initialize progress bar
    updateProgress();
    
    // Initialize play/pause icon
    updatePlayPauseIcon();
    
    // Initialize volume slider background
    updateVolumeSliderBackground();
  }

  // Start initialization
  initialize();

  // Export player instance for external control if needed
  (window as any).audioPlayer = {
    play: () => audioElement?.play(),
    pause: () => audioElement?.pause(),
    setSpeed: setPlaybackSpeed,
    seekTo: (time: number) => {
      if (audioElement) audioElement.currentTime = time;
    }
  };
});