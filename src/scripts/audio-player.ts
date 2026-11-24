/**
 * Lazy native audio playback for every episode.
 * Audio owns timestamps in Read view; video owns them in Watch view.
 */

import { parseTimeHash, timeHashTarget } from "./time-hash";
import { passageSeconds, passageSelector } from "../lib/passage";

interface MessagePoint {
    time: number;
    el: HTMLElement;
}

let audio: HTMLAudioElement | null = null;
let playPauseButton: HTMLButtonElement | null = null;
let seekSlider: HTMLInputElement | null = null;
let currentTimeDisplay: HTMLElement | null = null;
let durationDisplay: HTMLElement | null = null;
let progressBar: HTMLElement | null = null;
let playIcon: HTMLElement | null = null;
let pauseIcon: HTMLElement | null = null;
let muteButton: HTMLElement | null = null;
let volumeIcon: HTMLElement | null = null;
let muteIcon: HTMLElement | null = null;
let volumeSlider: HTMLInputElement | null = null;
let playerFeedback: HTMLElement | null = null;
let feedbackText: HTMLElement | null = null;
let messagePoints: MessagePoint[] = [];
let messagePointsReady = false;
let feedbackTimeout: ReturnType<typeof setTimeout> | null = null;
let lastHighlightedMessage: HTMLElement | null = null;
let isLoaded = false;
let pendingTime = 0;
let src = "";

function isWatchView(): boolean {
    return document.getElementById("episode-shell")?.dataset.videoMode === "watch";
}

function enterReadView() {
    if (isWatchView()) {
        document.dispatchEvent(new CustomEvent("his:audio-intent"));
    }
}

function ensureMessagePoints() {
    if (messagePointsReady) return;
    messagePoints = Array.from(document.querySelectorAll<HTMLElement>(".message[id]"))
        .map((message) => ({
            time: passageSeconds(message.id) ?? NaN,
            el: message,
        }))
        .filter(({ time }) => !Number.isNaN(time))
        .sort((a, b) => a.time - b.time);
    messagePointsReady = true;
}

function formatTime(seconds: number) {
    if (!seconds || Number.isNaN(seconds)) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function findMessageIndex(seconds: number): number {
    let low = 0;
    let high = messagePoints.length - 1;
    let best = -1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (messagePoints[mid].time <= seconds) {
            best = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return best;
}

function highlightTime(seconds: number) {
    ensureMessagePoints();
    const currentIndex = findMessageIndex(Math.floor(seconds));
    const currentMessage = currentIndex >= 0 ? messagePoints[currentIndex].el : null;

    if (currentMessage === lastHighlightedMessage) return;
    lastHighlightedMessage?.classList.remove("message-current");
    currentMessage?.classList.add("message-current");
    lastHighlightedMessage = currentMessage;
    scheduleFollow();
}

let followFrame = 0;

function updateFollow() {
    followFrame = 0;
    const shell = document.getElementById("episode-shell");
    const container = document.getElementById("episode-scroll-container");
    if (!shell || !container) return;
    if (!lastHighlightedMessage) {
        delete shell.dataset.follow;
        return;
    }
    const message = lastHighlightedMessage.getBoundingClientRect(), view = container.getBoundingClientRect();
    shell.dataset.follow = message.bottom < view.top ? "above" : message.top > view.bottom ? "below" : "here";
}

function scheduleFollow() {
    followFrame ||= requestAnimationFrame(updateFollow);
}

function setPlaying(playing: boolean) {
    const shell = document.getElementById("episode-shell");
    if (!shell) return;
    if (playing) shell.dataset.playback = "playing";
    else delete shell.dataset.playback;
    scheduleFollow();
}

function updateTimeDisplay() {
    if (!audio || !audio.duration || !currentTimeDisplay || !durationDisplay || !seekSlider || !progressBar) return;

    currentTimeDisplay.textContent = formatTime(audio.currentTime);
    durationDisplay.textContent = formatTime(audio.duration);
    const percent = (audio.currentTime / audio.duration) * 100;
    seekSlider.value = String(percent);
    seekSlider.setAttribute(
        "aria-valuetext",
        `${formatTime(audio.currentTime)} of ${formatTime(audio.duration)}`,
    );
    progressBar.style.width = `calc(${percent}% + ${6 - percent * 0.12}px)`;
    highlightTime(audio.currentTime);
}

function setPlaybackUi(isPaused: boolean) {
    playIcon?.classList.toggle("hidden", !isPaused);
    pauseIcon?.classList.toggle("hidden", isPaused);
    const position = isLoaded && audio ? audio.currentTime : pendingTime;
    const playLabel = document.getElementById("play-label");
    if (playLabel) playLabel.textContent = position > 0 ? formatTime(position) : "";
    playPauseButton?.setAttribute("aria-label", isPaused
        ? (position > 0 ? `Play from ${formatTime(position)}` : "Play episode")
        : "Pause episode");
}

function ensureAudioLoaded() {
    if (!audio || isLoaded || !src) return;
    document.getElementById("audio-player-container")?.setAttribute("data-audio-state", "active");
    audio.src = src;
    audio.load();
    isLoaded = true;
}

function setAudioPosition(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    pendingTime = seconds;
    if (isLoaded && audio) audio.currentTime = seconds;
    if (currentTimeDisplay) currentTimeDisplay.textContent = formatTime(seconds);
    seekSlider?.setAttribute("aria-valuetext", `${formatTime(seconds)} of ${durationDisplay?.textContent || "00:00"}`);
    highlightTime(seconds);
    if (audio?.paused) setPlaybackUi(true);
}

function playFrom(seconds = pendingTime) {
    if (!audio) return;
    enterReadView();
    ensureAudioLoaded();
    audio.currentTime = seconds;
    pendingTime = seconds;
    void audio.play().catch((error) => {
        if (error instanceof DOMException && (error.name === "AbortError" || error.name === "NotAllowedError")) {
            return;
        }
        console.error("Error playing audio:", error);
    });
}

function togglePlayPause() {
    if (!audio) return;
    enterReadView();
    if (!isLoaded || audio.paused) {
        playFrom(isLoaded ? audio.currentTime : pendingTime);
    } else {
        audio.pause();
    }
}

function stageHashTime(options: { scroll: boolean }) {
    const hash = window.location.hash;
    if (!hash) return;

    const parsedTimeHash = parseTimeHash(hash);
    if (parsedTimeHash) {
        if (hash !== parsedTimeHash.canonicalHash) {
            history.replaceState(null, "", parsedTimeHash.canonicalHash);
        }
        audio?.pause();
        setAudioPosition(parsedTimeHash.seconds);
        if (options.scroll) {
            const index = findMessageIndex(parsedTimeHash.seconds);
            const message = timeHashTarget(parsedTimeHash.seconds,
                document.getElementById(`msg-${parsedTimeHash.seconds}`),
                messagePoints[Math.max(0, index)]?.el);
            requestAnimationFrame(() => message?.scrollIntoView({ block: "start", behavior: "instant" }));
        }
        return;
    }

    if (!hash.startsWith("#msg-")) return;
    const anchor = document.getElementById(hash.slice(1));
    const seconds = passageSeconds(anchor?.closest(passageSelector)?.id ?? "");
    if (seconds !== null) {
        audio?.pause();
        setAudioPosition(seconds);
    }
}

function updateMuteIcon(isMuted: boolean) {
    volumeIcon?.classList.toggle("hidden", isMuted);
    muteIcon?.classList.toggle("hidden", !isMuted);
    muteButton?.setAttribute("aria-label", isMuted ? "Unmute episode" : "Mute episode");
}

function toggleMute() {
    if (!audio) return;
    audio.muted = !audio.muted;
    if (!audio.muted && audio.volume === 0) audio.volume = 0.5;
    showFeedback(audio.muted ? "mute" : "unmute");
}

function showFeedback(action: "play" | "pause" | "mute" | "unmute" | "volume" | "error", value: string | number = "") {
    if (!feedbackText || !playerFeedback) return;
    if (feedbackTimeout) clearTimeout(feedbackTimeout);

    const feedback = {
        play: "Playing",
        pause: "Paused",
        mute: "Muted",
        unmute: "Unmuted",
        volume: `Volume ${value}%`,
        error: "Audio could not play",
    };

    feedbackText.textContent = feedback[action];
    playerFeedback.style.opacity = "1";
    feedbackTimeout = setTimeout(() => {
        if (playerFeedback) playerFeedback.style.opacity = "0";
    }, 500);
}

function stepMessage(direction: 1 | -1) {
    ensureMessagePoints();
    const container = document.getElementById("episode-scroll-container");
    if (!messagePoints.length || !container) return;
    const view = container.getBoundingClientRect();
    const current = lastHighlightedMessage ? messagePoints.findIndex(({ el }) => el === lastHighlightedMessage) : -1;
    const box = current >= 0 ? messagePoints[current].el.getBoundingClientRect() : null;
    const onScreen = box && box.bottom > view.top && box.top < view.bottom;
    const base = onScreen ? current : messagePoints.findIndex(({ el }) => el.getBoundingClientRect().bottom > view.top + 56) - (direction > 0 ? 1 : 0);
    const target = messagePoints[Math.max(0, Math.min(messagePoints.length - 1, base + direction))];
    if (audio && isLoaded && !audio.paused) audio.currentTime = target.time;
    else setAudioPosition(target.time);
    highlightTime(target.time);
    target.el.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
}

function handleAudioKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, button, a, [role='button']"))) return;
    if (!audio || isWatchView()) return;

    switch (event.code) {
        case "Space":
            event.preventDefault();
            togglePlayPause();
            break;
        case "KeyJ":
            event.preventDefault();
            stepMessage(1);
            break;
        case "KeyK":
            event.preventDefault();
            stepMessage(-1);
            break;
        case "KeyM":
            event.preventDefault();
            toggleMute();
            break;
    }
}

function handleGlobalClick(event: MouseEvent) {
    if (isWatchView() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#t="]');
    if (!link) return;

    const href = link.getAttribute("href");
    const parsed = href ? parseTimeHash(href) : null;
    if (!href || !parsed) return;

    event.preventDefault();
    history.replaceState(null, "", parsed.canonicalHash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function initAudioPlayer() {
    audio = document.getElementById("audio-element") as HTMLAudioElement | null;
    playPauseButton = document.getElementById("play-pause") as HTMLButtonElement | null;
    seekSlider = document.getElementById("seek-slider") as HTMLInputElement | null;
    currentTimeDisplay = document.getElementById("current-time");
    durationDisplay = document.getElementById("duration");
    progressBar = document.getElementById("progress-bar");
    playIcon = document.getElementById("play-icon");
    pauseIcon = document.getElementById("pause-icon");
    muteButton = document.getElementById("mute-button");
    volumeIcon = document.getElementById("volume-icon");
    muteIcon = document.getElementById("mute-icon");
    volumeSlider = document.getElementById("volume-slider") as HTMLInputElement | null;
    playerFeedback = document.getElementById("player-feedback");
    feedbackText = document.getElementById("feedback-text");

    const container = document.getElementById("audio-player-container");
    src = container?.dataset.src || "";
    if (!audio) return;

    playPauseButton?.addEventListener("click", togglePlayPause);
    seekSlider?.addEventListener("input", () => {
        if (!audio?.duration || !seekSlider) return;
        audio.currentTime = audio.duration * (Number(seekSlider.value) / 100);
    });

    audio.addEventListener("timeupdate", updateTimeDisplay);
    audio.addEventListener("loadedmetadata", () => {
        if (!audio) return;
        if (pendingTime > 0) audio.currentTime = pendingTime;
        if (seekSlider) seekSlider.disabled = false;
        updateTimeDisplay();
    });
    audio.addEventListener("play", () => {
        setPlaybackUi(false);
        setPlaying(true);
        showFeedback("play");
    });
    audio.addEventListener("pause", () => {
        setPlaybackUi(true);
        setPlaying(false);
        if (isLoaded) showFeedback("pause");
    });
    audio.addEventListener("error", () => {
        setPlaybackUi(true);
        setPlaying(false);
        showFeedback("error");
    });
    document.getElementById("episode-scroll-container")?.addEventListener("scroll", scheduleFollow, { passive: true });
    document.getElementById("now-playing")?.addEventListener("click", () => {
        lastHighlightedMessage?.scrollIntoView({
            block: "center",
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        });
    });

    volumeSlider?.addEventListener("input", () => {
        if (!audio || !volumeSlider) return;
        const value = Number(volumeSlider.value);
        audio.volume = value / 100;
        audio.muted = value === 0;
        volumeSlider.setAttribute("aria-valuetext", `${value} percent`);
        showFeedback("volume", value);
    });
    audio.addEventListener("volumechange", () => {
        if (!audio) return;
        updateMuteIcon(audio.muted);
        if (!audio.muted && volumeSlider) {
            const percent = Math.round(audio.volume * 100);
            volumeSlider.value = String(percent);
            volumeSlider.setAttribute("aria-valuetext", `${percent} percent`);
        }
    });
    muteButton?.addEventListener("click", toggleMute);

    document.addEventListener("keydown", handleAudioKeydown);
    document.addEventListener("click", handleGlobalClick);
    window.addEventListener("hashchange", () => stageHashTime({ scroll: true }));
    document.addEventListener("his:watch-intent", () => audio?.pause());
    document.addEventListener("his:video-position", (event) => {
        const seconds = (event as CustomEvent<{ seconds: number }>).detail?.seconds;
        if (Number.isFinite(seconds)) setAudioPosition(seconds);
    });

    audio.volume = 0.5;
    setPlaybackUi(true);
    stageHashTime({ scroll: true });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAudioPlayer, { once: true });
} else {
    initAudioPlayer();
}

export {};
