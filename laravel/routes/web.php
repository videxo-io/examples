<?php
// Add these imports and routes to your application's routes/web.php.
use App\Http\Controllers\VidexoController;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => response()->file(public_path('index.html')));
Route::post('/api/uploads', [VidexoController::class, 'upload']);
Route::post('/api/jobs', [VidexoController::class, 'create']);
Route::get('/api/jobs/{id}', [VidexoController::class, 'show']);
Route::get('/api/jobs/{id}/outputs/{alias}', [VidexoController::class, 'download']);
Route::post('/webhooks/videxo', [VidexoController::class, 'webhook']);
