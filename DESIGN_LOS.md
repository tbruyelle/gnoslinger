# Line of sight (rule 31) — implementation plan

Status: plan, 2026-10-15. Step 1 (the generator's between table) is done;
the rest is not implemented yet.

Board A has no buildings: the corral fence never blocks sight (35.1) and
characters do not block it either, so line of sight (LOS) on board A comes
down to the **horse trough** and the DOWN/upright height rules. Walls,
doors, windows and slopes need a board with buildings; this plan builds the
generic mechanism and fills it with the trough only: the board generator
computes, for every pair of hexes, which terrain feature lies between them
(a **table**, from the geometry of the board image), and the realm applies
the height rule to that table at run time. No geometry runs on chain.

## Rules decisions (board A)

**Heights** (the HEIGHTS table of the rules, all at ground elevation):

| Thing | Height |
|---|---|
| DOWN character | 3 |
| the trough (obstacles and windows) | 4 |
| upright character, character on the trough, a hex aimed at | 5 |

**When the trough blocks** a line between two characters (31.3, 36.3, 36.5):

The trough is not a wall: the line crossing it is only the first condition,
the heights of the two characters decide.

- First condition: neither stands on the trough and every line between
  their printed coordinates crosses the trough's rectangle (see "The line"
  below). Among the trough's neighbours only H10–I11 and I10–I11 are
  across it; H11–I11, J10–I11, H10–J10 and I10–J10 pass beside it. A
  character on the trough is never blocked by it (36.5) and counts as
  upright (30.32).
- **Both upright**: clear, the trough is lower than both (31.31).
- **One DOWN, one upright**: blocked only if the DOWN one is adjacent to
  the trough (31.32, "either counter"), shooter and target alike. An
  upright shooter at A10 is blocked by a target lying in I11 or J10, but
  not by one lying in J11, which is not adjacent to I11\* (31.33 does not
  apply without hill or gully hexes, so the plateau effect is a comment in
  the code, not code). Symmetrically a character lying in H11 has no sight
  across the trough at all.
- **Both DOWN**: blocked at any distance, the trough is higher than both
  (31.31; the rule's diagram: "If both players are DOWN, the LOS is
  blocked").
- "Adjacent to the trough" is the neighbour table of `A-I11*`: I10, J10,
  I11, H11 and H10.
- A hex target counts as upright (31.3). A shot at a hex where the opponent
  stands uses the opponent's height.

**The line.** Rule 31.2 locates a character on his hex's *coordinate*, the
label printed in the hex, and the string must touch both coordinates. On
board A the coordinate is the hex centre (the grid's point), except for the
five hexes around the trough, H10, I10, J10, H11 and I11, whose coordinates
are printed larger, rotated, along the trough's sides (30.5: "hexes are
distorted to match the terrain"). A printed label has a size, and the
string may touch any part of it ("he can position the line to avoid
terrain that is partly in the way, as long as it touches both his
coordinate and his target's coordinate"), which is what lets a string pass
beside the trough between two of its neighbours.

So each hex gets a **coordinate box**, the printed label's rectangle in
board pixels: the standard label size (about 40×15 px) around the grid
centre by default, the traced box for the five hexes around the trough. The
trough is **between** two hexes if every straight line from a point of one
box to a point of the other crosses its polygon. For a convex obstacle it
is enough to test the lines between the centre and the four corners of
each box (25 lines): if any of them misses, the trough is not between. A
line that only touches a corner of the polygon or runs along an edge does
not cross it.

**This geometry runs in the generator only** (`scripts/gen_board_data.py`,
integer cross products on the pixel coordinates). Its result is the
**between table**: for each obstacle, the sorted list of hex pairs it lies
between, 322 pairs for the trough. The realm and the client read that
table; neither computes a line. A sight check is then a binary search in
the table followed by the height rule above, and the two sides cannot
disagree since they read the same generated list.

Measured on the image (x0, y0, x1, y1), to be refined when tracing:
H10 (1176, 1880, 1244, 1932), I10 (1236, 1849, 1324, 1892),
J10 (1330, 1840, 1394, 1892), H11 (1128, 1967, 1194, 2018),
I11 (1251, 1949, 1311, 1995). Tokens stay drawn at the grid centres; the
boxes are only sight anchors.

**When it is checked** (31.1):

- An aim whose target is not visible when it executes is cancelled, like an
  aim out of the zone today.
- A shot whose target is not visible when it executes is cancelled: no
  card, no shell, the gun stays cocked. Rule 31.1 says cancelled, unlike an
  out-of-zone shot which rule 11.32 makes a drawn miss. **To confirm.**
- At the end of every segment, a character holding AIM points without a
  clear line to the markers' target loses the aim (`lose_aim`, reason
  `no_los`), next to the existing out-of-zone check (12.41), after the
  segment's hits have applied, so a target that drops behind the trough is
  caught the same segment.

**Assumptions to verify**

- The blocking region is the rectangle already traced for the `A-I11*`
  highlight (`HALF_HEXES` in the generator), which sticks out a little into
  H11 and J10. With that polygon and the coordinate boxes above, 322 of the
  9,453 hex pairs are across it (398 with plain centre-to-centre lines,
  which is what the first draft of this plan used). Both the polygon and
  the five boxes can be re-traced before step 1.
- Where a line only grazes the trough the answer depends on a few pixels
  of tracing, for example H11–J10 along the trough's length, which the
  boxes leave clear. Those are long-shot or side-by-side cases; the clear
  ones, H10–I11 and I10–I11 across it, do not depend on the tracing.
- The case in the TODO's video (https://youtu.be/WGQbh6coUQI?t=2704) has not
  been checked against these decisions.

## Steps

1. **Generator: the between table.** In `scripts/gen_board_data.py`:
   - the coordinate box of every hex: the standard label size (`COORD_W`,
     `COORD_H`) around the grid centre, overridden by `COORD_BOXES` for the
     five hexes traced around the trough;
   - the polygon of every obstacle hex: the traced rectangle for the
     trough (the `shape` of `HALF_HEXES`), a regular hexagon rounded to
     integers for a whole-hex obstacle;
   - the integer geometry: cross product, proper segment intersection,
     point strictly inside a convex polygon, segment crossing a polygon;
   - `compute_between(...)`: for each obstacle and each pair of other
     hexes, whether all 25 box-to-box lines cross the polygon;
   - self-checks that fail the run when the tracing drifts: H10–I11 and
     I10–I11 across the trough, H11–I11, J10–I11, H10–J10 and I10–J10
     beside it, touching a vertex and running along an edge not crossing,
     no pair involving `A-I11*`; the counts printed with the others;
   - an optional `--draw-los A-H11 A-I11` that writes the lines and the
     polygon over `board_A.png` to the scratch directory, for tracing.
   - Output in `board_a.gno`: `between [][3]int`, rows `{a, b, obstacle}`
     with `a < b` hex indices and the obstacle's index into `obstacles`,
     sorted so the realm can binary-search a pair (about 322 lines). The
     JSON gains `between: [[id, id, obstacleId], ...]`. `hexes[].x/y` and
     `shapes` stay as they are; the boxes and polygons are not emitted.
   - Run `make gen-board`; existing tests stay green.

2. **Hex package: the sight rule** (`gno.land/p/tbruyelle/gnoslinger/hex/v0`),
   in a new `sight.gno`; `geom.gno` is untouched: `InAimZone` (8.32, hex
   rows from the axial coordinates) is not affected by the trough or the
   printed coordinates, and rule 31.21 (a target out of the aim zone has
   no LOS) is already the `out_of_zone` check at the same three moments.
   The zone check comes first, the terrain check next, each with its own
   reason, so the log can tell "in the blind zone" from "behind the
   trough".
   - A `Height` type with `HeightDown = 3`, `HeightObstacle = 4` (windows
     too), `HeightUpright = 5`, `HeightWall = 10` (for later).
   - `Board.Adjacent(a, b string) bool`.
   - `Board.Between(a, b string) []string`: the obstacle hexes lying
     between two hexes, from the `between` table (binary search on the
     ordered pair, so `Between(a, b) == Between(b, a)`); nil when clear or
     unknown.
   - `Board.LineOfSight(from, to string, hFrom, hTo Height) (clear bool, blocker string)`:
     for each obstacle between the two hexes, the height rule: blocked when
     the obstacle is higher than both heights, clear when lower than both,
     otherwise blocked only when the lower end is adjacent to it (31.31,
     31.32; 31.33 as a comment). The first blocker is returned.
   - Tests in `board_test.gno`:
     - the table: sorted, `a < b`, every index valid, no row with
       `A-I11*`, `Between` symmetric;
     - pairs across the trough: H10–I11, I10–I11, I10–J11, I9–I12, H9–J12;
     - pairs beside it: H11–I11, J10–I11, H10–J10, I10–J10, H10–H11,
       H11–J10 (along its length), I11–I12, I11–J11, F3–F9;
     - the height matrix on I10–I11 (upright/upright clear, DOWN/DOWN
       blocked, DOWN at I10 or at I11 with the other upright blocked since
       both are adjacent), the non-adjacent cases on I9–I12 (one DOWN,
       clear), anything to or from I11\* clear whatever the heights, an
       unknown hex false.

3. **Engine** (`engine/v0`).
   - `ReasonNoLOS = "no_los"`, carried by `cancel` and `lose_aim` events,
     with the blocking hex in `To`. No encoding change (`Reason` and `To`
     are existing fields).
   - A helper giving a character's sight height (upright, or DOWN unless on
     an obstacle) and one answering "can `c` see this target" for a hex
     (upright) or a character.
   - Three hooks in `resolve.gno`: the `OptAim` branch after the zone check
     (`cancel(ReasonNoLOS)`), `shoot` after the `no_target` check and
     before the card is drawn (`cancel(ReasonNoLOS)`: no card, no shell,
     stays cocked), and the segment-end loop next to the 12.41 check
     (`loseAim(..., ReasonNoLOS, ...)`).
   - Tests in `resolve_test.gno`:
     - both DOWN across the trough: the aim is cancelled; the shot is
       cancelled with no card drawn and the shells untouched;
     - marshal upright at I10 facing S with AIM on the Kid at I12: the Kid
       advances to I11 then drops (`1f:ahead,4b`), the aim is lost at the
       end of segment 3; the Kid merely dropping at I12 keeps it clear;
     - marshal DOWN at I10 with AIM on the Kid upright at I12 loses it at
       the end of segment 1;
     - a shot at a hex where the opponent lies DOWN behind the trough is
       cancelled; at an empty hex it is still held (`nothing`, `empty_hex`).

4. **Realm** (`r/tbruyelle/gnoslinger/v0`): a filetest
   (`z14_line_of_sight_filetest.gno`) with a `no_los` cancel in its output,
   the gnoweb log wording in `render.gno` ("no line of sight" rather than
   "no los"), and a line on the help page. `make test`, `make lint`.

5. **Client** (`client/src`).
   - `board/boardA.ts`: `between(a, b)` from the JSON's `between` list (a
     map keyed by the ordered pair, as `fenceSet` is) and
     `lineOfSight(from, to, hFrom, hTo)` applying the same height rule as
     the realm, the height constants in `rules/`, the same fixtures in
     `boardA.test.ts`. No geometry in TypeScript; tokens, highlights and the
     aim line keep using `hexes[].x/y`.
   - `scenes/GameScene.ts`: in `enterAimMode`, hexes of the aim zone without
     line of sight from my previewed state are drawn hatched like disabled
     card sides and are not clickable, with "no line of sight (trough)" in
     the hover detail; the height of a hex holding the opponent is the
     opponent's. `showAimZone` (token hover) may dim them the same way
     (optional).
   - `game/shotOdds.ts`: a `los` flag so the odds read 0% there.
   - `game/playback.ts`: `describeEvent` wording for `cancel` and
     `lose_aim` with reason `no_los`.
   - The preview (`replay.ts`) is unchanged: like the aim zone today, the
     client prevents the pick and the realm decides at resolution.
   - `make check`.

6. **Docs.** Replace "no obstacles or line of sight yet" in the Resolution
   section of `AGENTS.md` with the rules above; tick the board A items of
   the TODO's line-of-sight list; keep walls, doors and windows there with a
   note that they need hexside segments traced on the first building board.
   The same generator pass handles them, with a segment instead of a
   polygon: a wall blocks at height 10, a doorway blocks like a wall
   (33.4), a window blocks at height 4 like the trough (33.5).

## Cost

On chain, a sight check is a binary search in the 322-row table plus a
few comparisons, once per aim, per shot and per aiming character per
segment: far below the breadth-first search `Board.Distance` already runs
for every shot's range. The table adds about 322 short lines to the
`hex` package source, deployed once. No new game storage except the
occasional `cancel` or `lose_aim` event carrying the `no_los` reason, a
few dozen bytes in the turn's events.

## Later (first board with buildings)

- Hexside features in the generator: `walls`, `doors`, `windows` as per-hex
  bitmasks like `fence` (for movement), plus the segment of each hexside in
  pixels (traced, since hexes are distorted around buildings, 30.5). The
  generator tests the box-to-box lines against those segments the same way
  and adds the rows to the between table, with the feature's kind so the
  realm knows its height; a line through a corner hex's corner is clear
  (33.3).
- If a board with many walls makes the table long, a bitmap per feature
  (138 × 138 bits, about 2.4 KB) replaces the pair list; `Between` keeps
  its signature.
- Head counters (32), slopes and banks (34), elevations and the plateau
  effect (31.33) come with the boards that have them.
