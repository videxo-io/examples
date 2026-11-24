<?php

namespace App\Http\Controllers;

use App\Services\VidexoJobs;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;
use Videxo\Exception\ApiException;
use Videxo\Videxo;

final class VidexoController extends Controller
{
    public function __construct(private readonly Videxo $videxo, private readonly VidexoJobs $jobs) {}

    // snippet:start upload-route
    public function upload(Request $request): Response
    {
        return $this->respond(function () use ($request) {
            $filename = $request->input('filename');
            $size = $request->input('size_bytes');
            $type = $request->input('content_type');
            if (!is_string($filename) || !is_int($size) || ($type !== null && !is_string($type))) {
                throw VidexoJobs::invalid('Send filename, size_bytes and content_type.');
            }
            $upload = $this->videxo->uploads->create($filename, $size, $type);
            return response()->json(['input_url' => $upload->inputUrl, 'upload_url' => $upload->uploadUrl], 201);
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
            $job = $this->jobs->create($kind, is_string($input) ? $input : '');
            return response()->json($job, 202);
        });
    }
    // snippet:end create-route

    public function show(string $id): Response
    {
        return $this->respond(fn () => response()->json($this->videxo->jobs->get($id)));
    }

    // snippet:start download-route
    public function download(string $id, string $alias): Response
    {
        // A fresh signed link for each click; the client does not follow the API's redirect.
        return $this->respond(fn () => redirect()->away($this->videxo->outputs->url($id, $alias), 302));
    }
    // snippet:end download-route

    // snippet:start errors
    private function respond(callable $route): Response
    {
        try {
            return $route();
        } catch (ApiException $error) {
            // The API's problem details as they came, or the same fields for this app's own refusal.
            $problem = is_array($error->body) ? $error->body : [
                'type' => $error->type ?? 'about:blank', 'title' => $error->title,
                'status' => $error->status, 'detail' => $error->detail, 'code' => $error->errorCode,
            ];
            return response()->json($problem, $error->status, ['Content-Type' => 'application/problem+json']);
        } catch (Throwable $error) {
            report($error);
            return response()->json(['title' => 'Something went wrong.', 'status' => 500], 500, ['Content-Type' => 'application/problem+json']);
        }
    }
    // snippet:end errors
}
