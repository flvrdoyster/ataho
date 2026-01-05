if (!window.MAP_DATA) window.MAP_DATA = {};
// 맵의 트리거(상호작용 오브젝트) 데이터를 정의합니다.
// x, y: 좌표 / w, h: 영역 크기 / items: 모달에 표시될 메뉴 구성
if (!window.MAP_DATA.triggers) window.MAP_DATA.triggers = [];

window.MAP_DATA.triggers = [
    {
        "x": 11,
        "y": 10,
        "w": 3,
        "h": 1,
        "id": "sake",
        "type": "dialog",
        "sprite": "../../object/object_sake.png",
        "text": [
            "호랑이 마을, 내 집에 있던 특주다.",
            "이건 아직도 누가 보냈는지 모르겠어.",
            "한 모금만 마실까?"
        ]
    },
    {
        "x": 31,
        "y": 19,
        "w": 2,
        "h": 1,
        "id": "jar-3",
        "type": "dialog",
        "sprite": "../../object/object_jar.png",
        "text": [
            "아무 것도 안 들었어."
        ]
    },
    {
        "x": 15,
        "y": 46,
        "w": 3,
        "h": 2,
        "id": "minigame",
        "title": "미니게임",
        "type": "menu",
        "items": [
            {
                "label": "헤엄치기",
                "href": "swim/index.html",
                "target": "_blank"
            },
            {
                "label": "평균대 동작수련",
                "href": "balance/index.html",
                "target": "_blank"
            }
        ]
    },
    {
        "x": 15,
        "y": 18,
        "w": 4,
        "h": 3,
        "id": "haiyuki",
        "title": "환세패유기",
        "type": "menu",
        "sprite": "assets/cave_tile_irori.png",
        "animW": 64,
        "animH": 48,
        "frames": 4,
        "speed": 200,
        "text": [
            "따뜻하구만."
        ],
        "items": [
            {
                "label": "웹 버전 (ko)",
                "href": "haiyuki_web/index.html",
                "target": "_blank"
            },
            {
                "label": "매뉴얼 (ko)",
                "href": "haiyuki_manual/index.html",
                "target": "_blank"
            },
            {
                "label": "매뉴얼 원본 1 (PDF)",
                "href": "haiyuki_manual/ref/manual_thebest.pdf",
                "target": "_blank"
            },
            {
                "label": "매뉴얼 원본 2 (PDF)",
                "href": "haiyuki_manual/ref/manual_D4.pdf",
                "target": "_blank"
            }
        ]
    },
    {
        "x": 3,
        "y": 18,
        "w": 2,
        "h": 2,
        "id": "jar-1",
        "sprite": "../../object/object_jar.png",
        "title": "일러스트",
        "type": "menu",
        "items": [
            {
                "label": "Disc Station 04",
                "href": "#resource/img/ds04.png",
                "data": {
                    "caption": "Disc Station 04 메뉴 화면 일러스트"
                }
            },
            {
                "label": "Disc Station 10",
                "href": "#resource/img/ds10.png",
                "data": {
                    "caption": "Disc Station 10 메뉴 화면 일러스트"
                }
            },
            {
                "label": "Disc Station 14",
                "href": "#resource/img/ds14.png",
                "data": {
                    "caption": "Disc Station 14 메뉴 화면 일러스트"
                }
            },
            {
                "label": "Disc Station 20",
                "href": "#resource/img/ds20.png",
                "data": {
                    "caption": "Disc Station 20 메뉴 화면 일러스트"
                }
            }
        ]
    },
    {
        "x": 31,
        "y": 22,
        "w": 2,
        "h": 1,
        "id": "jar-4",
        "sprite": "../../object/object_jar.png",
        "title": "DS 아니메 총집편 '98",
        "type": "menu",
        "items": [
            {
                "label": "환세 시리즈 부분 컷",
                "href": "#resource/mov/ani_orig.mp4",
                "data": {
                    "caption": "그런 계절 / 싱크로 / 본능 / 쿠킹 DE GO / 물가의 사랑",
                    "subtitle": "ani_caption.vtt"
                }
            }
        ]
    },
    {
        "id": "jar-2",
        "sprite": "../../object/object_jar.png",
        "title": "장면 뷰어",
        "type": "menu",
        "x": 28,
        "y": 16,
        "w": 2,
        "h": 1,
        "items": [
            {
                "label": "환세쾌진극 엔딩",
                "href": "scene_viewer/scene.html",
                "target": "_blank"
            }
        ]
    }
]