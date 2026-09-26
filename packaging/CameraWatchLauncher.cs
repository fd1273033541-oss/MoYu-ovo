using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Drawing;
using System.Reflection;

[assembly: AssemblyTitle("耍起 V1.0")]
[assembly: AssemblyProduct("耍起 V1.0")]
[assembly: AssemblyDescription("耍起 V1.0 摄像头监控")]
[assembly: AssemblyVersion("4.2.1.0")]
[assembly: AssemblyFileVersion("4.2.1.0")]

internal static class CameraWatchLauncher
{
    static string root = AppDomain.CurrentDomain.BaseDirectory;
    static string data = Environment.GetEnvironmentVariable("CAMERA_WATCH_DATA_DIR") ??
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CameraWatch", "logs");
    static string url = "http://127.0.0.1:18787/";
    static Process server;
    static object logLock = new object();
    static NotifyIcon tray;
    static void Log(string value) {
        lock(logLock) File.AppendAllText(Path.Combine(data, "startup.log"), DateTime.Now.ToString("s") + " " + value + Environment.NewLine, Encoding.UTF8);
    }
    static ProcessStartInfo Node(string script) {
        var info = new ProcessStartInfo(Path.Combine(root, "runtime", "node.exe"), "\"" + Path.Combine(root, script) + "\"");
        info.WorkingDirectory = root;
        info.UseShellExecute = false; info.CreateNoWindow = true;
        info.RedirectStandardOutput = true; info.RedirectStandardError = true;
        info.StandardOutputEncoding = Encoding.UTF8; info.StandardErrorEncoding = Encoding.UTF8;
        return info;
    }
    static string Health() {
        var request = (HttpWebRequest)WebRequest.Create(url + "health");
        request.Timeout = 1200; request.Proxy = null;
        using (var response = request.GetResponse())
        using (var reader = new StreamReader(response.GetResponseStream())) return reader.ReadToEnd();
    }
    static void OpenPage() {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception error) { MessageBox.Show("请手动用 Edge 或 Chrome 打开：" + url + "\n" + error.Message, "耍起 V1.0"); }
    }
    static void Shutdown() {
        if (tray != null) { tray.Visible = false; tray.Dispose(); }
        if (server != null) {
            try { if (!server.HasExited) { server.Kill(); server.WaitForExit(4000); } } catch {}
            server.Dispose(); server = null;
        }
    }
    [STAThread]
    static int Main(string[] args) {
        bool smoke = Array.IndexOf(args, "--smoke-test") >= 0;
        bool checkOnly = Array.IndexOf(args, "--self-test") >= 0;
        Directory.CreateDirectory(data);
        Application.EnableVisualStyles();
        bool created;
        using (var mutex = new Mutex(true, "Local\\CameraWatchDesktop", out created)) {
            if (!created) {
                if (smoke || checkOnly) return 3;
                try {
                    if (Health().Contains("\"app\":\"camera-watch-desktop\"")) OpenPage();
                    else throw new Exception("现有程序仍在启动，请稍后重试。");
                } catch (Exception e) { MessageBox.Show(e.Message, "耍起 V1.0"); }
                return 0;
            }
            try {
                Log("Checking bundled runtime and model integrity");
                using (var check = Process.Start(Node("check-runtime.cjs"))) {
                    string output = check.StandardOutput.ReadToEnd(), error = check.StandardError.ReadToEnd();
                    check.WaitForExit(); Log(output + error);
                    if (check.ExitCode != 0) throw new Exception("安装文件自检失败，请重新安装。\n" + error);
                }
                if (checkOnly) { Log("SELF_TEST_OK"); return 0; }
                var info = Node("camera-server.js");
                info.Arguments += " --desktop";
                server = new Process { StartInfo = info, EnableRaisingEvents = true };
                server.OutputDataReceived += (s, e) => { if (e.Data != null) Log(e.Data); };
                server.ErrorDataReceived += (s, e) => { if (e.Data != null) Log(e.Data); };
                server.Start(); server.BeginOutputReadLine(); server.BeginErrorReadLine();
                bool ready = false;
                for (int i = 0; i < 40; i++) {
                    if (server.HasExited) throw new Exception("本地服务退出。可能有其他程序占用 18787 端口。");
                    try { string health = Health(); if (health.Contains("\"pid\":" + server.Id + ",") && health.Contains("\"app\":\"camera-watch-desktop\"")) { ready = true; break; } } catch {}
                    Thread.Sleep(250);
                }
                if (!ready) throw new Exception("本地服务没有响应，请查看启动日志。");
                Log("HTTP_HEALTH_OK");
                if (smoke) { Log("SMOKE_TEST_OK"); return 0; }
                tray = new NotifyIcon { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath), Text = "耍起 V1.0", Visible = true };
                var menu = new ContextMenuStrip();
                menu.Items.Add("打开监控页面", null, (s, e) => OpenPage());
                menu.Items.Add("查看日志", null, (s, e) => Process.Start("explorer.exe", data));
                menu.Items.Add("退出耍起 V1.0", null, (s, e) => Application.Exit());
                tray.ContextMenuStrip = menu; tray.DoubleClick += (s, e) => OpenPage();
                var timer = new System.Windows.Forms.Timer { Interval = 2000 };
                timer.Tick += (s, e) => { if (server.HasExited) { timer.Stop(); MessageBox.Show("本地服务已停止，请重新启动。日志：" + data, "耍起 V1.0"); Application.Exit(); } };
                timer.Start(); OpenPage();
                Application.Run();
                timer.Dispose();
                return 0;
            } catch (Exception error) {
                Log("FAILED " + error);
                if (!smoke && !checkOnly) MessageBox.Show(error.Message + "\n日志：" + data, "耍起 V1.0启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            } finally { Shutdown(); }
        }
    }
}
