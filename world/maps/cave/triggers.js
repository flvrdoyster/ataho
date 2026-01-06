/**
 * 맵의 트리거(상호작용 오브젝트) 데이터를 정의합니다.
 * 
 * [트리거 속성]
 * - x, y: 좌표 (타일 단위)
 * - w, h: 상호작용 영역 크기
 * - id: 트리거 식별자
 * - type: 'dialog' (대사만) 또는 'menu' (선택지 메뉴)
 * - sprite: 표시할 오브젝트 이미지 경로
 * - title: 모달 제목 (생략 시 제목 영역 숨김)
 * - text: 상호작용 시 출력될 기본 대사 (배열 시 순차 출력)
 * 
 * [items (메뉴) 속성]
 * - label: 선택지 텍스트
 * - action: 실행할 액션 키 (eat, drink, sit, lie, yawn)
 * - count: 실행할 횟수
 * - text: 선택 시 출력될 캐릭터 대사 (말풍선)
 * - href: 링크 이동 주소 (action/text가 없을 때 사용)
 */

if (!window.MAP_DATA.triggers) window.MAP_DATA.triggers = [];

window.MAP_DATA.triggers = [
    {
        "x": 11,
        "y": 10,
        "w": 3,
        "h": 1,
        "id": "sake",
        "type": "menu",
        "sprite": "../../object/object_sake.png",
        "text": [
            "호랑이 마을, 내 집에 있던 특주다.",
            "이건 아직도 누가 보냈는지 모르겠어.",
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
        "text": [
            "해변 마을에나 가볼까?"
        ],
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
        "sprite": "../../object/object_irori.png",
        "animW": 64,
        "animH": 48,
        "frames": 4,
        "speed": 200,
        "text": [
            "쓸데 없이 뜨겁구만."
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
        "title": "DS 메뉴 화면 일러스트",
        "type": "menu",
        "text": [
            "언제 받았는지도 모를 전단지 투성이야."
        ],
        "items": [
            {
                "label": "Disc Station 04",
                "href": "#resource/img/ds04.png",
                "data": {
                    "caption": "Disc Station 04"
                }
            },
            {
                "label": "Disc Station 10",
                "href": "#resource/img/ds10.png",
                "data": {
                    "caption": "Disc Station 10"
                }
            },
            {
                "label": "Disc Station 14",
                "href": "#resource/img/ds14.png",
                "data": {
                    "caption": "Disc Station 14"
                }
            },
            {
                "label": "Disc Station 20",
                "href": "#resource/img/ds20.png",
                "data": {
                    "caption": "Disc Station 20"
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
        "text": [
            "이건 뭐지?"
        ],
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
        "text": [
            "그러고보니 스마슈 녀석이 이상한 책을 줬었지."
        ],
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