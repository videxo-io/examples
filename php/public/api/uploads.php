<?php
require_once __DIR__.'/../../src/respond.php';
allowMethods(['POST']);

// snippet:start upload-route
respond(function (Videxo $videxo): void {
    $body = requestBody();
    $upload = $videxo->createUpload([
        'filename' => $body['filename'] ?? null,
        'size_bytes' => $body['size_bytes'] ?? null,
        'content_type' => $body['content_type'] ?? null,
    ]);
    jsonResponse(['input_url' => $upload['input_url'], 'upload_url' => $upload['upload_url']], 201);
});
// snippet:end upload-route
