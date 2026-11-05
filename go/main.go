// The app's routes: the page in public/ uploads a file straight to Videxo with an upload URL this
// server makes, then asks the server to create a job and reads it until it ends. Videxo calls
// /webhooks/videxo when the job ends. The API key and the webhook secret never leave the server.
package main

import (
	_ "embed"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"sync"
)

//go:embed public/index.html
var page []byte

// Webhook ids already handled. Keep them in your database (a unique column) so a retry is skipped
// after a restart too.
var (
	handled   = map[string]bool{}
	handledMu sync.Mutex
)

func onJobEnded(event *WebhookEvent) {
	// Your code: mark the order done, store the outputs' names, email the customer.
	log.Printf("%s %s", event.Type, event.Data)
}

// snippet:start errors
// fail answers an error: Videxo's problem details go to the page as they came, so it can show
// Detail and the field errors; anything else is a plain 500.
func fail(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/problem+json")
	var problem *Problem
	if !errors.As(err, &problem) {
		log.Print(err)
		problem = &Problem{Type: "about:blank", Title: "Something went wrong.", Status: 500}
	}
	w.WriteHeader(problem.Status)
	json.NewEncoder(w).Encode(problem)
}

// snippet:end errors

func badRequest(detail string) *Problem {
	return &Problem{Type: "about:blank", Title: "The request is not valid.", Status: 400, Detail: detail, Code: "invalid_request"}
}

func reply(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}

// snippet:start upload-route
func createUpload(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Filename    string `json:"filename"`
		SizeBytes   int64  `json:"size_bytes"`
		ContentType string `json:"content_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, badRequest("The body is not JSON."))
		return
	}
	upload, err := CreateUpload(body.Filename, body.SizeBytes, body.ContentType)
	if err != nil {
		fail(w, err)
		return
	}
	// Only the one-time URL goes to the browser; it holds no API key.
	reply(w, http.StatusCreated, map[string]string{"input_url": upload.InputURL, "upload_url": upload.UploadURL})
}

// snippet:end upload-route

// snippet:start create-route
var uploadSource = regexp.MustCompile(`^videxo://uploads/(up_[a-f0-9]{24})$`)

func createJob(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Kind     string `json:"kind"`
		InputURL string `json:"input_url"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	// Accept only uploads, so nobody can make this server fetch URLs of their choice.
	match := uploadSource.FindStringSubmatch(body.InputURL)
	if match == nil {
		fail(w, badRequest("input_url must be the input_url of an upload."))
		return
	}
	// The same key for the same upload and kind: a retried request answers the same job, never a second one.
	var job *json.RawMessage
	var err error
	if body.Kind == "jobs" {
		job, err = CreateJob(body.InputURL, "jobs-"+match[1])
	} else {
		job, err = Transcode(body.InputURL, "transcode-"+match[1])
	}
	if err != nil {
		fail(w, err)
		return
	}
	reply(w, http.StatusAccepted, job)
}

// snippet:end create-route

func getJob(w http.ResponseWriter, r *http.Request) {
	job, err := GetJob(r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	reply(w, http.StatusOK, job)
}

// snippet:start download-route
func download(w http.ResponseWriter, r *http.Request) {
	// A fresh link each time: signed links expire within an hour.
	link, err := OutputURL(r.PathValue("id"), r.PathValue("alias"))
	if err != nil {
		fail(w, err)
		return
	}
	http.Redirect(w, r, link, http.StatusFound)
}

// snippet:end download-route

// snippet:start webhook
func webhook(w http.ResponseWriter, r *http.Request) {
	// The raw body, exactly as received: parsed and serialized again, it no longer matches the
	// signature. It is the whole job, up to several hundred KB; 2 MB leaves room.
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 2<<20))
	if err != nil {
		w.WriteHeader(http.StatusRequestEntityTooLarge)
		return
	}
	event, err := VerifyWebhook(body, r.Header)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	id := r.Header.Get("webhook-id")
	handledMu.Lock()
	seen := handled[id]
	handled[id] = true
	handledMu.Unlock()
	if !seen {
		onJobEnded(event)
	}
	// Answer 2xx within seconds; do slow work in a queue of your own.
	w.WriteHeader(http.StatusNoContent)
}

// snippet:end webhook

// snippet:start routes
func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(page)
	})
	mux.HandleFunc("POST /api/uploads", createUpload)
	mux.HandleFunc("POST /api/jobs", createJob)
	mux.HandleFunc("GET /api/jobs/{id}", getJob)
	mux.HandleFunc("GET /api/jobs/{id}/outputs/{alias}", download)
	mux.HandleFunc("POST /webhooks/videxo", webhook)
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	log.Printf("http://localhost:%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

// snippet:end routes
