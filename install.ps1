#Requires -Version 5.1
<#
    Apple Music UI for foobar2000 - 설치 도우미

    하는 일 (모두 관리자 권한 없이, 사용자 영역에만):
      1. foobar2000 설치 위치와 프로필 폴더를 찾는다
      2. Pretendard 폰트를 설치한다
      3. apple-music.js를 프로필 폴더에 두고, 내용을 클립보드에 복사한다
      4. JScript Panel 3 컴포넌트를 foobar2000 자체 설치기로 넘긴다

    지우거나 덮어쓰는 파일은 없다. 각 단계는 실패해도 다음 단계로 넘어간다.
#>
[CmdletBinding()]
param(
    [string] $Fb2kPath,          # foobar2000.exe 경로를 직접 지정할 때
    [switch] $SkipFont,
    [switch] $SkipComponent,
    [switch] $ColumnsUI          # 물어보지 않고 Columns UI까지 설치
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$script:Steps = @()
function Note($stage, $result) { $script:Steps += [pscustomobject]@{ 단계 = $stage; 결과 = $result } }
function Say($text, $colour = 'Gray') { Write-Host $text -ForegroundColor $colour }
function Head($text) { Write-Host ''; Write-Host $text -ForegroundColor Cyan }

Write-Host ''
Write-Host '  Apple Music UI for foobar2000' -ForegroundColor White
Write-Host '  ------------------------------' -ForegroundColor DarkGray

# ---------------------------------------------------------------- foobar2000 --
function Find-Foobar {
    $found = New-Object System.Collections.ArrayList

    $appPath = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\foobar2000.exe'
    $v = (Get-ItemProperty $appPath -ErrorAction SilentlyContinue).'(default)'
    if ($v) { [void]$found.Add($v) }

    $uninstall = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
    )
    foreach ($root in $uninstall) {
        Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
            $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
            if ($p.DisplayName -like 'foobar2000*' -and $p.InstallLocation) {
                [void]$found.Add((Join-Path $p.InstallLocation 'foobar2000.exe'))
            }
        }
    }
    foreach ($guess in @(
        "$env:ProgramFiles\foobar2000\foobar2000.exe",
        "$env:ProgramFiles\foobar2000 v2\foobar2000.exe",
        "${env:ProgramFiles(x86)}\foobar2000\foobar2000.exe",
        "${env:ProgramFiles(x86)}\foobar2000 v2\foobar2000.exe",
        "$env:LOCALAPPDATA\Programs\foobar2000\foobar2000.exe"
    )) { [void]$found.Add($guess) }

    foreach ($f in $found) { if ($f -and (Test-Path -LiteralPath $f)) { return (Resolve-Path $f).Path } }
    return $null
}

function Get-Bitness($exe) {
    try {
        $fs = [IO.File]::OpenRead($exe)
        $br = New-Object IO.BinaryReader($fs)
        [void]$fs.Seek(0x3C, 'Begin'); $peOffset = $br.ReadInt32()
        [void]$fs.Seek($peOffset + 4, 'Begin'); $machine = $br.ReadUInt16()
        $br.Close(); $fs.Close()
        switch ($machine) { 0x8664 { 'x64' } 0x014c { 'x86' } default { '알 수 없음' } }
    } catch { '알 수 없음' }
}

Head '1. foobar2000 찾는 중'
$exe = if ($Fb2kPath) { $Fb2kPath } else { Find-Foobar }
if (-not $exe -or -not (Test-Path -LiteralPath $exe)) {
    Say '   foobar2000을 찾지 못했습니다.' Red
    Say '   설치되어 있다면 이렇게 경로를 직접 알려주세요:' DarkGray
    Say '   powershell -ExecutionPolicy Bypass -File install.ps1 -Fb2kPath "D:\foobar2000\foobar2000.exe"' DarkGray
    Say '   아직 없다면 https://www.foobar2000.org/download 에서 먼저 설치하세요.' DarkGray
    Note 'foobar2000 찾기' '실패 - 중단'
    $script:Steps | Format-Table -AutoSize
    return
}
$installDir = Split-Path $exe -Parent
$bitness = Get-Bitness $exe
Say "   $exe  ($bitness)" Green

# 프로필 폴더 ($profile 은 PowerShell 예약 변수라 쓰면 안 된다)
$profileDir = $null
if (Test-Path -LiteralPath (Join-Path $installDir 'portable_mode_enabled')) {
    $profileDir = Join-Path $installDir 'profile'
} elseif (Test-Path -LiteralPath "$env:APPDATA\foobar2000-v2") {
    $profileDir = "$env:APPDATA\foobar2000-v2"
} elseif (Test-Path -LiteralPath "$env:APPDATA\foobar2000") {
    $profileDir = "$env:APPDATA\foobar2000"
} else {
    $profileDir = "$env:APPDATA\foobar2000-v2"
}
if (-not (Test-Path -LiteralPath $profileDir)) {
    New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
}
Say "   프로필: $profileDir" Green
Note 'foobar2000 찾기' "$bitness"

# --------------------------------------------------------------------- 폰트 --
# 새로 설치한 폰트를 지금 실행 중인 프로그램들에게 알린다 (재로그인 없이 반영)
function Broadcast-FontChange {
    try {
        if (-not ('Win32FontBroadcast' -as [type])) {
            Add-Type -Namespace Win32 -Name FontBroadcast -MemberDefinition @'
[DllImport("user32.dll")]
public static extern int SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam,
    IntPtr lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
'@ -ErrorAction Stop
        }
        $HWND_BROADCAST = [IntPtr]0xffff
        $WM_FONTCHANGE  = 0x001D
        $out = [IntPtr]::Zero
        [void][Win32.FontBroadcast]::SendMessageTimeout($HWND_BROADCAST, $WM_FONTCHANGE,
            [IntPtr]::Zero, [IntPtr]::Zero, 2, 1000, [ref]$out)
    } catch { }
}

function Install-UserFont($url, $fileName, $displayName) {
    $fontDir = "$env:LOCALAPPDATA\Microsoft\Windows\Fonts"
    $dest = Join-Path $fontDir $fileName
    if (Test-Path -LiteralPath $dest) { return 'already' }
    New-Item -ItemType Directory -Force -Path $fontDir | Out-Null
    $tmp = Join-Path $env:TEMP $fileName
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -TimeoutSec 60
    if ((Get-Item $tmp).Length -lt 50000) { throw '내려받은 파일이 폰트가 아닙니다' }
    Copy-Item $tmp $dest -Force
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    $key = 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    New-ItemProperty -Path $key -Name "$displayName (OpenType)" -Value $dest -PropertyType String -Force | Out-Null
    return 'installed'
}

Head '2. Pretendard 폰트'
if ($SkipFont) {
    Say '   건너뜀 (-SkipFont)' DarkGray
    Note '폰트' '건너뜀'
} else {
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
    $base = 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static'
    $weights = @(
        @{ file = 'Pretendard-Regular.otf';  name = 'Pretendard Regular' },
        @{ file = 'Pretendard-Medium.otf';   name = 'Pretendard Medium' },
        @{ file = 'Pretendard-SemiBold.otf'; name = 'Pretendard SemiBold' },
        @{ file = 'Pretendard-Bold.otf';     name = 'Pretendard Bold' }
    )
    $ok = 0; $skip = 0; $fail = 0
    foreach ($w in $weights) {
        try {
            $r = Install-UserFont "$base/$($w.file)" $w.file $w.name
            if ($r -eq 'installed') { $ok++; Say "   설치: $($w.name)" Green }
            else { $skip++; Say "   이미 있음: $($w.name)" DarkGray }
        } catch {
            $fail++
            Say "   실패: $($w.name) - $($_.Exception.Message)" Yellow
        }
    }
    if ($ok -gt 0) { Broadcast-FontChange }
    if ($fail -gt 0 -and $ok -eq 0 -and $skip -eq 0) {
        Say '   폰트 없이도 동작합니다. 맑은 고딕으로 표시됩니다.' DarkGray
        Say '   직접 설치: https://github.com/orioncactus/pretendard/releases' DarkGray
        Note '폰트' '실패 - 건너뛰어도 됨'
    } else {
        Note '폰트' "설치 $ok / 기존 $skip / 실패 $fail"
    }
}

# ------------------------------------------------------------------ 스크립트 --
Head '3. 패널 스크립트'
$srcJs = Join-Path $PSScriptRoot 'apple-music.js'
if (-not (Test-Path -LiteralPath $srcJs)) {
    Say "   apple-music.js를 찾지 못했습니다 ($PSScriptRoot)" Red
    Say '   저장소를 통째로 내려받아 압축을 푼 뒤, 그 폴더에서 실행하세요.' DarkGray
    Note '스크립트' '실패 - 파일 없음'
} else {
    $destJs = Join-Path $profileDir 'apple-music.js'
    Copy-Item $srcJs $destJs -Force
    Say "   복사: $destJs" Green
    $body = Get-Content -LiteralPath $srcJs -Raw -Encoding UTF8
    try {
        Set-Clipboard -Value $body
        Say '   클립보드에 복사했습니다. 편집기에서 Ctrl+V만 누르면 됩니다.' Green
        Note '스크립트' '복사 + 클립보드'
    } catch {
        Say '   클립보드 복사는 실패했지만 파일은 위 경로에 있습니다.' Yellow
        Note '스크립트' '복사 (클립보드 실패)'
    }
}

# ---------------------------------------------------------------- 컴포넌트 --
function Find-Component {
    $names = 'foo_jscript_panel3*.fb2k-component', '*jscript*panel*3*.fb2k-component'
    $dirs = @($PSScriptRoot, "$env:USERPROFILE\Downloads", "$env:USERPROFILE\Desktop")
    foreach ($d in $dirs) {
        if (-not (Test-Path -LiteralPath $d)) { continue }
        foreach ($n in $names) {
            $hit = Get-ChildItem -LiteralPath $d -Filter $n -File -ErrorAction SilentlyContinue |
                   Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($hit) { return $hit.FullName }
        }
    }
    return $null
}

Head '4. JScript Panel 3 컴포넌트'
$componentDirs = Get-ChildItem -LiteralPath $profileDir -Directory -Filter 'user-components*' -ErrorAction SilentlyContinue
$already = $null
foreach ($cd in $componentDirs) {
    $hit = Get-ChildItem -LiteralPath $cd.FullName -Recurse -Filter 'foo_jscript_panel3.dll' -ErrorAction SilentlyContinue |
           Select-Object -First 1
    if ($hit) { $already = $hit; break }
}
if ($SkipComponent) {
    Say '   건너뜀 (-SkipComponent)' DarkGray
    Note '컴포넌트' '건너뜀'
} elseif ($already) {
    Say "   이미 설치되어 있습니다: $($already.FullName)" Green
    Note '컴포넌트' '이미 설치됨'
} else {
    $pkg = Find-Component
    if (-not $pkg) {
        # 원저작자(marc2003)가 GitHub 저장소를 내려서 공식 배포처가 없다.
        # 아래는 커뮤니티 미러이며, 내려받은 뒤 해시를 대조한다.
        $mirror = 'https://raw.githubusercontent.com/Dronf3/JScript-Panel-3---foobar2k/main/foo_jscript_panel3-3.4.34.fb2k-component'
        $expect = '70B6B258081BAF05D0181AA8F5382902D6FA5440DF1C80CDD599D3F79C9C906E'
        $target = Join-Path $env:TEMP 'foo_jscript_panel3-3.4.34.fb2k-component'
        Say '   공식 배포처가 사라져 커뮤니티 미러에서 받습니다.' Yellow
        Say '   받은 뒤 SHA-256을 대조합니다.' DarkGray
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $mirror -OutFile $target -UseBasicParsing -TimeoutSec 180
            $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
            if ($hash -eq $expect) {
                Say "   해시 일치 ($($hash.Substring(0,16))...)" Green
                $pkg = $target
            } else {
                Say '   해시가 다릅니다. 파일을 신뢰할 수 없어 설치하지 않습니다.' Red
                Say "   기대: $expect" DarkGray
                Say "   실제: $hash" DarkGray
                Remove-Item $target -Force -ErrorAction SilentlyContinue
            }
        } catch {
            Say "   내려받기 실패: $($_.Exception.Message)" Yellow
        }
    }
    if ($pkg) {
        Say "   찾음: $pkg" Green
        Say '   foobar2000 설치 창이 뜨면 [Yes] / [예] 를 누르고 재시작하세요.' White
        Start-Process -FilePath $pkg
        Note '컴포넌트' 'foobar2000 설치기로 넘김'
    } else {
        Say '   찾지 못했습니다. 내려받은 .fb2k-component 파일을 두 번 눌러 설치하세요.' Yellow
        Note '컴포넌트' '수동 설치 필요'
    }
}

# --------------------------------------------------------------- Columns UI --
#  Default UI에는 상태바를 끄는 기능이 없다. Columns UI는 UI 모듈 자체를
#  교체하는 공식 확장이고, 'Show status bar' / 'Show toolbars' 옵션이 있다.
#  (3.6.0 패키지의 DLL에서 두 문자열을 직접 확인했다)

Head '5. Columns UI (선택)'
$cuiInstalled = $false
foreach ($cd in $componentDirs) {
    if (Get-ChildItem -LiteralPath $cd.FullName -Recurse -Filter 'foo_ui_columns.dll' -ErrorAction SilentlyContinue) {
        $cuiInstalled = $true
    }
}
if ($cuiInstalled) {
    Say '   이미 설치되어 있습니다.' Green
    Note 'Columns UI' '이미 설치됨'
} else {
    $want = $ColumnsUI
    if (-not $want) {
        Say '   Default UI는 상태바와 툴바를 끌 수 없습니다.' DarkGray
        Say '   Columns UI로 바꾸면 창을 이 스크립트만 남기고 비울 수 있습니다.' DarkGray
        Say '   (스크립트는 그대로 쓰고, 레이아웃만 다시 잡으면 됩니다)' DarkGray
        $answer = Read-Host '   설치할까요? [y/N]'
        $want = ($answer -eq 'y' -or $answer -eq 'Y')
    }
    if (-not $want) {
        Say '   건너뜁니다.' DarkGray
        Note 'Columns UI' '건너뜀'
    } else {
        $cuiUrl = 'https://github.com/reupen/columns_ui/releases/download/v3.6.0/foo_ui_columns-3.6.0.x86-x64.fb2k-component'
        $cuiHash = '7381A79FECED139F9F7F4A18D6EFAC5D71DF6336587F1491393318A3945CAE09'
        $cuiFile = Join-Path $env:TEMP 'foo_ui_columns-3.6.0.x86-x64.fb2k-component'
        try {
            Invoke-WebRequest -Uri $cuiUrl -OutFile $cuiFile -UseBasicParsing -TimeoutSec 180
            $h = (Get-FileHash -LiteralPath $cuiFile -Algorithm SHA256).Hash
            if ($h -eq $cuiHash) {
                Say "   해시 일치 ($($h.Substring(0,16))...)" Green
                Say '   설치 창이 뜨면 [Yes] / [예] 를 누르세요.' White
                Start-Process -FilePath $cuiFile
                Note 'Columns UI' 'foobar2000 설치기로 넘김'
            } else {
                Say '   해시가 달라 설치하지 않습니다.' Red
                Remove-Item $cuiFile -Force -ErrorAction SilentlyContinue
                Note 'Columns UI' '해시 불일치'
            }
        } catch {
            Say "   내려받기 실패: $($_.Exception.Message)" Yellow
            Note 'Columns UI' '실패'
        }
    }
}

# -------------------------------------------------------------------- 마무리 --
$fth = Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.fth' -File -ErrorAction SilentlyContinue |
       Select-Object -First 1

Write-Host ''
Write-Host '  요약' -ForegroundColor White
$script:Steps | Format-Table -AutoSize

Write-Host '  남은 단계' -ForegroundColor White
if ($fth) {
    Say "   테마 파일이 있습니다: $($fth.Name)" Green
    Say '   1) foobar2000 재시작' 
    Say '   2) Preferences > Display > Default User Interface'
    Say "   3) [Import Theme] 버튼에서 $($fth.Name) 선택 -> 끝"
} else {
    Say '   1) foobar2000 재시작 (컴포넌트를 방금 설치했다면)'
    Say '   2) View > Layout > Enable layout editing mode'
    Say '   3) 원하는 영역 우클릭 > Replace UI Element... > JScript Panel'
    Say '   4) 그 패널 우클릭 > Configure... > 내용 전부 지우고 Ctrl+V > Apply'
    Say '   5) 패널 우클릭 > 패널 모드 에서 플레이어 / 바 / 재생목록 선택'
    Write-Host ''
    Say '   이 배치가 마음에 들면, 나중에 다시 깔 때를 위해' DarkGray
    Say '   Preferences > Display > Default User Interface 의 [Export Theme] 버튼으로' DarkGray
    Say '   .fth 파일을 뽑아 이 폴더에 두세요. 다음부터는 위 3~5단계가 사라집니다.' DarkGray
}
Write-Host ''
