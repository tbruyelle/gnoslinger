#!/usr/bin/env bash
# The local notification stack (make notif): a tx-indexer reading the gnodev
# chain and a gnotifd pushing the realm's notifications to the browsers
# opted in (gno/r/v0/notify.gno). It needs gnodev running (make gnodev).
#
# It declares the realm's triggers as test1 (DeclareTriggers), then runs
# both and follows gnodev's reloads: a reload starts the chain over, with
# the earlier transactions in its genesis, whose events no indexer serves;
# so when the height drops (or the RPC goes away), both are stopped, the
# indexer's database is wiped, the triggers declared again (the realm
# makes the registry emit them anew) and both restarted. gnotifd's
# database is kept, its cursor put back to the chain's start, so the
# browsers stay subscribed across reloads; events older than -max-age are
# not sent again. The tools go to .tools/ (gitignored), with the VAPID
# key pair gnotifd signs its pushes with, made once: a new pair would make
# every browser enable notifications again. The client finds the server
# through VITE_GNOTIF_SERVER (http://127.0.0.1:8080). NOTIF_DATA names
# another directory for the databases (a second stack beside the usual one).
set -euo pipefail
cd "$(dirname "$0")/.."

TOOLS=.tools
DATA=${NOTIF_DATA:-$TOOLS}
RPC=${RPC:-http://127.0.0.1:26657}
INDEXER_LISTEN=${INDEXER_LISTEN:-127.0.0.1:8546}
GNOTIF_LISTEN=${GNOTIF_LISTEN:-127.0.0.1:8080}
# Where push services may reach the operator of this gnotifd: an email or
# an https URL. Nobody will, on a dev machine.
GNOTIF_CONTACT=${GNOTIF_CONTACT:-gnoslinger@example.com}
TX_INDEXER_VERSION=v1.4.0
GNOTIF_VERSION=v0.4.0
REALM=gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0
REGISTRY=gno.land/r/nym-gfanton001/gnotif/v1
# gnodev's default account, which deploys the realm and so is its admin.
TEST1_MNEMONIC="source bonus chronic canvas draft south burst lottery vacant surface solve popular case indicate oppose farm nothing bullet exhibit title speed wink action roast"

mkdir -p "$TOOLS" "$DATA"
if [ ! -x "$TOOLS/tx-indexer" ]; then
	echo "installing tx-indexer $TX_INDEXER_VERSION"
	GOBIN="$PWD/$TOOLS" go install github.com/gnolang/tx-indexer/cmd@$TX_INDEXER_VERSION
	mv "$TOOLS/cmd" "$TOOLS/tx-indexer"
fi
if [ ! -x "$TOOLS/gnotifd" ]; then
	echo "installing gnotifd $GNOTIF_VERSION"
	GOBIN="$PWD/$TOOLS" go install github.com/gfanton/gnotif/cmd/gnotifd@$GNOTIF_VERSION
fi
if [ ! -f "$TOOLS/vapid.env" ]; then
	(umask 077 && "$TOOLS/gnotifd" keygen >"$TOOLS/vapid.env")
fi
set -a
# shellcheck disable=SC1091
. "$TOOLS/vapid.env"
set +a

KEYBASE=$TOOLS/keybase
if ! go tool gnokey list -home "$KEYBASE" 2>/dev/null | grep -q ' test1 (local)'; then
	printf '%s\n\n\n' "$TEST1_MNEMONIC" | go tool gnokey add test1 -recover -insecure-password-stdin -home "$KEYBASE" >/dev/null
fi

# height prints the chain's height, or fails while the RPC is away.
height() {
	curl -sf --max-time 2 "$RPC/status" | sed -n 's/.*"latest_block_height": *"\([0-9]*\)".*/\1/p' | grep .
}

# wait_chain waits for gnodev to answer and commit a block (a transaction
# sent before fails its signature check).
wait_chain() {
	local h
	until h=$(height) && [ "$h" -ge 1 ]; do sleep 1; done
}

declare_triggers() {
	echo "declaring the realm's triggers (DeclareTriggers as test1)"
	local out
	if ! out=$(printf '\n' | go tool gnokey maketx call -pkgpath "$REALM" -func DeclareTriggers \
		-gas-fee 1000000ugnot -gas-wanted 50000000 -broadcast -chainid dev -remote "$RPC" \
		-insecure-password-stdin -home "$KEYBASE" test1 2>&1); then
		echo "$out"
		echo "DeclareTriggers failed: is test1 the realm's admin?"
	fi
}

indexer_pid=
gnotifd_pid=
start_stack() {
	rm -rf "$DATA/indexer-db"
	"$TOOLS/tx-indexer" start -remote "$RPC" -db-path "$PWD/$DATA/indexer-db" -listen-address "$INDEXER_LISTEN" -log-level warn &
	indexer_pid=$!
	# A kept database reads the new chain from its start: the triggers
	# declared again, and nothing older than -max-age.
	if [ -f "$DATA/gnotif.db" ]; then
		sqlite3 "$DATA/gnotif.db" "update cursor set height_done = 0, bound = 0, next_tx = 0;"
	fi
	# -stream-max lets pages connect live; -push-hosts adds Chrome's newer
	# push endpoints (jmt<N>.google.com) to gnotifd's default list, which
	# refuses them.
	"$TOOLS/gnotifd" -indexer "http://$INDEXER_LISTEN/graphql/query" -registry "$REGISTRY" -start-height 1 \
		-vapid-subject "$GNOTIF_CONTACT" -listen "$GNOTIF_LISTEN" -db "$DATA/gnotif.db" -max-age 5m -stream-max 16 \
		-push-hosts "fcm.googleapis.com,*.google.com,updates.push.services.mozilla.com,web.push.apple.com,*.notify.windows.com" &
	gnotifd_pid=$!
	echo "gnotifd on http://$GNOTIF_LISTEN (VITE_GNOTIF_SERVER), tx-indexer on $INDEXER_LISTEN"
}

stop_stack() {
	kill "$indexer_pid" "$gnotifd_pid" 2>/dev/null || true
	wait "$indexer_pid" "$gnotifd_pid" 2>/dev/null || true
}
trap stop_stack EXIT

while true; do
	echo "waiting for gnodev at $RPC"
	wait_chain
	declare_triggers
	start_stack
	last=$(height)
	missed=0
	# Follow the chain: a height going backwards, or an RPC gone for a
	# while, is a gnodev reload; a tool gone is an error.
	while true; do
		sleep 2
		if ! kill -0 "$indexer_pid" 2>/dev/null || ! kill -0 "$gnotifd_pid" 2>/dev/null; then
			echo "tx-indexer or gnotifd stopped" >&2
			exit 1
		fi
		if h=$(height); then
			missed=0
			if [ "$h" -ge "$last" ]; then
				last=$h
				continue
			fi
		elif [ $((missed += 1)) -lt 3 ]; then
			continue
		fi
		echo "gnodev reloaded: starting the stack over on the new chain"
		stop_stack
		break
	done
done
