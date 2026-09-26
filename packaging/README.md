# 构建 Windows 安装包

需在 Windows x64 上使用 Node.js 24、.NET Framework 4 的 C# 编译器、Inno Setup 6。构建脚本默认从 `C:\Program Files\nodejs\node.exe` 复制运行环境；不同位置需调整 `build.ps1`。Inno Setup 编译器通过 `-Compiler` 指定。

```powershell
npm ci
npm test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/build.ps1 -Compiler "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
```

输出为 `dist/Shuaiqi-V1.0-Setup-x64.exe`。构建时使用仓库根目录 `奶龙.png` 生成多分辨率图标、编译托盘启动器、复制运行依赖并生成 SHA-256 文件清单。图标生成保留原图比例。

源码运行需要的两个小型 Windows 通知辅助 EXE 随仓库提供，源码分别为 `register-toast.cs` 和 `toast-sender.cs`。可在 Windows 上重新编译：

```powershell
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /nologo /target:exe /codepage:65001 /out:register-toast.exe register-toast.cs
& $csc /nologo /target:exe /codepage:65001 /out:toast-sender.exe toast-sender.cs
```

安装后的 `CameraWatch.exe --self-test` 验证文件；`--smoke-test` 验证文件并启动、检查、关闭自己的服务，不打开浏览器。日志位于 `%LOCALAPPDATA%\CameraWatch\logs\startup.log`，也可用 `CAMERA_WATCH_DATA_DIR` 指定测试目录。

开发机路径、日志、旧版备份、机主特征、npm 依赖缓存和安装器编译器均不纳入仓库。安装包已包含可运行依赖。
