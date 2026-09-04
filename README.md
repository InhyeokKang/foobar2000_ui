# Apple Music UI for foobar2000

foobar2000 기본 UI를 Apple Music처럼 바꿔주는 패널 스크립트입니다.
`apple-music.js` **파일 하나**로 세 가지 패널을 모두 만듭니다.

> **[→ 라이브 미리보기](https://claude.ai/code/artifact/0a4426bb-fc4f-4960-b85a-b4fabc8d4355)**
> — 설치 전에 어떤 모습인지 브라우저에서 눌러보세요. 저장소의 `preview.html`과 같은 파일이며,
> 이 스크립트를 캔버스 위에서 그대로 실행합니다.

| 모드 | 모습 | 쓰임새 |
|------|------|--------|
| `all` | **상단 바 + 재생목록 사이드바 + 트랙 리스트를 한 패널이 전부** | **대부분 이것만 쓰면 됩니다** |
| `player` | 큰 앨범아트 + 제목/아티스트 + 재생바 + 컨트롤 + 볼륨 (세로형) | 영역을 직접 쪼갠 경우 |
| `bar` | 가로 트랜스포트 바 + 가운데 라운드 카드(아트·제목·진행바) | 〃 |
| `list` | 앨범 썸네일 + 제목/아티스트 + 앨범 + 시간 트랙 리스트 | 〃 |
| `auto` | 패널이 크면 `all`, 납작하면 `bar`, 좁고 길면 `player` | 기본값 |

> **Default UI는 영역이 처음에 하나뿐입니다.** 그래서 기본 모드는 그 하나에 전부를 그리는
> `all`입니다. 영역을 쪼개지 않아도 됩니다.
>
> `all` 모드의 왼쪽은 Apple Music처럼 **재생목록 사이드바**입니다. 목록을 누르면 그 재생목록으로
> 전환되고, 아래 공간이 남으면 재생 중인 앨범아트가 채웁니다.

다크/라이트 테마, Apple Music 시그니처 레드(`#FA243C`) 액센트, 라운드 코너 앨범아트,
호버 하이라이트, 재생 중 트랙의 이퀄라이저 애니메이션까지 들어 있습니다.

아이콘은 폰트 글리프가 아니라 **SVG**입니다. JScript Panel 3에 내장된 resvg가 그리므로
아이콘 폰트를 따로 깔 필요가 없고, 어떤 배율에서도 뭉개지지 않습니다.

---

## 원클릭 설치

저장소를 [ZIP으로 받아](https://github.com/InhyeokKang/foobar2000_ui/archive/refs/heads/main.zip)
압축을 풀고 **`install.bat`** 을 두 번 누르세요. 관리자 권한은 필요 없습니다.

설치기가 자동으로 하는 일:

1. foobar2000 설치 위치와 프로필 폴더를 찾습니다 (일반/포터블, 32·64비트 모두)
2. **Pretendard** 폰트를 사용자 영역에 설치합니다
3. `apple-music.js`를 프로필 폴더에 넣고, **내용을 클립보드에 복사**합니다
4. **JScript Panel 3** 컴포넌트를 foobar2000 자체 설치기로 넘깁니다
   (없으면 다운로드 페이지를 열고, 받을 때까지 기다렸다가 이어서 진행)

지우거나 덮어쓰는 파일은 없고, 단계별로 실패해도 나머지는 계속 진행합니다.

### 그래도 남는 3단계

패널 **배치**는 foobar2000 프로필 안에 바이너리 설정으로 저장돼서, 설치기가 밖에서
만들어 넣을 수 없습니다. 그래서 이것만 직접 하셔야 합니다 (설치기가 끝나면서 그대로 안내합니다):

1. `View` → `Layout` → **`Enable layout editing mode`**
   (같은 항목이 `Preferences` → `Display` → `Default User Interface`에 체크박스로도 있습니다)
2. **재생목록이 있는 큰 영역**에서 우클릭 → `Replace UI Element...` → **JScript Panel**
   (Default UI를 처음 열면 이 영역 하나뿐입니다. 그게 맞습니다 — 쪼갤 필요 없습니다)
3. 그 패널 우클릭 → `Configure...` → 내용 전부 지우고 **Ctrl+V** → `Apply`
   → `Enable layout editing mode` 다시 해제

> foobar2000 v2.24에서 확인한 경로입니다.

이러면 그 패널 하나가 상단 바 + 나우플레잉 + 트랙 리스트를 전부 그립니다.

**정말 영역을 나누고 싶다면** — 레이아웃 편집을 켠 상태에서 패널을 우클릭하면
`Insert UI Element` 계열 항목으로 위/아래/좌/우에 새 영역을 끼워 넣을 수 있습니다.
그렇게 만든 각 패널에 같은 스크립트를 붙여넣고, 패널 우클릭 → `패널 모드`에서
`바` / `플레이어` / `재생목록`을 따로 지정하면 됩니다.

### 한 번 하면 다음부터는 정말 원클릭

배치가 마음에 들면 `Preferences` → `Display` → `Default User Interface` 페이지
오른쪽 위 **`Export Theme`** 버튼으로 `.fth` 파일을 뽑아 이 폴더에 두세요.
(같은 자리에 `Import Theme`, `Quick Setup` 버튼과 `Enable layout editing mode`
체크박스가 함께 있습니다)

`.fth`에는 레이아웃뿐 아니라 **각 패널의 설정(=스크립트 본문)까지 통째로** 들어갑니다.
그래서 이 파일이 폴더에 있으면 설치기가 알아서 감지하고, 다음 설치부터는 위 3단계 대신
`Import theme...` **한 번**으로 끝납니다. 다른 PC에 옮길 때도 마찬가지입니다.

> 단, 테마를 불러오기 전에 JScript Panel 3 컴포넌트는 반드시 먼저 설치되어 있어야 합니다.
> 없으면 패널 자리가 빈 칸으로 들어옵니다. (설치기가 순서를 맞춰 줍니다)

---

## 1. 준비물

1. **foobar2000 v2.x** — [foobar2000.org](https://www.foobar2000.org/download)
2. **JScript Panel 3** (`foo_jscript_panel3`) — ⚠️ **공식 배포처가 사라졌습니다.**
   원저작자(marc2003)가 GitHub 저장소를 삭제해서 `jscript-panel/release`,
   `marc2k3/jscript-panel` 모두 404입니다. 현재는 커뮤니티 미러가 유일한 경로입니다:
   [Dronf3/JScript-Panel-3---foobar2k](https://github.com/Dronf3/JScript-Panel-3---foobar2k)
   (`foo_jscript_panel3-3.4.34.fb2k-component`, SHA-256
   `70b6b258081baf05d0181aa8f5382902d6fa5440df1c80cdd599d3f79c9c906e`)
   - 파일 하나에 32·64비트 DLL이 모두 들어 있습니다.
   - `install.bat`은 이 파일을 받은 뒤 위 해시와 대조하고, 다르면 설치를 중단합니다.
   - 설치: foobar2000 → `File` → `Preferences` → `Components` → `Install...` → 받은 `.fb2k-component` 선택 → `Apply` → 재시작
3. (선택) **Columns UI** (`foo_ui_columns`) — 패널을 자유롭게 배치하고 싶다면 추천

> **foobar2000 v2 + JScript Panel 3 전용입니다.**
> JScript Panel 3는 Direct2D/DirectWrite로 그리기 때문에, GDI+를 쓰던 이전 세대
> (JScript Panel 2, Spider Monkey Panel)와는 API가 호환되지 않습니다.
> 이 스크립트는 JSP3의 API(`gr.WriteText`, `gr.FillRoundedRectangle`, `utils.LoadSVG`,
> `handle.GetAlbumArt` 등)로 작성되어 있습니다.

## 2. 패널 만들기

### Default UI를 쓰는 경우
1. `View` → `Layout` → **`Enable layout editing mode`**
2. 바꾸고 싶은 영역에서 **우클릭** → `Replace UI Element...` → `JScript Panel`
3. 다시 `Enable layout editing mode` 해제

### Columns UI를 쓰는 경우
1. `File` → `Preferences` → `Display` → `Columns UI` → `Layout` 탭
2. 최상위에 `Splitter (vertical)` 추가 → 그 안에 `JScript Panel` 삽입
3. 아래 배치를 추천합니다:

```
Splitter (vertical)
├─ JScript Panel   ← mode: bar     (높이 96px 고정)
└─ Splitter (horizontal)
   ├─ JScript Panel  ← mode: player  (폭 320px 고정)
   └─ JScript Panel  ← mode: list
```

## 3. 스크립트 넣기

1. 패널에서 **우클릭** → `Configure...` (또는 `Edit script`)
2. 편집기에 있는 샘플 코드를 **전부 지우고**, [`apple-music.js`](apple-music.js) 내용을 통째로 붙여넣기
3. `Apply` / `OK`

패널을 여러 개 만들 때도 **같은 파일을 그대로** 붙여넣고, 아래 `Mode` 속성만 바꾸면 됩니다.

## 4. 설정

패널 **어디서든 우클릭**하면 나옵니다:

- **테마** — 다크 / 라이트
- **패널 모드** — 자동 / 전체 / 플레이어(세로) / 바(가로) / 재생목록
- **foobar2000 메뉴** — View / Playback / Library / File / Edit 를 그대로 불러옵니다.
  메뉴 이름은 버전과 설치된 컴포넌트에 따라 다르므로, **자기 설치본에 실제로 뭐가 있는지**
  여기서 확인하는 게 가장 확실합니다 (레이아웃 편집, 상태바 표시 등)
- **Apple Music 패널 속성…** — 아래 표의 모든 값

곡 위에서 우클릭하면 foobar2000의 트랙 메뉴(태그 편집·변환 등)가 **위쪽에** 붙고,
그 아래에 위 항목들이 이어집니다. 즉 어디를 우클릭하든 패널 설정에 닿습니다.

> 우클릭이 아예 안 먹으면 `View` → `Layout` → `Enable layout editing`이
> 켜져 있는지 확인하세요. 켜져 있으면 레이아웃 편집기가 우클릭을 가져갑니다.

| 속성 | 기본값 | 설명 |
|------|--------|------|
| `Apple Music.Mode (auto\|player\|bar\|list)` | `auto` | 패널 모드 |
| `Apple Music.Theme (dark\|light)` | `dark` | 테마 |
| `Apple Music.Accent colour` | `#FA243C` | 액센트 색 (Apple Music 레드). `#1DB954`로 바꾸면 Spotify 느낌 |
| `Apple Music.Scale %` | `100` | 고DPI 화면에서 키우기 (예: 150) |
| `Apple Music.List row height` | `46` | 리스트 행 높이. 34 이하로 내리면 한 줄 컴팩트 모드 |
| `Apple Music.List artwork` | `true` | 리스트에 앨범 썸네일 표시 |
| `Apple Music.Font` | `Pretendard, ...` | 쉼표로 나열한 폰트 우선순위. **설치된 첫 번째 폰트**를 사용 |

> 속성 값을 바꾼 뒤에는 패널을 새로고침해야 반영됩니다
> (`Configure...` 창을 열고 `Apply`를 다시 누르거나 foobar2000 재시작).
>
> 이미 패널을 만든 뒤라면 **속성에 저장된 예전 값이 그대로 남습니다.** 스크립트를 새로
> 붙여넣어도 폰트가 안 바뀐다면, 패널 속성에서 `Apple Music.Font` 값을 직접 고치세요.

### 폰트

기본값은 **[Pretendard](https://github.com/orioncactus/pretendard/releases)** 입니다.
한글과 영문의 굵기·너비가 잘 맞는 요즘 고딕이라, Apple Music의 SF Pro 자리에 그대로 놓기 좋습니다.
**설치를 권장합니다** — 없으면 맑은 고딕으로 떨어지면서 인상이 확 달라집니다.

설치: 최신 릴리스의 `Pretendard-*.zip` → 압축 해제 → `public/variable/PretendardVariable.ttf`
(또는 `public/static/` 안의 원하는 굵기들) → 파일 우클릭 → **설치** → foobar2000 재시작

취향에 따라 `Apple Music.Font` 속성 값을 바꿔 다른 고딕을 쓸 수도 있습니다.
쉼표로 나열하면 **설치되어 있는 첫 번째 것**을 씁니다.

| 대안 | 인상 |
|------|------|
| [SUIT](https://sunn.us/suit/) | Pretendard보다 조금 더 둥글고 부드러움 |
| [Wanted Sans](https://github.com/wanteddev/wanted-sans) | 각지고 또렷함, 숫자가 시원함 |
| [SF Pro](https://developer.apple.com/fonts/) | Apple 정품. 한글은 Apple SD Gothic Neo로 넘어감 |
| Apple SD Gothic Neo | macOS 기본. 별도 설치 없이 가장 Apple에 가까움 |

## 5. 조작

| 동작 | 결과 |
|------|------|
| 재생바 클릭·드래그 | 탐색 |
| 재생바 위에서 휠 | 5초씩 이동 |
| 그 외 영역에서 휠 (player/bar) | 볼륨 |
| 볼륨 슬라이더 드래그 | 볼륨 |
| 리스트 더블클릭 | 재생 |
| 리스트 클릭 / Ctrl+클릭 / Shift+클릭 | 단일 · 토글 · 범위 선택 |
| 리스트 ↑ ↓ Enter PgUp PgDn | 이동 / 재생 / 페이지 스크롤 |
| 리스트 우클릭 | foobar2000 기본 컨텍스트 메뉴 (태그, 변환 등 전부 사용 가능) |
| **드래그앤드롭** | 파일 탐색기에서 음악 파일·폴더를 끌어다 놓으면 재생목록에 추가됩니다. **사이드바의 재생목록 위에 놓으면 그 목록으로** 들어가고, 그 외 영역은 현재 재생목록입니다 |
| 앨범아트 더블클릭 | 재생 중인 곡으로 이동 |

드롭한 파일은 목록 끝에 추가되고 선택 상태가 됩니다. 재생 중인 곡이 없고 지금 보고 있는
재생목록에 놓았다면 **첫 곡이 바로 재생**됩니다. 잠긴 재생목록에는 놓아도 거부됩니다
(드래그 중 커서로 표시). 추가 직전에 `UndoBackup`을 호출하므로 `Edit` → `Undo` 로 되돌릴 수 있습니다.

## 6. 창 전체를 이 UI로 — Columns UI

Default UI에는 **상태바를 끄는 기능이 없습니다.** (v2.24에서 `View` 메뉴, `Preferences` →
`Display` → `Default User Interface` 양쪽 다 확인) 툴바도 마찬가지입니다.

창을 이 스크립트만 남기고 비우려면 **Columns UI**로 바꾸면 됩니다. 테마를 덮어쓰는 게 아니라
foobar2000의 **UI 모듈 자체를 교체**하는 공식 확장입니다.

- 다운로드: [reupen/columns_ui releases](https://github.com/reupen/columns_ui/releases)
  (`foo_ui_columns-3.6.0.x86-x64.fb2k-component`, 파일 하나에 32·64비트 모두 포함,
  SHA-256 `7381a79feced139f9f7f4a18d6efac5d71df6336587f1491393318a3945cae09`)
- `install.bat`이 설치 여부를 물어보고, 받은 뒤 위 해시와 대조합니다
  (`install.bat -ColumnsUI` 로 물어보지 않고 바로 설치)

### 설정 위치 (v3.6.0에서 확인)

| 할 일 | 위치 |
|-------|------|
| **UI 모듈 전환** | `Preferences` → `Display` → 맨 위 `User interface module` 드롭다운에서 **Columns UI** |
| **상태바 끄기** | `Display` → `Columns UI` → `Status bar` 탭 → **`Show status bar`** 체크 해제 |
| **툴바 끄기** | `Display` → `Columns UI` → `Main window` 탭 → **`Show toolbars`** |
| **하단 정보 띠 끄기** | `Display` → `Columns UI` → `Status pane` 탭 → **`Show status pane`** |
| **패널 배치** | `Display` → `Columns UI` → **`Layout`** (트리에서 우클릭) |

> **툴바를 끄면 메뉴바도 함께 사라집니다.** 설정은 **`Ctrl+P`** 로 열면 되고,
> 패널 우클릭의 `foobar2000 메뉴`에도 File/Edit/View/Playback/Library가 다 들어 있습니다.

### 레이아웃 잡기

Columns UI를 처음 켜면 레이아웃 트리가 이렇습니다:

```
Row
├ Column → Playlist switcher   ← 재생목록 탭 바
└ Column → Playlist view       ← 기본 재생목록
```

이 트리는 `Layout` **페이지 안의 박스**입니다. 왼쪽 설정 트리에도 `Playlist switcher` /
`Playlist view`라는 **같은 이름**이 있는데 그건 설정 페이지일 뿐이니 헷갈리지 마세요.

화면에도 적혀 있듯 **박스 안의 항목에서 우클릭**해서 바꿉니다. DUI와 달리 `Replace`가 없고
`Add` / `Remove` 방식입니다. DLL에서 확인한 메뉴 항목: `Add before`, `Add after`,
`Add child`, `Remove`, `Copy`, `Paste`.

1. `Playlist view` 우클릭 → `Remove`
2. 그 `Column` 우클릭 → `Add child` → 패널 목록에서 **JScript Panel**
3. `Playlist switcher` 가 있는 `Column` 우클릭 → `Remove` (탭 바 제거)
4. 트리 아래 **`Apply`** → 창의 `OK`
5. 새로 생긴 패널 우클릭 → `Configure...` → 스크립트 붙여넣기

> 패널 목록에 무엇이 뜨는지는 확인하지 못했습니다. `JScript Panel`이 안 보이면
> 그 목록 화면을 보여주세요.

**스크립트는 그대로 씁니다.** UI 종류에 의존하는 API를 하나도 쓰지 않아서
Default UI든 Columns UI든 똑같이 동작합니다.

## 7. 마무리 손질 (선택)

Apple Music처럼 보이게 하려면 패널 밖의 요소도 정리하면 좋습니다.

- `Preferences` → `Display` → `Default User Interface`에서 배경색을 `#1C1C1E`(다크) /
  `#FFFFFF`(라이트)로 맞추면 패널 경계가 보이지 않습니다.
- 남아 있는 상단 툴바(재생 버튼·탐색바)는 툴바 영역에서 우클릭하면 켜고 끌 수 있습니다.
  스크립트가 같은 기능을 이미 그리므로 꺼도 됩니다.
- **`Default Playlist` 탭 바**는 지울 수 있습니다. 레이아웃 편집 모드를 켜고
  탭 바에서 우클릭 → **`Cut UI Element`**.
- **상태바는 Default UI에서 끌 수 없습니다.** (v2.24의 `View` 메뉴에도, DUI 설정
  페이지에도 토글이 없습니다) 끄려면 위 6번의 Columns UI로 가야 합니다.
- Columns UI 사용 시 `Preferences` → `Display` → `Columns UI` → `Main`에서
  Toolbar/Status bar를 모두 끄면 창 전체가 패널만 남습니다.
- Windows 11의 둥근 창 모서리 + 다크 타이틀바와 잘 어울립니다.

## 알려진 제약

- **셔플과 반복은 foobar2000에서 하나의 `Playback order` 값**을 공유합니다.
  그래서 셔플을 켠 상태에서 반복을 누르면 셔플이 꺼집니다 (foobar2000 자체 동작).
- 리스트의 앨범 썸네일은 화면에 보이는 행만 읽어 캐시(최대 96장)합니다.
  네트워크 드라이브의 대용량 재생목록에서는 처음 스크롤할 때 잠깐 끊길 수 있는데,
  그럴 땐 `Apple Music.List artwork`를 `false`로 두세요.
- 앨범아트가 안 보이면 `Preferences` → `Display` → `Album art`에서
  커버 파일 패턴(`cover.jpg`, `folder.jpg` 등)이 등록되어 있는지 확인하세요.

## 문제가 생기면

패널이 오류 문구를 그려주면 그 내용이 곧 원인입니다.
같은 메시지가 `View` → `Console`에도 한 번 남습니다.

- **패널이 회색으로만 나옴** → 스크립트를 붙여넣고 `Apply`를 눌렀는지 확인
- **글자가 너무 작음/큼** → `Apple Music.Scale %` 조정
- **컴포넌트 목록에 JScript Panel이 없음** → foobar2000 비트수(32/64)와 컴포넌트 비트수가 다른 경우입니다
