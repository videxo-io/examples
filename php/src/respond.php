<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';
require_once __DIR__.'/videxo.php';

use Videxo\Exception\ApiException;

function jsonResponse(array|JsonSerializable $body, int $status = 200, string $type = 'application/json'): void
{
    http_response_code($status);
    header('Content-Type: '.$type);
    echo json_encode($body, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
}

function requestBody(): array
{
    try {
        $body = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) throw new JsonException();
        return $body;
    } catch (JsonException) {
        throw invalidRequest('Send a JSON object.');
    }
}

// snippet:start errors
function respond(callable $route): void
{
    try {
        $route();
    } catch (ApiException $error) {
        // The API's problem details as they came, or the same fields for this app's own refusal.
        $problem = is_array($error->body) ? $error->body : [
            'type' => $error->type ?? 'about:blank', 'title' => $error->title,
            'status' => $error->status, 'detail' => $error->detail, 'code' => $error->errorCode,
        ];
        jsonResponse($problem, $error->status, 'application/problem+json');
    } catch (Throwable $error) {
        // Keep diagnostics free of request bodies, signed URLs and arbitrary exception messages.
        error_log('Videxo endpoint error: '.$error::class);
        jsonResponse(['title' => 'Something went wrong.', 'status' => 500], 500, 'application/problem+json');
    }
}
// snippet:end errors

function allowMethods(array $methods): void
{
    if (!in_array($_SERVER['REQUEST_METHOD'], $methods, true)) {
        header('Allow: '.implode(', ', $methods));
        jsonResponse(['title' => 'Method not allowed.', 'status' => 405], 405, 'application/problem+json');
        exit;
    }
}
