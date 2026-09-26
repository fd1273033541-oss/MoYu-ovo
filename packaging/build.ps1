param([string]$Compiler = "$PSScriptRoot\inno\ISCC.exe", [switch]$StageOnly)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $PSScriptRoot 'stage'
& "$PSScriptRoot\make-icon.ps1"
Copy-Item -LiteralPath "$PSScriptRoot\shuaiqi.ico" -Destination "$project\shuaiqi.ico"
New-Item -ItemType Directory -Force $stage, "$stage\runtime", "$stage\licenses", "$stage\node_modules\face-api.js\dist", "$stage\node_modules\@mediapipe\tasks-vision" | Out-Null
$files = @('camera-monitor.js','camera-monitor.html','camera-monitor.css','watch-logic.mjs','camera-server.js','toast-sender.exe','register-toast.exe','CAMERA-WATCH-V4.md')
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $project $file) -Destination $stage }
Copy-Item -LiteralPath "$PSScriptRoot\check-runtime.cjs" -Destination $stage
Copy-Item -LiteralPath "$project\models" -Destination $stage -Recurse -Force
Copy-Item -LiteralPath 'C:\Program Files\nodejs\node.exe' -Destination "$stage\runtime\node.exe"
Copy-Item -LiteralPath "$project\node_modules\face-api.js\dist\face-api.min.js" -Destination "$stage\node_modules\face-api.js\dist"
Copy-Item -LiteralPath "$project\node_modules\face-api.js\LICENSE" -Destination "$stage\licenses\face-api-LICENSE.txt"
Copy-Item -LiteralPath "$project\node_modules\@mediapipe\tasks-vision\vision_bundle.mjs" -Destination "$stage\node_modules\@mediapipe\tasks-vision"
Copy-Item -LiteralPath "$project\node_modules\@mediapipe\tasks-vision\wasm" -Destination "$stage\node_modules\@mediapipe\tasks-vision" -Recurse -Force
Copy-Item -Path "$PSScriptRoot\licenses\*" -Destination "$stage\licenses"
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
Copy-Item -LiteralPath "$PSScriptRoot\shuaiqi.ico" -Destination "$stage\shuaiqi.ico"
& $csc /nologo /target:winexe /platform:x64 /codepage:65001 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/win32icon:$PSScriptRoot\shuaiqi.ico" "/out:$stage\CameraWatch.exe" "$PSScriptRoot\CameraWatchLauncher.cs"
if ($LASTEXITCODE) { throw 'Launcher compilation failed' }
$manifest = [ordered]@{version='4.2.1';displayName='耍起 V1.0';files=[ordered]@{}}
Get-ChildItem -LiteralPath $stage -Recurse -File | Where-Object { $_.Name -ne 'bundle-manifest.json' } | Sort-Object FullName | ForEach-Object {
  $name = $_.FullName.Substring($stage.Length + 1).Replace('\','/')
  $manifest.files[$name] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower()
}
[IO.File]::WriteAllText("$stage\bundle-manifest.json", ($manifest | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
& "$stage\runtime\node.exe" "$stage\check-runtime.cjs"
if ($LASTEXITCODE) { throw 'Bundle self-test failed' }
if ($StageOnly) { exit 0 }
& $Compiler "$PSScriptRoot\camera-watch.iss"
if ($LASTEXITCODE) { throw 'Installer compilation failed' }
