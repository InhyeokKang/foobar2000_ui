# Apple Music UI for foobar2000

foobar2000 기본 UI를 Apple Music처럼 바꿔주는 패널 스크립트입니다.
`apple-music.js` **파일 하나**로 세 가지 패널을 모두 만듭니다.

> **[→ 라이브 미리보기](https://claude.ai/code/artifact/0a4426bb-fc4f-4960-b85a-b4fabc8d4355)**
> — 설치 전에 어떤 모습인지 브라우저에서 눌러보세요. 저장소의 `preview.html`과 같은 파일이며,
> 이 스크립트를 캔버스 위에서 그대로 실행합니다.

| 모드 | 모습 | 쓰임새 |
|------|------|--------|
| `player` | 큰 앨범아트 + 제목/아티스트 + 재생바 + 컨트롤 + 볼륨 (세로형) | 창 왼쪽/오른쪽 사이드 패널 |
| `bar` | 가로 트랜스포트 바 + 가운데 라운드 카드(아트·제목·진행바) | Apple Music 상단 바 재현 |
| `list` | 앨범 썸네일 + 제목/아티스트 + 앨범 + 시간 트랙 리스트 | 메인 재생목록 |
| `auto` | 패널 비율을 보고 `bar` 또는 `player` 자동 선택 | 기본값 |

다크/라이트 테마, Apple Music 시그니처 레드(`#FA243C`) 액센트, 라운드 코너 앨범아트,
호버 하이라이트, 재생 중 트랙의 이퀄라이저 애니메이션까지 들어 있습니다.

---

## 1. 준비물

1. **foobar2000 v2.x** — [foobar2000.org](https://www.foobar2000.org/download)
2. **JScript Panel 3** (`foo_jscript_panel3`) — [github.com/jscript-panel/release](https://github.com/jscript-panel/release/releases)
   - foobar2000 **32비트/64비트 버전에 맞는 파일**을 받으세요.
   - 설치: foobar2000 → `File` → `Preferences` → `Components` → `Install...` → 받은 `.fb2k-component` 선택 → `Apply` → 재시작
3. (선택) **Columns UI** (`foo_ui_columns`) — 패널을 자유롭게 배치하고 싶다면 추천

> 이 스크립트는 ES5로만 작성해서 JScript Panel 2, Spider Monkey Panel(foobar2000 v1.6)에서도 동작합니다.
> 호스트마다 다른 API는 전부 런타임에 감지하도록 해 두었습니다.

## 2. 패널 만들기

### Default UI를 쓰는 경우
1. `View` → `Layout` → `Enable layout editing` 체크
2. 바꾸고 싶은 영역에서 **우클릭** → `Replace UI Element...` → `JScript Panel`
3. 다시 `Enable layout editing` 해제

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

패널에서 **우클릭**하면 바로 나오는 메뉴:

- **테마** — 다크 / 라이트
- **패널 모드** — 자동 / 플레이어(세로) / 바(가로) / 재생목록
- **패널 속성…** — 아래 표의 모든 값

| 속성 | 기본값 | 설명 |
|------|--------|------|
| `Apple Music.Mode (auto\|player\|bar\|list)` | `auto` | 패널 모드 |
| `Apple Music.Theme (dark\|light)` | `dark` | 테마 |
| `Apple Music.Accent colour` | `#FA243C` | 액센트 색 (Apple Music 레드). `#1DB954`로 바꾸면 Spotify 느낌 |
| `Apple Music.Scale %` | `100` | 고DPI 화면에서 키우기 (예: 150) |
| `Apple Music.List row height` | `46` | 리스트 행 높이. 34 이하로 내리면 한 줄 컴팩트 모드 |
| `Apple Music.List artwork` | `true` | 리스트에 앨범 썸네일 표시 |
| `Apple Music.Font` | `SF Pro Display, ...` | 쉼표로 나열한 폰트 우선순위. **설치된 첫 번째 폰트**를 사용 |

> 속성 값을 바꾼 뒤에는 패널을 새로고침해야 반영됩니다
> (`Configure...` 창을 열고 `Apply`를 다시 누르거나 foobar2000 재시작).

**폰트 추천** — Apple Music 느낌을 제대로 내려면 [SF Pro](https://developer.apple.com/fonts/)
(Apple 개발자 사이트, 무료) 또는 한글까지 예쁜 [Pretendard](https://github.com/orioncactus/pretendard)를
설치하세요. 없으면 자동으로 Segoe UI / 맑은 고딕으로 떨어집니다.

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
| 앨범아트 더블클릭 | 재생 중인 곡으로 이동 |

## 6. 마무리 손질 (선택)

Apple Music처럼 보이게 하려면 패널 밖의 요소도 정리하면 좋습니다.

- `Preferences` → `Display` → `Default User Interface`에서 배경색을 `#1C1C1E`(다크) /
  `#FFFFFF`(라이트)로 맞추면 패널 경계가 보이지 않습니다.
- `View` → `Status bar` 해제
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
