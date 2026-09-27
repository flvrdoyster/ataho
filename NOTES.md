# atah.io 노트

코드에 두지 않는 설명(배경·결정 이유·측정값)을 모아 둔다. 대시보드는 `dashboard/IMPROVE.md`, 패유기 웹 버전은 `haiyuki_web/STRUCTURE.md`에 따로 있다.

## 월드 트리거 데이터 (`world/maps/cave/triggers.js`)

홈 월드의 상호작용 오브젝트 목록이다. 맵 에디터(`world/editor.html`)는 트리거를 `window.MAP_DATA.triggers = [...]` 형태의 JSON으로 클립보드에 복사해 주므로, 파일을 통째로 바꿔 붙이면 파일 안의 주석은 사라진다. 그래서 형식 설명은 여기에만 둔다.

트리거 속성:

- `x`, `y` — 좌표(타일 단위)
- `w`, `h` — 상호작용 영역 크기
- `id` — 식별자
- `type` — `dialog`(대사만) 또는 `menu`(선택지 메뉴)
- `sprite` — 표시할 오브젝트 이미지 경로
- `title` — 모달 제목. 생략하면 제목 영역을 숨긴다
- `text` — 상호작용 시 출력할 기본 대사. 배열이면 순서대로 출력

`items`(메뉴 항목) 속성:

- `label` — 선택지 텍스트. `\n`으로 두 줄 버튼을 만들 수 있다
- `action` — 실행할 액션 키(`eat`, `drink`, `sit`, `lie`, `yawn`)
- `count` — 액션 실행 횟수
- `text` — 선택 시 출력할 캐릭터 대사(말풍선)
- `href` — 링크 주소(`action`·`text`가 없을 때)
- `group` — 이 항목 위에 소제목을 붙인다. 같은 `group`이 연달아 나오면 한 번만 붙는다. 오브젝트 하나로 여러 분류를 보여줄 때 쓰고(`haiyuki`, `emulator`), `title` 대신 쓸 수 있다

`items` 대신 `itemsFrom`을 쓰면 그 이름의 전역 변수에서 항목을 읽는다. 예: `RESOURCE_IMG_MANIFEST`(`resource/img/manifest.js`, `{ 파일명 → { caption, source, modified, group } }`)로 `resource/img/`의 이미지를 메뉴 항목으로 만든다. 같은 `group`끼리 떨어져 있으면 소제목이 여러 번 생기므로 manifest에서 붙여 둘 것.

배열 순서는 게임 동작과 무관하다. 그리기는 y좌표로 정렬하고, 오브젝트끼리 영역이 겹치지 않는다. 대신 이 순서가 아래 "모든 페이지" 목록의 순서가 된다.

## 홈 "모든 페이지" 목록

월드의 모든 이동은 캔버스 안(트리거)에 있어서, 검색엔진과 키보드 사용자는 홈에서 다른 페이지로 갈 길이 없었다. 같은 목적지를 헤더 왼쪽 위 아이콘 아래에 진짜 링크로 한 번 더 둔다. 평소엔 접혀 있어 월드 화면은 그대로다.

### 생성

`index.html`의 `<!-- site-index:begin -->`~`<!-- site-index:end -->` 구간은 `scripts/gen_site_index.js`가 트리거에서 생성한다. 손으로 고치지 않는다. 트리거와 메뉴의 분류·이름이 따로 놀던 문제(2026-09-27)를 막으려고 원본을 트리거 하나로 정했다. 크롤러가 JS 없이 읽도록 최종 HTML은 정적 링크로 남긴다.

- 분류는 항목의 `group`, 없으면 트리거의 `title`
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

- 아이콘은 `home.svg`(MingCute 계열)의 집 모양 path만 인라인으로 넣었다. 원본에 있던 `fill: none` 장식 path는 보이지 않아 뺐다
- 헤더(`#header`)는 월드 조작을 막지 않으려고 `pointer-events: none`이라, `#site-index`만 다시 켠다. 제목은 가운데 정렬 그대로 두고 아이콘만 문서 흐름에서 빼서 왼쪽 위에 앉힌다
- 펼친 목록(`nav`)은 `position: fixed`로 뷰포트에 직접 앉힌다. 아이콘 박스 흐름 안에 두면 부모가 목록 폭만큼 넓어져, 캔버스 위에 보이지 않는 클릭 사각지대가 생긴다
- `top: 76px` = 아이콘 top 18 + 높이 28 + 여백 30. 아이콘 바로 밑에서 열면 영문 부제("All Things Archived Here")를 덮는다
- 폭은 `width`가 아니라 `max-width: calc(100vw - 40px)`. 평소엔 내용 폭만큼 좁고, 모바일처럼 좁은 화면에서만 이 한도에 걸려 오른쪽에도 20px이 남는다
- 분류와 링크가 열로 맞게 `ul`을 두 열 그리드(`max-content 1fr`)로 짜고 `li`는 `display: contents`. `min-width`로 흉내 낸 열은 그 값보다 긴 분류명부터 어긋났다
- 목록 안의 `keydown`은 `stopPropagation`. 월드(`world/engine.js`)가 `window`에서 키를 받아, 막지 않으면 목록을 방향키로 다닐 때 캐릭터도 같이 움직인다

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

### 남은 것

- 네이버 서치어드바이저·구글 서치콘솔 등록과 사이트맵 제출(계정 필요)
- 썸네일 없는 페이지의 `og:image`(1200×630)
- pc98·suiko 서브도메인의 robots.txt·sitemap.xml(`gensei-pc98`, `suiko-web-v2` 레포)
- 평균대 동작수련·헤엄치기는 원작을 코드에서 확인하지 못해 설명을 짧게만 썼다

## 개발 도구

- `world/editor.html`에는 doctype이 없다. 넣으면 호환 모드(quirks)에서 표준 모드로 바뀌어 에디터 레이아웃이 달라질 수 있어, charset·lang만 넣었다(2026-09-27). 넣으려면 에디터 화면을 직접 확인하면서 할 것

## 전역 점검에서 보류한 것 (2026-09-27)

- 원본 자료가 공개 서빙된다 — `haiyuki_manual/ref/`(원본 설명서 PDF 2개), `kitan_manual/orig/manual_kitan.pdf`, `viewer/kaisin/ref/`(참고 영상·PSD), `viewer/gaiden/title-bg.psd`, 약 22MB. 작업 파일 노출이자 원본 설명서 스캔 배포다. 레포에서 빼도 git 히스토리엔 남고, robots.txt로 막아도 주소를 알면 받을 수 있다
- 공식 일러스트 갤러리(`resource/img/`)가 장당 1.8~7MB PNG, 합계 36MB이고 라이트박스가 원본을 그대로 띄운다. 웹용 축소본을 따로 두면 모바일 로딩이 크게 준다
- 패유기 웹의 안 쓰는 자산 18개(약 650KB) — `bgm_option`, `bgm_toilet`, `OPTBG.png`, `HELPBG.png`, 난이도·조작 UI 등. 앞으로 만들 옵션·도움말 화면용일 수 있다
- 설명 주석이 많은 파일 — `world/ui.js`, `viewer/video_player.js`, `scripts/ga4_dashboard.py`, `world/engine.js`, `dashboard/dashboard.js` 등. 한꺼번에 옮기기보다 각 파일을 고칠 때 문서로 옮긴다
- 옛 경로 `scene_viewer/` 리다이렉트 스텁은 유지한다 — 최근 90일 75회, 한 달 20회꼴로 아직 들어온다(마지막 2026-09-22)
