require "net/http"
require "json"
require "uri"
require "standardwebhooks"

# Every Videxo call and the webhook check live here. Keep the key on the server.
class Videxo
  class Problem < StandardError
    attr_reader :problem

    def initialize(problem)
      @problem = problem
      super(problem["detail"] || problem["title"])
    end
  end

  # snippet:start create
  def create_job(kind, input)
    upload = input.is_a?(String) && /\Avidexo:\/\/uploads\/(up_[a-f0-9]{24})\z/.match(input)
    unless upload
      raise Problem.new({
        "type" => "about:blank", "title" => "The request is not valid.", "status" => 400,
        "detail" => "input_url must be the input_url of an upload.", "code" => "invalid_request"
      })
    end
    kind = kind == "jobs" ? "jobs" : "transcode"
    body = JSON.parse(File.read(Rails.root.join("requests", "#{kind}.json")))
    if kind == "jobs"
      body["inputs"] = { "talk" => input }
    else
      body["input"] = input
    end
    url = ENV["VIDEXO_WEBHOOK_URL"]
    body["webhook_url"] = url unless url.nil? || url.empty?
    request("/v1/#{kind}", method: "POST", body: body, key: "#{kind}-#{upload[1]}")
  end
  # snippet:end create

  def get_job(id)
    request("/v1/jobs/#{segment(id)}")
  end

  # snippet:start upload
  def create_upload(file)
    request("/v1/uploads", method: "POST", body: file)
  end
  # snippet:end upload

  # snippet:start download
  def output_url(id, alias_name)
    request("/v1/jobs/#{segment(id)}/outputs/#{segment(alias_name)}")
  end
  # snippet:end download

  # snippet:start verify
  def verify_webhook(raw, headers)
    secret = ENV.fetch("VIDEXO_WEBHOOK_SECRET")
    raise "Set VIDEXO_WEBHOOK_SECRET on the server." if secret.empty?
    # Gem 1.1.0 can raise NoMethodError for a signature entry without a comma.
    # Accept the space-separated signatures used during secret rotation too.
    signatures = headers["webhook-signature"]
    unless signatures.is_a?(String) && signatures.ascii_only? && %r{\Av[0-9]+,[A-Za-z0-9+/]+={0,2}(?: v[0-9]+,[A-Za-z0-9+/]+={0,2})*\z}.match?(signatures)
      raise StandardWebhooks::WebhookVerificationError, "Invalid signature header."
    end
    StandardWebhooks::Webhook.new(secret).verify(raw, headers)
  end
  # snippet:end verify

  private

  def segment(value)
    URI.encode_www_form_component(value).gsub("+", "%20")
  end

  # snippet:start request
  def request(path, method: "GET", body: nil, key: nil)
    api_key = ENV.fetch("VIDEXO_API_KEY")
    raise "Set VIDEXO_API_KEY on the server." if api_key.empty?
    base = ENV["VIDEXO_API_URL"].to_s
    base = "https://api.videxo.io" if base.empty?
    uri = URI("#{base.sub(%r{/$}, '')}#{path}")
    call = method == "POST" ? Net::HTTP::Post.new(uri) : Net::HTTP::Get.new(uri)
    call["Authorization"] = "Bearer #{api_key}"
    call["Accept"] = "application/json"
    call["Idempotency-Key"] = key if key
    if body
      call["Content-Type"] = "application/json"
      call.body = JSON.generate(body)
    end
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 5, read_timeout: 30) do |http|
      http.request(call)
    end
    status = response.code.to_i
    if status >= 400
      problem = begin
        JSON.parse(response.body)
      rescue JSON::ParserError
        nil
      end
      unless problem.is_a?(Hash) && problem["code"].is_a?(String)
        problem = { "type" => "about:blank", "title" => "The API answered with an error.",
                    "status" => status, "detail" => "HTTP #{status}", "code" => "http_error" }
      end
      raise Problem.new(problem)
    end
    # Net::HTTP does not follow redirects. Give the fresh Location to the browser.
    if status >= 300
      return response["Location"] || raise("The API returned no download link.")
    end
    JSON.parse(response.body)
  end
  # snippet:end request
end
