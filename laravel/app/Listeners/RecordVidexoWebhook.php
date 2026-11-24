<?php

namespace App\Listeners;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Videxo\Laravel\Events\WebhookReceived;

// snippet:start listener
final class RecordVidexoWebhook
{
    public function handle(WebhookReceived $received): void
    {
        $event = $received->event;
        // Explicit file store: works on a fresh app, even without a cache database migration.
        // In your app use a unique webhook-id column in the business update's transaction.
        $cache = Cache::store('file');
        $key = 'videxo-webhook:'.$event->id;
        $cache->lock($key.':lock', 30)->block(5, function () use ($cache, $key, $event) {
            if ($cache->has($key)) return;
            // Your code: mark the order done or enqueue slow work. Log only ids.
            Log::info('Videxo job ended', ['type' => $event->type, 'job_id' => $event->job?->id]);
            $cache->forever($key, true);
        });
    }
}
// snippet:end listener
