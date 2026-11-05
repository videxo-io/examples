<?php

namespace App\Http\Controllers;

use App\Exceptions\VidexoProblem;
use App\Services\Videxo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use StandardWebhooks\Exception\WebhookVerificationException;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

final class VidexoController extends Controller
{
    public function __construct(private readonly Videxo $videxo) {}

    // snippet:start upload-route
    public function upload(Request $request): Response
    {
        return $this->respond(function () use ($request) {
            $upload = $this->videxo->createUpload([
                'filename' => $request->input('filename'),
                'size_bytes' => $request->input('size_bytes'),
                'content_type' => $request->input('content_type'),
            ]);
            return response()->json(['input_url' => $upload['input_url'], 'upload_url' => $upload['upload_url']], 201);
        });
    }
    // snippet:end upload-route

    // snippet:start create-route
    public function create(Request $request): Response
    {
        return $this->respond(function () use ($request) {
            $kind = $request->input('kind') === 'jobs' ? 'jobs' : 'transcode';
            $input = $request->input('input_url');
            // The page needs the Job now. CreateVidexoJob is the background variant for your own code.
            $job = $this->videxo->createJob($kind, is_string($input) ? $input : '');
            return response()->json($job, 202);
        });
    }
    // snippet:end create-route

    public function show(string $id): Response
    {
        return $this->respond(fn () => response()->json($this->videxo->getJob($id)));
    }

    // snippet:start download-route
    public function download(string $id, string $alias): Response
    {
        return $this->respond(fn () => redirect()->away($this->videxo->outputUrl($id, $alias), 302));
    }
    // snippet:end download-route

    // snippet:start webhook
    public function webhook(Request $request): Response
    {
        return $this->respond(function () use ($request) {
            $max = 2_097_152;
            if ((float) $request->header('Content-Length', '0') > $max) return response('', 413);
            // Bootstrap skips JSON transformations here so nothing eagerly reads the full body.
            $stream = $request->getContent(true);
            if (!is_resource($stream)) throw new \RuntimeException('Could not read the webhook.');
            try {
                $raw = stream_get_contents($stream, $max + 1);
            } finally {
                fclose($stream);
            }
            if ($raw === false) throw new \RuntimeException('Could not read the webhook.');
            if (strlen($raw) > $max) return response('', 413);
            try {
                $event = $this->videxo->verifyWebhook($raw, [
                    'webhook-id' => $request->header('webhook-id'),
                    'webhook-timestamp' => $request->header('webhook-timestamp'),
                    'webhook-signature' => $request->header('webhook-signature'),
                ]);
            } catch (WebhookVerificationException) {
                return response('', 400);
            }
            // Explicit file store: works on a fresh app, even without a cache database migration.
            // In your app use a unique webhook-id column in the business update's transaction.
            $cache = Cache::store('file');
            $key = 'videxo-webhook:'.$request->header('webhook-id');
            $cache->lock($key.':lock', 30)->block(5, function () use ($cache, $key, $event) {
                if ($cache->has($key)) return;
                // Your code: mark the order done or enqueue slow work. Log only ids.
                Log::info('Videxo job ended', ['type' => $event['type'], 'job_id' => $event['data']['id']]);
                $cache->forever($key, true);
            });
            return response('', 204);
        });
    }
    // snippet:end webhook

    // snippet:start errors
    private function respond(callable $route): Response
    {
        try {
            return $route();
        } catch (VidexoProblem $error) {
            return response()->json($error->problem, $error->problem['status'], ['Content-Type' => 'application/problem+json']);
        } catch (Throwable $error) {
            report($error);
            return response()->json(['title' => 'Something went wrong.', 'status' => 500], 500, ['Content-Type' => 'application/problem+json']);
        }
    }
    // snippet:end errors
}
