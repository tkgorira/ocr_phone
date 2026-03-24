const videoEl = document.getElementById("video");
const canvasEl = document.getElementById("snapshot");
const startCameraBtn = document.getElementById("startCameraBtn");
const stopCameraBtn = document.getElementById("stopCameraBtn");
const captureBtn = document.getElementById("captureBtn");
const copyBtn = document.getElementById("copyBtn");
const resultTextEl = document.getElementById("resultText");
const statusTextEl = document.getElementById("statusText");
const progressFillEl = document.getElementById("progressFill");
const langSelect = document.getElementById("langSelect");

let stream = null;

function setStatus(text, progress = null) {
  statusTextEl.textContent = text;

  if (typeof progress === "number") {
    const safeProgress = Math.min(100, Math.max(0, Math.round(progress)));
    progressFillEl.style.width = `${safeProgress}%`;
  }
}

function stopAllTracks(mediaStream) {
  if (!mediaStream) return;

  mediaStream.getTracks().forEach((track) => {
    track.stop();
  });
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("このブラウザはカメラAPIに対応していません。");
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 3840, min: 1280 },
        height: { ideal: 2160, min: 720 },
      },
      audio: false,
    });

    videoEl.srcObject = stream;

    // Safari requires loadedmetadata before videoWidth/videoHeight are valid
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("metadata-timeout")), 10000);
      videoEl.onloadedmetadata = () => {
        clearTimeout(timeout);
        videoEl.onloadedmetadata = null;
        resolve();
      };
    });
    await videoEl.play();

    startCameraBtn.disabled = true;
    stopCameraBtn.disabled = false;
    captureBtn.disabled = false;
    setStatus("カメラを開始しました。文字が見える位置で撮影してください。", 0);
  } catch (error) {
    setStatus("カメラを開始できませんでした。権限を確認してください。");
    console.error(error);
  }
}

function stopCamera() {
  stopAllTracks(stream);
  stream = null;
  videoEl.srcObject = null;

  startCameraBtn.disabled = false;
  stopCameraBtn.disabled = true;
  captureBtn.disabled = true;
  setStatus("カメラを停止しました。", 0);
}

async function captureFrame() {
  if (!stream) {
    throw new Error("camera-not-started");
  }

  // Safari may still report 0 briefly after play() — retry up to 20 times
  let width = 0;
  let height = 0;
  for (let i = 0; i < 20; i++) {
    width = videoEl.videoWidth;
    height = videoEl.videoHeight;
    if (width && height) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!width || !height) {
    throw new Error("video-not-ready");
  }

  canvasEl.width = width;
  canvasEl.height = height;

  const ctx = canvasEl.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(videoEl, 0, 0, width, height);

  return preprocessImage(canvasEl);
}

/**
 * Grayscale + contrast boost to improve Tesseract accuracy on documents.
 */
function preprocessImage(sourceCanvas) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(sourceCanvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const factor = 2.0; // contrast multiplier

  for (let i = 0; i < d.length; i += 4) {
    // Weighted grayscale (luminance)
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // Contrast stretch around midpoint
    const c = Math.min(255, Math.max(0, (gray - 128) * factor + 128));
    d[i] = c;
    d[i + 1] = c;
    d[i + 2] = c;
  }

  ctx.putImageData(imageData, 0, 0);
  return out;
}

async function runOcr() {
  captureBtn.disabled = true;
  copyBtn.disabled = true;
  setStatus("画像を処理中...", 5);

  try {
    const imageSource = await captureFrame();
    const lang = langSelect.value;

    const result = await Tesseract.recognize(imageSource, lang, {
      logger: (message) => {
        if (message.status === "recognizing text" && typeof message.progress === "number") {
          setStatus("文字認識中...", message.progress * 100);
        }
      },
      // Tesseract parameters for document accuracy
      tessedit_pageseg_mode: "1",     // Auto OSD
      preserve_interword_spaces: "1",
      tessedit_do_invert: "0",        // Skip inversion (we handle contrast ourselves)
    });

    const text = result.data.text.trim();
    resultTextEl.value = text;

    if (text) {
      copyBtn.disabled = false;
      setStatus("認識が完了しました。コピーできます。", 100);
    } else {
      setStatus("文字を検出できませんでした。明るさや距離を調整して再撮影してください。", 100);
    }
  } catch (error) {
    if (error.message === "camera-not-started") {
      setStatus("先にカメラを開始してください。", 0);
    } else if (error.message === "video-not-ready") {
      setStatus("カメラ準備中です。少し待ってから再度お試しください。", 0);
    } else {
      setStatus("OCR中にエラーが発生しました。", 0);
      console.error(error);
    }
  } finally {
    captureBtn.disabled = !stream;
  }
}

async function copyResult() {
  const text = resultTextEl.value;

  if (!text) {
    setStatus("コピーするテキストがありません。", null);
    return;
  }

  try {
    // Try modern clipboard API first; iOS Safari needs it inside a user gesture (button click ✓)
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback: select + execCommand for older Safari / WebView
      resultTextEl.focus();
      resultTextEl.select();
      const ok = document.execCommand("copy");
      resultTextEl.setSelectionRange(0, 0);
      if (!ok) throw new Error("execCommand failed");
    }

    setStatus("テキストをコピーしました。", null);
  } catch (error) {
    // Last resort: select text so user can copy manually
    resultTextEl.focus();
    resultTextEl.select();
    setStatus("テキストを選択しました。長押しでコピーしてください。", null);
    console.error(error);
  }
}

startCameraBtn.addEventListener("click", startCamera);
stopCameraBtn.addEventListener("click", stopCamera);
captureBtn.addEventListener("click", runOcr);
copyBtn.addEventListener("click", copyResult);

window.addEventListener("beforeunload", () => {
  stopAllTracks(stream);
});
