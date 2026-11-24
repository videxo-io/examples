# Videxo with curl

The whole round trip from a shell: upload a local file, create a job from JSON, wait for it and
download its outputs. Docs: https://videxo.io/docs/integrations/curl

A shell cannot receive webhooks; to verify them, see one of the server examples (Express, Next.js,
SvelteKit).

## Run it

Needs `curl` and `jq`.

```bash
export VIDEXO_API_KEY=...            # from the dashboard's API keys page
./videxo.sh talk.mp4                 # one MP4: POST /v1/transcode
./videxo.sh talk.mp4 jobs            # MP4, poster and GIF preview in one job: POST /v1/jobs
```

The request bodies are `requests/transcode.json` and `requests/jobs.json`; the script puts the
upload in as the input. Errors print the problem's status, code, detail and field errors.

## Text to speech

`requests/tts.json` is a `POST /v1/tts` body: text in English in the language's default voice. The
job ends with one output, `speech.wav`. The idempotency key comes from the body: a retry of the
same body returns the same job, and an edited body makes a new one. Speech is paid from purchased credits only, from a plan or
a top-up; without them the API answers `402 out_of_credits`.

```bash
api=${VIDEXO_API_URL:-https://api.videxo.io}
curl -sS "$api/v1/tts" -H "Authorization: Bearer $VIDEXO_API_KEY" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: tts-$(shasum -a 256 requests/tts.json | cut -c1-32)" \
  -d @requests/tts.json
# Set ID to the job's id and read the job until its state is succeeded, failed or cancelled:
job=$(curl -sS "$api/v1/jobs/$ID" -H "Authorization: Bearer $VIDEXO_API_KEY")
# The signed download link needs no API key:
curl -sS --fail-with-body "$(jq -r '.outputs[0].download_url' <<< "$job")" -o speech.wav
```

Guide: https://videxo.io/docs/guides/text-to-speech
