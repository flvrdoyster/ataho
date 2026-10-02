# atah.io 노트

코드에 두지 않는 설명(배경·결정 이유·측정값)을 모아 둔다. 대시보드는 `dashboard/NOTES.md`, 패유기 웹 버전은 `haiyuki_web/STRUCTURE.md`에 따로 있다.

## 월드 트리거 데이터 (`world/maps/cave/triggers.js`)

홈 월드의 상호작용 오브젝트 목록이다. 맵 에디터(`world/editor.html`)는 트리거를 `window.MAP_DATA.triggers = [...]` 형태의 JSON으로 클립보드에 복사해 주므로, 파일을 통째로 바꿔 붙이면 파일 안의 주석은 사라진다. 그래서 형식 설명은 여기에만 둔다.

트리거 속성:

- `x`, `y` — 좌표(타일 단위)
- `w`, `h` — 상호작용 영역 크기
- `id` — 식별자. 담긴 내용이 아니라 오브젝트나 배경의 형태로 짓는다(`irori` 화로, `upward`·`downward` 위·아래로 나가는 길, `jar-N` 항아리). 내용물을 다른 오브젝트로 옮겨도 이름이 어긋나지 않는다
- `type` — `dialog`(대사만) 또는 `menu`(선택지 메뉴)
- `sprite` — 표시할 오브젝트 이미지 경로
- `title` — 모달 제목. 생략하면 제목 영역을 숨긴다. 분류명은 `group` 소제목으로 쓰고, 제목은 소제목 위에 한 단계 더 묶을 때만 쓴다(`upward`·`irori`의 "게임 플레이", 작품명 소제목이 붙는 `jar-3`의 "공식 일러스트")
- `text` — 상호작용 시 출력할 기본 대사. 배열이면 순서대로 출력

`items`(메뉴 항목) 속성:

- `label` — 선택지 텍스트. `\n`으로 두 줄 버튼을 만들 수 있다
- `action` — 실행할 액션 키(`eat`, `drink`, `sit`, `lie`, `yawn`)
- `count` — 액션 실행 횟수
- `text` — 선택 시 출력할 캐릭터 대사(말풍선)
- `href` — 링크 주소(`action`·`text`가 없을 때)
- `group` — 이 항목 위에 소제목을 붙인다. 같은 `group`이 연달아 나오면 한 번만 붙는다. 분류가 하나뿐인 메뉴도 분류명을 여기에 둔다

`items` 대신 `itemsFrom`을 쓰면 그 이름의 전역 변수에서 항목을 읽는다. 예: `RESOURCE_IMG_MANIFEST`(`resource/img/manifest.js`, `{ 파일명 → { caption, source, modified, group } }`)로 `resource/img/`의 이미지를 메뉴 항목으로 만든다. 같은 `group`끼리 떨어져 있으면 소제목이 여러 번 생기므로 manifest에서 붙여 둘 것.

메뉴 창 너비는 가장 긴 항목에 맞춘다(내용 폭 최소 120px, 최대 250px, 모바일은 최대 `80vw`). `.modal`은 `width: max-content`여야 한다. 엔진이 창의 왼쪽 끝을 화자 위치에 두고 `translateX(-50%)`로 당기기 때문에, `width: auto`면 브라우저가 그 왼쪽 끝부터 화면 오른쪽 끝까지 남은 공간으로 너비를 잡아 화자가 오른쪽에 있을수록 창이 좁아지고 줄이 바뀐다. 말풍선도 같은 이유로 같은 방식이다.

배열 순서는 게임 동작과 무관하다. 그리기는 y좌표로 정렬하고, 오브젝트끼리 영역이 겹치지 않는다. 대신 이 순서가 아래 "모든 페이지" 목록의 순서가 된다.

## 홈 "모든 페이지" 목록

월드의 모든 이동은 캔버스 안(트리거)에 있어서, 검색엔진은 홈에서 다른 페이지로 갈 길이 없었다. 같은 목적지를 헤더 왼쪽 위 아이콘 아래에 진짜 링크로 한 번 더 둔다. 평소엔 접혀 있어 월드 화면은 그대로다.

### 생성

`index.html`의 `<!-- site-index:begin -->`~`<!-- site-index:end -->` 구간은 `scripts/gen_site_index.js`가 트리거에서 생성한다. 손으로 고치지 않는다. 트리거와 메뉴의 분류·이름이 따로 놀던 문제(2026-09-27)를 막으려고 원본을 트리거 하나로 정했다. 크롤러가 JS 없이 읽도록 최종 HTML은 정적 링크로 남긴다.

- 분류는 항목의 `group`, 없으면 트리거의 `title`. 그래서 "게임 플레이" 같은 상위 제목은 목록에 나오지 않는다
- 순서는 트리거 파일에 처음 나오는 순서. 순서표를 따로 두면 그게 또 어긋날 곳이 된다
- `itemsFrom` 트리거(공식 일러스트)와 `href` 없는 항목(술 마시기 등)은 뺀다
- `index.html`로 끝나는 주소는 폴더 주소로(`haiyuki_web/`), 두 줄 라벨은 한 줄로
- atah.io 주소인데 `sitemap.xml`에 없으면 경고만 한다. 사이트맵은 손으로 관리한다

```bash
node scripts/gen_site_index.js          # 갱신
node scripts/gen_site_index.js --check  # 어긋나면 exit 1
```

커밋 훅 `.githooks/pre-commit`이 커밋 직전에 생성을 돌리고, 바뀌면 `index.html`을 스테이징에 넣는다. `index.html`에 스테이징 안 된 다른 수정이 있으면 관계없는 변경이 딸려 들어가지 않게 자동으로 넣지 않고 `--check`만 해서, 어긋났을 때만 커밋을 막는다. node가 없으면 건너뛴다. 훅은 클론마다 `git config core.hooksPath .githooks`로 켠다.

### 화면

- 아이콘은 SVG Repo의 `more-grid-small`(점 네 개)을 인라인으로 넣었다. 원본은 반지름 1인 원에 굵기 2 선을 그은 것이라, 같은 모양을 반지름 2인 채운 원(`fill="currentColor"`)으로 바꿨다. 원본 24×24 캔버스는 여백이 커서 viewBox를 `6 6 12 12`로 잘라, 점 네 개 폭(10)이 박스의 83%(28px 박스에서 23.3px)를 차지하게 했다. 이전 집 아이콘의 폭(800 중 666.8, 83%)과 같다
- 헤더(`#header`)는 월드 조작을 막지 않으려고 `pointer-events: none`이라, `#site-index`만 다시 켠다. 제목은 가운데 정렬 그대로 두고 아이콘만 문서 흐름에서 빼서 왼쪽 위에 앉힌다
- 펼친 목록(`nav`)은 `position: fixed`로 뷰포트에 직접 앉힌다. 아이콘 박스 흐름 안에 두면 부모가 목록 폭만큼 넓어져, 캔버스 위에 보이지 않는 클릭 사각지대가 생긴다
- `top: 76px` = 아이콘 top 18 + 높이 28 + 여백 30. 아이콘 바로 밑에서 열면 영문 부제("All Things Archived Here")를 덮는다
- 폭은 `width`가 아니라 `max-width: calc(100vw - 40px)`. 평소엔 내용 폭만큼 좁고, 모바일처럼 좁은 화면에서만 이 한도에 걸려 오른쪽에도 20px이 남는다
- 분류와 링크가 열로 맞게 `ul`을 두 열 그리드(`max-content 1fr`)로 짜고 `li`는 `display: contents`. `min-width`로 흉내 낸 열은 그 값보다 긴 분류명부터 어긋났다
- 키보드는 캐릭터 조작 전용이다. 아이콘(`summary`)과 링크는 `tabindex="-1"`로 Tab 순서에서 빼고, `#site-index`의 `mousedown`은 `preventDefault`해서 클릭해도 포커스가 옮겨 가지 않게 한다. 아이콘에 포커스가 남으면 Space가 월드(`window`에서 키를 받음)와 `details` 열고 닫기에 동시에 먹힌다. 목록은 마우스·터치로만 쓴다. 예외로 ESC만은 열려 있으면 닫는다 — `<details>`는 네이티브로 ESC에 반응하지 않아 따로 `document`에 `keydown`을 둔다

## SEO

### 현황 (GA4, 2026-09-27 기준 최근 90일 확정 구간)

- 세션 채널: 추천 52.6%(나무위키 733, 블로그 405), 직접 20.5%, 소셜 17.9%, 검색 8.7%
- 검색 유입 194세션 중 네이버 계열 168(약 87%), 구글 13, 다음 13 — 네이버 기준으로 맞추는 게 효과가 가장 크다
- 검색으로 들어오는 곳은 거의 pc98·suiko 서브도메인이다(환세희담 54, 환세풍광전 50, 환세취호전 31 …). atah.io 자체는 홈 8, 패유기 웹 4, 해설서 각 2 수준. pc98 페이지들은 description·OG가 갖춰져 있었고 atah.io는 패유기 웹 한 곳뿐이었다

### 적용한 것

- `robots.txt` — `/blog/`(티스토리 스킨 원본. 페이지에 태그를 넣으면 그대로 블로그 스킨에 실려 나간다), `/dashboard/data/`, `/scripts/`를 막는다
- 개발 도구(`world/editor.html`, `world/viewer.html`, `sweep/stage_editor.html`)는 robots.txt가 아니라 페이지 안 `noindex`로 뺀다. robots.txt로 막으면 크롤러가 그 `noindex`를 읽지 못해, 다른 곳에 링크가 걸렸을 때 제목 없는 주소로 색인될 수 있다
- `haiyuki_manual/char.html`도 `noindex`. 해설서 안에 iframe으로 끼워 쓰는 조각이라 단독으로 검색되면 머리말 없는 반쪽 화면에 떨어진다(대신 그 내용은 검색되기 어렵다)
- `sitemap.xml` — 손으로 관리한다. 주소는 각 페이지의 canonical과 같은 모양(폴더는 끝에 `/`). pc98·suiko는 다른 호스트라 넣을 수 없다. 개발 도구·대시보드·`char.html`은 뺐다. `lastmod`·`changefreq`·`priority`는 쓰지 않는다 — 구글은 뒤의 둘을 무시하고, `lastmod`는 손으로 맞추다 틀리면 오히려 신뢰를 잃는다
- 공개 페이지 메타 — description, `og:title`·`type`·`url`·`description`·`site_name`·`locale`, canonical. pc98 페이지들과 같은 구성이다
  - `og:image`는 1200×630 썸네일이 있는 패유기 웹에만
  - `viewer/scene.html`은 `?story=`로 여러 장면을 보여 주므로 canonical을 두지 않는다. 하나로 모으면 나머지 장면 주소가 색인에서 빠진다
  - 패유기 웹의 canonical·`og:url`은 끝에 `/`까지. `/haiyuki_web`은 서버가 `/haiyuki_web/`로 301 돌려보낸다
- 패유기 해설서의 패 이미지 337개에 alt. 이름은 게임의 `haiyuki_web/js/data/paiData.js`에서 가져왔다
- 희담 취급설명서 머리 부분(`translator-info`)에 pc98 환세희담 링크
- 검색엔진 등록 — 네이버 서치어드바이저는 atah.io·pc98·suiko 세 사이트를 따로 등록하고 HTML 파일 방식으로 소유 확인했다(확인 파일 `naver6ecd505c49bf822cb1185ddef5bce20b.html`은 레포 루트, 사이트맵에는 넣지 않는다). 구글 서치콘솔은 도메인 속성(`atah.io`)을 Route 53 TXT 레코드로 확인했고 사이트맵 세 개를 모두 제출했다

### 남은 것

- 썸네일 없는 페이지의 `og:image`(1200×630)
- `https://www.atah.io` 인증서 — 인증서에 `atah.io`만 있어 www는 https에서 경고가 뜬다. www CNAME이 apex(`atah.io`)를 가리켜서였고(GitHub 문서가 HTTPS 문제를 경고하는 설정), 2026-09-30 Route 53에서 `flvrdoyster.github.io`로 바꿨다. GitHub Pages 상태 API로 www가 유효·발급 대상이 된 것까지 확인했다. 재발급은 사이트가 잠깐 내려가는 도메인 재등록 대신 자동 갱신(현재 인증서 만료 2026-10-31)을 기다리기로 했다. 11월 초에 인증서에 www가 들어갔는지 보고, 없으면 Settings → Pages에서 도메인을 지웠다 다시 넣는다

## 파비콘

- `favicon.ico`·`favicon.svg` — 사이트 파비콘(원본 픽셀 아트는 `_asset/suiko-demo_refine.svg`). pc98·suiko도 `https://atah.io/favicon.ico`를 가져다 쓴다
- `favicon-mono.svg` — 같은 그림을 다른 인라인 SVG처럼 `fill="currentColor"` 한 색으로 바꾼 것(2026-09-28). 아직 어디에도 쓰지 않는다. 원래 색의 밝기 순서대로 불투명도를 줬다:

  | 부분 | 원래 색 | 불투명도 |
  |---|---|---|
  | 눈 흰자·눈꼬리(20~23행) | 흰색·살구 | 1 |
  | 상처 심지 | 흰색 | 0.85 |
  | 상처 가장자리 | 살구 | 0.75 |
  | 얼굴 바탕 | 노랑 | 0.65 |
  | 그늘 | 주황 | 0.43 |
  | 윤곽 | 갈색 | 0.22 |
  | 머리카락·눈썹 | 검정 | 비움 |

  검정을 비워 두므로 어두운 바탕 위에서 원본처럼 보이고, 밝은 바탕에서는 명암이 뒤집힌다. 픽셀 모서리가 흐려지지 않게 `shape-rendering="crispEdges"`를 둔다

## 개발 도구

- `world/editor.html`에는 doctype이 없다. 넣으면 호환 모드(quirks)에서 표준 모드로 바뀌어 에디터 레이아웃이 달라질 수 있어, charset·lang만 넣었다(2026-09-27). 넣으려면 에디터 화면을 직접 확인하면서 할 것

## 전역 점검에서 보류한 것 (2026-09-27)

- 원본 자료가 공개 서빙된다 — `haiyuki_manual/ref/`(원본 설명서 PDF 2개), `kitan_manual/orig/manual_kitan.pdf`, `viewer/kaisin/ref/`(참고 영상·PSD), `viewer/gaiden/title-bg.psd`, 약 22MB. 작업 파일 노출이자 원본 설명서 스캔 배포다. 레포에서 빼도 git 히스토리엔 남고, robots.txt로 막아도 주소를 알면 받을 수 있다
- 공식 일러스트 갤러리(`resource/img/`)가 장당 1.8~7MB PNG, 합계 36MB이고 라이트박스가 원본을 그대로 띄운다. 웹용 축소본을 따로 두면 모바일 로딩이 크게 준다
- 패유기 웹의 안 쓰는 자산 18개(약 650KB) — `bgm_option`, `bgm_toilet`, `OPTBG.png`, `HELPBG.png`, 난이도·조작 UI 등. 앞으로 만들 옵션·도움말 화면용일 수 있다
- 설명 주석이 많은 파일 — `world/ui.js`, `viewer/video_player.js`, `scripts/ga4_dashboard.py`, `world/engine.js`, `dashboard/dashboard.js` 등. 한꺼번에 옮기기보다 각 파일을 고칠 때 문서로 옮긴다
- 옛 경로 `scene_viewer/` 리다이렉트 스텁은 유지한다 — 최근 90일 75회, 한 달 20회꼴로 아직 들어온다(마지막 2026-09-22)
