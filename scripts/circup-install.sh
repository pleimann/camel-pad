#!/usr/bin/env bash

set -e

if [[ -d ./.venv ]] ; then
. .venv/bin/activate
fi

uv pip install circup

circup --host 192.168.12.248 install $@
