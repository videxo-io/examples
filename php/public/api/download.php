<?php
require_once __DIR__.'/../../src/respond.php';
allowMethods(['GET']);

// snippet:start download-route
respond(function (Videxo $videxo): void {
    $id = is_string($_GET['id'] ?? null) ? $_GET['id'] : '';
    $alias = is_string($_GET['alias'] ?? null) ? $_GET['alias'] : '';
    header('Location: '.$videxo->outputUrl($id, $alias), true, 302);
});
// snippet:end download-route
