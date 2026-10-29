#!/usr/bin/env bash
# Deploys Gnoslinger on a gno.land network (make deploy-onyx):
# the packages and the realms in import order, then the gnotif triggers
# (DeclareTriggers, admin only, which the deployer is). Signed by KEY, whose
# address must own the namespace the paths are under (th0mas,
# g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2): gno.land lets an address deploy
# under its own address namespace only, and the realm's first DeclareTriggers
# must come from the namespace owner's own key. The password is asked once.
#
# Each package goes up without its tests (the chain stores every file sent,
# test files included, and locks a storage deposit for each byte: the
# production files are what runs), is simulated first to size its gas and
# fee (gas-wanted is the simulated gas plus GAS_MARGIN percent, the fee
# follows the chain's gas price), and is skipped when already on the chain,
# so the script can be run again after a failure. A package on the chain is
# final: a change is a new version (gnoslinger/v1), not a redeploy. Each
# transaction locks a storage deposit (100 ugnot per byte stored, about 148
# GNOT for the whole deployment, the engine alone 96: AGENTS.md, Storage
# deposit) up to MAX_DEPOSIT, which must cover it: the chain's default cap
# (100 GNOT on Onyx) is too close to the engine's.
set -euo pipefail
cd "$(dirname "$0")/.."

KEY=${KEY:-th0mas}
REMOTE=${REMOTE:-https://rpc.onyx.testnets.gno.land:443}
CHAINID=${CHAINID:-onyx-1}
GAS_MARGIN=${GAS_MARGIN:-20}
MAX_DEPOSIT=${MAX_DEPOSIT:-150000000ugnot}
# Another keybase than gnokey's default (~/.config/gno).
GNOKEY_HOME=${GNOKEY_HOME:-}

# In import order; each is deployed at the module of its gnomod.toml.
PACKAGES=(
	gno/p/hex/v0
	gno/p/cards/v0
	gno/p/engine/v0
	gno/r/profiles/v0
	gno/r/v0
)

gnokey() {
	if [ -n "$GNOKEY_HOME" ]; then
		go tool gnokey -home "$GNOKEY_HOME" "$@"
	else
		go tool gnokey "$@"
	fi
}

pkgpath() { sed -n 's/^module = "\(.*\)"$/\1/p' "$1/gnomod.toml"; }

REALM=$(pkgpath gno/r/v0)
# gno.land/r/<namespace>/...
NAMESPACE=$(echo "$REALM" | cut -d/ -f3)

# --- Pre-flight ---

addr=$(gnokey list | sed -n "s/^[0-9]*\. $KEY ([a-z]*) - addr: \([a-z0-9]*\) .*/\1/p")
if [ -z "$addr" ]; then
	echo "no key named '$KEY' in the keybase (go tool gnokey list)" >&2
	exit 1
fi
if [ "$addr" != "$NAMESPACE" ]; then
	echo "$KEY is $addr, but the packages are under the namespace of $NAMESPACE: only that address can deploy them" >&2
	exit 1
fi

network=$(curl -sf --max-time 10 "$REMOTE/status" | sed -n 's/.*"network": *"\([^"]*\)".*/\1/p')
if [ "$network" != "$CHAINID" ]; then
	echo "$REMOTE is chain '$network', not '$CHAINID'" >&2
	exit 1
fi

gasprice=$(gnokey query auth/gasprice -remote "$REMOTE")
GP_GAS=$(echo "$gasprice" | sed -n 's/.*"gas": *"\([0-9]*\)".*/\1/p')
GP_PRICE=$(echo "$gasprice" | sed -n 's/.*"price": *"\([0-9]*\)ugnot".*/\1/p')
if [ -z "$GP_GAS" ] || [ -z "$GP_PRICE" ] || [ "$GP_GAS" = 0 ]; then
	echo "cannot read the gas price of $CHAINID: $gasprice" >&2
	exit 1
fi

balance=$(gnokey query "bank/balances/$addr" -remote "$REMOTE" | sed -n 's/^data: "\(.*\)"$/\1/p')
echo "deploying on $CHAINID ($REMOTE) as $KEY ($addr), balance ${balance:-0}, gas price ${GP_PRICE}ugnot per $GP_GAS gas"

read -rsp "password of $KEY: " PASSWORD
echo

# --- Transactions ---

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# sign <gnokey maketx args...>: signs with KEY, the password from stdin.
sign() {
	printf '%s\n' "$PASSWORD" | gnokey maketx "$@" -max-deposit "$MAX_DEPOSIT" -chainid "$CHAINID" -remote "$REMOTE" -insecure-password-stdin "$KEY"
}

# simulated <maketx args...>: the gas the transaction uses, simulated with
# the block's gas limit (gnokey raises gas-wanted to it for a dry run).
simulated() {
	local out used
	if ! out=$(sign "$@" -gas-wanted 1000000000 -gas-fee 1000000ugnot -broadcast -simulate only 2>&1); then
		echo "$out" >&2
		return 1
	fi
	used=$(echo "$out" | sed -n 's/.*estimated gas usage: \([0-9]*\) .*/\1/p')
	if [ -z "$used" ]; then
		echo "$out" >&2
		echo "no gas estimate in gnokey's output" >&2
		return 1
	fi
	echo "$used"
}

# send <label> <maketx args...>: simulates, then broadcasts with the gas
# and fee sized on the simulation.
send() {
	local label=$1 used gas fee
	shift
	used=$(simulated "$@")
	gas=$((used * (100 + GAS_MARGIN) / 100))
	fee=$((gas * GP_PRICE / GP_GAS + 1))
	echo "$label: $used gas simulated, sent with $gas and a ${fee}ugnot fee"
	sign "$@" -gas-wanted "$gas" -gas-fee "${fee}ugnot" -broadcast
}

deployed() { gnokey query vm/qfile -remote "$REMOTE" -data "$1" >/dev/null 2>&1; }

# production <dir>: a copy of the package without its tests and filetests.
production() {
	local dir="$TMP/$(basename "$1")"
	cp -r "$1" "$dir"
	rm -rf "$dir/filetests"
	find "$dir" -name '*_test.gno' -delete
	echo "$dir"
}

for dir in "${PACKAGES[@]}"; do
	path=$(pkgpath "$dir")
	if deployed "$path"; then
		echo "$path: already on $CHAINID, skipped"
		continue
	fi
	send "$path" addpkg -pkgdir "$(production "$dir")" -pkgpath "$path"
done

send "$REALM DeclareTriggers" call -pkgpath "$REALM" -func DeclareTriggers

echo
echo "done. The client's production env (client/.env.production):"
echo "VITE_RPC_URL=$REMOTE"
echo "VITE_CHAIN_ID=$CHAINID"
echo "VITE_REALM_PATH=$REALM"
echo "VITE_PROFILES_PATH=$(pkgpath gno/r/profiles/v0)"
