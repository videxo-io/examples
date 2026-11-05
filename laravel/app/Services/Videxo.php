<?php

namespace App\Services;

use App\Exceptions\VidexoProblem;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use StandardWebhooks\Webhook;
use StandardWebhooks\Exception\WebhookVerificationException;

final class Videxo
{
    // snippet:start request
    private function request(string $path, string $method = 'GET', ?array $body = null, ?string $key = null): array|string
    {
        $apiKey = config('services.videxo.key') ?: throw new RuntimeException('Set VIDEXO_API_KEY on the server.');
        $http = Http::baseUrl(rtrim(config('services.videxo.url'), '/'))
            ->withToken($apiKey)->acceptJson()->withoutRedirecting()->connectTimeout(5)->timeout(30);
        if ($key !== null) $http = $http->withHeaders(['Idempotency-Key' => $key]);
        $response = $http->send($method, $path, $body === null ? [] : ['json' => $body]);
        if ($response->failed()) {
            $problem = $response->json();
            throw new VidexoProblem(is_array($problem) && isset($problem['code']) ? $problem : [
                'type' => 'about:blank', 'title' => 'The API answered with an error.',
                'status' => $response->status(), 'detail' => 'HTTP '.$response->status(), 'code' => 'http_error',
            ]);
        }
        if ($response->redirect()) return $response->header('Location') ?: throw new RuntimeException('The API returned no download link.');
        return $response->json();
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
        $body = json_decode(file_get_contents(base_path("requests/$kind.json")), true, 512, JSON_THROW_ON_ERROR);
        if ($kind === 'jobs') $body['inputs'] = ['talk' => $input];
        else $body['input'] = $input;
        if ($url = config('services.videxo.webhook_url')) $body['webhook_url'] = $url;
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
        $secret = config('services.videxo.webhook_secret') ?: throw new RuntimeException('Set VIDEXO_WEBHOOK_SECRET on the server.');
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
