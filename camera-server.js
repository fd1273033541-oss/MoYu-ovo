const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = __dirname;
const desktop = process.argv.includes("--desktop") || process.env.CAMERA_WATCH_DESKTOP === "1";
const port = desktop ? 18787 : Number(process.env.CAMERA_WATCH_PORT || 8787);
const appId = desktop ? "FaceWatch.Desktop" : "FaceWatch.Local";
const shortcutPath = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "耍起 V1.0.lnk");
const registrationHelper = path.join(root, "register-toast.exe");
const toastSender = path.join(root, "toast-sender.exe");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".tflite": "application/octet-stream",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(JSON.stringify(payload));
}

function registerToastIdentity() {
  if (fs.existsSync(shortcutPath)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const child = spawn(registrationHelper, [shortcutPath, toastSender, root, appId], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || `通知身份注册进程退出码 ${code}`)));
  });
}

async function ensureToastIdentity() {
  if (desktop) return; // Installed shortcut carries the AppUserModelID.
  await registerToastIdentity();
  if (!fs.existsSync(shortcutPath)) throw new Error("Windows 通知身份注册失败：未创建开始菜单快捷方式");
}

async function showWindowsToast(title, body) {
  await ensureToastIdentity();
  return new Promise((resolve, reject) => {
    const child = spawn(toastSender, [appId, title, body], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ submitted: true, displayUnconfirmed: true });
      else reject(new Error(stderr.trim() || `Windows Toast 被拒绝，退出码 ${code}`));
    });
  });
}

function validateNotifyPayload(input) {
  if (!input || typeof input !== "object") throw new Error("通知请求格式无效");
  return {
    title: String(input.title || "耍起 V1.0").slice(0, 80),
    body: String(input.body || "").slice(0, 240),
  };
}

http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { app: desktop ? "camera-watch-desktop" : "camera-watch", pid: process.pid, version: "4.2.1" });
    return;
  }
  if (req.method === "POST" && req.url === "/notify") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      const input = validateNotifyPayload(JSON.parse(raw));
      const { title, body } = input;
      const delivery = await showWindowsToast(title, body);
      sendJson(res, 200, { ok: true, delivery });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  const requested = req.url === "/" ? "/camera-monitor.html" : req.url.split("?")[0];
  const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(404); res.end("Not found"); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end("Not found"); return; }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", async () => {
  console.log(`耍起 V1.0已启动：http://127.0.0.1:${port}/`);
  console.log("在浏览器中打开地址，点击“开始监控”即可。按 Ctrl+C 停止程序。");
  try {
    await ensureToastIdentity();
    console.log("Windows 通知身份已注册。");
  } catch (error) {
    console.error(`Windows 通知身份注册失败：${error.message}`);
  }
});
