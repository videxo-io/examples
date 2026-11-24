<?php

namespace App\Jobs;

use App\Services\VidexoJobs;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

// snippet:start background
final class CreateVidexoJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $backoff = 30;

    public function __construct(public string $kind, public string $input) {}

    public function handle(VidexoJobs $jobs): void
    {
        // The service derives the same key from the upload on each retry.
        $job = $jobs->create($this->kind, $this->input);
        // Your code: store this id on the order so your webhook can update it later.
        Log::info('Videxo job created', ['job_id' => $job->id]);
    }
}
// snippet:end background
