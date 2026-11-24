<?php
require_once __DIR__.'/../../src/respond.php';
allowMethods(['POST', 'GET']);

// snippet:start create-route
respond(function (): void {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        jsonResponse(videxo()->jobs->get(is_string($_GET['id'] ?? null) ? $_GET['id'] : ''));
        return;
    }
    $body = requestBody();
    $kind = ($body['kind'] ?? null) === 'jobs' ? 'jobs' : 'transcode';
    $input = is_string($body['input_url'] ?? null) ? $body['input_url'] : '';
    jsonResponse(createJob($kind, $input), 202);
});
// snippet:end create-route
