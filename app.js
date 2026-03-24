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

  return canvasEl;
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
