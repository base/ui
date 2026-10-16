# Start the internal UI with an optional local metrics snapshot.
dev:
    #!/usr/bin/env sh
    set -eu
    export SCALING_SNAPSHOT_PATH=""
    if [ -f .local/scaling/mainnet.json ]; then
        export SCALING_SNAPSHOT_PATH="$PWD/.local/scaling/mainnet.json"
    fi
    exec npm run dev:internal -- --hostname 127.0.0.1
