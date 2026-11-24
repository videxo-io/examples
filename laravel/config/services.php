<?php
// Merge this entry into the array returned by your existing config/services.php.
return [
    // snippet:start config
    'videxo' => [
        'webhook_url' => env('VIDEXO_WEBHOOK_URL'),
    ],
    // snippet:end config
];
