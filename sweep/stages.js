/**
 * stages.js — 술창고 청소 스테이지 데이터
 * (sweep/stage_editor.html 에서 생성)
 *
 * 좌표는 셀 좌표(cx 0~10, cy 0~5) — 이동 격자 한 칸 단위.
 * 장애물 스탬프: 3×3 타일(row-major 9칸) 묶음. null은 투명. block=false는 통행 가능.
 */

window.SWEEP_OBSTACLES = {
    "포대1": {
        tiles: [
            [18, 5], [19, 5], [20, 5],
            [21, 5], [22, 5], [23, 5],
            [24, 5], [25, 5], [26, 5]
        ]
    },
    "포대2": {
        tiles: [
            [27, 5], [28, 5], [29, 5],
            [30, 5], [31, 5], [32, 5],
            [33, 5], [34, 5], [35, 5]
        ]
    },
    "술박스": {
        tiles: [
            [5, 3], [6, 3], [7, 3],
            [15, 3], [16, 3], [17, 3],
            [22, 3], [23, 3], [24, 3]
        ]
    },
    "작은박스더미": {
        tiles: [
            [8, 3], [8, 3], [8, 3],
            [18, 3], [18, 3], [18, 3],
            [25, 3], [25, 3], [25, 3]
        ]
    },
    "세운술통": {
        tiles: [
            [33, 1], [34, 1], [35, 1],
            [12, 2], [13, 2], [14, 2],
            [30, 2], [31, 2], [32, 2]
        ]
    },
    "누운술통": {
        tiles: [
            [36, 1], [37, 1], [38, 1],
            [15, 2], [16, 2], [17, 2],
            [33, 2], [34, 2], [35, 2]
        ]
    }
};

window.SWEEP_STAGES = [
    { spawn: { cx: 5, cy: 5 }, obstacles: [
            { cx: 2, cy: 1, stamp: "포대1" },
            { cx: 9, cy: 1, stamp: "포대1" },
            { cx: 3, cy: 1, stamp: "포대2" },
            { cx: 5, cy: 1, stamp: "포대2" },
            { cx: 6, cy: 1, stamp: "세운술통" },
            { cx: 7, cy: 1, stamp: "세운술통" },
            { cx: 8, cy: 1, stamp: "세운술통" },
            { cx: 9, cy: 2, stamp: "세운술통" },
            { cx: 8, cy: 4, stamp: "세운술통" },
            { cx: 5, cy: 2, stamp: "세운술통" },
            { cx: 5, cy: 4, stamp: "세운술통" },
            { cx: 4, cy: 4, stamp: "세운술통" },
            { cx: 3, cy: 4, stamp: "세운술통" },
            { cx: 2, cy: 4, stamp: "세운술통" },
            { cx: 2, cy: 3, stamp: "세운술통" }
        ] },
    { spawn: { cx: 5, cy: 5 }, obstacles: [
            { cx: 5, cy: 0, stamp: "세운술통" },
            { cx: 1, cy: 2, stamp: "세운술통" },
            { cx: 1, cy: 3, stamp: "세운술통" },
            { cx: 7, cy: 5, stamp: "포대1" },
            { cx: 7, cy: 4, stamp: "세운술통" },
            { cx: 7, cy: 3, stamp: "세운술통" },
            { cx: 10, cy: 1, stamp: "세운술통" },
            { cx: 10, cy: 0, stamp: "술박스" },
            { cx: 8, cy: 1, stamp: "포대1" },
            { cx: 3, cy: 1, stamp: "포대1" },
            { cx: 3, cy: 4, stamp: "술박스" }
        ] },
    { spawn: { cx: 5, cy: 5 }, obstacles: [
            { cx: 2, cy: 0, stamp: "술박스" },
            { cx: 1, cy: 2, stamp: "세운술통" },
            { cx: 1, cy: 3, stamp: "세운술통" },
            { cx: 2, cy: 3, stamp: "세운술통" },
            { cx: 3, cy: 3, stamp: "세운술통" },
            { cx: 0, cy: 5, stamp: "세운술통" },
            { cx: 8, cy: 4, stamp: "세운술통" },
            { cx: 9, cy: 4, stamp: "세운술통" },
            { cx: 9, cy: 3, stamp: "세운술통" },
            { cx: 9, cy: 2, stamp: "세운술통" },
            { cx: 9, cy: 1, stamp: "세운술통" },
            { cx: 8, cy: 1, stamp: "세운술통" },
            { cx: 4, cy: 1, stamp: "포대1" },
            { cx: 5, cy: 1, stamp: "포대1" },
            { cx: 6, cy: 1, stamp: "포대2" },
            { cx: 5, cy: 3, stamp: "포대1" }
        ] },
    { spawn: { cx: 5, cy: 5 }, obstacles: [
            { cx: 0, cy: 0, stamp: "작은박스더미" },
            { cx: 1, cy: 2, stamp: "세운술통" },
            { cx: 1, cy: 3, stamp: "세운술통" },
            { cx: 2, cy: 3, stamp: "세운술통" },
            { cx: 2, cy: 2, stamp: "세운술통" },
            { cx: 3, cy: 2, stamp: "세운술통" },
            { cx: 4, cy: 2, stamp: "세운술통" },
            { cx: 4, cy: 3, stamp: "세운술통" },
            { cx: 3, cy: 3, stamp: "세운술통" },
            { cx: 6, cy: 2, stamp: "세운술통" },
            { cx: 7, cy: 2, stamp: "세운술통" },
            { cx: 8, cy: 2, stamp: "세운술통" },
            { cx: 9, cy: 2, stamp: "세운술통" },
            { cx: 9, cy: 3, stamp: "세운술통" },
            { cx: 8, cy: 3, stamp: "세운술통" },
            { cx: 7, cy: 3, stamp: "세운술통" },
            { cx: 6, cy: 3, stamp: "세운술통" },
            { cx: 10, cy: 5, stamp: "술박스" }
        ] },
    { spawn: { cx: 5, cy: 5 }, obstacles: [
            { cx: 10, cy: 0, stamp: "술박스" },
            { cx: 0, cy: 0, stamp: "작은박스더미" },
            { cx: 1, cy: 0, stamp: "세운술통" },
            { cx: 9, cy: 0, stamp: "세운술통" },
            { cx: 0, cy: 1, stamp: "세운술통" },
            { cx: 0, cy: 2, stamp: "세운술통" },
            { cx: 0, cy: 3, stamp: "세운술통" },
            { cx: 0, cy: 4, stamp: "세운술통" },
            { cx: 0, cy: 5, stamp: "세운술통" },
            { cx: 1, cy: 5, stamp: "세운술통" },
            { cx: 9, cy: 5, stamp: "세운술통" },
            { cx: 10, cy: 5, stamp: "세운술통" },
            { cx: 10, cy: 4, stamp: "세운술통" },
            { cx: 10, cy: 3, stamp: "세운술통" },
            { cx: 10, cy: 2, stamp: "세운술통" },
            { cx: 10, cy: 1, stamp: "세운술통" },
            { cx: 5, cy: 4, stamp: "세운술통" },
            { cx: 5, cy: 3, stamp: "세운술통" },
            { cx: 5, cy: 2, stamp: "세운술통" },
            { cx: 5, cy: 1, stamp: "세운술통" },
            { cx: 4, cy: 2, stamp: "세운술통" },
            { cx: 4, cy: 3, stamp: "세운술통" },
            { cx: 3, cy: 2, stamp: "세운술통" },
            { cx: 3, cy: 3, stamp: "세운술통" },
            { cx: 6, cy: 2, stamp: "세운술통" },
            { cx: 6, cy: 3, stamp: "세운술통" },
            { cx: 7, cy: 3, stamp: "세운술통" },
            { cx: 7, cy: 2, stamp: "세운술통" }
        ] }
];

