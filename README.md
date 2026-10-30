# Gnoslinger

A digital version of **Gunslinger**, the 1982 Avalon Hill tactical gunfight:
hex movement, five-segment turns, action cards, the full hit and wound
tables. It runs on the **gno.land chain**: a Gno realm holds every showdown
and settles every turn, the web client is the interface and signs its
moves with the Adena wallet. There is no game server.

[![The trailer](https://img.youtube.com/vi/YQ4HInJah5s/maxresdefault.jpg)](https://youtu.be/YQ4HInJah5s)

**Play at [gnoslinger.xyz](https://gnoslinger.xyz)** (on Onyx, with Adena),
or start with **How to play**, a guided duel that needs no wallet.

## Running it locally

```
make gnodev   # a local chain with the realm, hot-reloaded from gno/
make web      # the client on http://localhost:5173
make test     # the realm's tests
make check    # the client's type check and tests
```

`AGENTS.md` describes everything: the rules as implemented, the realm, the
client, the commands. `video/` holds how the trailer is made.

Based on GUNSLINGER © 1982 The Avalon Hill Game Company, cover art
included. Gnoslinger is a fan project, not affiliated with Avalon Hill or
Hasbro.
