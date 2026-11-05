<?php
require_once __DIR__.'/../../src/respond.php';
allowMethods(['POST']);

// snippet:start webhook
respond(function (Videxo $videxo): void {
    $max = 2_097_152; // 2 MiB of raw bytes, before signature verification or JSON parsing.
    if (isset($_SERVER['CONTENT_LENGTH']) && (float) $_SERVER['CONTENT_LENGTH'] > $max) {
        http_response_code(413);
        return;
    }
    $stream = fopen('php://input', 'rb');
    if ($stream === false) throw new RuntimeException('Could not read the webhook.');
    try {
        $raw = stream_get_contents($stream, $max + 1);
    } finally {
        fclose($stream);
    }
    if ($raw === false) throw new RuntimeException('Could not read the webhook.');
    if (strlen($raw) > $max) {
        http_response_code(413);
        return;
    }
    // Verify these exact bytes, never parsed and serialized again.
    $headers = array_change_key_case(getallheaders(), CASE_LOWER);
    try {
        $event = $videxo->verifyWebhook($raw, $headers);
    } catch (\StandardWebhooks\Exception\WebhookVerificationException) {
        http_response_code(400);
        return;
    }
    // A file for this single-server demo. In your app use a unique webhook-id column in the
    // same transaction as your business update, so retries and concurrent deliveries are skipped.
    $directory = __DIR__.'/../../storage';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Could not create webhook storage.');
    }
    $file = fopen($directory.'/webhooks.json', 'c+');
    if (!$file) throw new RuntimeException('Could not open webhook storage.');
    try {
        if (!flock($file, LOCK_EX)) throw new RuntimeException('Could not lock webhook storage.');
        $saved = stream_get_contents($file);
        $handled = $saved === '' ? [] : json_decode($saved, true, 512, JSON_THROW_ON_ERROR);
        $id = $headers['webhook-id'];
        if (!isset($handled[$id])) {
            // Your code: mark the order done or enqueue slow work. Log only ids, never signed URLs.
            error_log($event['type'].' '.$event['data']['id']);
            $handled[$id] = true;
            rewind($file);
            $json = json_encode($handled, JSON_THROW_ON_ERROR);
            if (fwrite($file, $json) !== strlen($json) || !ftruncate($file, strlen($json)) || !fflush($file)) {
                throw new RuntimeException('Could not save webhook storage.');
            }
        }
    } finally {
        fclose($file); // Releases the lock too.
    }
    http_response_code(204);
});
// snippet:end webhook
