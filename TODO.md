# TODO

## Size
- Encode boards so they took less space

## UI
- change window size to see how things fit
- add link to gnoslinger.xyz to the render node
- add links to jmgj youtube videos for the rules in details

## General
- move the repository to a gnoslinger organization (github.com/gnoslinger/gnoslinger)
  - create the org, transfer the repository (Settings → Danger Zone), `git remote set-url origin git@github.com:gnoslinger/gnoslinger.git`
  - Pages: enter the custom domain again if it is gone, point the DNS CNAME of gnoslinger.xyz at gnoslinger.github.io, verify the domain in the org's settings
  - update the links: client/src/game/bugReport.ts (issues), client/src/links.ts (the trailer's release asset), video/src/Video.tsx (the outro card), AGENTS.md
  - add Open Graph tags to client/index.html (title, description, the trailer frame, the mp4) so the site's link unfurls in chats
- check albttx/drand, how this can be used ?
  - github.com/albttx/gno-drand (prototype, upstreamed in gnolang/gno#6268,
    still open on 2026-10-25, becomes gno.land/{p,r}/drand/v0; nothing on
    Onyx yet): on-chain verifiable randomness from drand's evmnet (BLS on
    the BN254 curve, the one gno.land verifies natively, ~10-12M gas; our
    timelocked plans use quicknet, BLS12-381, off chain, unaffected)
  - why: the deck seed (salts, plans, block height and time) cannot be
    biased by a player, but the block's proposer sets its time and picks
    its txs: a validator colluding with a player could grind the cards
  - r/drand is asynchronous: Request pins a future round, a relayer
    Submits its signature (verified, so it can only deliver drand's), a
    later tx reads it; no callback, so ~10-15 s and a second tx per turn
  - better for us, no relayer, no r/drand: at the last reveal the realm
    pins the round; then Resolve(id, signature) from any client (it
    fetches the round from drand's HTTP API, as for the timelocked plans)
    verifies it with p/drand.Verify and resolves the turn in the same tx
  - wait for gnolang/gno#6268 to land and p/drand to be on the chain
- use clockwork/wire for codec
  - github.com/clockworkgr/gno-upgradeable, gno.land/p/clockwork/wire/v0:
    a binary codec, values end to end, numbers as varints, strings
    length-prefixed, the reader's call order as the schema; decoding cuts
    each field out instead of scanning bytes (strings.Split, atoi)
  - cannot be used as is: no LICENSE in the repo (all rights reserved),
    and not on Onyx (no wire path under any namespace on 2026-10-25; the
    author's g1lnkytfqcjwllws63gvf0mv9yt04aswy4y9amhm has upgradeable/v0)
  - measured on game 1's turn 1 events (17), same 22 fields, vs our text
    codec: decode 24.8M -> 7.4M gas (-70%), encode 14.9M -> 4.9M (-67%),
    870 -> 658 bytes (-24%; an empty field still costs a byte)
  - plan (B): our own codec on the same idea, a presence mask (one varint)
    so only the fields set are written; for EventsEnc, StartEnc, CardsEnc
    (no version byte needed: nothing deployed, no old records to read)
  - gain now modest: the turn records' encoding is ~27M of a heavy 4-seat
    resolving reveal (94.5M), so ~18M less, ~0.04 GNOT of fee and ~0.05 of
    deposit per turn; the history is read a turn per query, no more near
    the query gas ceiling: not urgent
- upgrade architecture
  - DESIGN_SHOWDOWN

## Player profile
- Add profile page with specific token and linked reputation (check RPG rules)
  - Add XP to player to increase stats? 
- Add a challenge player button
- Can pick a specific character token
- Buy more character tokens 
- NFTs
- Buy guns
- Buy bonus cards
  - Say some cowbow thing during the game
  - Real bonus cards from the game

## Tutorial
- Advanced tutorial

## Lobby
- allow winner to remove replay to be refunded for the deposit
- Create game options
  - only the default gun
  - any gun bought
  - scenario
    - battelroyale 2 to 8
    - OK coral with the whyatt earp (adapt with number of players)
    - poker game with money

## Showdown
- some screen size hides the run away hexes
- add winning/losing burst
- Movements
  - Check possible to move around a building corner
- Cards
  - add brawling
    - add knifes and others
- Aim/Shoots
  - line of sight (board A done: the trough, DESIGN_LOS.md; the rest
    needs a board with buildings and its hexsides traced)
    - wall and doors block (except saloon)
    - cant shot if target is down behind a window
    - cant shoot if both players are down and there is a window between
      them
    - check case https://youtu.be/WGQbh6coUQI?t=2704
    - range through the split hex I11 counts both halves (30.62 says one)
  - fanfire
- Obstacles
  - walls 
  - doors except saloon
  - windows
    
## Special Events
- allow temparory events like "rob the bank" with rewards from realm funds
