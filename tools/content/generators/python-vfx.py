import argparse
import math
import random
from PIL import Image, ImageDraw, ImageFilter


def rgba(hex_value, alpha=255):
    value = hex_value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def ellipse(draw, cx, cy, radius, fill):
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=fill)


def line(draw, points, fill, width):
    draw.line(points, fill=fill, width=max(1, int(width)), joint="curve")


def render_hit(draw, size, index, count, rng):
    cx, cy = size * 0.5, size * 0.5
    t = index / (count - 1)
    strength = math.sin(min(1, t * 1.25) * math.pi)
    radius = size * (0.1 + 0.38 * t)
    for ray in range(12):
        angle = ray * math.tau / 12 + 0.09 * math.sin(ray * 2.1)
        inner = size * 0.035
        outer = radius * (0.72 + 0.35 * rng.random())
        alpha = max(14, int(235 * (1 - t) ** 0.65))
        color = rgba("ffd166" if ray % 2 == 0 else "fff4c2", alpha)
        line(draw, [(cx + math.cos(angle) * inner, cy + math.sin(angle) * inner), (cx + math.cos(angle) * outer, cy + math.sin(angle) * outer)], color, size * (0.045 - 0.025 * t))
    ellipse(draw, cx, cy, size * (0.18 * strength + 0.025), rgba("ffffff", int(245 * (1 - t))))
    ellipse(draw, cx, cy, size * (0.10 * strength + 0.015), rgba("fff2a8", int(255 * (1 - t))))
    for p in range(7):
        angle = p * math.tau / 7 + 0.3
        dist = size * (0.12 + 0.35 * t) * (0.75 + 0.3 * rng.random())
        r = size * (0.027 * (1 - t) + 0.009)
        ellipse(draw, cx + math.cos(angle) * dist, cy + math.sin(angle) * dist, r, rgba("ff9f43", int(230 * (1 - t))))


def render_slash(draw, size, index, count):
    t = index / (count - 1)
    cx, cy = size * 0.50, size * 0.55
    box = (size * 0.10, size * 0.10, size * 0.90, size * 0.90)
    start = 205 - 85 * t
    end = start + 70 + 45 * math.sin(t * math.pi)
    alpha = max(16, int(255 * math.sin(min(1, t * 1.08) * math.pi)))
    draw.arc(box, start=start, end=end, fill=rgba("ffffff", alpha), width=max(2, int(size * 0.075 * (1 - 0.35 * t))))
    inner = (size * 0.16, size * 0.16, size * 0.84, size * 0.84)
    draw.arc(inner, start=start + 4, end=end - 5, fill=rgba("8bd9ff", int(alpha * 0.85)), width=max(1, int(size * 0.035)))
    tip_angle = math.radians(end)
    tip_x = cx + math.cos(tip_angle) * size * 0.40
    tip_y = cy + math.sin(tip_angle) * size * 0.40
    line(draw, [(cx, cy), (tip_x, tip_y)], rgba("eaf9ff", int(alpha * 0.5)), size * 0.018)


def render_fireball_projectile(draw, size, index, count):
    phase = index / count * math.tau
    cx, cy = size * 0.55, size * 0.50
    for layer, color, radius in [(0, "ff5a1f", 0.27), (1, "ff9f1c", 0.20), (2, "ffe66d", 0.12), (3, "ffffff", 0.055)]:
        wobble = math.sin(phase + layer * 1.7) * size * 0.012
        ellipse(draw, cx + wobble, cy - wobble * 0.5, size * radius, rgba(color, 230 if layer == 0 else 255))
    for flame in range(4):
        y = cy + math.sin(phase + flame * 1.5) * size * 0.08
        length = size * (0.22 + flame * 0.055)
        line(draw, [(cx - size * 0.16, y), (cx - length, y + math.sin(phase + flame) * size * 0.07)], rgba("ff7b1a", 190 - flame * 25), size * (0.08 - flame * 0.012))


def render_fireball_impact(draw, size, index, count, rng):
    cx, cy = size * 0.5, size * 0.53
    t = index / (count - 1)
    bloom = math.sin(min(1, t * 1.3) * math.pi)
    for radius, color, alpha in [(0.40, "ff541f", 170), (0.29, "ff971c", 220), (0.17, "ffe066", 245), (0.07, "ffffff", 255)]:
        ellipse(draw, cx, cy, size * radius * bloom, rgba(color, int(alpha * (1 - t) ** 0.55)))
    ring_r = size * (0.12 + 0.34 * t)
    draw.ellipse((cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r), outline=rgba("ffd166", int(230 * (1 - t))), width=max(1, int(size * 0.035 * (1 - t) + 1)))
    for p in range(10):
        angle = p * math.tau / 10 + rng.uniform(-0.15, 0.15)
        dist = size * (0.1 + 0.42 * t) * (0.8 + rng.random() * 0.25)
        ellipse(draw, cx + math.cos(angle) * dist, cy + math.sin(angle) * dist, size * (0.026 * (1 - t) + 0.008), rgba("ff8c24", max(12, int(230 * (1 - t)))))


def render_heal(draw, size, index, count):
    cx, cy = size * 0.5, size * 0.56
    t = index / (count - 1)
    pulse = math.sin(min(1, t * 1.15) * math.pi)
    ring_rx = size * (0.16 + 0.24 * t)
    ring_ry = ring_rx * 0.38
    draw.ellipse((cx - ring_rx, cy - ring_ry, cx + ring_rx, cy + ring_ry), outline=rgba("8cffb2", max(12, int(235 * (1 - t) ** 0.5))), width=max(2, int(size * 0.035)))
    ellipse(draw, cx, cy - size * 0.08, size * 0.19 * pulse, rgba("6fe6a1", int(85 * (1 - t))))
    cross_alpha = int(255 * math.sin(min(1, t * 1.4) * math.pi))
    line(draw, [(cx, cy - size * 0.34), (cx, cy - size * 0.10)], rgba("eaffef", cross_alpha), size * 0.055)
    line(draw, [(cx - size * 0.12, cy - size * 0.22), (cx + size * 0.12, cy - size * 0.22)], rgba("eaffef", cross_alpha), size * 0.055)
    for p in range(6):
        angle = p * math.tau / 6 + t * 1.7
        x = cx + math.cos(angle) * size * (0.19 + 0.09 * t)
        y = cy - size * (0.05 + 0.32 * t) + math.sin(angle) * size * 0.07
        ellipse(draw, x, y, size * (0.018 + 0.008 * pulse), rgba("a7ffbf", int(230 * (1 - t))))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--effect", required=True)
    parser.add_argument("--index", type=int, required=True)
    parser.add_argument("--count", type=int, required=True)
    parser.add_argument("--size", type=int, default=128)
    args = parser.parse_args()

    scale = 4
    size = args.size * scale
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    glow_draw = ImageDraw.Draw(glow)
    rng = random.Random(20260819 + args.index * 97 + sum(ord(c) for c in args.effect))

    target = glow_draw if args.effect in {"fireball_projectile", "fireball_impact", "heal_aura"} else draw
    if args.effect == "hit_physical":
        render_hit(draw, size, args.index, args.count, rng)
    elif args.effect == "slash_arc":
        render_slash(draw, size, args.index, args.count)
    elif args.effect == "fireball_projectile":
        render_fireball_projectile(target, size, args.index, args.count)
    elif args.effect == "fireball_impact":
        render_fireball_impact(target, size, args.index, args.count, rng)
    elif args.effect == "heal_aura":
        render_heal(target, size, args.index, args.count)
    else:
        raise ValueError(args.effect)

    if glow.getbbox() is not None:
        blurred = glow.filter(ImageFilter.GaussianBlur(radius=size * 0.025))
        image = Image.alpha_composite(image, blurred)
        image = Image.alpha_composite(image, glow)
    image = image.resize((args.size, args.size), Image.Resampling.LANCZOS)
    image.save(args.out)


if __name__ == "__main__":
    main()
