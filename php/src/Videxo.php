<?php

declare(strict_types=1);

use Videxo\Exception\InvalidRequestException;
use Videxo\Model\Job;
use Videxo\Videxo;

// The Videxo client and what this app does with it. Keep the key on the server.

// snippet:start client
function videxo(): Videxo
{
    static $client = null;
    // Reads VIDEXO_API_KEY, and VIDEXO_API_URL when it is set, from the environment.
    return $client ??= Videxo::fromEnvironment();
}
// snippet:end client

function invalidRequest(string $detail): InvalidRequestException
{
    return new InvalidRequestException(400, 'invalid_request', 'The request is not valid.', $detail);
}

// snippet:start create
function createJob(string $kind, string $input): Job
{
    if (!preg_match('~^videxo://uploads/(up_[a-f0-9]{24})$~D', $input, $match)) {
        throw invalidRequest('input_url must be the input_url of an upload.');
    }
    $kind = $kind === 'jobs' ? 'jobs' : 'transcode';
    $body = json_decode(file_get_contents(__DIR__."/../requests/$kind.json"), true, 512, JSON_THROW_ON_ERROR);
    if ($kind === 'jobs') $body['inputs'] = ['talk' => $input];
    else $body['input'] = $input;
    if ($url = getenv('VIDEXO_WEBHOOK_URL')) $body['webhook_url'] = $url;
    // The same upload and kind send the same key: a retry within 24 hours returns the same job.
    $key = "$kind-{$match[1]}";
    return $kind === 'jobs' ? videxo()->jobs->create($body, $key) : videxo()->transcode($body, $key);
}
// snippet:end create

function createSpeech(string $text, string $locale, string $key): Job
{
    // The language's default voice: no voice_id. The API checks the text itself (1 to 800 characters).
    if (!in_array($locale, ['pl', 'en'], true)) throw invalidRequest('locale must be pl or en.');
    // One key per submit from the page: a retry of that submit returns the same job, a new submit makes a new one.
    if (!preg_match('~^[A-Za-z0-9-]{8,64}$~D', $key)) throw invalidRequest('key must be 8 to 64 letters, digits or hyphens.');
    $body = ['text' => $text, 'locale' => $locale];
    if ($url = getenv('VIDEXO_WEBHOOK_URL')) $body['webhook_url'] = $url;
    return videxo()->tts($body, "tts-$key");
}
