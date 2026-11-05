class VidexoController < ApplicationController
  # The shared static demo page has no session token. In a signed-in app use auth and CSRF.
  skip_forgery_protection only: [:upload, :create]
  around_action :respond_with_problem

  # snippet:start upload-route
  def upload
    file = { filename: params[:filename], size_bytes: params[:size_bytes], content_type: params[:content_type] }
    upload = Videxo.new.create_upload(file)
    render json: upload.slice("input_url", "upload_url"), status: :created
  end
  # snippet:end upload-route

  # snippet:start create-route
  def create
    kind = params[:kind] == "jobs" ? "jobs" : "transcode"
    input = params[:input_url].is_a?(String) ? params[:input_url] : ""
    # perform_now returns the created Job; perform_later is for your own background work.
    job = CreateVidexoJob.perform_now(kind, input)
    render json: job, status: :accepted
  end
  # snippet:end create-route

  def show
    render json: Videxo.new.get_job(params[:id])
  end

  # snippet:start download-route
  def download
    redirect_to Videxo.new.output_url(params[:id], params[:alias]), allow_other_host: true, status: :found
  end
  # snippet:end download-route

  private

  # snippet:start errors
  def respond_with_problem
    yield
  rescue Videxo::Problem => error
    render json: error.problem, status: error.problem.fetch("status"), content_type: "application/problem+json"
  rescue StandardError => error
    Rails.logger.error("Videxo controller error: #{error.class}")
    render json: { title: "Something went wrong.", status: 500 }, status: 500, content_type: "application/problem+json"
  end
  # snippet:end errors
end
