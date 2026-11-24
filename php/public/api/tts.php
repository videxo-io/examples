<?php
require_once __DIR__.'/../../src/respond.php';
allowMethods(['POST']);

// Text to speech: the page polls the job through /api/jobs/:id and plays its output's signed download_url.
respond(function (): void {
    $body = requestBody();
    $text = $body['text'] ?? null;
    $locale = $body['locale'] ?? null;
    $key = $body['key'] ?? null;
    if (!is_string($text) || !is_string($locale) || !is_string($key)) throw invalidRequest('Send text, locale and key.');
    jsonResponse(createSpeech($text, $locale, $key), 202);
});
