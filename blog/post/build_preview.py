#!/usr/bin/env python3
"""blog/post/*-intro.md 원고를 블로그 스킨(blog/preview.html + skin.css)에 얹어
미리보기 페이지로 만든다.

    python3 blog/post/build_preview.py

결과: blog/post/preview/index.html (+ 스킨 CSS, 리사이즈한 이미지)
상단 카테고리 탭(환세희담·풍광전·쾌도전·포물장)으로 글을 오간다.

원고의 주석 규칙
  <!-- 이미지: 경로 --> + 바로 다음 "> 캡션"   → 캡션 달린 이미지
  <!-- 이미지 위치: 설명 -->                   → 블로그에 이미 있는 이미지 자리(회색 상자)
  <!-- 더보기 블록: 「버튼 문구」 --> + 인용문  → 접은 글
  <!-- 링크: url --> / <!-- 링크 카드: url -->   → 링크 카드 자리
  <!-- 태그: a, b -->                          → 글 하단 태그
"""
import html
import re
import shutil
from pathlib import Path

from PIL import Image

POST = Path(__file__).resolve().parent
BLOG = POST.parent
ROOT = BLOG.parent
OUT = POST / "preview"

POSTS = [  # (파일, 탭 이름, 앵커)
    ("kitan-intro.md", "환세희담", "kitan"),
    ("hukyou-intro.md", "환세풍광전", "hukyou"),
    ("kaitou-intro.md", "환세쾌도전", "kaitou"),
    ("torimono-intro.md", "환세포물장", "torimono"),
]

MAX_W = 1400


# ---------- 이미지 ----------
def copy_image(rel: str) -> str:
    src = (POST / rel).resolve()
    if not src.exists():
        raise FileNotFoundError(f"이미지 없음: {rel}")
    dst_dir = OUT / "img"
    dst_dir.mkdir(parents=True, exist_ok=True)
    im = Image.open(src)
    keep_png = src.suffix.lower() == ".png" and im.width * im.height <= 640 * 480
    name = src.stem + (".png" if keep_png else ".jpg")
    dst = dst_dir / name
    if not dst.exists():
        if im.width > MAX_W:
            im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        if keep_png:
            im.save(dst)
        else:
            im.convert("RGB").save(dst, quality=82, optimize=True)
    return f"img/{name}"


# ---------- 인라인 ----------
def inline(text: str) -> str:
    t = html.escape(text, quote=False)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', t)
    t = re.sub(r"(?<![\"=])(https?://[^\s<)]+)", r'<a href="\1" target="_blank" rel="noopener">\1</a>', t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    return t


COMMENT = re.compile(r"^<!--\s*(.*?)\s*-->$")


def placeholder(label: str, kind: str = "img") -> str:
    return (f'<div class="pv-ph pv-ph-{kind}"><span>{html.escape(label)}</span></div>')


# ---------- 블록 ----------
def render_blocks(lines, tags):
    out = []
    i = 0
    n = len(lines)

    def para(buf, br=False):
        if not buf:
            return
        joiner = "<br>" if br else " "
        out.append(f'<p data-ke-size="size16">{joiner.join(inline(x) for x in buf)}</p>')

    while i < n:
        line = lines[i].rstrip("\n")
        s = line.strip()
        if not s:
            i += 1
            continue

        m = COMMENT.match(s)
        if m:
            body = m.group(1)
            if body.startswith("이미지:"):
                src = copy_image(body.split(":", 1)[1].strip())
                cap = ""
                j = i + 1
                caps = []
                while j < n and lines[j].startswith(">"):
                    caps.append(lines[j][1:].strip())
                    j += 1
                cap = " ".join(c for c in caps if c)
                out.append(
                    f'<figure class="imageblock alignCenter" data-ke-mobilestyle="widthOrigin">'
                    f'<span><img src="{src}" loading="lazy" alt=""></span>'
                    + (f"<figcaption>{inline(cap)}</figcaption>" if cap else "")
                    + "</figure>")
                i = j
                continue
            if body.startswith("이미지 위치:"):
                out.append(placeholder("블로그 기존 이미지 · " + body.split(":", 1)[1].strip()))
                i += 1
                continue
            if body.startswith("링크 카드:") or body.startswith("링크:"):
                url = body.split(":", 1)[1].strip()
                out.append(placeholder("링크 카드 · " + url, "link"))
                i += 1
                continue
            if body.startswith("더보기 블록:"):
                btn = body.split(":", 1)[1].strip().strip("「」")
                j = i + 1
                while j < n and not lines[j].strip():
                    j += 1
                inner = []
                while j < n and lines[j].startswith(">"):
                    inner.append(lines[j][2:] if lines[j].startswith("> ") else lines[j][1:])
                    j += 1
                content = render_blocks(inner, None) if inner else ""
                out.append(
                    f'<div data-ke-type="moreLess" data-text-more="{html.escape(btn)}" data-text-less="닫기">'
                    f'<a class="btn-toggle-moreless">{html.escape(btn)}</a>'
                    f'<div class="moreless-content">{content}</div></div>')
                i = j
                continue
            if body.startswith("태그:") and tags is not None:
                tags.extend(t.strip() for t in body.split(":", 1)[1].split(","))
            i += 1
            continue

        if s.startswith("## "):
            out.append(f'<h2 data-ke-size="size26">{inline(s[3:])}</h2>')
            i += 1
            continue
        if s.startswith("### "):
            out.append(f'<h3 data-ke-size="size23">{inline(s[4:])}</h3>')
            i += 1
            continue
        if s == "---":
            out.append('<hr contenteditable="false" data-ke-type="horizontalRule" data-ke-style="style5">')
            i += 1
            continue
        if s.startswith("|"):
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-+:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            h = "".join(f"<td><b>{inline(c)}</b></td>" for c in rows[0])
            body = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows[1:])
            out.append(f'<table style="border-collapse: collapse; width: 100%;" border="1" data-ke-align="alignLeft">'
                       f"<tbody><tr>{h}</tr>{body}</tbody></table>")
            continue
        if s.startswith("- "):
            items = []
            while i < n and lines[i].strip().startswith("- "):
                items.append(lines[i].strip()[2:])
                i += 1
            out.append('<ul style="list-style-type: disc;" data-ke-list-type="disc">'
                       + "".join(f"<li>{inline(x)}</li>" for x in items) + "</ul>")
            continue
        if s.startswith(">"):
            inner = []
            while i < n and lines[i].startswith(">"):
                inner.append(lines[i][2:] if lines[i].startswith("> ") else lines[i][1:])
                i += 1
            out.append(f'<blockquote data-ke-style="style2">{render_blocks(inner, None)}</blockquote>')
            continue

        # 문단: 빈 줄까지. 줄바꿈이 있는 문단(인용 속 대사 등)은 <br>로 잇는다
        buf = []
        while i < n and lines[i].strip() and not COMMENT.match(lines[i].strip()) \
                and not re.match(r"^(## |### |---$|\||- |>)", lines[i].strip()):
            buf.append(lines[i].strip())
            i += 1
        para(buf, br=len(buf) > 1)
    return "\n".join(out)


def render_post(path: Path):
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    meta = {}
    title = ""
    body_lines = []
    for ln in lines:
        m = COMMENT.match(ln.strip())
        if m and " — https://" in m.group(1):
            meta["src"] = m.group(1)
            continue
        if m and m.group(1).startswith("공략:"):
            continue
        if ln.startswith("# ") and not title:
            title = ln[2:].strip()
            continue
        body_lines.append(ln)
    tags = []
    body = render_blocks(body_lines, tags)
    return title, meta.get("src", ""), body, tags


def main():
    shell = (BLOG / "preview.html").read_text(encoding="utf-8")
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "images").mkdir(parents=True)
    shutil.copy(BLOG / "skin.css", OUT / "skin.css")
    shutil.copy(ROOT / "design-tokens.css", OUT / "design-tokens.css")
    shutil.copy(ROOT / "fonts.css", OUT / "fonts.css")
    shutil.copy(BLOG / "images" / "hero.png", OUT / "images" / "hero.png")

    head = shell[: shell.index('<div class="area_list">')]
    head = head.replace("https://atah.io/design-tokens.css", "./design-tokens.css")
    head = head.replace("https://atah.io/fonts.css", "./fonts.css")
    head = head.replace("<title>스킨 미리보기</title>", "<title>환세 시리즈 소개글 미리보기</title>")
    head = head.replace("</style>", PV_CSS + "\n  </style>", 1)
    # 카테고리 탭을 글 전환용으로
    anchors = {name: a for _, name, a in POSTS}

    def tab(m):
        label = m.group(2)
        if label in anchors:
            return f'<a href="#{anchors[label]}" data-post="{anchors[label]}">{label}</a>'
        return f'<a href="#" class="pv-off">{label}</a>'
    nav_start = head.index('<nav class="area_titlenav"')
    nav_end = head.index("</nav>", nav_start)
    nav = re.sub(r'<a href="#"( class="on" aria-current="page")?>([^<]+)</a>', tab, head[nav_start:nav_end])
    head = head[:nav_start] + nav + head[nav_end:]

    foot_start = shell.index('<hr class="hide">\n    <div id="dkFoot"')
    tail = shell[foot_start:]
    tail = re.sub(r'<div id="previewBadge">.*?</div>',
                  '<div id="previewBadge">🔍 <b>소개글 원고 미리보기</b><br>'
                  'blog/post/*-intro.md를 스킨에 얹어 본 것이에요. 위 카테고리 탭으로 글을 바꿔 보세요.<br>'
                  '회색 상자는 블로그에 이미 올라가 있는 이미지 자리예요.</div>', tail, flags=re.S)
    tail = tail.replace("  </script>\n\n</body>", PV_JS + "\n  </script>\n\n</body>")

    arts = []
    for fn, name, a in POSTS:
        title, src, body, tags = render_post(POST / fn)
        m = re.search(r"(https://\S+)\s*\((.*?)\)", src)
        src_html = (f'<a href="{m.group(1)}" target="_blank" rel="noopener">원 글</a><span class="txt_bar"></span>{html.escape(m.group(2))}' if m else html.escape(src))
        tag_html = ""
        if tags:
            tag_html = ('<dl class="list_tag"><dt class="tit_tag"><span class="screen_out">TAG</span>TAG</dt>'
                        '<dd class="desc_tag">' + ", ".join(f'<a href="#">{html.escape(t)}</a>' for t in tags)
                        + "</dd></dl>")
        arts.append(f'''
        <div class="article_skin pv-post" id="post-{a}" hidden>
          <div class="skin_view">
            <div class="area_title">
              <strong class="tit_category"><a href="#{a}">{name}</a></strong>
              <h1 class="tit_post"><a href="#{a}">{html.escape(title)}</a></h1>
              <span class="txt_detail my_post">맛굴<span class="txt_bar"></span>{src_html}</span>
            </div>
            <div class="area_view" id="article-view-{a}">
              <div class="contents_style">
{body}
              </div>
              {tag_html}
            </div>
          </div>
        </div>''')
    main_html = ('<div id="dkContent" class="cont_skin" role="main">\n      <div id="cMain">'
                 + "".join(arts) + "\n      </div>\n    </div>\n    ")
    page = head + main_html + tail
    # 스킨 CSS가 #article-view 기준이라 활성 글에만 id를 옮겨 준다(JS). 첫 글은 미리 붙여 둔다.
    (OUT / "index.html").write_text(page, encoding="utf-8")
    print("written", OUT / "index.html")


PV_CSS = """
    .pv-ph { display: flex; align-items: center; justify-content: center; min-height: 120px; margin: 24px 0;
      border: 1px dashed #bbb; border-radius: 6px; color: #888; font: 13px/1.5 -apple-system, sans-serif;
      background: repeating-linear-gradient(45deg, #f4f4f4, #f4f4f4 10px, #fafafa 10px, #fafafa 20px); text-align: center; padding: 12px; }
    .pv-ph-link { min-height: 64px; }
    .area_titlenav a.pv-off { opacity: .35; pointer-events: none; }
"""

PV_JS = """
    (function () {
      var posts = document.querySelectorAll('.pv-post');
      var tabs = document.querySelectorAll('.area_titlenav a[data-post]');
      function show(key) {
        var found = false;
        posts.forEach(function (p) {
          var on = p.id === 'post-' + key;
          p.hidden = !on;
          var view = p.querySelector('.area_view');
          if (on) { view.id = 'article-view'; found = true; } else { view.id = 'article-view-' + p.id.slice(5); }
        });
        if (!found && posts.length) { return show(posts[0].id.slice(5)); }
        tabs.forEach(function (t) {
          var on = t.getAttribute('data-post') === key;
          t.className = on ? 'on' : '';
          if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
        });
      }
      function fromHash() { show((location.hash || '#kitan').slice(1)); }
      window.addEventListener('hashchange', function () { fromHash(); window.scrollTo(0, 0); });
      fromHash();
      document.addEventListener('click', function (e) {
        var b = e.target.closest('.btn-toggle-moreless');
        if (!b) return;
        e.preventDefault();
        var box = b.parentNode;
        var open = box.classList.toggle('open');
        b.textContent = open ? box.getAttribute('data-text-less') : box.getAttribute('data-text-more');
      });
    })();
"""

if __name__ == "__main__":
    main()
