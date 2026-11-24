<?php
require_once __DIR__.'/../../src/respond.php';
allowMethods(['GET']);

// snippet:start download-route
respond(function (): void {
    $id = is_string($_GET['id'] ?? null) ? $_GET['id'] : '';
    $alias = is_string($_GET['alias'] ?? null) ? $_GET['alias'] : '';
    // A fresh signed link for each click; the client does not follow the API's redirect.
    header('Location: '.videxo()->outputs->url($id, $alias), true, 302);
});
// snippet:end download-route
