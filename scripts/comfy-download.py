"""多线程 Range 分片下载 hf-mirror 模型（单连接限速时并行提速）。

用法: python scripts/comfy-download.py <url> <out_path> [threads]
"""
import os
import sys
import time
import urllib.request
import threading
from concurrent.futures import ThreadPoolExecutor

URL = sys.argv[1]
OUT = sys.argv[2]
THREADS = int(sys.argv[3]) if len(sys.argv) > 3 else 8
CHUNK = 16 * 1024 * 1024  # 16MB 每片


def probe_size(url: str) -> int:
    req = urllib.request.Request(url, method="GET", headers={"Range": "bytes=0-0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        cr = r.headers.get("Content-Range") or ""
        return int(cr.split("/")[-1])


def download_range(url: str, start: int, end: int, out: str, idx: int, progress: list):
    req = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}"})
    with urllib.request.urlopen(req, timeout=120) as r, open(out, "r+b") as f:
        f.seek(start)
        while True:
            buf = r.read(1 << 20)
            if not buf:
                break
            f.write(buf)
            progress[idx] += len(buf)


def main():
    total = probe_size(URL)
    print(f"total={total / 1e6:.1f}MB threads={THREADS}", flush=True)
    if os.path.exists(OUT) and os.path.getsize(OUT) == total:
        print("already complete", flush=True)
        return
    with open(OUT, "wb") as f:
        f.truncate(total)
    ranges = []
    for s in range(0, total, CHUNK):
        ranges.append((s, min(s + CHUNK - 1, total - 1)))
    progress = [0] * len(ranges)
    done = [0]
    started = time.time()
    lock = threading.Lock()
    last_report = [0.0]

    def worker(i):
        s, e = ranges[i]
        download_range(URL, s, e, OUT, i, progress)
        with lock:
            done[0] += 1
            if done[0] % 4 == 0 or done[0] == len(ranges):
                now = time.time()
                if now - last_report[0] > 10:
                    last_report[0] = now
                    got = sum(progress)
                    speed = got / (now - started) / 1e6
                    print(f"  {got / 1e6:.0f}/{total / 1e6:.0f}MB  {speed:.1f}MB/s  {done[0]}/{len(ranges)}", flush=True)

    with ThreadPoolExecutor(max_workers=THREADS) as ex:
        list(ex.map(worker, range(len(ranges))))
    elapsed = time.time() - started
    print(f"done in {elapsed:.0f}s, avg {total / elapsed / 1e6:.1f}MB/s", flush=True)


if __name__ == "__main__":
    main()
