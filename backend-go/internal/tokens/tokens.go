// Package tokens issues Sanctum-compatible personal access tokens. Laravel's
// own format (Laravel\Sanctum\HasApiTokens::generateTokenString) is
// Str::random(40) + hash('crc32b', that). The exact generation algorithm
// doesn't need to match byte-for-byte for interop - Sanctum's findToken()
// only ever compares sha256(plaintext) against the stored hash - so any
// sufficiently random plaintext is valid; this uses crypto/rand directly.
package tokens

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
)

// Generate returns a random plaintext token and its sha256 hex hash (the
// value stored in personal_access_tokens.token). Combine with the row id as
// "{id}|{plaintext}" for the value handed back to the client.
func Generate() (plaintext, hash string, err error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	plaintext = hex.EncodeToString(buf)
	sum := sha256.Sum256([]byte(plaintext))
	hash = hex.EncodeToString(sum[:])
	return plaintext, hash, nil
}
