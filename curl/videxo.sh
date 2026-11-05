#!/usr/bin/env bash
# The whole round trip with curl and jq: upload a local file, create a job from JSON, wait for it
# and download its outputs. Usage: ./videxo.sh talk.mp4 [transcode|jobs]
# Needs VIDEXO_API_KEY; VIDEXO_API_URL defaults to https://api.videxo.io.
set -euo pipefail
# The request bodies sit next to the script; the file and the outputs stay relative to where you run it.
here=$(cd "$(dirname "$0")" && pwd)

file=${1:?usage: ./videxo.sh FILE [transcode|jobs]}
kind=${2:-transcode}
api=${VIDEXO_API_URL:-https://api.videxo.io}
auth="Authorization: Bearer ${VIDEXO_API_KEY:?set VIDEXO_API_KEY}"

# snippet:start errors
# Every error answer is problem details (application/problem+json): print its code and detail.
call() {
  local body status
  body=$(mktemp)
  # A request that gets no answer stops the script too (set -e does not reach into $(...)).
  status=$(curl -sS -o "$body" -w '%{http_code}' -H "$auth" "$@") || exit 1
  if [ "$status" -ge 400 ]; then
    jq -r '"\(.status) \(.code): \(.detail)", (.errors[]? | "  \(.pointer // .parameter // .header): \(.detail)")' "$body" >&2
    exit 1
  fi
  cat "$body"
}
# snippet:end errors

# snippet:start upload
name=$(basename "$file" | tr -c 'A-Za-z0-9_.\n-' '-')
size=$(wc -c < "$file" | tr -d ' ')
upload=$(call "$api/v1/uploads" -H 'Content-Type: application/json' \
  -d "{\"filename\":\"$name\",\"size_bytes\":$size,\"content_type\":\"application/octet-stream\"}")
# The upload URL takes one PUT and needs no API key.
curl -sS --fail-with-body -X PUT "$(jq -r .upload_url <<< "$upload")" \
  -H 'Content-Type: application/octet-stream' --data-binary "@$file" > /dev/null
input=$(jq -r .input_url <<< "$upload")
# snippet:end upload

# snippet:start create
# The body from requests/, with the upload as its input. The Idempotency-Key makes a retry safe: the
# same key answers the same job, never a second one.
if [ "$kind" = jobs ]; then
  body=$(jq --arg input "$input" '.inputs.talk = $input' "$here/requests/jobs.json")
  path=/v1/jobs
else
  body=$(jq --arg input "$input" '.input = $input' "$here/requests/transcode.json")
  path=/v1/transcode
fi
job=$(call "$api$path" -H 'Content-Type: application/json' -H "Idempotency-Key: $kind-$(jq -r .id <<< "$upload")" -d "$body")
id=$(jq -r .id <<< "$job")
# snippet:end create

# snippet:start wait
while state=$(jq -r .state <<< "$job"); [ "$state" = queued ] || [ "$state" = running ]; do
  echo "$id: $state"
  sleep 2
  job=$(call "$api/v1/jobs/$id")
done
echo "$id: $state $(jq -r '.error // empty | "\(.code): \(.message)"' <<< "$job")"
# snippet:end wait

# snippet:start download
# Each output through GET /v1/jobs/{id}/outputs/{alias}: it redirects to a fresh signed link, which
# needs no API key (curl does not send the Authorization header to another host).
for alias in $(jq -r '.outputs[].alias' <<< "$job"); do
  filename=$(jq -r --arg alias "$alias" '.outputs[] | select(.alias == $alias) | .filename' <<< "$job")
  curl -sS --fail-with-body -L -H "$auth" "$api/v1/jobs/$id/outputs/$alias" -o "$filename"
  echo "saved $filename"
done
# snippet:end download
