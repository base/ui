# List development commands.
default:
    @just --list

# Start the public UI.
dev:
    npm run dev:public -- --hostname 127.0.0.1
