package main

// Every call this app makes to the Videxo API, with net/http. It is the only file that talks to
// Videxo, and it runs on the server only: it reads the API key.

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"

	standardwebhooks "github.com/standard-webhooks/standard-webhooks/libraries/go"
)

// The request bodies sit in requests/, next to the code.
var (
	//go:embed requests/transcode.json
	transcodeBody []byte
	//go:embed requests/jobs.json
	jobsBody []byte
)

type Upload struct {
	ID        string `json:"id"`
	InputURL  string `json:"input_url"`
	UploadURL string `json:"upload_url"`
}

// WebhookEvent is a webhook's body: the event, and the job as GET /v1/jobs/{id} answers it in Data.
type WebhookEvent struct {
	Type      string          `json:"type"`
	Timestamp string          `json:"timestamp"`
	Data      json.RawMessage `json:"data"`
}

// snippet:start request
// Problem is an error answer of the API: RFC 9457 problem details. Branch on Code (and Reason for
// the finer case); show Detail to people; quote RequestID to support.
type Problem struct {
	Type      string            `json:"type"`
	Title     string            `json:"title"`
	Status    int               `json:"status"`
	Detail    string            `json:"detail,omitempty"`
	Code      string            `json:"code,omitempty"`
	Reason    string            `json:"reason,omitempty"`
	Retryable bool              `json:"retryable"`
	RequestID string            `json:"request_id,omitempty"`
	Errors    []json.RawMessage `json:"errors,omitempty"`
}

func (p *Problem) Error() string { return p.Code + ": " + p.Detail }

// The client does not follow redirects: the download route reads the Location itself.
var client = &http.Client{
	Timeout:       60 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

func apiURL() string {
	if value := os.Getenv("VIDEXO_API_URL"); value != "" {
		return value
	}
	return "https://api.videxo.io"
}

// request sends one call and answers the response of a 2xx or 3xx; an error answer becomes a *Problem.
func request(method, path string, body any, idempotencyKey string) (*http.Response, error) {
	apiKey := os.Getenv("VIDEXO_API_KEY")
	if apiKey == "" {
		return nil, errors.New("set VIDEXO_API_KEY in the server environment")
	}
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequest(method, apiURL()+path, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	if res.StatusCode < 400 {
		return res, nil
	}
	defer res.Body.Close()
	problem := &Problem{}
	if json.NewDecoder(res.Body).Decode(problem) != nil || problem.Code == "" {
		// Not problem details: a proxy or the network answered, not the API.
		problem = &Problem{Type: "about:blank", Title: "The API answered with an error.", Status: res.StatusCode,
			Detail: fmt.Sprintf("HTTP %d", res.StatusCode), Code: "http_error"}
	}
	return nil, problem
}

// decode sends one call and reads its JSON answer into a value of type T.
func decode[T any](method, path string, body any, idempotencyKey string) (*T, error) {
	res, err := request(method, path, body, idempotencyKey)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	value := new(T)
	return value, json.NewDecoder(res.Body).Decode(value)
}

// snippet:end request

// withInput is a body from requests/ with the upload in place of its input, and the webhook URL when there is one.
func withInput(template []byte, set func(map[string]any)) (map[string]any, error) {
	body := map[string]any{}
	if err := json.Unmarshal(template, &body); err != nil {
		return nil, err
	}
	set(body)
	// A public https URL of this app's /webhooks/videxo (a tunnel in development); optional.
	if webhookURL := os.Getenv("VIDEXO_WEBHOOK_URL"); webhookURL != "" {
		body["webhook_url"] = webhookURL
	}
	return body, nil
}

// snippet:start create
// Transcode makes one MP4 from one input: POST /v1/transcode with the body in requests/transcode.json.
func Transcode(input, idempotencyKey string) (*json.RawMessage, error) {
	body, err := withInput(transcodeBody, func(body map[string]any) { body["input"] = input })
	if err != nil {
		return nil, err
	}
	return decode[json.RawMessage]("POST", "/v1/transcode", body, idempotencyKey)
}

// CreateJob makes several outputs from one input in one job: POST /v1/jobs with the body in requests/jobs.json.
func CreateJob(input, idempotencyKey string) (*json.RawMessage, error) {
	body, err := withInput(jobsBody, func(body map[string]any) { body["inputs"] = map[string]string{"talk": input} })
	if err != nil {
		return nil, err
	}
	return decode[json.RawMessage]("POST", "/v1/jobs", body, idempotencyKey)
}

// snippet:end create

// GetJob reads a job as the API answers it.
func GetJob(id string) (*json.RawMessage, error) {
	return decode[json.RawMessage]("GET", "/v1/jobs/"+url.PathEscape(id), nil, "")
}

// snippet:start upload
// CreateUpload makes a one-time upload URL for a file the browser sends straight to Videxo; the API key stays here.
func CreateUpload(filename string, sizeBytes int64, contentType string) (*Upload, error) {
	body := map[string]any{"filename": filename, "size_bytes": sizeBytes, "content_type": contentType}
	return decode[Upload]("POST", "/v1/uploads", body, "")
}

// snippet:end upload

// snippet:start download
// OutputURL is a fresh signed link to one output, from the redirect of GET /v1/jobs/{id}/outputs/{alias}.
func OutputURL(jobID, alias string) (string, error) {
	res, err := request("GET", "/v1/jobs/"+url.PathEscape(jobID)+"/outputs/"+url.PathEscape(alias), nil, "")
	if err != nil {
		return "", err
	}
	res.Body.Close()
	return res.Header.Get("Location"), nil
}

// snippet:end download

// snippet:start verify
// VerifyWebhook answers the event when the request is a webhook Videxo signed, in the last five
// minutes, and an error otherwise. body is the raw body exactly as received: parsed and serialized
// again, it no longer matches the signature.
func VerifyWebhook(body []byte, headers http.Header) (*WebhookEvent, error) {
	webhook, err := standardwebhooks.NewWebhook(os.Getenv("VIDEXO_WEBHOOK_SECRET"))
	if err != nil {
		return nil, err
	}
	if err := webhook.Verify(body, headers); err != nil {
		return nil, err
	}
	event := &WebhookEvent{}
	return event, json.Unmarshal(body, event)
}

// snippet:end verify
