<?php
// In your existing bootstrap/app.php, add this inside ->withMiddleware(...).
// This file is an addition to merge, not a replacement for the application's bootstrap.

// snippet:start csrf
// The identical static demo page sends no session CSRF token. Exempt only these demo POSTs.
// In a signed-in app protect the browser routes with auth and CSRF.
$middleware->validateCsrfTokens(except: ['api/uploads', 'api/jobs']);
// snippet:end csrf
