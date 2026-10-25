#!/usr/bin/env python3
"""Generate the board A ("Corral") hex adjacency table for both the Gno realm
and the web client from assets/hex_grid.json.

Outputs (never edit by hand):
  gno.land/p/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/hex/v0/board_a.gno
      sorted hex ids + 6-neighbour table as indices into that list (-1 = off-board)
      + axial coordinates (q, r) of every hex, for ranges and aim zones
      + the fenced hexsides of every hex, as a bit per direction
      + the obstacle hexes
      + the between table: the hex pairs each obstacle lies between (line of sight, rule 31)
  client/src/board/board_A.json
      {key, w, h, hexes: {id: {x, y, q, r}}, neighbors: {id: [6 x (id|null)]},
       fences: [[id, id], ...], obstacles: [id, ...],
       shapes: {id: [[x, y], ...]}  (outlines of the hexes that are not regular),
       between: [[id, id, obstacleId], ...]}

Both files come from the same computation so the client's movement preview
and the realm's resolution can never disagree on adjacency, and neither
computes a line of sight: the geometry of rule 31 runs here only, into the
between table (see compute_between).

    gen_board_data.py --draw-los A-H11 A-I11 [--out los.png]

draws the lines of sight between two hexes over the board image, to check
the tracing of the coordinate boxes and the obstacle polygons.

Flat-top hexes tessellate in vertical columns:
  dir 0 = N  (up, -y)      1 = NE (up-right)    2 = SE (down-right)
  dir 3 = S  (down, +y)    4 = SW (down-left)   5 = NW (up-left)

Classification rule (same as bga/scripts/gen_board_data.py): for each hex, the
nearest other hex within MAX_DIST px whose bearing is within 30 degrees of a
direction's target angle is that direction's neighbour.
"""
import argparse
import json
import math
import os
import sys
from fractions import Fraction

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GRID = os.path.join(ROOT, "assets", "hex_grid.json")
OUT_GNO = os.path.join(ROOT, "gno.land", "p", "g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2", "gnoslinger", "hex", "v0", "board_a.gno")
OUT_JSON = os.path.join(ROOT, "client", "src", "board", "board_A.json")

BOARD_KEY = "board_A"
BOARD_NAME = "A"
IMAGE_W, IMAGE_H = 1600, 2232
EXPECTED_HEXES = 137

# Target angle (degrees, screen coords y-down: 0=E, 90=S) for each direction.
DIR_ANGLE = {0: 270, 1: 330, 2: 30, 3: 90, 4: 150, 5: 210}
# Axial (q, r) step of each direction on a flat-top grid: q runs along the
# columns (east), r down the column; NE/SW and SE/NW are the diagonals.
DIR_AXIAL = {0: (0, -1), 1: (1, -1), 2: (1, 0), 3: (0, 1), 4: (-1, 1), 5: (-1, 0)}
# The corral fence (rule 35): the hexsides drawn as rails on board_A.png,
# as the pairs of hexes they separate. Read off the image (reddish rails
# along the shared edge of two neighbours), the gaps at F2 and F10 being the
# Upper and Lower Gates.
FENCES = [
    # west side, columns A/B
    ("A-A4", "A-B4"), ("A-A5", "A-B4"), ("A-A5", "A-B5"), ("A-A6", "A-B5"), ("A-A6", "A-B6"),
    ("A-A7", "A-B6"), ("A-A7", "A-B7"), ("A-A8", "A-B7"), ("A-A8", "A-B8"), ("A-A9", "A-B8"),
    # north-west, A4 up to the Upper Gate
    ("A-B3", "A-B4"), ("A-B3", "A-C4"), ("A-C3", "A-C4"), ("A-C3", "A-D3"), ("A-D2", "A-D3"),
    ("A-D2", "A-E3"), ("A-E2", "A-E3"),
    # north-east, the Upper Gate to K4
    ("A-G2", "A-G3"), ("A-G3", "A-H2"), ("A-H2", "A-H3"), ("A-H3", "A-I3"), ("A-I3", "A-I4"),
    ("A-I4", "A-J3"), ("A-J3", "A-J4"),
    # east side, columns J/K
    ("A-J4", "A-K4"), ("A-J4", "A-K5"), ("A-J5", "A-K5"), ("A-J5", "A-K6"), ("A-J6", "A-K6"),
    ("A-J6", "A-K7"), ("A-J7", "A-K7"), ("A-J7", "A-K8"), ("A-J8", "A-K8"), ("A-J8", "A-K9"),
    # south-west, A9 down to the Lower Gate
    ("A-B8", "A-B9"), ("A-B9", "A-C9"), ("A-C9", "A-C10"), ("A-C10", "A-D9"), ("A-D9", "A-D10"),
    ("A-D10", "A-E10"), ("A-E10", "A-E11"),
    # south-east, the Lower Gate to K9
    ("A-G10", "A-G11"), ("A-G10", "A-H10"), ("A-H9", "A-H10"), ("A-H9", "A-I10"), ("A-I9", "A-I10"),
    ("A-I9", "A-J9"), ("A-J8", "A-J9"),
]

# Half-hexes (rule 36.2): the horse trough fills the top half of I11, an
# obstacle half-hex named I11*, the bottom half being the empty I11. The
# VASSAL grid has one point for the whole hex, so the split is added here:
# the centre and outline of each half (board pixels, traced on board_A.png),
# the neighbours of each half in
# the six directions, and the links of the hexes around that now lead to
# another half than the grid's. The trough's sides carry the labels of
# its neighbours (H10, I10, J10, H11, I11); a half takes the axial
# coordinates of the whole hex for aim zones.
HALF_HEXES = {
    "A-I11*": {
        "of": "A-I11", "pos": (1268, 1937),
        "shape": [(1173, 1954), (1333, 1862), (1357, 1920), (1207, 2010)],
        "nbr": ["A-I10", "A-J10", "A-I11", "A-I11", "A-H11", "A-H10"],
    },
    "A-I11": {
        "of": "A-I11", "pos": (1283, 2000),
        "shape": [(1207, 2010), (1357, 1920), (1387, 1954), (1333, 2047), (1227, 2047)],
        "nbr": ["A-I11*", "A-J10", "A-J11", "A-I12", "A-H11", "A-I11*"],
    },
}
HALF_HEX_LINKS = [  # (hex, direction, half it now leads to)
    ("A-I10", 3, "A-I11*"),
    ("A-J10", 4, "A-I11*"),
    ("A-H10", 2, "A-I11*"),
    ("A-H11", 1, "A-I11*"),
]

# Obstacle hexes (rule 36): the horse trough.
OBSTACLES = ["A-I11*"]

# The printed coordinate of a hex: rule 31.2 locates a character on it and
# traces a line of sight as a string touching both coordinates, so for the
# line of sight a hex's coordinate is a box, its label's rectangle in board
# pixels. Every label is the standard size around the grid point, except
# around the trough where they are printed larger along its sides (30.5):
# those are traced on board_A.png as (x0, y0, x1, y1).
COORD_HW, COORD_HH = 20, 8  # half the standard label size (40x16 px)
COORD_BOXES = {
    "A-H10": (1176, 1880, 1244, 1932),
    "A-I10": (1236, 1849, 1324, 1892),
    "A-J10": (1330, 1840, 1394, 1892),
    "A-H11": (1128, 1967, 1194, 2018),
    "A-I11": (1251, 1949, 1311, 1995),
}

MAX_DIST = 235.0  # a bit above the ~180-200px centre spacing
MAX_ANGLE_DIFF = 30.0


def ang_diff(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


def compute_neighbors(hexes):
    neighbors = {}
    for hid, (x, y) in hexes.items():
        best = {d: (None, math.inf) for d in range(6)}
        for oid, (ox, oy) in hexes.items():
            if oid == hid:
                continue
            dx, dy = ox - x, oy - y
            dist = math.hypot(dx, dy)
            if dist > MAX_DIST:
                continue
            ang = math.degrees(math.atan2(dy, dx)) % 360
            for d, target in DIR_ANGLE.items():
                if ang_diff(ang, target) <= MAX_ANGLE_DIFF and dist < best[d][1]:
                    best[d] = (oid, dist)
        neighbors[hid] = [best[d][0] for d in range(6)]
    return neighbors


def compute_axial(ids, neighbors):
    """Assigns axial coordinates by walking the adjacency from the first hex,
    and checks every edge agrees with the direction steps (a regular grid)."""
    origin = ids[0]
    coords = {origin: (0, 0)}
    queue = [origin]
    errors = []
    while queue:
        hid = queue.pop(0)
        q, r = coords[hid]
        for d, other in enumerate(neighbors[hid]):
            if other is None:
                continue
            dq, dr = DIR_AXIAL[d]
            want = (q + dq, r + dr)
            if other in coords:
                if coords[other] != want:
                    errors.append(f"irregular grid: {hid} -[{d}]-> {other} is at {coords[other]}, expected {want}")
            else:
                coords[other] = want
                queue.append(other)
    missing = [h for h in ids if h not in coords]
    if missing:
        errors.append(f"unreachable hexes: {missing}")
    return coords, errors


def check(hexes, neighbors):
    errors = []
    if len(hexes) != EXPECTED_HEXES:
        errors.append(f"expected {EXPECTED_HEXES} hexes, got {len(hexes)}")
    for hid, ns in neighbors.items():
        if not any(ns):
            errors.append(f"{hid} has no neighbours")
        for d, other in enumerate(ns):
            if other is None:
                continue
            back = neighbors[other][(d + 3) % 6]
            if back != hid:
                errors.append(f"asymmetric: {hid} -[{d}]-> {other} but {other} -[{(d + 3) % 6}]-> {back}")
    return errors


def compute_fences(neighbors):
    """Returns, for each hex, the bitmask of its fenced hexsides (bit d for
    direction d), and checks every fence separates two neighbours."""
    masks = {hid: 0 for hid in neighbors}
    errors = []
    seen = set()
    for a, b in FENCES:
        key = tuple(sorted((a, b)))
        if key in seen:
            errors.append(f"fence {a}|{b} listed twice")
        seen.add(key)
        if a not in neighbors or b not in neighbors[a]:
            errors.append(f"fence {a}|{b}: not neighbours")
            continue
        d = neighbors[a].index(b)
        masks[a] |= 1 << d
        masks[b] |= 1 << ((d + 3) % 6)
    return masks, errors


def split_half_hexes(hexes, neighbors, coords):
    """Applies HALF_HEXES and HALF_HEX_LINKS once the regular grid is
    computed and checked."""
    for hid, h in HALF_HEXES.items():
        hexes[hid] = h["pos"]
        neighbors[hid] = list(h["nbr"])
        coords[hid] = coords[h["of"]]
    for hid, d, half in HALF_HEX_LINKS:
        neighbors[hid][d] = half
    errors = []
    for hid, ns in neighbors.items():
        for d, other in enumerate(ns):
            if other is not None and other not in neighbors:
                errors.append(f"{hid} -[{d}]-> unknown {other}")
    return errors


def cross(o, a, b):
    """The cross product (a - o) x (b - o): its sign tells which side of the
    line through o and a the point b lies on."""
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def sign(v):
    return (v > 0) - (v < 0)


def passes_through(a, b, poly):
    """Whether the segment a-b has a point strictly inside the convex polygon
    poly (36.3: a line of sight passing through any part of an obstacle's
    hex passes through the obstacle). Touching a corner or running along an
    edge does not count: the string can be laid there (31.2). Exact: the
    segment is clipped by every edge's half-plane in rational arithmetic."""
    n = len(poly)
    orient = sign(sum(cross(poly[0], poly[i], poly[i + 1]) for i in range(1, n - 1)))
    lo, hi = Fraction(0), Fraction(1)
    for i in range(n):
        p, q = poly[i], poly[(i + 1) % n]
        fa = cross(p, q, a) * orient  # > 0 strictly inside this edge's half-plane
        fb = cross(p, q, b) * orient
        if fa == fb:
            if fa <= 0:
                return False
            continue
        root = Fraction(-fa, fb - fa)  # where fa + (fb - fa) t = 0
        if fb > fa:
            lo = max(lo, root)
        else:
            hi = min(hi, root)
    return lo < hi


def coord_box(hid, pos):
    """The coordinate box of a hex (x0, y0, x1, y1), see COORD_BOXES."""
    if hid in COORD_BOXES:
        return COORD_BOXES[hid]
    x, y = pos
    return (x - COORD_HW, y - COORD_HH, x + COORD_HW, y + COORD_HH)


def box_points(box):
    """The points of a box a line of sight is traced from: its centre and its
    four corners. For a convex obstacle, if every line between two boxes'
    points passes through it, so does every line between the boxes."""
    x0, y0, x1, y1 = box
    return [((x0 + x1) // 2, (y0 + y1) // 2), (x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def hex_radius(hexes, neighbors):
    """Centre-to-corner radius of a regular hex: the hexes of a column sit
    sqrt(3) R apart (as the client's BoardMap.hexRadius)."""
    gaps = sorted(
        hexes[ns[3]][1] - hexes[hid][1]
        for hid, ns in neighbors.items()
        if ns[3] and hid not in HALF_HEXES and ns[3] not in HALF_HEXES
    )
    return gaps[len(gaps) // 2] / math.sqrt(3)


def obstacle_polygons(hexes, neighbors):
    """The region each obstacle fills (36.3), in board pixels: the traced
    shape of a half-hex, else the regular hexagon around the grid point."""
    r = hex_radius(hexes, neighbors)
    polys = {}
    for hid in sorted(OBSTACLES):
        if hid in HALF_HEXES:
            polys[hid] = [tuple(p) for p in HALF_HEXES[hid]["shape"]]
        else:
            x, y = hexes[hid]
            polys[hid] = [(round(x + r * math.cos(math.radians(d))), round(y + r * math.sin(math.radians(d)))) for d in range(0, 360, 60)]
    return polys


def compute_between(ids, hexes, polygons):
    """The between table (rule 31): for each obstacle, the pairs of other
    hexes it lies between, i.e. every line from a point of one hex's
    coordinate box to a point of the other's passes through its region
    (31.2, 36.3). A character on the obstacle is never blocked by it (36.5),
    so its own pairs are left out. Rows are (a, b, obstacle) with a < b."""
    boxes = {hid: box_points(coord_box(hid, hexes[hid])) for hid in ids}
    rows = []
    for o, poly in polygons.items():
        others = [hid for hid in ids if hid != o]
        for i, a in enumerate(others):
            for b in others[i + 1:]:
                if all(passes_through(p, q, poly) for p in boxes[a] for q in boxes[b]):
                    rows.append((a, b, o))
    rows.sort()
    return rows


def check_between(rows):
    """Known answers around the trough, so that a re-traced box or polygon
    that moves them is noticed, after the degenerate lines of the geometry."""
    errors = []
    square = [(0, 0), (10, 0), (10, 10), (0, 10)]
    for a, b, want in [
        ((5, -5), (5, 15), True),  # straight through
        ((0, 0), (10, 10), True),  # from corner to corner: through the inside
        ((5, 5), (20, 20), True),  # one end inside
        ((0, 0), (10, 0), False),  # along an edge
        ((-5, -5), (0, 0), False),  # touching a corner
        ((-5, 5), (0, 5), False),  # touching an edge
        ((-5, -5), (15, -5), False),  # outside
    ]:
        for poly in (square, square[::-1]):
            if passes_through(a, b, poly) != want:
                errors.append(f"passes_through({a}, {b}) = {not want}, want {want}")
    pairs = {(a, b) for a, b, _ in rows}
    for a, b in [("A-H10", "A-I11"), ("A-I10", "A-I11")]:
        if (a, b) not in pairs:
            errors.append(f"{a}|{b}: the trough should lie between them")
    for a, b in [("A-H11", "A-I11"), ("A-I11", "A-J10"), ("A-H10", "A-J10"), ("A-I10", "A-J10")]:
        if (a, b) in pairs:
            errors.append(f"{a}|{b}: the trough should not lie between them (the string passes beside it)")
    for a, b, o in rows:
        if o in (a, b):
            errors.append(f"{a}|{b}: {o} lies between itself and a hex")
        if not a < b:
            errors.append(f"{a}|{b}: not ordered")
    return errors


def draw_los(hexes, neighbors, a, b, out):
    """Draws the lines of sight between two hexes' coordinate boxes over the
    board image: red where a line passes through an obstacle, green where it
    does not, and prints what lies between the hexes."""
    from PIL import Image, ImageDraw

    polygons = obstacle_polygons(hexes, neighbors)
    boxes = {h: coord_box(h, hexes[h]) for h in (a, b)}
    im = Image.open(os.path.join(ROOT, "assets", f"{BOARD_KEY}.png")).convert("RGB")
    dr = ImageDraw.Draw(im)
    for poly in polygons.values():
        dr.polygon(poly, outline=(200, 0, 0), width=3)
    for box in boxes.values():
        dr.rectangle(box, outline=(0, 0, 200), width=2)
    for o, poly in polygons.items():
        if o in (a, b):
            continue
        through = 0
        for p in box_points(boxes[a]):
            for q in box_points(boxes[b]):
                t = passes_through(p, q, poly)
                through += t
                dr.line([p, q], fill=(200, 0, 0) if t else (0, 140, 0), width=1)
        print(f"{a} {b}: {through}/25 lines pass through {o}: {o} lies between them" if through == 25 else f"{a} {b}: {through}/25 lines pass through {o}: not between them")
    xs = [v for box in boxes.values() for v in box[0::2]] + [p[0] for poly in polygons.values() for p in poly]
    ys = [v for box in boxes.values() for v in box[1::2]] + [p[1] for poly in polygons.values() for p in poly]
    m = 120
    im.crop((max(0, min(xs) - m), max(0, min(ys) - m), min(IMAGE_W, max(xs) + m), min(IMAGE_H, max(ys) + m))).save(out)
    print("wrote", out)


def write_gno(ids, index, neighbors, coords, fences, obstacles, between):
    lines = [
        "// Code generated by scripts/gen_board_data.py from assets/hex_grid.json. DO NOT EDIT.",
        "",
        "package hex",
        "",
        f'// A is board {BOARD_NAME} ("Corral"): {len(ids)} flat-top hexes in offset vertical columns.',
        "// ids is sorted so Index can binary-search it; nbr holds, for each hex, the",
        "// index of its neighbour in each of the 6 directions (N, NE, SE, S, SW, NW),",
        "// or -1 when the hex is on the board edge; qr holds its axial coordinates;",
        "// fence holds its fenced hexsides, bit d for direction d (rule 35);",
        "// obstacles lists the indices of the obstacle hexes (rule 36);",
        "// between lists the hex pairs an obstacle lies between for the line of",
        "// sight (rule 31), as {a, b, o}: a < b indices in ids, o an index in",
        "// obstacles, sorted by (a, b, o).",
        "var A = &Board{",
        f'\tname: "{BOARD_NAME}",',
        "\tids: []string{",
    ]
    for hid in ids:
        lines.append(f'\t\t"{hid}",')
    lines.append("\t},")
    lines.append("\tnbr: [][6]int{")
    for hid in ids:
        cells = ", ".join("-1" if n is None else str(index[n]) for n in neighbors[hid])
        lines.append(f"\t\t{{{cells}}}, // {hid}")
    lines.append("\t},")
    lines.append("\tqr: [][2]int{")
    for hid in ids:
        q, r = coords[hid]
        lines.append(f"\t\t{{{q}, {r}}}, // {hid}")
    lines.append("\t},")
    lines.append("\tfence: []uint8{")
    for hid in ids:
        lines.append(f"\t\t{fences[hid]}, // {hid}")
    lines.append("\t},")
    lines.append("\tobstacles: []int{")
    for hid in obstacles:
        lines.append(f"\t\t{index[hid]}, // {hid}")
    lines.append("\t},")
    lines.append("\tbetween: [][3]int{")
    for a, b, o in between:
        lines.append(f"\t\t{{{index[a]}, {index[b]}, {obstacles.index(o)}}}, // {a} {b}")
    lines.append("\t},")
    lines.append("}")
    lines.append("")
    os.makedirs(os.path.dirname(OUT_GNO), exist_ok=True)
    with open(OUT_GNO, "w") as f:
        f.write("\n".join(lines))
    return OUT_GNO


def write_json(ids, hexes, neighbors, coords, between):
    data = {
        "key": BOARD_KEY,
        "w": IMAGE_W,
        "h": IMAGE_H,
        "hexes": {hid: {"x": hexes[hid][0], "y": hexes[hid][1], "q": coords[hid][0], "r": coords[hid][1]} for hid in ids},
        "neighbors": {hid: neighbors[hid] for hid in ids},
        "fences": [list(f) for f in FENCES],
        "obstacles": OBSTACLES,
        "shapes": {hid: [list(p) for p in h["shape"]] for hid, h in HALF_HEXES.items()},
        "between": [list(row) for row in between],
    }
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w") as f:
        json.dump(data, f, separators=(",", ":"))
        f.write("\n")
    return OUT_JSON


def parse_args():
    parser = argparse.ArgumentParser(description="Generates board A's data for the realm and the client.")
    parser.add_argument("--draw-los", nargs=2, metavar=("HEX", "HEX"), help="draw the lines of sight between two hexes over the board image instead of generating")
    parser.add_argument("--out", help="the image --draw-los writes (default /tmp/los_<hex>_<hex>.png)")
    return parser.parse_args()


def main():
    args = parse_args()
    grid = json.load(open(GRID))
    board = grid["boards"][BOARD_KEY]
    hexes = {h["id"]: (h["x"], h["y"]) for h in board["hexes"]}
    neighbors = compute_neighbors(hexes)

    errors = check(hexes, neighbors)
    if errors:
        for e in errors:
            print("error:", e, file=sys.stderr)
        sys.exit(1)

    coords, errors = compute_axial(sorted(hexes), neighbors)
    errors += split_half_hexes(hexes, neighbors, coords)
    if errors:
        for e in errors:
            print("error:", e, file=sys.stderr)
        sys.exit(1)
    ids = sorted(hexes)
    index = {hid: i for i, hid in enumerate(ids)}

    fences, errors = compute_fences(neighbors)
    if errors:
        for e in errors:
            print("error:", e, file=sys.stderr)
        sys.exit(1)

    obstacles = sorted(OBSTACLES)
    unknown = [h for h in obstacles if h not in hexes]
    if unknown:
        print("error: unknown obstacle hexes:", unknown, file=sys.stderr)
        sys.exit(1)

    if args.draw_los:
        a, b = args.draw_los
        unknown = [h for h in (a, b) if h not in hexes]
        if unknown:
            print("error: unknown hexes:", unknown, file=sys.stderr)
            sys.exit(1)
        draw_los(hexes, neighbors, a, b, args.out or f"/tmp/los_{a}_{b}.png")
        return

    between = compute_between(ids, hexes, obstacle_polygons(hexes, neighbors))
    errors = check_between(between)
    if errors:
        for e in errors:
            print("error:", e, file=sys.stderr)
        sys.exit(1)

    counts = {}
    for ns in neighbors.values():
        c = sum(1 for n in ns if n)
        counts[c] = counts.get(c, 0) + 1
    print("hexes:", len(ids))
    print("neighbour-count histogram (n_neighbours: n_hexes):", dict(sorted(counts.items())))
    print("sample A-F6 ->", neighbors["A-F6"])
    print("fenced hexsides:", len(FENCES))
    print("obstacle hexes:", obstacles)
    print("between table:", len(between), "rows (hex pairs an obstacle lies between)")

    for path in (write_gno(ids, index, neighbors, coords, fences, obstacles, between), write_json(ids, hexes, neighbors, coords, between)):
        print("wrote", os.path.relpath(path, ROOT), f"({os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    main()
