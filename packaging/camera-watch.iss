#define AppVersion "4.2.1"
[Setup]
AppId={{7E458EAF-8543-4C0D-9C97-D39C4F0BDCEA}
AppName=耍起 V1.0
AppVerName=耍起 V1.0
AppVersion={#AppVersion}
AppPublisher=耍起
DefaultDirName={localappdata}\Programs\CameraWatch
DefaultGroupName=耍起 V1.0
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\dist
OutputBaseFilename=Shuaiqi-V1.0-Setup-x64
SetupIconFile=shuaiqi.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\CameraWatch.exe
CloseApplications=yes
AppMutex=Local\CameraWatchDesktop
SetupLogging=yes
[Files]
Source: "stage\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"
[Icons]
Name: "{group}\耍起 V1.0"; Filename: "{app}\CameraWatch.exe"; IconFilename: "{app}\shuaiqi.ico"; AppUserModelID: "FaceWatch.Desktop"
Name: "{autodesktop}\耍起 V1.0"; Filename: "{app}\CameraWatch.exe"; IconFilename: "{app}\shuaiqi.ico"; Tasks: desktopicon
[Run]
Filename: "{app}\CameraWatch.exe"; Description: "启动耍起 V1.0"; Flags: nowait postinstall skipifsilent
