// resource/img/ 이미지 갤러리 데이터. caption/source/modified/group은 직접 편집한다.
// 새 이미지의 빈 자리 항목은 scripts/gen-img-manifest.js가 맨 끝에 자동으로 추가한다.
// 노출 순서 = 아래 나열된 순서 그대로. 순서를 바꾸려면 항목을 직접 옮길 것.
// modified: 0=원본, 1=업스케일, 2=재구성, 3=기타
// group: 갤러리 메뉴 섹션 이름. 같은 group끼리는 서로 붙어 있어야 헤더로 묶인다.
window.RESOURCE_IMG_MANIFEST = {
  "cover-kitan.png": {
    "caption": "패키지 커버 원본",
    "source": "환세희담 패키지",
    "modified": 1,
    "group": "환세희담"
  },
  "illust-kitan.png": {
    "caption": "패키지 커버 업스케일",
    "source": "환세희담 매뉴얼",
    "modified": 2,
    "group": "환세희담"
  },
  "compileclub-vol51-p00_upscale.png": {
    "caption": "컴파일클럽 표지",
    "source": "컴파일클럽 Vol.51 p0",
    "modified": 1,
    "group": "환세희담"
  },
  "compileclub-vol51-p04_upscale.png": {
    "caption": "컴파일클럽 광고지",
    "source": "컴파일클럽 Vol.51 p04",
    "modified": 1,
    "group": "환세희담"
  },
  "ds04.png": {
    "caption": "디스크 스테이션 메뉴",
    "source": "디스크 스테이션 Vol.4",
    "modified": 0,
    "group": "환세풍광전"
  },
  "illust-hukyou.png": {
    "caption": "메인 일러스트",
    "source": "디스크 스테이션 Vol.4",
    "modified": 2,
    "group": "환세풍광전"
  },
  "illust-kaitou.png": {
    "caption": "메인 일러스트",
    "source": "디스크 스테이션 Vol.8",
    "modified": 2,
    "group": "환세쾌도전"
  },
  "ds10.png": {
    "caption": "디스크 스테이션 메뉴",
    "source": "디스크 스테이션 Vol.10",
    "modified": 0,
    "group": "환세포물장"
  },
  "illust-torimono.png": {
    "caption": "메인 일러스트",
    "source": "디스크 스테이션 Vol.10",
    "modified": 2,
    "group": "환세포물장"
  },
  "ds14.png": {
    "caption": "디스크 스테이션 메뉴",
    "source": "디스크 스테이션 Vol.14",
    "modified": 0,
    "group": "환세취호전"
  },
  "illust-suiko.png": {
    "caption": "메인 일러스트",
    "source": "디스크 스테이션 Vol.14",
    "modified": 2,
    "group": "환세취호전"
  },
  "ds20.png": {
    "caption": "디스크 스테이션 메뉴",
    "source": "디스크 스테이션 Vol.20",
    "modified": 0,
    "group": "환세패유기"
  }
};
