<?php
// Merge this entry into the array returned by your existing config/services.php.
return [
    // snippet:start config
    'videxo' => [
        'url' => env('VIDEXO_API_URL') ?: 'https://api.videxo.io',
        'key' => env('VIDEXO_API_KEY'),
        'webhook_secret' => env('VIDEXO_WEBHOOK_SECRET'),
        'webhook_url' => env('VIDEXO_WEBHOOK_URL'),
    ],
    // snippet:end config
];
