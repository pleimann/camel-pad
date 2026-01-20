#!/usr/bin/env bash

set -e

# Build the Go project
export CGO_CFLAGS="-Wno-deprecated-declarations"

go build -o claude-pad ./cmd/claude-pad

echo "Build complete: claude-pad"