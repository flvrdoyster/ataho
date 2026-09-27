window.MAP_DATA.triggers = [
  {
    "x": 16,
    "y": 2,
    "id": "emulator",
    "type": "menu",
    "w": 5,
    "h": 2,
    "text": [
      "상자를 치웠으니 호수로 갈 수 있어."
    ],
    "bubbleOffsetY": 0,
    "collision": false,
    "items": [
      {
        "label": "환세풍광전",
        "href": "https://pc98.atah.io/hukyou.html",
        "target": "_blank",
        "group": "PC-98 웹 에뮬"
      },
      {
        "label": "환세희담",
        "href": "https://pc98.atah.io/kitan.html",
        "target": "_blank",
        "group": "PC-98 웹 에뮬"
      },
      {
        "label": "환세쾌도전",
        "href": "https://pc98.atah.io/kaitou.html",
        "target": "_blank",
        "group": "PC-98 웹 에뮬"
      },
      {
        "label": "환세포물장",
        "href": "https://pc98.atah.io/torimono.html",
        "target": "_blank",
        "group": "PC-98 웹 에뮬"
      },
      {
        "label": "환세취호전",
        "href": "https://suiko.atah.io/kr.html",
        "target": "_blank",
        "group": "Windows 웹 에뮬"
      }
    ]
  },
  {
    "x": 15,
    "y": 18,
    "w": 4,
    "h": 3,
    "id": "haiyuki",
    "type": "menu",
    "text": [
      "여기다 밧줄을 태울 생각을 하다니..."
    ],
    "sprite": "object/object_irori.png",
    "animW": 64,
    "animH": 48,
    "frames": 4,
    "speed": 200,
    "items": [
      {
        "label": "환세패유기",
        "href": "haiyuki_web/index.html",
        "target": "_blank",
        "group": "웹 포팅"
      },
      {
        "label": "환세희담 취급설명서",
        "href": "kitan_manual/index.html",
        "target": "_blank",
        "group": "매뉴얼"
      },
      {
        "label": "환세패유기 해설서",
        "href": "haiyuki_manual/index.html",
        "target": "_blank",
        "group": "매뉴얼"
      }
    ]
  },
  {
    "x": 15,
    "y": 46,
    "w": 3,
    "h": 2,
    "id": "minigame",
    "title": "취호전 미니게임",
    "type": "menu",
    "text": [
      "해변 마을에 쇼핑이나 가볼까?"
    ],
    "items": [
      {
        "label": "평균대 동작수련",
        "href": "balance/index.html",
        "target": ""
      },
      {
        "label": "술창고 청소",
        "href": "sweep/index.html",
        "target": "_blank"
      },
      {
        "label": "헤엄치기",
        "href": "swim/index.html",
        "target": "_blank"
      }
    ]
  },
  {
    "id": "jar-2",
    "sprite": "object/object_jar.png",
    "text": [
      "그러고보니 스마슈 녀석이 수상한 책을 줬었지."
    ],
    "title": "장면 뷰어",
    "type": "menu",
    "x": 28,
    "y": 16,
    "w": 2,
    "h": 1,
    "items": [
      {
        "label": "엔딩: 환세쾌진극",
        "href": "viewer/scene.html?story=kaisin",
        "target": "_blank"
      }
    ]
  },
  {
    "x": 31,
    "y": 19,
    "w": 2,
    "h": 1,
    "id": "jar-3",
    "sprite": "object/object_jar.png",
    "type": "menu",
    "title": "장면 뷰어",
    "items": [
      {
        "label": "애니메이션: 환세희담 외전\n~궁극의 에로문서 전설~",
        "href": "viewer/scene.html?story=gaiden",
        "target": "_blank"
      }
    ]
  },
  {
    "x": 31,
    "y": 22,
    "w": 2,
    "h": 1,
    "id": "jar-4",
    "sprite": "object/object_jar.png",
    "title": "장면 뷰어",
    "type": "menu",
    "text": [
      "이런 것도 있었나?"
    ],
    "items": [
      {
        "label": "애니메이션: DS 아니메 총집편 '98",
        "href": "viewer/ani.html",
        "target": "_blank"
      }
    ]
  },
  {
    "x": 11,
    "y": 10,
    "w": 3,
    "h": 1,
    "id": "sake",
    "type": "menu",
    "sprite": "object/object_sake.png",
    "text": [
      "호랑이 마을, 내 집에 있던 화주다.",
      "내 팬이 준 선물인데 아직도 누가 보낸 건지 모르겠어.",
      "한 모금만 마실까?"
    ],
    "items": [
      {
        "label": "마신다",
        "action": "drink",
        "count": 1
      },
      {
        "label": "참는다",
        "text": "한 잔 하긴 아직 이른 시간이야."
      }
    ]
  },
  {
    "x": 3,
    "y": 18,
    "w": 2,
    "h": 2,
    "id": "jar-1",
    "sprite": "object/object_jar.png",
    "title": "공식 일러스트",
    "type": "menu",
    "text": [
      "종이 쓰레기는 모아서 버려야겠다."
    ],
    "itemsFrom": "RESOURCE_IMG_MANIFEST"
  }
]
