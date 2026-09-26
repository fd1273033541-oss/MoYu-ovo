import { Tracker, labelPeople, validDescriptor, distance } from "./watch-logic.mjs";

const $ = id => document.getElementById(id);
const video = $("camera");
const KEY = "camera-watch-owner-v1";
let samples = [];
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved?.samples?.length <= 3 && saved.samples.every(validDescriptor)) samples = saved.samples;
} catch {}
let stream, bodyDetector, timer, modelsReady = false, starting = false, busy = false;
let generation = 0, tracker = new Tracker(), lastFrame = -1, lastAttempt = -Infinity;
let notifying = false, audioContext;
let enrolling = false, detectionDone = Promise.resolve();
let mode = "idle", draft = [];
const frame = document.createElement("canvas");
const context = frame.getContext("2d");

function status(text, type = "") {
  $("statusText").textContent = text;
  $("statusPill").className = "status-pill " + type;
}
function log(text) {
  $("events").querySelector(".event-empty")?.remove();
  const row = document.createElement("div");
  row.className = "event";
  const label = document.createElement("strong");
  label.textContent = text;
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString();
  row.append(label, time);
  $("events").prepend(row);
  while ($("events").children.length > 8) $("events").lastChild.remove();
}
function ownerUI() {
  $("ownerStatus").textContent = mode === "enrollment" ? "待确认样本：" + draft.length + "/3" : samples.length === 3 ? "已登记：匹配机主时静默" : "请先录入并确认机主特征";
  $("recordOwnerBtn").disabled = starting || enrolling || busy || mode === "enrollment";
  $("enrollBtn").disabled = mode !== "enrollment" || !stream || !modelsReady || draft.length === 3 || enrolling;
  $("enrollBtn").textContent = enrolling ? "正在采集，请正对镜头…" : "采集机主样本（共 3 次）";
  $("confirmOwnerBtn").disabled = mode !== "enrollment" || draft.length !== 3 || enrolling || starting;
  $("cancelOwnerBtn").disabled = mode !== "enrollment";
  $("clearOwnerBtn").disabled = !samples.length || enrolling || starting || mode !== "idle";
  $("startBtn").disabled = samples.length !== 3 || mode !== "idle" || starting || busy || enrolling;
}
async function models() {
  if (modelsReady) return;
  if (!window.faceapi) throw new Error("人脸库未加载，请刷新页面");
  const { ObjectDetector, FilesetResolver } = await import("/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs");
  const vision = await FilesetResolver.forVisionTasks("/node_modules/@mediapipe/tasks-vision/wasm");
  if (!bodyDetector) bodyDetector = await ObjectDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "/models/efficientdet_lite0.tflite", delegate: "CPU" },
    runningMode: "IMAGE", categoryAllowlist: ["person"], scoreThreshold: 0.5, maxResults: 8
  });
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri("/models/face-api"),
    faceapi.nets.faceLandmark68Net.loadFromUri("/models/face-api"),
    faceapi.nets.faceRecognitionNet.loadFromUri("/models/face-api")
  ]);
  modelsReady = true;
}
function capture() {
  frame.width = 640;
  frame.height = Math.round(640 * video.videoHeight / video.videoWidth);
  context.drawImage(video, 0, 0, frame.width, frame.height);
}
async function faces(enrollment = false) {
  return faceapi.detectAllFaces(frame, new faceapi.TinyFaceDetectorOptions({ inputSize: enrollment ? 416 : 320, scoreThreshold: 0.55 }))
    .withFaceLandmarks().withFaceDescriptors();
}
function beep() {
  if (!$("soundToggle").checked || audioContext?.state !== "running") return;
  const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.035, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(); oscillator.stop(audioContext.currentTime + 0.16);
}
async function sendNotification(test = false, session = generation) {
  const response = await fetch("/notify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: test ? "耍起 V1.0测试" : "有人在看你", body: "检测到未排除为机主的人员，请留意周围。" }),
    signal: AbortSignal.timeout(8000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const detail = result.error || "通知服务返回失败";
    throw new Error(/E_ACCESSDENIED|80070005/i.test(detail) ? "Windows 拒绝访问通知服务（0x80070005）" : detail);
  }
  if (session === generation) $("notice").textContent = "已提交 Windows 通知；是否显示请以通知中心为准。";
}
async function alertTracks(tracks, session) {
  if (enrolling || mode !== "monitoring" || session !== generation) return;
  const candidates = tracks.filter(t => t.hits >= 3 && t.identity !== "owner" && ($("repeatToggle").checked || !t.alerted));
  if (!candidates.length || notifying || Date.now() - lastAttempt < Number($("cooldownSelect").value) * 1000) return;
  notifying = true;
  lastAttempt = Date.now();
  beep();
  log("有人在看你：发现非机主或身份不明人员");
  try {
    await sendNotification(false, session);
    candidates.forEach(t => { t.alerted = true; });
  } catch (error) {
    if (session === generation) $("notice").textContent = "Windows 通知失败：" + error.message + "。页面提示仍有效；可勾选短提示音。";
  } finally { notifying = false; }
}
async function tick(session) {
  if (session !== generation || !stream || mode !== "monitoring") return;
  let acquired = false;
  let release;
  try {
    if (!busy && !enrolling && video.readyState >= 2 && video.currentTime !== lastFrame) {
      detectionDone = new Promise(resolve => { release = resolve; });
      busy = true; acquired = true; ownerUI(); lastFrame = video.currentTime;
      capture();
      const detections = bodyDetector.detect(frame).detections;
      const faceResults = await faces();
      if (session !== generation || !stream || enrolling) return;
      const bodies = detections.map(d => ({ x: d.boundingBox.originX, y: d.boundingBox.originY, width: d.boundingBox.width, height: d.boundingBox.height }));
      const people = labelPeople(bodies, faceResults.map(f => ({ box: f.detection.box, descriptor: f.descriptor })), samples);
      const tracks = tracker.update(people, Date.now());
      const others = tracks.filter(t => t.hits >= 3 && t.identity !== "owner");
      $("faceBadge").classList.toggle("visible", tracks.length > 0);
      $("faceBadge").textContent = tracks.length + " 人";
      $("faceInfo").textContent = tracks.length ? tracks.map(t => "#" + t.id + " " + t.activity + " · " + (t.identity === "owner" ? "机主（静默）" : t.identity === "other" ? "非机主" : "身份不明")).join("；") : "未发现人员";
      status(others.length ? "发现其他人员" : tracks.length ? "核验中 / 机主已排除" : "监控中", others.length ? "alert" : "active");
      void alertTracks(tracks, session);
    }
  } catch (error) {
    if (session === generation) { status("检测异常"); $("notice").textContent = "检测失败：" + error.message; }
  } finally {
    if (acquired) busy = false;
    release?.();
    ownerUI();
    if (session === generation && stream && mode === "monitoring") timer = setTimeout(() => tick(session), 180);
  }
}
async function start(targetMode = "monitoring") {
  if (stream || starting || busy || enrolling) return;
  if (targetMode === "monitoring" && samples.length !== 3) {
    $("notice").textContent = "请先点击录入机主特征，采集并确认保存后再开始监控。";
    return;
  }
  mode = targetMode;
  if (mode === "enrollment") draft = [];
  starting = true; $("startBtn").disabled = true; $("stopBtn").disabled = false;
  ownerUI();
  const session = ++generation;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前浏览器不支持摄像头，请用 Edge 或 Chrome 打开本地网址");
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio && $("soundToggle").checked) { audioContext ||= new Audio(); await audioContext.resume(); }
    $("notice").textContent = "正在连接摄像头…";
    const acquired = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    if (session !== generation) { acquired.getTracks().forEach(t => t.stop()); return; }
    stream = acquired;
    video.srcObject = stream;
    await video.play();
    if (session !== generation) return;
    video.classList.add("visible"); $("emptyState").style.display = "none";
    $("cameraInfo").textContent = stream.getVideoTracks()[0].label || "摄像头已连接";
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if (session === generation) { stop(); $("notice").textContent = "摄像头已断开，请重新连接后启动"; }
    });
    $("notice").textContent = "摄像头已连接，正在加载本地人体与机主识别模型…";
    await models();
    if (session !== generation) return;
    if (mode === "enrollment") {
      status("录入机主中");
      $("faceInfo").textContent = "仅预览和采集，监控尚未运行";
      $("ownerHint").textContent = "请单独面对镜头采集 3 次，再点击“确认保存”。";
      $("notice").textContent = "录入模式：不会监控或自动提醒。";
      return;
    }
    tracker = new Tracker(); lastFrame = -1; lastAttempt = -Infinity;
    $("notice").textContent = samples.length === 3 ? "监控中：仅排除当前清晰匹配的机主，其他人员仍提醒。" : "尚未登记机主。可采集 3 个样本；未登记时所有人员均可能提醒。";
    status("监控中", "active"); log("开始人体活动监控");
    void tick(session);
  } catch (error) {
    if (session === generation) {
      stop(); status("启动失败");
      const reasons = { NotAllowedError: "摄像头权限被拒绝，请在浏览器中允许摄像头", NotReadableError: "摄像头无法读取，可能正被其他程序占用", NotFoundError: "没有检测到可用摄像头" };
      $("notice").textContent = reasons[error.name] || "启动失败：" + error.message;
    }
  } finally {
    starting = false; $("startBtn").disabled = !!stream; ownerUI();
  }
}
function stop() {
  ++generation; clearTimeout(timer);
  mode = "idle"; draft = [];
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  video.srcObject = null; video.classList.remove("visible");
  $("emptyState").style.display = "grid"; $("faceBadge").classList.remove("visible");
  $("startBtn").disabled = false; $("stopBtn").disabled = true;
  $("cameraInfo").textContent = "摄像头已停止"; $("faceInfo").textContent = "尚未检测";
  status("已停止"); ownerUI();
}
$("enrollBtn").addEventListener("click", async () => {
  if (mode !== "enrollment" || enrolling || !stream || !modelsReady || draft.length === 3) return;
  enrolling = true; ownerUI(); const session = generation;
  const hint = $("ownerHint");
  hint.textContent = "正在等待当前检测结束，请保持正对镜头…";
  try {
    await detectionDone;
    if (session !== generation || !stream) return;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) throw new Error("摄像头画面尚未就绪，请稍后重试");
    hint.textContent = "正在提取面容特征，请保持画面中只有你的一张清晰人脸…";
    capture();
    const found = await faces(true);
    if (session !== generation) return;
    if (found.length === 0) throw new Error("未找到清晰人脸，请靠近镜头、正面看向镜头并增加光线");
    if (found.length > 1) throw new Error("检测到多张人脸，请让其他人离开画面后再采集");
    const descriptor = Array.from(found[0].descriptor);
    if (!validDescriptor(descriptor)) throw new Error("特征无效，请重试");
    if (draft.length && Math.min(...draft.map(s => distance(s, descriptor))) > 0.48) throw new Error("与本次已采集样本不一致，请调整光线或取消后重录");
    draft = [...draft, descriptor];
    hint.textContent = "已采集 " + draft.length + "/3，请稍微调整角度后再采集。";
    if (draft.length === 3) hint.textContent = "采集完成，请点击“确认保存”。保存后才能开始监控。";
  } catch (error) {
    if (session === generation) hint.textContent = "采集失败：" + error.message;
  } finally {
    if (session !== generation) hint.textContent = "采集已取消，未保存本次样本。";
    enrolling = false; ownerUI();
  }
});
$("clearOwnerBtn").addEventListener("click", () => {
  try { localStorage.removeItem(KEY); samples = []; ownerUI(); $("ownerHint").textContent = "机主数据已删除，可重新采集。"; }
  catch (error) { $("notice").textContent = error.message; }
});
$("recordOwnerBtn").addEventListener("click", async () => {
  if (starting || enrolling || busy) return;
  stop();
  await start("enrollment");
});
$("confirmOwnerBtn").addEventListener("click", () => {
  if (mode !== "enrollment" || draft.length !== 3 || enrolling) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ samples: draft }));
    samples = draft.slice();
    stop();
    $("ownerHint").textContent = "机主特征已确认保存。现在可以点击“开始监控”。";
    $("notice").textContent = "准备就绪，等待手动开始监控。";
  } catch (error) { $("ownerHint").textContent = "保存失败：" + error.message; }
});
$("cancelOwnerBtn").addEventListener("click", () => {
  stop();
  $("ownerHint").textContent = "已取消本次录入，原有机主特征保持不变。";
});
$("startBtn").addEventListener("click", () => start("monitoring"));
$("stopBtn").addEventListener("click", stop);
$("testNotificationBtn").addEventListener("click", async () => {
  $("testNotificationBtn").disabled = true;
  try { await sendNotification(true); }
  catch (error) { $("notice").textContent = "Windows 通知失败：" + error.message; }
  finally { $("testNotificationBtn").disabled = false; }
});
$("clearBtn").addEventListener("click", () => { $("events").replaceChildren(); });
window.addEventListener("beforeunload", stop);
ownerUI();
