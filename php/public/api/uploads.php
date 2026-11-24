<?php
require_once __DIR__.'/../../src/respond.php';
allowMethods(['POST']);

// snippet:start upload-route
respond(function (): void {
    $body = requestBody();
    $filename = $body['filename'] ?? null;
    $size = $body['size_bytes'] ?? null;
    $type = $body['content_type'] ?? null;
    if (!is_string($filename) || !is_int($size) || ($type !== null && !is_string($type))) {
        throw invalidRequest('Send filename, size_bytes and content_type.');
    }
    $upload = videxo()->uploads->create($filename, $size, $type);
    jsonResponse(['input_url' => $upload->inputUrl, 'upload_url' => $upload->uploadUrl], 201);
});
// snippet:end upload-route
