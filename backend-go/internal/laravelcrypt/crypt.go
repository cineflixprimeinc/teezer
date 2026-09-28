// Package laravelcrypt ports the read side of Laravel's
// Illuminate\Encryption\Encrypter (AES-256-CBC, config('app.cipher') for
// this app) - just enough to decrypt values Laravel encrypted with
// Crypt::encryptString(), e.g. users.two_factor_secret. No encrypt side:
// nothing here needs to write a value Laravel will later decrypt.
package laravelcrypt

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
)

type Decrypter struct {
	key []byte // raw 32 bytes, for aes-256-cbc
}

// New parses APP_KEY exactly as Laravel's EncryptionServiceProvider does:
// strip the "base64:" prefix (always present for keys Laravel itself
// generated) and base64-decode to the raw key.
func New(appKey string) (*Decrypter, error) {
	raw := strings.TrimPrefix(appKey, "base64:")
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, errors.New("laravelcrypt: APP_KEY is not valid base64")
	}
	if len(key) != 32 {
		return nil, errors.New("laravelcrypt: APP_KEY is not a 32-byte key (expected AES-256-CBC)")
	}
	return &Decrypter{key: key}, nil
}

type payload struct {
	IV    string `json:"iv"`
	Value string `json:"value"`
	MAC   string `json:"mac"`
	Tag   string `json:"tag"`
}

// DecryptString mirrors Encrypter::decryptString(): base64-decode the outer
// envelope, verify the HMAC-SHA256 MAC (computed over the *string* iv+value
// fields, matching Laravel's own hash() step), then AES-256-CBC-decrypt and
// strip PKCS7 padding.
func (d *Decrypter) DecryptString(encoded string) (string, error) {
	envelope, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", errors.New("laravelcrypt: invalid payload")
	}

	var p payload
	if err := json.Unmarshal(envelope, &p); err != nil {
		return "", errors.New("laravelcrypt: invalid payload")
	}
	if p.IV == "" || p.Value == "" || p.MAC == "" {
		return "", errors.New("laravelcrypt: invalid payload")
	}

	expectedMAC := hmacHex(p.IV+p.Value, d.key)
	if subtle.ConstantTimeCompare([]byte(expectedMAC), []byte(p.MAC)) != 1 {
		return "", errors.New("laravelcrypt: MAC is invalid")
	}

	iv, err := base64.StdEncoding.DecodeString(p.IV)
	if err != nil || len(iv) != aes.BlockSize {
		return "", errors.New("laravelcrypt: invalid iv")
	}

	// Laravel's openssl_encrypt(..., $options=0, ...) base64-encodes the raw
	// ciphertext before it ever reaches the JSON envelope, so `value` here
	// is base64-of-raw-ciphertext, not raw-ciphertext itself.
	ciphertext, err := base64.StdEncoding.DecodeString(p.Value)
	if err != nil || len(ciphertext) == 0 || len(ciphertext)%aes.BlockSize != 0 {
		return "", errors.New("laravelcrypt: invalid ciphertext")
	}

	block, err := aes.NewCipher(d.key)
	if err != nil {
		return "", err
	}
	plaintext := make([]byte, len(ciphertext))
	cipher.NewCBCDecrypter(block, iv).CryptBlocks(plaintext, ciphertext)

	unpadded, err := pkcs7Unpad(plaintext, aes.BlockSize)
	if err != nil {
		return "", err
	}
	return string(unpadded), nil
}

func hmacHex(data string, key []byte) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))
}

func pkcs7Unpad(data []byte, blockSize int) ([]byte, error) {
	n := len(data)
	if n == 0 || n%blockSize != 0 {
		return nil, errors.New("laravelcrypt: invalid padding")
	}
	padLen := int(data[n-1])
	if padLen == 0 || padLen > blockSize || padLen > n {
		return nil, errors.New("laravelcrypt: invalid padding")
	}
	for _, b := range data[n-padLen:] {
		if int(b) != padLen {
			return nil, errors.New("laravelcrypt: invalid padding")
		}
	}
	return data[:n-padLen], nil
}
