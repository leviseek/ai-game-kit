#!/usr/bin/env python3
"""参考生成器：Python3 标准库生成 WAV 音效（正弦/噪声 + 线性包络）。无第三方依赖。

用法：python python-wave.py --out <file.wav> [--duration 0.3] [--freq 440] [--waveform sine|noise] [--sample-rate 22050]
输出：单声道 16bit PCM WAV，含淡入 10ms / 淡出 50ms 包络。
"""
import argparse
import math
import random
import struct
import sys
import wave


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="python-wave")
    parser.add_argument("--out", required=True)
    parser.add_argument("--duration", type=float, default=0.3)
    parser.add_argument("--freq", type=float, default=440.0)
    parser.add_argument("--waveform", choices=["sine", "noise"], default="sine")
    parser.add_argument("--sample-rate", type=int, default=22050)
    args = parser.parse_args(argv)

    rate = args.sample_rate
    total = max(1, int(args.duration * rate))
    fade_in = max(1, int(0.01 * rate))
    fade_out = max(1, int(0.05 * rate))
    rng = random.Random(int(args.freq * 1000))

    frames = bytearray()
    for i in range(total):
        t = i / rate
        sample = rng.uniform(-1.0, 1.0) if args.waveform == "noise" else math.sin(2.0 * math.pi * args.freq * t)
        if i < fade_in:
            env = i / fade_in
        elif i > total - fade_out:
            env = max(0.0, (total - i) / fade_out)
        else:
            env = 1.0
        frames += struct.pack("<h", int(sample * env * 32767))

    with wave.open(args.out, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(bytes(frames))
    print(f"written {args.out} duration={args.duration} rate={rate}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
