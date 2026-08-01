
const isCapacitor = typeof window.Capacitor !== "undefined";
const SystemAudioCapture = isCapacitor ? window.Capacitor.Plugins.SystemAudioCapture : null;
let serverUrl = localStorage.getItem("backend_server_url") || "";

// Helper to convert native base64 PCM stream back to binary Blob
function base64ToBlob(base64, mimeType = "audio/pcm") {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

const stopButton = document.querySelector("#stopButton");
const clearButton = document.querySelector("#clearButton");
const previewVideo = document.querySelector("#previewVideo");
const supportNote = document.querySelector("#supportNote");
const statusPill = document.querySelector("#statusPill");
const targetLanguage = document.querySelector("#targetLanguage");
const sourceLanguage = document.querySelector("#sourceLanguage");
const detectedLanguage = document.querySelector("#detectedLanguage");
const captionList = document.querySelector("#captionList");
const audioMeter = document.querySelector("#audioMeter");
const meterContext = audioMeter.getContext("2d");

const themeToggle = document.querySelector("#themeToggle");
const sunIcon = themeToggle.querySelector(".sun-icon");
const moonIcon = themeToggle.querySelector(".moon-icon");

const fontSizeDec = document.querySelector("#fontSizeDec");
const fontSizeInc = document.querySelector("#fontSizeInc");
const exportButton = document.querySelector("#exportButton");

// Floating Overlay (PiP) Drivers
const pipButton = document.querySelector("#pipButton");
if (isCapacitor && pipButton) {
  // Mobile app styling for the start button
  pipButton.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg> Start Capture`;
  
  // Show backend URL input config row on mobile
  const serverUrlRow = document.querySelector("#serverUrlRow");
  if (serverUrlRow) serverUrlRow.style.display = "block";
}
const pipCanvas = document.querySelector("#pipCanvas");
const pipCanvasCtx = pipCanvas?.getContext("2d");
const pipVideo = document.querySelector("#pipVideo");

// PWA Install Button
const installPwaBtn = document.querySelector("#installPwaBtn");

let mediaStream;
let lastRecognizedText = "";
let mediaRecorder;
let audioContext;
let analyser;
let meterAnimation;
let captionCount = 0;
let sessionHistory = [];

let pipWindow = null;
let currentPiPText = { original: "", translated: "" };

// For caption stream smoothing
let lastCaptionTime = null;
let lastDetectedLanguage = null;
let lastCardElement = null;

const canShareScreen = Boolean(navigator.mediaDevices?.getDisplayMedia);
const isLikelyMobile = matchMedia("(max-width: 860px), (pointer: coarse)").matches;
const sizeSteps = ["small", "medium", "large", "xlarge"];

function setSupportMessage() {
  if (!window.isSecureContext) {
    supportNote.hidden = false;
    supportNote.textContent =
      "Secure context (HTTPS) is required for audio/mic capture. If testing on mobile, please open the deployed HTTPS site.";
  }
}

function setStatus(label, isLive = false) {
  if (statusPill) {
    statusPill.lastChild.textContent = ` ${label}`;
    statusPill.classList.toggle("is-live", isLive);
  }
}

function resetMeter() {
  meterContext.clearRect(0, 0, audioMeter.width, audioMeter.height);
}

function drawMeter() {
  if (!analyser) return;

  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  meterContext.clearRect(0, 0, audioMeter.width, audioMeter.height);

  meterContext.fillStyle = "rgba(0, 0, 0, 0)";
  meterContext.fillRect(0, 0, audioMeter.width, audioMeter.height);

  const barCount = 42;
  const barWidth = audioMeter.width / barCount;
  
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const primaryColor = isDark ? "#0df2c9" : "#0d9488";
  const secondaryColor = isDark ? "#f43f5e" : "#e11d48";
  const tertiaryColor = isDark ? "#fbbf24" : "#d97706";

  for (let i = 0; i < barCount; i += 1) {
    const value = data[Math.floor((i / barCount) * data.length)] / 255;
    const height = Math.max(4, value * audioMeter.height * 0.85);
    const color = i % 3 === 0 ? primaryColor : i % 3 === 1 ? secondaryColor : tertiaryColor;
    
    meterContext.fillStyle = color;
    
    const x = i * barWidth + 3;
    const y = audioMeter.height - height;
    const width = Math.max(3, barWidth - 6);
    const radius = 2;

    meterContext.beginPath();
    meterContext.moveTo(x + radius, y);
    meterContext.lineTo(x + width - radius, y);
    meterContext.quadraticCurveTo(x + width, y, x + width, y + radius);
    meterContext.lineTo(x + width, y + height);
    meterContext.lineTo(x, y + height);
    meterContext.lineTo(x, y + radius);
    meterContext.quadraticCurveTo(x, y, x + radius, y);
    meterContext.closePath();
    meterContext.fill();
  }

  meterAnimation = requestAnimationFrame(drawMeter);
}

// Render Picture-in-Picture Floating Subtitle Frame
function renderPiPFrame(originalText, translatedText) {
  currentPiPText.original = originalText || "";
  currentPiPText.translated = translatedText || "";

  // 1. Update Document Picture-in-Picture Window if active
  if (pipWindow && pipWindow.document) {
    const origEl = pipWindow.document.querySelector("#pipOriginal");
    const transEl = pipWindow.document.querySelector("#pipTranslated");
    if (origEl) origEl.textContent = currentPiPText.original;
    if (transEl) transEl.textContent = currentPiPText.translated;
  }

  // 2. Update Canvas Video Stream PiP Fallback
  if (pipCanvasCtx && pipCanvas) {
    pipCanvasCtx.fillStyle = "#080a0f";
    pipCanvasCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);

    pipCanvasCtx.strokeStyle = "#0df2c9";
    pipCanvasCtx.lineWidth = 4;
    pipCanvasCtx.strokeRect(0, 0, pipCanvas.width, pipCanvas.height);

    pipCanvasCtx.fillStyle = "#94a3b8";
    pipCanvasCtx.font = "italic 16px 'Plus Jakarta Sans', sans-serif";
    pipCanvasCtx.fillText((currentPiPText.original || "").slice(0, 50), 20, 45);

    pipCanvasCtx.fillStyle = "#0df2c9";
    pipCanvasCtx.font = "bold 22px 'Space Grotesk', sans-serif";

    const words = (currentPiPText.translated || "Listening for speech...").split(" ");
    let line = "";
    let y = 100;
    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + " ";
      if (pipCanvasCtx.measureText(testLine).width > pipCanvas.width - 40 && i > 0) {
        pipCanvasCtx.fillText(line, 20, y);
        line = words[i] + " ";
        y += 32;
      } else {
        line = testLine;
      }
    }
    pipCanvasCtx.fillText(line, 20, y);
  }
}

async function togglePictureInPicture() {
  try {
    // 1. Modern Document Picture-in-Picture API
    if ("documentPictureInPicture" in window) {
      if (pipWindow) {
        pipWindow.close();
        pipWindow = null;
        if (pipButton) pipButton.classList.remove("is-active");
        return;
      }

      pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 480,
        height: 160
      });

      const style = pipWindow.document.createElement("style");
      style.textContent = `
        body {
          margin: 0;
          padding: 14px;
          background: #080a0f;
          color: #f8fafc;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          display: flex;
          flex-direction: column;
          justify-content: center;
          height: 100vh;
          box-sizing: border-box;
          border: 2px solid #0df2c9;
          border-radius: 8px;
          overflow: hidden;
        }
        .pip-orig {
          font-size: 0.8rem;
          color: #94a3b8;
          font-style: italic;
          margin-bottom: 6px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pip-trans {
          font-size: 1.2rem;
          font-weight: 800;
          color: #0df2c9;
          line-height: 1.35;
        }
      `;
      pipWindow.document.head.appendChild(style);

      const origDiv = pipWindow.document.createElement("div");
      origDiv.id = "pipOriginal";
      origDiv.className = "pip-orig";
      origDiv.textContent = currentPiPText.original || "Subtitles active...";

      const transDiv = pipWindow.document.createElement("div");
      transDiv.id = "pipTranslated";
      transDiv.className = "pip-trans";
      transDiv.textContent = currentPiPText.translated || "Waiting for speech...";

      pipWindow.document.body.appendChild(origDiv);
      pipWindow.document.body.appendChild(transDiv);

      if (pipButton) pipButton.classList.add("is-active");

      pipWindow.addEventListener("pagehide", () => {
        pipWindow = null;
        if (pipButton) pipButton.classList.remove("is-active");
      });
      return;
    }

    // 2. Fallback Canvas Video Stream Picture-in-Picture
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      if (pipButton) pipButton.classList.remove("is-active");
      return;
    }

    renderPiPFrame(currentPiPText.original, currentPiPText.translated);
    if (pipCanvas && pipVideo) {
      const stream = pipCanvas.captureStream(15);
      pipVideo.srcObject = stream;
      await pipVideo.play();
      await pipVideo.requestPictureInPicture();
      if (pipButton) pipButton.classList.add("is-active");

      pipVideo.addEventListener("leavepictureinpicture", () => {
        if (pipButton) pipButton.classList.remove("is-active");
      });
    }
  } catch (err) {
    console.error("Picture-in-Picture error:", err);
    alert("Floating subtitle overlay is not supported in this browser context.");
  }
}

function addCaption(caption) {
  // Ignore silent chunks that contain no recognized original or translated text
  if (!caption || (!caption.original && !caption.translated)) {
    return;
  }

  if (caption.original) {
    lastRecognizedText = caption.original;
  }

  if (captionCount === 0) {
    captionList.innerHTML = "";
  }

  if (detectedLanguage) {
    detectedLanguage.textContent = caption.detectedLanguage || "Auto";
  }

  const timestamp = new Date(caption.createdAt || Date.now());
  const timeString = timestamp.toLocaleTimeString();

  sessionHistory.push({
    time: timeString,
    lang: caption.detectedLanguage || "Auto",
    original: caption.original,
    translated: caption.translated
  });

  const isSameLanguage = lastDetectedLanguage === caption.detectedLanguage;
  const isRecent = lastCaptionTime && (timestamp - lastCaptionTime < 15000);

  if (lastCardElement && isSameLanguage && isRecent) {
    const origTextNode = lastCardElement.querySelector(".original");
    const transTextNode = lastCardElement.querySelector(".translated");

    origTextNode.textContent += " " + caption.original;
    transTextNode.textContent += " " + caption.translated;

    const lastHistIndex = sessionHistory.length - 2;
    if (sessionHistory[lastHistIndex]) {
      sessionHistory[lastHistIndex].original += " " + caption.original;
      sessionHistory[lastHistIndex].translated += " " + caption.translated;
      sessionHistory.pop();
    }

    lastCaptionTime = timestamp;
    renderPiPFrame(origTextNode.textContent, transTextNode.textContent);
  } else {
    captionCount += 1;
    lastDetectedLanguage = caption.detectedLanguage;
    lastCaptionTime = timestamp;

    const card = document.createElement("article");
    card.className = "caption-card";
    card.innerHTML = `
      <div class="caption-meta-row">
        <p class="caption-meta">${timeString} - ${caption.mode || "live"}</p>
        <div class="card-actions">
          <button class="card-action-btn copy-btn" title="Copy translated caption">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
      </div>
      <p class="original"></p>
      <p class="translated"></p>
    `;

    card.querySelector(".original").textContent = caption.original;
    card.querySelector(".translated").textContent = caption.translated;

    const copyBtn = card.querySelector(".copy-btn");
    copyBtn.addEventListener("click", () => {
      const textToCopy = card.querySelector(".translated").textContent;
      navigator.clipboard.writeText(textToCopy).then(() => {
        copyBtn.style.color = "#10b981";
        setTimeout(() => { copyBtn.style.color = ""; }, 1500);
      }).catch(err => {
        console.error("Failed to copy text:", err);
      });
    });

    captionList.appendChild(card);
    lastCardElement = card;
    renderPiPFrame(caption.original, caption.translated);
  }

  const pauseScroll = document.querySelector("#pauseScroll")?.checked;
  if (!pauseScroll) {
    captionList.scrollTop = captionList.scrollHeight;
  }
function encodeWAV(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

async function sendChunk(blob, encoding = "WEBM_OPUS", sampleRate = 48000) {
  if (!blob.size) return;

  const baseUrl = (isCapacitor && serverUrl) ? serverUrl : "";
  const response = await fetch(baseUrl + "/api/audio-chunk", {
    method: "POST",
    headers: {
      "content-type": blob.type || "application/octet-stream",
      "x-source-language": sourceLanguage.value,
      "x-target-language": targetLanguage.value,
      "x-context-text": lastRecognizedText,
      "x-audio-encoding": encoding,
      "x-audio-sample-rate": sampleRate.toString()
    },
    body: blob
  });

  if (!response.ok) {
    throw new Error(`Translation request failed with ${response.status}`);
  }

  addCaption(await response.json());
}

function stopCapture() {
  if (isCapacitor && SystemAudioCapture) {
    try {
      SystemAudioCapture.removeAllListeners();
      SystemAudioCapture.stopCapture().catch(e => console.error(e));
    } catch (e) {
      console.error("Error stopping native capture:", e);
    }
    pipButton.disabled = false;
    stopButton.disabled = true;
    setStatus("Idle");
    resetMeter();
    lastCaptionTime = null;
    lastDetectedLanguage = null;
    lastCardElement = null;
    return;
  }

  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
  }

  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = undefined;
  mediaRecorder = undefined;

  if (meterAnimation) {
    cancelAnimationFrame(meterAnimation);
  }
  meterAnimation = undefined;
  analyser = undefined;

  audioContext?.close();
  audioContext = undefined;

  if (previewVideo) previewVideo.srcObject = null;
  
  pipButton.disabled = false;
  stopButton.disabled = true;
  setStatus("Idle");
  resetMeter();

  lastCaptionTime = null;
  lastDetectedLanguage = null;
  lastCardElement = null;
}

function getSupportedMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
    "audio/wav"
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

async function startCapture() {
  if (isCapacitor && SystemAudioCapture) {
    try {
      pipButton.disabled = true;
      setStatus("Accessing audio");

      await SystemAudioCapture.startCapture();

      stopButton.disabled = false;
      setStatus("Listening", true);

      // Listen for chunks from native Android projection service
      SystemAudioCapture.addListener("onAudioChunk", (data) => {
        if (data && data.chunk) {
          const blob = base64ToBlob(data.chunk, "audio/pcm");
          sendChunk(blob, "LINEAR16", 48000).catch((error) => {
            console.error(error);
            setStatus("Backend error");
          });
        }
      });

      SystemAudioCapture.addListener("onError", (data) => {
        console.error("Native audio capture error:", data.message);
        setStatus("Capture error");
        stopCapture();
      });

      // Automatically launch Picture-in-Picture Floating Subtitles on Desktop
      if (!isCapacitor) {
        setTimeout(() => {
          if (!pipWindow && !document.pictureInPictureElement) {
            togglePictureInPicture().catch((err) => console.log("PiP auto launch note:", err));
          }
        }, 400);
      }

      return;
    } catch (error) {
      console.error(error);
      stopCapture();
      setStatus("Permission denied");
      return;
    }
  }

  if (!window.isSecureContext) {
    setStatus("HTTPS required");
    alert("Audio capture requires a secure context (HTTPS). If testing on a mobile device, please access the deployed HTTPS Vercel URL.");
    pipButton.disabled = false;
    return;
  }
  try {
    pipButton.disabled = true;
    setStatus("Accessing audio");

    let stream;
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (navigator.mediaDevices?.getDisplayMedia && !isMobileDevice) {
      setStatus("Select system sound");
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000
        }
      });
    } else {
      setStatus("Accessing microphone");
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000
        }
      });
    }

    mediaStream = stream;
    if (previewVideo) previewVideo.srcObject = mediaStream;

    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) {
      stopCapture();
      supportNote.hidden = false;
      supportNote.textContent =
        "No audio track was captured. Please grant audio permission and try again.";
      return;
    }

    stopButton.disabled = false;
    setStatus("Listening", true);

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass({ sampleRate: 16000 });
    const sourceNode = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    sourceNode.connect(analyser);
    drawMeter();

    // Continuous 16kHz LINEAR16 WAV Processor
    const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
    let pcmSamples = [];
    const targetSampleCount = 16000 * 2.5; // 2.5 seconds of 16kHz audio

    scriptNode.onaudioprocess = (e) => {
      if (!mediaStream || !mediaStream.active) return;
      const inputBuffer = e.inputBuffer.getChannelData(0);
      for (let i = 0; i < inputBuffer.length; i++) {
        pcmSamples.push(inputBuffer[i]);
      }

      if (pcmSamples.length >= targetSampleCount) {
        const samplesToEncode = new Float32Array(pcmSamples);
        pcmSamples = [];
        const wavBlob = encodeWAV(samplesToEncode, 16000);
        sendChunk(wavBlob, "LINEAR16", 16000).catch((error) => {
          console.error("WAV Chunk processing error:", error);
          setStatus("Backend error");
        });
      }
    };

    sourceNode.connect(scriptNode);
    scriptNode.connect(audioContext.destination);

    // Automatically launch Picture-in-Picture Floating Subtitles as soon as capture begins!
    setTimeout(() => {
      if (!pipWindow && !document.pictureInPictureElement) {
        togglePictureInPicture().catch((err) => console.log("PiP auto launch note:", err));
      }
    }, 400);
    
    mediaStream.getVideoTracks()[0]?.addEventListener("ended", stopCapture);
  } catch (error) {
    console.error(error);
    stopCapture();
    setStatus("Permission denied");
  }
}

// Theme management
function updateThemeIcons(theme) {
  if (theme === "light") {
    sunIcon.style.display = "block";
    moonIcon.style.display = "none";
  } else {
    sunIcon.style.display = "none";
    moonIcon.style.display = "block";
  }
}

themeToggle.addEventListener("click", () => {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  updateThemeIcons(newTheme);
});

// Font size adjustments
fontSizeDec.addEventListener("click", () => {
  const currentSize = captionList.getAttribute("data-size") || "medium";
  const currentIndex = sizeSteps.indexOf(currentSize);
  if (currentIndex > 0) {
    captionList.setAttribute("data-size", sizeSteps[currentIndex - 1]);
  }
});

fontSizeInc.addEventListener("click", () => {
  const currentSize = captionList.getAttribute("data-size") || "medium";
  const currentIndex = sizeSteps.indexOf(currentSize);
  if (currentIndex < sizeSteps.length - 1) {
    captionList.setAttribute("data-size", sizeSteps[currentIndex + 1]);
  }
});

// Transcript export
exportButton.addEventListener("click", () => {
  if (sessionHistory.length === 0) {
    alert("No captions captured to export yet.");
    return;
  }

  let text = "Translatuhh Translation Transcript\n";
  text += `Exported on: ${new Date().toLocaleString()}\n`;
  text += "=========================================\n\n";

  sessionHistory.forEach((item) => {
    text += `[${item.time}] (${item.lang})\n`;
    text += `Original:   ${item.original}\n`;
    text += `Translated: ${item.translated}\n`;
    text += "-----------------------------------------\n";
  });

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `translatuhh-transcript-${Date.now()}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

// Check backend API Key status
async function checkApiStatus() {
  const apiBadge = document.querySelector("#apiBadge");
  if (!apiBadge) return;
  const badgeDot = apiBadge.querySelector(".badge-dot");
  const badgeText = apiBadge.querySelector(".badge-text");

  try {
    const baseUrl = (isCapacitor && serverUrl) ? serverUrl : "";
    const response = await fetch(baseUrl + "/api/status");
    if (response.ok) {
      const data = await response.json();
      if (data.hasApiKey) {
        apiBadge.className = "api-badge active";
        badgeText.textContent = "Live (Google Cloud)";
        apiBadge.title = "Connected to Google Cloud Speech & Translate backend";
      } else {
        apiBadge.className = "api-badge demo";
        badgeText.textContent = "Demo Mode";
        apiBadge.title = "Running with fallback mock captions. Define GOOGLE_API_KEY in .env / Vercel for real translation.";
      }
    } else {
      throw new Error();
    }
  } catch {
    apiBadge.className = "api-badge";
    badgeText.textContent = "Offline";
    apiBadge.title = "Could not check API status. Check if server is running.";
  }
}

// Service Worker & PWA Support (Network-First Auto-Update)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      reg.update();
    }).catch((err) => {
      console.log("Service Worker registration note:", err);
    });
  });
}

let deferredPrompt = null;
const pwaBanner = document.querySelector("#pwaBanner");
const bannerInstallBtn = document.querySelector("#bannerInstallBtn");
const bannerDismissBtn = document.querySelector("#bannerDismissBtn");

// Check if PWA is already running in standalone mode
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
if (isStandalone && installPwaBtn) {
  installPwaBtn.style.display = "none";
}

window.addEventListener("beforeinstallprompt", (e) => {
  if (isStandalone) return;
  e.preventDefault();
  deferredPrompt = e;
  if (installPwaBtn) {
    installPwaBtn.style.display = "inline-flex";
  }
  if (pwaBanner && !sessionStorage.getItem("pwa_banner_dismissed")) {
    pwaBanner.style.display = "flex";
  }
});

window.addEventListener("appinstalled", () => {
  console.log("Translatuhh PWA installed successfully");
  if (installPwaBtn) installPwaBtn.style.display = "none";
  if (pwaBanner) pwaBanner.style.display = "none";
  deferredPrompt = null;
});

async function triggerPwaInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === "accepted") {
    if (installPwaBtn) installPwaBtn.style.display = "none";
    if (pwaBanner) pwaBanner.style.display = "none";
  }
  deferredPrompt = null;
}

if (installPwaBtn) {
  installPwaBtn.addEventListener("click", triggerPwaInstall);
}

if (bannerInstallBtn) {
  bannerInstallBtn.addEventListener("click", triggerPwaInstall);
}

if (bannerDismissBtn) {
  bannerDismissBtn.addEventListener("click", () => {
    if (pwaBanner) pwaBanner.style.display = "none";
    sessionStorage.setItem("pwa_banner_dismissed", "true");
  });
}

if (pipButton) {
  pipButton.addEventListener("click", async () => {
    if (!mediaStream) {
      await startCapture();
    } else {
      togglePictureInPicture();
    }
  });
}

stopButton.addEventListener("click", stopCapture);
clearButton.addEventListener("click", () => {
  captionCount = 0;
  sessionHistory = [];
  if (detectedLanguage) detectedLanguage.textContent = "Waiting";
  captionList.innerHTML = `
    <article class="caption-card muted">
      <p class="original">No captions yet.</p>
      <p class="translated">Select your audio source, click "Start Capture", and click "Floating Subtitles (PiP)" to view real-time captions pinned over reels and apps.</p>
    </article>
  `;
  lastCaptionTime = null;
  lastDetectedLanguage = null;
  lastCardElement = null;
  renderPiPFrame("", "");
});

// Initialization
updateThemeIcons(document.documentElement.getAttribute("data-theme") || "dark");
setSupportMessage();
resetMeter();

// Set up server URL input bindings for Capacitor
const serverUrlInput = document.querySelector("#serverUrlInput");
const saveServerUrlBtn = document.querySelector("#saveServerUrlBtn");
if (serverUrlInput) serverUrlInput.value = serverUrl;
if (saveServerUrlBtn && serverUrlInput) {
  saveServerUrlBtn.addEventListener("click", async () => {
    let val = serverUrlInput.value.trim();
    if (val && val.endsWith("/")) {
      val = val.substring(0, val.length - 1);
    }
    localStorage.setItem("backend_server_url", val);
    serverUrl = val;
    setStatus("Connecting...");
    await checkApiStatus();
    setStatus("Idle");
  });
}

// Make API badge double as a manual Refresh button
const apiBadge = document.querySelector("#apiBadge");
if (apiBadge) {
  apiBadge.style.cursor = "pointer";
  apiBadge.addEventListener("click", async () => {
    setStatus("Checking...");
    await checkApiStatus();
    setStatus("Idle");
  });
}

checkApiStatus();
initPermissions();

// Onboarding Permission Handler (Notification + Microphone)
async function initPermissions() {
  // 1. Request Notification permission on page load
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(err => console.log("Notification note:", err));
  }

  const overlay = document.querySelector("#permissionOverlay");
  const grantBtn = document.querySelector("#grantPermissionBtn");
  if (!overlay || !grantBtn) return;

  // If user has already granted or dismissed permission prompt previously, never show overlay again
  if (localStorage.getItem("audio_permission_granted") === "true") {
    overlay.style.display = "none";
    return;
  }

  // If in Capacitor, the native plugin handles permissions dynamically
  if (isCapacitor) {
    overlay.style.display = "none";
    localStorage.setItem("audio_permission_granted", "true");
    return;
  }

  // Check microphone permission state via permissions API if supported
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const status = await navigator.permissions.query({ name: "microphone" });
      if (status.state === "prompt") {
        overlay.style.display = "flex";
      }
      status.onchange = () => {
        if (status.state === "granted") {
          overlay.style.display = "none";
        }
      };
    } catch (e) {
      // Fallback: If querying microphone permission throws, check local storage
      if (!localStorage.getItem("audio_permission_granted")) {
        overlay.style.display = "flex";
      }
    }
  } else {
    // Legacy fallback using localStorage
    if (!localStorage.getItem("audio_permission_granted")) {
      overlay.style.display = "flex";
    }
  }

  grantBtn.addEventListener("click", async () => {
    try {
      setStatus("Accessing audio");
      let stream;
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (navigator.mediaDevices?.getDisplayMedia && !isMobileDevice) {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 48000
          }
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 48000
          }
        });
      }

      // Close tracks immediately since we only wanted to test permission
      stream.getTracks().forEach((track) => track.stop());
      localStorage.setItem("audio_permission_granted", "true");
      overlay.style.display = "none";
      setStatus("Idle");

      // Auto-trigger notification request as well once audio is granted
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch (err) {
      console.error("Audio permission request denied:", err);
      alert("Audio capture access is required to translate. Please allow access to proceed.");
    }
  });
}
