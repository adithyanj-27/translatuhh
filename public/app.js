const shareButton = document.querySelector("#shareButton");
const stopButton = document.querySelector("#stopButton");
const clearButton = document.querySelector("#clearButton");
const previewVideo = document.querySelector("#previewVideo");
const emptyPreview = document.querySelector("#emptyPreview");
const emptyPreviewText = document.querySelector("#emptyPreviewText");
const supportNote = document.querySelector("#supportNote");
const statusPill = document.querySelector("#statusPill");
const targetLanguage = document.querySelector("#targetLanguage");
const audioSource = document.querySelector("#audioSource");
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

let mediaStream;
let mediaRecorder;
let audioContext;
let analyser;
let meterAnimation;
let captionCount = 0;
let sessionHistory = [];

// For caption stream smoothing
let lastCaptionTime = null;
let lastDetectedLanguage = null;
let lastCardElement = null;

const canShareScreen = Boolean(navigator.mediaDevices?.getDisplayMedia);
const isLikelyMobile = matchMedia("(max-width: 860px), (pointer: coarse)").matches;
const sizeSteps = ["small", "medium", "large", "xlarge"];

function setSupportMessage() {
  if (!canShareScreen) {
    // If they can't share screen, hide Tab option, set source to mic default
    audioSource.value = "mic";
    const tabOption = audioSource.querySelector('option[value="tab"]');
    if (tabOption) tabOption.disabled = true;
    
    supportNote.hidden = false;
    supportNote.textContent =
      "Browser tab sharing is not supported on this device. Microphone mode is active.";
  }

  if (isLikelyMobile && canShareScreen) {
    supportNote.hidden = false;
    supportNote.textContent =
      "Tab sharing is supported, but mobile devices often block audio capture from other tabs. Switch to Microphone mode to capture nearby speech.";
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

  // Stream Smoothing: merge if same language, within 10 seconds, and non-empty
  const isSameLanguage = lastDetectedLanguage === caption.detectedLanguage;
  const isRecent = lastCaptionTime && (timestamp - lastCaptionTime < 10000);

  if (lastCardElement && isSameLanguage && isRecent && caption.original && caption.translated) {
    const origTextNode = lastCardElement.querySelector(".original");
    const transTextNode = lastCardElement.querySelector(".translated");

    origTextNode.textContent += " " + caption.original;
    transTextNode.textContent += " " + caption.translated;

    // Update session history
    const lastHistIndex = sessionHistory.length - 2;
    if (sessionHistory[lastHistIndex]) {
      sessionHistory[lastHistIndex].original += " " + caption.original;
      sessionHistory[lastHistIndex].translated += " " + caption.translated;
      sessionHistory.pop(); // Remove the single chunk entry
    }

    lastCaptionTime = timestamp;
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

  previewVideo.srcObject = null;
  
  // Set placeholder view
  emptyPreviewText.textContent = "Start capture to preview feed here.";
  emptyPreview.classList.remove("is-hidden");
  
  shareButton.disabled = false;
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
    shareButton.disabled = true;
    const source = audioSource.value;

    if (source === "tab") {
      setStatus("Choose a tab");
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000
        }
      });
      previewVideo.srcObject = mediaStream;
      emptyPreview.classList.add("is-hidden");
    } else {
      setStatus("Accessing mic");
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000
        }
      });
      previewVideo.srcObject = null;
      emptyPreviewText.textContent = "Microphone input active.";
      emptyPreview.classList.remove("is-hidden");
    }

    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) {
      stopCapture();
      supportNote.hidden = false;
      supportNote.textContent =
        "No audio track was captured. Check device/tab permissions and try again.";
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

    mediaRecorder.start(3500);
    
    // Automatically stop when the shared screen track ends
    mediaStream.getVideoTracks()[0]?.addEventListener("ended", stopCapture);
  } catch (error) {
    console.error(error);
    stopCapture();
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
        badgeText.textContent = "Live (Sarvam AI)";
        apiBadge.title = "Connected to Sarvam AI translation backend";
      } else {
        apiBadge.className = "api-badge demo";
        badgeText.textContent = "Demo Mode";
        apiBadge.title = "Running with fallback mock captions. Define SARVAM_API_KEY in .env for real translation.";
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

shareButton.addEventListener("click", startCapture);
stopButton.addEventListener("click", stopCapture);
clearButton.addEventListener("click", () => {
  captionCount = 0;
  sessionHistory = [];
  detectedLanguage.textContent = "Waiting";
  captionList.innerHTML = `
    <article class="caption-card muted">
      <p class="original">No captions yet.</p>
      <p class="translated">Select your audio source and click "Start Capture". Converted text and translations will appear here in real-time.</p>
    </article>
  `;
  lastCaptionTime = null;
  lastDetectedLanguage = null;
  lastCardElement = null;
});

// Initialization
updateThemeIcons(document.documentElement.getAttribute("data-theme") || "dark");
setSupportMessage();
resetMeter();
checkApiStatus();
