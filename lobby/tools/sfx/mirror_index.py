"""Crawl the Your.Org mirror of the Sonniss GameAudioGDC bundles (the official mirror linked from
sonniss.com/gameaudiogdc) and write one index line per file: year <TAB> size-bytes-approx <TAB> relative path.

    python mirror_index.py <out.tsv> [year ...]

Only directory listings are read here; nothing is downloaded.
"""
import html
import re
import sys
import threading
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://ftpmirror.your.org/pub/misc/"
YEARS = {"2015": "sonniss", "2016": "sonniss2016", "2017": "sonniss2017", "2018": "sonniss2018",
         "2019": "sonniss2019", "2020": "sonniss2020"}
ROW = re.compile(r'<tr><td class="link"><a href="([^"]+)"[^>]*>.*?</a></td><td class="size">([^<]*)</td>')
UNIT = {"B": 1, "KiB": 1024, "MiB": 1024 ** 2, "GiB": 1024 ** 3}
UA = {"User-Agent": "sfx-library-fetch/1.0"}


def size_of(text):
    m = re.match(r"([\d.]+)\s*(B|KiB|MiB|GiB)", text.strip())
    return int(float(m.group(1)) * UNIT[m.group(2)]) if m else 0


def listing(url):
    last = None
    for _ in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # retry on any network error
            last = e
    raise last


def crawl(year, out, lock, pool):
    root = BASE + YEARS[year] + "/individual/"
    pending = [root]
    while pending:
        pages = list(pool.map(lambda u: (u, listing(u)), pending))
        pending = []
        for url, page in pages:
            for href, size in ROW.findall(page):
                href = html.unescape(href)
                if href.startswith("../") or href.startswith("?"):
                    continue
                full = url + href
                if href.endswith("/"):
                    pending.append(full)
                else:
                    rel = urllib.parse.unquote(full[len(root):])
                    with lock:
                        out.write(f"{year}\t{size_of(size)}\t{rel}\n")
        print(year, "dirs queued", len(pending), flush=True)


def main():
    out_path = sys.argv[1]
    years = sys.argv[2:] or list(YEARS)
    lock = threading.Lock()
    with open(out_path, "w", encoding="utf-8") as out, ThreadPoolExecutor(12) as pool:
        for y in years:
            crawl(y, out, lock, pool)


if __name__ == "__main__":
    main()
