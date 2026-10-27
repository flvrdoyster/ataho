#!/usr/bin/env python3
import argparse
import html
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

TITLES = {"환세희담": 135, "환세풍광전": 44, "환세쾌도전": 98, "환세포물장": 55, "환세패유기": 43}
BLOG = "oysterbay.tistory.com"
OURS = ("oysterbay.tistory.com", "atah.io")
AREA = {"abL_rtX": "AI 브리핑", "abL_baX": "AI 브리핑", "apB_ugC": "네이버 메이트", "fqL_iaX": "관련질문",
        "ink_kig": "인플루언서", "urB_imM": "이미지", "nws_all": "뉴스"}
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/130.0 Safari/537.36")


def fetch(title):
    url = "https://search.naver.com/search.naver?where=nexearch&query=" + urllib.parse.quote(title)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ko"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", errors="replace")


def parse(raw):
    blocks = []
    for m in re.finditer(r'data-meta-area="([^"]+)"', raw):
        if m.group(1) not in blocks:
            blocks.append(m.group(1))
    cards, after_keep = [], False
    for m in re.finditer(r"<a [^>]*>", raw):
        tag = m.group(0)
        area = re.search(r'data-nlog-area="([^"]+)"', tag)
        href = re.search(r'href="(https?://[^"]+)"', tag)
        if not (area and href):
            continue
        if area.group(1).endswith("kephome"):
            after_keep = True
            continue
        if after_keep and (area.group(1).endswith(".link") or area.group(1).endswith(".title")):
            p = urllib.parse.urlparse(html.unescape(href.group(1)))
            cards.append(p.netloc + urllib.parse.unquote(p.path).rstrip("/"))
            after_keep = False
    first_web = next((b for b in blocks if b.startswith("urB_co") or b.startswith("urB_bo")), None)
    above_web = [AREA.get(b, b) for b in blocks[:blocks.index(first_web)]] if first_web else []
    return cards, above_web


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--save")
    args = ap.parse_args()
    save = Path(args.save) if args.save else None
    if save:
        save.mkdir(parents=True, exist_ok=True)

    out = {}
    for title, post in TITLES.items():
        raw = fetch(title)
        if save:
            (save / f"naver_{title}.html").write_text(raw, encoding="utf-8")
        cards, above_web = parse(raw)
        rank = next((i for i, c in enumerate(cards, 1) if c == f"{BLOG}/{post}"), None)
        ours = [(i, c) for i, c in enumerate(cards, 1) if c.split("/")[0].endswith(OURS)]
        out[title] = {"post": post, "rank": rank, "ours": ours, "above_web": above_web, "cards": cards[:12]}
        print(f"== {title} (소개 /{post}) → {rank or '없음'} | 웹문서 위 영역: {', '.join(above_web) or '없음'}")
        for i, c in ours:
            print(f"   우리: {i:2}. {c}")
        for i, c in enumerate(cards[:10], 1):
            print(f"   {i:2}. {c[:70]}")
    if save:
        (save / "naver_rank.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
