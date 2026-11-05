<?php
// Run from the project folder: php -S "127.0.0.1:$PORT" -t public public/router.php
// This explicit route map also keeps private files and storage outside the public document root.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/' || $path === '/index.html') {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); return; }
    header('Content-Type: text/html; charset=utf-8');
    readfile(__DIR__.'/index.html');
} elseif ($path === '/api/uploads' || $path === '/api/uploads.php') {
    require __DIR__.'/api/uploads.php';
} elseif ($path === '/api/jobs' || $path === '/api/jobs.php') {
    require __DIR__.'/api/jobs.php';
} elseif (preg_match('~^/api/jobs/([^/]+)/outputs/([^/]+)$~D', $path, $match)) {
    $_GET['id'] = rawurldecode($match[1]);
    $_GET['alias'] = rawurldecode($match[2]);
    require __DIR__.'/api/download.php';
} elseif (preg_match('~^/api/jobs/([^/]+)$~D', $path, $match)) {
    $_GET['id'] = rawurldecode($match[1]);
    require __DIR__.'/api/jobs.php';
} elseif ($path === '/api/download.php') {
    require __DIR__.'/api/download.php';
} elseif ($path === '/webhooks/videxo' || $path === '/webhooks/videxo.php') {
    require __DIR__.'/webhooks/videxo.php';
} else {
    http_response_code(404);
}
