# gnotif registry (third party)

`registry/` and `trigger/` are the gnotif registry realm,
`gno.land/r/nym-gfanton001/gnotif/v1`, and its trigger package,
`gno.land/p/nym-gfanton001/gnotif/trigger/v0`, as deployed on Onyx: the
registry the public gnotif server (https://gnotif.xyz) follows. They come
from https://github.com/gfanton/gnotif (Apache-2.0, see LICENSE) and are
fetched from the chain with `make fetch-gnotif` (`vm/qfile`; the
`[addpkg]` block the chain adds to each gnomod.toml is left out).

They are here, under their Onyx paths, so that the game realm imports the
registry by one path everywhere (`gno/r/v0/notify.gno`): gnodev loads
these copies at genesis, the tests resolve them, and on Onyx the import
reaches the registry itself. Not ours: do not edit, refetch.
