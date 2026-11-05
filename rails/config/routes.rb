# Merge these routes into your existing Rails.application.routes.draw block.
Rails.application.routes.draw do
  root to: redirect("/index.html")
  post "/api/uploads", to: "videxo#upload"
  post "/api/jobs", to: "videxo#create"
  get "/api/jobs/:id", to: "videxo#show"
  get "/api/jobs/:id/outputs/:alias", to: "videxo#download"
  post "/webhooks/videxo", to: "webhooks#videxo"
end
