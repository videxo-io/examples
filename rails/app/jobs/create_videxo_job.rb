# snippet:start background
class CreateVidexoJob < ApplicationJob
  def perform(kind, input)
    # Reusing the upload and kind derives the same Idempotency-Key on a retry.
    job = Videxo.new.create_job(kind, input)
    # Your code: store this id on the order so your webhook can update it later.
    Rails.logger.info("Videxo job created: #{job.fetch('id')}")
    job
  end
end
# snippet:end background
