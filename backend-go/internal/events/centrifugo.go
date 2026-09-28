package events

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// CentrifugoBridge is a Go port of server/app/Services/CentrifugoClient.php's
// broadcast() - same endpoint (/api/broadcast), same auth header (X-API-Key),
// same {channels, data} body shape, same short timeouts. Publishing through
// this (instead of each Go handler calling Centrifugo directly) is exactly
// what NATS buys: the HTTP call to Centrifugo happens once, off the request
// path, in the consumer - not once per like/comment/follow inside every
// handler.
type CentrifugoBridge struct {
	apiURL string
	apiKey string
	client *http.Client
}

func NewCentrifugoBridge(apiURL, apiKey string) *CentrifugoBridge {
	return &CentrifugoBridge{
		apiURL: apiURL,
		apiKey: apiKey,
		client: &http.Client{Timeout: 2 * time.Second},
	}
}

// Broadcast fans one {event, payload} envelope out to every room - identical
// wire format to CentrifugoClient::broadcast, so a client already listening
// for a Laravel-originated event needs no changes to also receive this one.
func (b *CentrifugoBridge) Broadcast(ev Event) error {
	if b == nil || b.apiURL == "" {
		return fmt.Errorf("centrifugo bridge not configured")
	}
	body, err := json.Marshal(map[string]any{
		"channels": ev.Rooms,
		"data":     map[string]any{"event": string(ev.Type), "payload": ev.Payload},
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, b.apiURL+"/api/broadcast", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", b.apiKey)

	resp, err := b.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("centrifugo broadcast: HTTP %d", resp.StatusCode)
	}
	return nil
}
