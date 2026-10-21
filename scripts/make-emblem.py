# Generates public/lottie/emblem.json: an original star-compass emblem.
# Swap the output for any LottieFiles JSON with the same name to change the animation.
import json, math
W = H = 512; OP = 240
GOLD = [0.827, 0.737, 0.557, 1]; BRIGHT = [0.949, 0.839, 0.608, 1]; CREAM = [0.925, 0.898, 0.847, 1]

def kf(vals, ease=True):
    out = []
    for i, (t, s) in enumerate(vals):
        k = {"t": t, "s": s if isinstance(s, list) else [s]}
        if i < len(vals) - 1:
            k["i"] = {"x": [0.45], "y": [1]}; k["o"] = {"x": [0.55], "y": [0]}
        out.append(k)
    return {"a": 1, "k": out}
st = lambda v: {"a": 0, "k": v}
def tr(): return {"ty": "tr", "p": st([0, 0]), "a": st([0, 0]), "s": st([100, 100]), "r": st(0), "o": st(100)}
def layer(ind, nm, shapes, r=st(0), s=st([100, 100, 100]), o=st(100), p=None):
    return {"ddd": 0, "ind": ind, "ty": 4, "nm": nm, "sr": 1, "ao": 0, "ip": 0, "op": OP, "st": 0, "bm": 0,
            "ks": {"o": o, "r": r, "p": st(p or [W / 2, H / 2, 0]), "a": st([0, 0, 0]), "s": s}, "shapes": shapes}
def ring(size, w, color, dash=None):
    it = [{"ty": "el", "p": st([0, 0]), "s": st([size, size])},
          {"ty": "st", "c": st(color), "o": st(100), "w": st(w), "lc": 2, "lj": 2, **({"d": [{"n": "d", "nm": "dash", "v": st(dash[0])}, {"n": "g", "nm": "gap", "v": st(dash[1])}]} if dash else {})}, tr()]
    return [{"ty": "gr", "it": it}]
def star(points, r_out, r_in, color, stroke=False):
    v = []
    for i in range(points * 2):
        a = math.pi * i / points - math.pi / 2
        r = r_out if i % 2 == 0 else r_in
        v.append([round(math.cos(a) * r, 2), round(math.sin(a) * r, 2)])
    z = [[0, 0]] * len(v)
    paint = {"ty": "st", "c": st(color), "o": st(100), "w": st(2), "lc": 2, "lj": 2} if stroke else {"ty": "fl", "c": st(color), "o": st(100)}
    return [{"ty": "gr", "it": [{"ty": "sh", "ks": st({"i": z, "o": z, "v": v, "c": True})}, paint, tr()]}]
def dot(x, y, size, color):
    return {"ty": "gr", "it": [{"ty": "el", "p": st([x, y]), "s": st([size, size])}, {"ty": "fl", "c": st(color), "o": st(100)}, tr()]}

layers = [
    layer(1, "core star", star(4, 92, 20, BRIGHT), r=kf([(0, 0), (OP, 90)]), s=kf([(0, [100, 100, 100]), (60, [108, 108, 100]), (120, [100, 100, 100]), (180, [108, 108, 100]), (OP, [100, 100, 100])])),
    layer(2, "outline star", star(4, 130, 34, GOLD, stroke=True), r=kf([(0, 45), (OP, -45)]), o=st(70)),
    layer(3, "small star", star(8, 44, 18, CREAM), r=kf([(0, 0), (OP, -180)]), o=st(85)),
    layer(4, "inner ring", ring(200, 2, GOLD, (6, 10)), r=kf([(0, 0), (OP, 120)])),
    layer(5, "outer ring", ring(330, 1.5, GOLD), s=kf([(0, [96, 96, 100]), (OP / 2, [104, 104, 100]), (OP, [96, 96, 100])]), o=kf([(0, 35), (OP / 2, 80), (OP, 35)])),
    layer(6, "wide ring", ring(440, 1, CREAM, (2, 14)), r=kf([(0, 0), (OP, -60)]), o=st(45)),
    layer(7, "orbit", [dot(165, 0, 12, BRIGHT), dot(-165, 0, 8, CREAM), dot(0, 220, 7, GOLD), dot(0, -220, 10, BRIGHT)], r=kf([(0, 0), (OP, 360)])),
    layer(8, "pulse", ring(240, 3, BRIGHT), s=kf([(0, [60, 60, 100]), (OP / 2, [190, 190, 100]), (OP / 2 + 1, [60, 60, 100]), (OP, [190, 190, 100])]), o=kf([(0, 70), (OP / 2, 0), (OP / 2 + 1, 70), (OP, 0)])),
]
json.dump({"v": "5.12.2", "fr": 60, "ip": 0, "op": OP, "w": W, "h": H, "nm": "AniMahou emblem", "ddd": 0, "assets": [], "layers": layers},
          open("public/lottie/emblem.json", "w"))
print("ok")
