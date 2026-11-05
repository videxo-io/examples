<?php

declare(strict_types=1);

use StandardWebhooks\Webhook;
use StandardWebhooks\Exception\WebhookVerificationException;

// Every Videxo call and the webhook check live here. Keep the key on the server.
final class VidexoProblem extends RuntimeException
{
    public function __construct(public readonly array $problem)
    {
        parent::__construct($problem['detail'] ?? $problem['title'] ?? 'The API answered with an error.');
    }
}

final class Videxo
{
    // snippet:start request
    private function request(string $path, string $method = 'GET', ?array $body = null, ?string $key = null): array|string
    {
        $apiKey = getenv('VIDEXO_API_KEY') ?: throw new RuntimeException('Set VIDEXO_API_KEY on the server.');
        $headers = ['Authorization: Bearer '.$apiKey, 'Accept: application/json'];
        if ($body !== null) $headers[] = 'Content-Type: application/json';
        if ($key !== null) $headers[] = 'Idempotency-Key: '.$key;
        $location = null;
        $curl = curl_init(rtrim(getenv('VIDEXO_API_URL') ?: 'https://api.videxo.io', '/').$path);
        curl_setopt_array($curl, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false, // The output endpoint returns a Location, not the file.
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$location): int {
                if (stripos($line, 'Location:') === 0) $location = trim(substr($line, 9));
                return strlen($line);
            },
        ]);
        if ($body !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($body, JSON_THROW_ON_ERROR));
        $raw = curl_exec($curl);
        if ($raw === false) throw new RuntimeException('Could not reach the API.');
        $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $problem = json_decode($raw, true);
        if ($status >= 400) {
            throw new VidexoProblem(is_array($problem) && isset($problem['code']) ? $problem : [
                'type' => 'about:blank', 'title' => 'The API answered with an error.',
                'status' => $status, 'detail' => "HTTP $status", 'code' => 'http_error',
            ]);
        }
        if ($status >= 300) return $location ?? throw new RuntimeException('The API returned no download link.');
        return json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    }
    // snippet:end request

    // snippet:start create
    public function createJob(string $kind, string $input): array
    {
        if (!preg_match('~^videxo://uploads/(up_[a-f0-9]{24})$~D', $input, $match)) {
            throw new VidexoProblem([
                'type' => 'about:blank', 'title' => 'The request is not valid.', 'status' => 400,
                'detail' => 'input_url must be the input_url of an upload.', 'code' => 'invalid_request',
            ]);
        }
        $kind = $kind === 'jobs' ? 'jobs' : 'transcode';
        $body = json_decode(file_get_contents(__DIR__."/../requests/$kind.json"), true, 512, JSON_THROW_ON_ERROR);
        if ($kind === 'jobs') $body['inputs'] = ['talk' => $input];
        else $body['input'] = $input;
        if ($url = getenv('VIDEXO_WEBHOOK_URL')) $body['webhook_url'] = $url;
        return $this->request('/v1/'.$kind, 'POST', $body, "$kind-{$match[1]}");
    }
    // snippet:end create

    public function getJob(string $id): array
    {
        return $this->request('/v1/jobs/'.rawurlencode($id));
    }

    // snippet:start upload
    public function createUpload(array $file): array
    {
        return $this->request('/v1/uploads', 'POST', $file);
    }
    // snippet:end upload

    // snippet:start download
    public function outputUrl(string $id, string $alias): string
    {
        return $this->request('/v1/jobs/'.rawurlencode($id).'/outputs/'.rawurlencode($alias));
    }
    // snippet:end download

    // snippet:start verify
    public function verifyWebhook(string $raw, array $headers): array
    {
        $secret = getenv('VIDEXO_WEBHOOK_SECRET') ?: throw new RuntimeException('Set VIDEXO_WEBHOOK_SECRET on the server.');
        // Composer 1.0.2 can throw a runtime error for a signature entry without a comma.
        // Accept the space-separated signatures used during secret rotation too.
        $signatures = $headers['webhook-signature'] ?? '';
        if (!is_string($signatures) || !preg_match('~\Av[0-9]+,[A-Za-z0-9+/]+={0,2}(?: v[0-9]+,[A-Za-z0-9+/]+={0,2})*\z~', $signatures)) {
            throw new WebhookVerificationException('Invalid signature header.');
        }
        return (new Webhook($secret))->verify($raw, $headers);
    }
    // snippet:end verify
}
