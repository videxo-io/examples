require "json"
require "standardwebhooks"

class WebhooksController < ApplicationController
  skip_forgery_protection only: :videxo

  # snippet:start webhook
  def videxo
    max = 2_097_152
    # content_length itself reads raw_post on chunked requests; use it only with the header.
    if request.headers["Content-Length"] && request.content_length > max
      return head :payload_too_large
    end
    raw = request.body.read(max + 1).to_s
    return head :payload_too_large if raw.bytesize > max
    headers = {
      "webhook-id" => request.headers["webhook-id"],
      "webhook-timestamp" => request.headers["webhook-timestamp"],
      "webhook-signature" => request.headers["webhook-signature"]
    }
    event = Videxo.new.verify_webhook(raw, headers)
    # A locked file for this single-server demo, independent of Rails' development NullStore.
    # In your app use a unique webhook-id column in the business update's transaction.
    File.open(Rails.root.join("tmp", "videxo-webhooks.json"), File::RDWR | File::CREAT, 0600) do |file|
      raise "Could not lock webhook storage." unless file.flock(File::LOCK_EX)
      saved = file.read
      handled = saved.empty? ? {} : JSON.parse(saved)
      id = headers.fetch("webhook-id")
      unless handled[id]
        # Your code: mark the order done or enqueue slow work. Log only ids, never signed URLs.
        Rails.logger.info("#{event.fetch('type')} #{event.fetch('data').fetch('id')}")
        handled[id] = true
        file.rewind
        file.write(JSON.generate(handled))
        file.truncate(file.pos)
        file.flush
      end
    end
    head :no_content
  rescue StandardWebhooks::WebhookVerificationError, JSON::ParserError
    head :bad_request
  end
  # snippet:end webhook
end
