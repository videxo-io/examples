<?php

namespace App\Services;

use Videxo\Exception\InvalidRequestException;
use Videxo\Model\Job;
use Videxo\Videxo;

final class VidexoJobs
{
    public function __construct(private readonly Videxo $videxo) {}

    // snippet:start create
    public function create(string $kind, string $input): Job
    {
        if (!preg_match('~^videxo://uploads/(up_[a-f0-9]{24})$~D', $input, $match)) {
            throw self::invalid('input_url must be the input_url of an upload.');
        }
        $kind = $kind === 'jobs' ? 'jobs' : 'transcode';
        $body = json_decode(file_get_contents(base_path("requests/$kind.json")), true, 512, JSON_THROW_ON_ERROR);
        if ($kind === 'jobs') $body['inputs'] = ['talk' => $input];
        else $body['input'] = $input;
        if ($url = config('services.videxo.webhook_url')) $body['webhook_url'] = $url;
        // The same upload and kind send the same key: a retry within 24 hours returns the same job.
        $key = "$kind-{$match[1]}";
        return $kind === 'jobs' ? $this->videxo->jobs->create($body, $key) : $this->videxo->transcode($body, $key);
    }
    // snippet:end create

    public static function invalid(string $detail): InvalidRequestException
    {
        return new InvalidRequestException(400, 'invalid_request', 'The request is not valid.', $detail);
    }
}
