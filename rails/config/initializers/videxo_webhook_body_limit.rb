require "stringio"
require "rack/utils"

# snippet:start webhook-limit
# Run before Rails' logging and parameter parsing, which can otherwise read the whole body.
class VidexoWebhookBodyLimit
  MAX = 2_097_152

  def initialize(app)
    @app = app
  end

  def call(env)
    path = Rack::Utils.unescape_path(env["PATH_INFO"].to_s)
    return @app.call(env) unless env["REQUEST_METHOD"] == "POST" && path.start_with?("/webhooks/videxo")
    return [413, { "content-length" => "0" }, []] if env["CONTENT_LENGTH"].to_i > MAX

    raw = env.fetch("rack.input").read(MAX + 1).to_s
    return [413, { "content-length" => "0" }, []] if raw.bytesize > MAX

    # Rails may parse/log the accepted body before the controller runs. It only sees bounded bytes.
    env["rack.input"] = StringIO.new(raw)
    env["RAW_POST_DATA"] = raw
    @app.call(env)
  end
end

Rails.application.config.middleware.insert_before(0, VidexoWebhookBodyLimit)
# snippet:end webhook-limit
