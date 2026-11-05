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
