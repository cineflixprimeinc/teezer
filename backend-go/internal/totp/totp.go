// Package totp ports App\Services\TwoFactorService's verify(): RFC 6238
// TOTP, SHA1, 6 digits, 30-second period, ±1 step window - the exact same
// parameters, so a code from the user's existing authenticator app (set up
// against Laravel) verifies identically here.
package totp

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"regexp"
	"strings"
	"time"
)

const (
	digits = 6
	period = 30
)

var nonDigits = regexp.MustCompile(`\D`)

// Verify mirrors TwoFactorService::verify($secret, $code, $window = 1).
func Verify(secret, code string, window int) bool {
	code = nonDigits.ReplaceAllString(code, "")
	if len(code) != digits {
		return false
	}

	currentStep := time.Now().Unix() / period
	for i := -window; i <= window; i++ {
		if hmac.Equal([]byte(codeForStep(secret, currentStep+int64(i))), []byte(code)) {
			return true
		}
	}
	return false
}

func codeForStep(secret string, step int64) string {
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(secret))
	if err != nil {
		return ""
	}

	var counter [8]byte
	binary.BigEndian.PutUint64(counter[:], uint64(step))

	mac := hmac.New(sha1.New, key)
	mac.Write(counter[:])
	sum := mac.Sum(nil)

	offset := sum[len(sum)-1] & 0x0f
	value := (uint32(sum[offset]&0x7f) << 24) |
		(uint32(sum[offset+1]) << 16) |
		(uint32(sum[offset+2]) << 8) |
		uint32(sum[offset+3])

	mod := uint32(1)
	for i := 0; i < digits; i++ {
		mod *= 10
	}
	return fmt.Sprintf("%0*d", digits, value%mod)
}
