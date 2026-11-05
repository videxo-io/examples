<?php

namespace App\Exceptions;

use RuntimeException;

final class VidexoProblem extends RuntimeException
{
    public function __construct(public readonly array $problem)
    {
        parent::__construct($problem['detail'] ?? $problem['title'] ?? 'The API answered with an error.');
    }
}
