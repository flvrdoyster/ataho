if (!window.MAP_DATA) window.MAP_DATA = {};
// 맵의 트리거(상호작용 오브젝트) 데이터를 정의합니다.
// x, y: 좌표 / w, h: 영역 크기 / items: 모달에 표시될 메뉴 구성
if (!window.MAP_DATA.triggers) window.MAP_DATA.triggers = [];

window.MAP_DATA.triggers = [
    {
        "x": 12,
        "y": 12,
        "w": 3,
        "h": 1,
        "id": "sake",
        "type": "dialog",
        "sprite": "../../object/object_sake.png",
        "text": [
            "술병이다. 아직 내용물이 남아있는 것 같다.",
            "한 모금 마셨다. 맛이 좋다.",
            "취기가 오른다..."
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
                "text": "헤엄치기",
                "href": "swim/index.html"
            },
            {
                "text": "평균대 동작수련",
                "href": "balance/index.html"
            }
        ]
    },
    {
        "x": 15,
        "y": 16,
        "w": 4,
        "h": 4,
        "id": "haiyuki",
        "title": "환세패유기",
        "type": "menu",
        "items": [
            {
                "text": "웹 버전 (ko)",
                "href": "haiyuki_web/index.html"
            },
            {
                "text": "매뉴얼 (ko)",
                "href": "haiyuki_manual/index.html"
            },
            {
                "text": "매뉴얼 원본 1 (PDF)",
                "href": "haiyuki_manual/ref/manual_thebest.pdf"
            },
            {
                "text": "매뉴얼 원본 2 (PDF)",
                "href": "haiyuki_manual/ref/manual_D4.pdf"
            }
        ]
    },
    {
        "x": 3,
        "y": 17,
        "w": 2,
        "h": 2,
        "id": "illust",
        "title": "일러스트",
        "type": "menu",
        "items": [
            {
                "text": "Disc Station 04",
                "href": "#resource/img/ds04.png",
                "data": {
                    "caption": "Disc Station 04 메뉴 화면 일러스트"
                }
            },
            {
                "text": "Disc Station 10",
                "href": "#resource/img/ds10.png",
                "data": {
                    "caption": "Disc Station 10 메뉴 화면 일러스트"
                }
            },
            {
                "text": "Disc Station 14",
                "href": "#resource/img/ds14.png",
                "data": {
                    "caption": "Disc Station 14 메뉴 화면 일러스트"
                }
            },
            {
                "text": "Disc Station 20",
                "href": "#resource/img/ds20.png",
                "data": {
                    "caption": "Disc Station 20 메뉴 화면 일러스트"
                }
            }
        ]
    },
    {
        "x": 31,
        "y": 21,
        "w": 2,
        "h": 2,
        "id": "ds_anime",
        "title": "DS 아니메 총집편 '98",
        "type": "menu",
        "items": [
            {
                "text": "환세 시리즈 부분 컷",
                "href": "#resource/mov/ani_orig.mp4",
                "data": {
                    "caption": "그런 계절 / 싱크로 / 본능 / 쿠킹 DE GO / 물가의 사랑",
                    "subtitle": "ani_caption.vtt"
                }
            }
        ]
    },
    {
        "id": "scene_viewer",
        "title": "장면 뷰어",
        "type": "menu",
        "x": 28,
        "y": 15,
        "w": 2,
        "h": 2,
        "items": [
            {
                "text": "환세쾌진극 엔딩",
                "href": "scene_viewer/scene.html"
            }
        ]
    }
]