// Package storage is the Go port of Laravel's App\Services\StorageService - the
// write side of media, on Backblaze B2 (S3-compatible).
//
// The read side already existed in Go (config.MediaBaseURL + mediaJoin turn a
// stored key into a URL); this adds Put and Delete so a Go handler can accept an
// upload. Key format matches Laravel's exactly - {directory}/YYYY/MM/uuid.ext -
// so a key written by either backend is readable by the other, and the media
// worker's prefix rules apply the same way.
//
// B2 is addressed virtual-hosted style through its S3 endpoint, mirroring the
// b2 disk in config/filesystems.php. Objects are read back from MEDIA_URL (the
// Cloudflare Worker), never from the S3 endpoint - the bucket is private and
// only the Worker holds credentials to read it.
package storage

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

// Config is the b2 disk, from the B2_* env the Laravel app already uses.
type Config struct {
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
	Endpoint        string // https://s3.<region>.backblazeb2.com
	Region          string // must match the region in Endpoint
}

// Region is required, unlike on R2 where the literal "auto" worked for every
// account. B2 signs against a real region, so an empty one produces a signature
// the service rejects on every request - better to report "not configured" up
// front than to serve 403s that read like bad credentials.
func (c Config) configured() bool {
	return c.AccessKeyID != "" && c.SecretAccessKey != "" &&
		c.Bucket != "" && c.Endpoint != "" && c.Region != ""
}

// Service is the B2 client. A zero Service (unconfigured) is deliberately usable:
// its methods return ErrNotConfigured rather than panicking, so a build without
// B2 credentials still starts and only upload endpoints fail.
type Service struct {
	client *s3.Client
	bucket string
	// now is injected so the key's YYYY/MM is testable; defaults to time.Now.
	now func() time.Time
}

// ErrNotConfigured is returned by every method when the B2 credentials are absent.
var ErrNotConfigured = fmt.Errorf("storage: Backblaze B2 is not configured")

// New builds the client. It never dials B2 - the first request does that - so a
// bad endpoint surfaces on upload, not at boot.
func New(cfg Config) *Service {
	if !cfg.configured() {
		return &Service{now: time.Now}
	}

	client := s3.New(s3.Options{
		Region:       cfg.Region,
		Credentials:  credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		BaseEndpoint: aws.String(cfg.Endpoint),
		// Path-style (bucket in the path, not the host), matching the b2 disk's
		// use_path_style_endpoint = true. Required here because the bucket name
		// contains uppercase letters: virtual-hosted style would put it in the
		// hostname, DNS would lowercase it in transit, and the SigV4 signature
		// - computed over the original casing - would no longer match. B2 calls
		// that a 403 and says nothing about capitalisation.
		UsePathStyle: true,
	})

	return &Service{client: client, bucket: cfg.Bucket, now: time.Now}
}

// Configured reports whether uploads can be served at all.
func (s *Service) Configured() bool {
	return s.client != nil
}

// StoreImage is StorageService::storeImage: put the bytes under {directory} and
// return the key. directory is caller-supplied and NEVER from the request, so it
// cannot be steered outside the intended prefix.
func (s *Service) StoreImage(ctx context.Context, data []byte, directory, ext, contentType string) (string, error) {
	return s.put(ctx, data, directory, ext, contentType)
}

// Delete is StorageService::delete: remove a key, silently ignoring a blank one.
// B2's S3 DeleteObject is idempotent, so a missing key is not an error either -
// which also spares us the exists() round trip Laravel does.
func (s *Service) Delete(ctx context.Context, key string) error {
	if s.client == nil {
		return ErrNotConfigured
	}
	if key == "" {
		return nil
	}
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	return err
}

// buildKey mirrors StorageService::put's naming - {directory}/YYYY/MM/uuid.ext,
// lowercased extension defaulting to "bin", a v4 uuid for the name. Split out
// from put so it is testable without an S3 client. The date is UTC because
// Laravel's app timezone is UTC, so keys minted by the two backends land in the
// same folders.
func (s *Service) buildKey(directory, ext string) string {
	now := s.now().UTC()
	ext = strings.ToLower(strings.TrimPrefix(ext, "."))
	if ext == "" {
		ext = "bin"
	}
	path := fmt.Sprintf("%s/%04d/%02d", strings.Trim(directory, "/"), now.Year(), int(now.Month()))
	return fmt.Sprintf("%s/%s.%s", path, uuid.NewString(), ext)
}

// put mirrors StorageService::put.
func (s *Service) put(ctx context.Context, data []byte, directory, ext, contentType string) (string, error) {
	if s.client == nil {
		return "", ErrNotConfigured
	}

	key := s.buildKey(directory, ext)

	input := &s3.PutObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
		Body:   bytes.NewReader(data),
	}
	if contentType != "" {
		input.ContentType = aws.String(contentType)
	}
	if _, err := s.client.PutObject(ctx, input); err != nil {
		return "", err
	}
	return key, nil
}
