<?php
// In your existing bootstrap/app.php, add this inside ->withMiddleware(...).
// This file is an addition to merge, not a replacement for the application's bootstrap.

// snippet:start csrf
// The identical static demo page sends no session CSRF token. Exempt only these demo POSTs
// and the signed webhook. In a signed-in app protect the browser routes with auth and CSRF.
$middleware->validateCsrfTokens(except: ['api/uploads', 'api/jobs', 'webhooks/videxo']);
// Avoid eager JSON reads before the webhook controller applies its bounded raw-body limit.
$middleware->trimStrings(except: [fn ($request) => $request->is('webhooks/videxo')]);
$middleware->convertEmptyStringsToNull(except: [fn ($request) => $request->is('webhooks/videxo')]);
// snippet:end csrf
