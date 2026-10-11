#!/usr/bin/env python3
"""Generate the board A ("Corral") hex adjacency table for both the Gno realm
and the web client from assets/hex_grid.json.

Outputs (never edit by hand):
  gno.land/p/tbruyelle/gunslinger/hex/v0/board_a.gno
      sorted hex ids + 6-neighbour table as indices into that list (-1 = off-board)
      + axial coordinates (q, r) of every hex, for ranges and aim zones
      + the fenced hexsides of every hex, as a bit per direction
      + the obstacle hexes
  client/src/board/board_A.json
      {key, w, h, hexes: {id: {x, y, q, r}}, neighbors: {id: [6 x (id|null)]},
       fences: [[id, id], ...], obstacles: [id, ...],
       shapes: {id: [[x, y], ...]}}  (outlines of the hexes that are not regular)

Both files come from the same computation so the client's movement preview
and the realm's resolution can never disagree on adjacency.

Flat-top hexes tessellate in vertical columns:
  dir 0 = N  (up, -y)      1 = NE (up-right)    2 = SE (down-right)
  dir 3 = S  (down, +y)    4 = SW (down-left)   5 = NW (up-left)

Classification rule (same as bga/scripts/gen_board_data.py): for each hex, the
nearest other hex within MAX_DIST px whose bearing is within 30 degrees of a
direction's target angle is that direction's neighbour.
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GRID = os.path.join(ROOT, "assets", "hex_grid.json")
OUT_GNO = os.path.join(ROOT, "gno.land", "p", "tbruyelle", "gunslinger", "hex", "v0", "board_a.gno")
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


def write_gno(ids, index, neighbors, coords, fences, obstacles):
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
        "// obstacles lists the indices of the obstacle hexes (rule 36).",
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
    lines.append("}")
    lines.append("")
    os.makedirs(os.path.dirname(OUT_GNO), exist_ok=True)
    with open(OUT_GNO, "w") as f:
        f.write("\n".join(lines))
    return OUT_GNO


def write_json(ids, hexes, neighbors, coords):
    data = {
        "key": BOARD_KEY,
        "w": IMAGE_W,
        "h": IMAGE_H,
        "hexes": {hid: {"x": hexes[hid][0], "y": hexes[hid][1], "q": coords[hid][0], "r": coords[hid][1]} for hid in ids},
        "neighbors": {hid: neighbors[hid] for hid in ids},
        "fences": [list(f) for f in FENCES],
        "obstacles": OBSTACLES,
        "shapes": {hid: [list(p) for p in h["shape"]] for hid, h in HALF_HEXES.items()},
    }
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w") as f:
        json.dump(data, f, separators=(",", ":"))
        f.write("\n")
    return OUT_JSON


def main():
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

    counts = {}
    for ns in neighbors.values():
        c = sum(1 for n in ns if n)
        counts[c] = counts.get(c, 0) + 1
    print("hexes:", len(ids))
    print("neighbour-count histogram (n_neighbours: n_hexes):", dict(sorted(counts.items())))
    print("sample A-F6 ->", neighbors["A-F6"])
    print("fenced hexsides:", len(FENCES))
    print("obstacle hexes:", obstacles)

    for path in (write_gno(ids, index, neighbors, coords, fences, obstacles), write_json(ids, hexes, neighbors, coords)):
        print("wrote", os.path.relpath(path, ROOT), f"({os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    main()
