"""
gen_tile_categories.py  —  타일셋 자동 분류 → data.js 주입
─────────────────────────────────────────────────────────────
사용법:
    python3 tools/gen_tile_categories.py <맵이름>
    python3 tools/gen_tile_categories.py cave
    python3 tools/gen_tile_categories.py souko

world/maps/<맵이름>/data.js 의 assets.tileCategories 를 자동 생성/갱신합니다.
"""

import sys, json, re
from pathlib import Path
from PIL import Image

if len(sys.argv) < 2:
    print("사용법: python3 tools/gen_tile_categories.py <맵이름>")
    sys.exit(1)

MAP_NAME  = sys.argv[1]
MAP_DIR   = Path(__file__).parent.parent / 'world/maps' / MAP_NAME
DATA_JS   = MAP_DIR / 'data.js'
TILE      = 16

if not DATA_JS.exists():
    print(f"오류: {DATA_JS} 를 찾을 수 없습니다.")
    sys.exit(1)

# ── data.js 파싱 ──────────────────────────────────────────────────────────────
raw = DATA_JS.read_text(encoding='utf-8')
json_str = re.sub(r'^window\.MAP_DATA\s*=\s*', '', raw.strip().rstrip(';'))
data = json.loads(json_str)

tileset_rel = data.get('assets', {}).get('tileset', '')
if not tileset_rel:
    print("오류: data.js 에 assets.tileset 이 없습니다.")
    sys.exit(1)

# tileset 경로는 maps/<맵>/assets/tile.png 형식 (world/ 기준 상대경로)
tileset_path = Path(__file__).parent.parent / 'world' / tileset_rel
if not tileset_path.exists():
    print(f"오류: 타일셋 이미지를 찾을 수 없습니다: {tileset_path}")
    sys.exit(1)

print(f"타일셋: {tileset_path}")

# ── 픽셀 분석 ─────────────────────────────────────────────────────────────────
img = Image.open(tileset_path).convert('RGBA')
pix = img.load()
TW, TH = img.size
TX, TY = TW // TILE, TH // TILE

def tile_pixels(tx, ty):
    bx, by = tx * TILE, ty * TILE
    return [pix[bx+x, by+y] for y in range(TILE) for x in range(TILE)]

def mean_alpha(p):
    return sum(q[3] for q in p) / len(p)

def blue_ratio(p):
    v = [q for q in p if q[3] > 80]
    return len([q for q in v if q[2] > q[0]+30 and q[2] > 80]) / max(len(v), 1)

def black_ratio(p):
    v = [q for q in p if q[3] > 80]
    return len([q for q in v if q[0]+q[1]+q[2] < 40]) / max(len(v), 1)

def classify(tx, ty, p):
    if mean_alpha(p) < 80:          return 'empty'
    if black_ratio(p) >= 0.20:      return 'outer_wall'
    br = blue_ratio(p)
    if br > 0.40:                   return 'water'
    if br > 0.05:                   return 'waterside_wall'
    # 따뜻한 중간 밝기 → 바닥
    v = [q for q in p if q[3] > 80]
    if not v: return 'empty'
    ar = sum(q[0] for q in v) / len(v)
    ag = sum(q[1] for q in v) / len(v)
    ab = sum(q[2] for q in v) / len(v)
    brightness = (ar + ag + ab) / 3
    if ar > ab + 20 and ag > ab + 5 and 80 < brightness < 180:
        return 'floor'
    return 'rock_wall'

# ── 분류 실행 ─────────────────────────────────────────────────────────────────
categories = {}
counts = {}
for ty in range(TY):
    for tx in range(TX):
        p = tile_pixels(tx, ty)
        cat = classify(tx, ty, p)
        categories[f"{tx},{ty}"] = cat
        counts[cat] = counts.get(cat, 0) + 1

print(f"분류 완료: {TX}×{TY} = {TX*TY}개 타일")
for cat, n in sorted(counts.items()):
    print(f"  {cat:16s}: {n}")

# ── data.js 에 tileCategories 주입 ───────────────────────────────────────────
data.setdefault('assets', {})['tileCategories'] = categories
DATA_JS.write_text('window.MAP_DATA = ' + json.dumps(data, indent=2, ensure_ascii=False) + ';\n',
                   encoding='utf-8')
print(f"저장: {DATA_JS}")
