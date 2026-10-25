#!/usr/bin/env python3
"""Extracts the tutorial's showdown from the realm filetest that plays it.

gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0/filetests/z16_tutorial_filetest.gno
plays the tutorial's turns through the realm and prints, in its golden
output, the game view at the start of each turn (the kid committed, the
marshal to play), the final view and the history. This writes them to
client/src/tutorial/showdown.json as {"views": [...], "history": {...}}.
Run it through `make gen-tutorial`, which refreshes the golden output
first.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILETEST = ROOT / "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0/filetests/z16_tutorial_filetest.gno"
OUT = ROOT / "client/src/tutorial/showdown.json"

src = FILETEST.read_text()
out = src[src.index("// Output:"):].splitlines()[1:]
objs = [json.loads(line[3:]) for line in out if line.startswith("// {")]
*views, history = objs
OUT.write_text(json.dumps({"views": views, "history": history}, indent=1) + "\n")
print(f"{OUT.relative_to(ROOT)}: {len(views)} views, {len(history['turns'])} turns")
