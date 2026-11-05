<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';
require_once __DIR__.'/Videxo.php';

function jsonResponse(array $body, int $status = 200, string $type = 'application/json'): void
{
    http_response_code($status);
    header('Content-Type: '.$type);
    echo json_encode($body, JSON_THROW_ON_ERROR);
}

function requestBody(): array
{
    try {
        $body = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) throw new JsonException();
        return $body;
    } catch (JsonException) {
        throw new VidexoProblem([
            'type' => 'about:blank', 'title' => 'The request is not valid.', 'status' => 400,
            'detail' => 'Send a JSON object.', 'code' => 'invalid_request',
        ]);
    }
}

// snippet:start errors
function respond(callable $route): void
{
    try {
        $route(new Videxo());
    } catch (VidexoProblem $error) {
        jsonResponse($error->problem, $error->problem['status'], 'application/problem+json');
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
