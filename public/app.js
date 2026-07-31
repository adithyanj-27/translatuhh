
const stopButton = document.querySelector("#stopButton");
const clearButton = document.querySelector("#clearButton");
const previewVideo = document.querySelector("#previewVideo");
const supportNote = document.querySelector("#supportNote");
const statusPill = document.querySelector("#statusPill");
const targetLanguage = document.querySelector("#targetLanguage");
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
const pipCanvas = document.querySelector("#pipCanvas");
const pipCanvasCtx = pipCanvas?.getContext("2d");
const pipVideo = document.querySelector("#pipVideo");

// PWA Install Button
const installPwaBtn = document.querySelector("#installPwaBtn");

let mediaStream;
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
  if (!canShareScreen) {
    supportNote.hidden = false;
    supportNote.textContent =
      "System audio capture is restricted on this browser context.";
  }
}

function setStatus(label, isLive = false) {
  statusPill.lastChild.textContent = ` ${label}`;
  statusPill.classList.toggle("is-live", isLive);
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
  if (captionCount === 0) {
    captionList.innerHTML = "";
  }

  detectedLanguage.textContent = caption.detectedLanguage || "Auto";

  const timestamp = new Date(caption.createdAt);
  const timeString = timestamp.toLocaleTimeString();

  sessionHistory.push({
    time: timeString,
    lang: caption.detectedLanguage || "Auto",
    original: caption.original,
    translated: caption.translated
  });

  const pauseScroll = document.querySelector("#pauseScroll").checked;

  const isSameLanguage = lastDetectedLanguage === caption.detectedLanguage;
  const isRecent = lastCaptionTime && (timestamp - lastCaptionTime < 10000);

  if (lastCardElement && isSameLanguage && isRecent && caption.original && caption.translated) {
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
    const card = document.createElement("article");
    card.className = "caption-card";
    card.innerHTML = `
      <div class="caption-meta-row">
        <p class="caption-meta">${timeString} - ${caption.mode}</p>
        <div class="card-actions">
          <button class="card-action-btn copy-btn" title="Copy translated caption">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
      </div>
      <p class="original"></p>
      <p class="translated"></p>
    `;

    card.querySelector(".original").textContent = caption.original || "Listening...";
    card.querySelector(".translated").textContent = caption.translated || "";

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

    captionList.prepend(card);
    
    lastCardElement = card;
    lastDetectedLanguage = caption.detectedLanguage;
    lastCaptionTime = timestamp;

    renderPiPFrame(caption.original, caption.translated);
  }

  if (!pauseScroll) {
    captionList.scrollTop = 0;
  }
}

async function sendChunk(blob) {
  if (!blob.size) return;

  const response = await fetch("/api/audio-chunk", {
    method: "POST",
    headers: {
      "content-type": blob.type || "application/octet-stream",
      "x-target-language": targetLanguage.value
    },
    body: blob
  });

  if (!response.ok) {
    throw new Error(`Translation request failed with ${response.status}`);
  }

  addCaption(await response.json());
}

function stopCapture() {
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

    audioContext = new AudioContext();
    const sourceNode = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    sourceNode.connect(analyser);
    drawMeter();

    const options = {};
    const mimeType = getSupportedMimeType();
    if (mimeType) {
      options.mimeType = mimeType;
    }

    mediaRecorder = new MediaRecorder(new MediaStream(audioTracks), options);

    mediaRecorder.addEventListener("dataavailable", (event) => {
      sendChunk(event.data).catch((error) => {
        console.error(error);
        setStatus("Backend error");
      });
    });

    mediaRecorder.start(4000);

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
  const badgeDot = apiBadge.querySelector(".badge-dot");
  const badgeText = apiBadge.querySelector(".badge-text");

  try {
    const response = await fetch("/api/status");
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

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installPwaBtn) {
    installPwaBtn.style.display = "inline-flex";
  }
  if (pwaBanner && !sessionStorage.getItem("pwa_banner_dismissed")) {
    pwaBanner.style.display = "flex";
  }
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
  detectedLanguage.textContent = "Waiting";
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
checkApiStatus();
