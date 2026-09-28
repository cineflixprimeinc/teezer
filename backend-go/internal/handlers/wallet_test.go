package handlers

import (
	"math"
	"testing"
)

func TestPhpIntCast(t *testing.T) {
	cases := map[string]int64{
		"100":    100,
		"20":     20,
		"":       0,
		"0":      0,
		"-5":     -5,
		"12abc":  12,
		"3.9":    3, // (int) stops at the decimal point
		"  42  ": 42,
		"abc":    0,
	}
	for in, want := range cases {
		if got := phpIntCast(in); got != want {
			t.Errorf("phpIntCast(%q) = %d, want %d", in, got, want)
		}
	}
}

func TestPhpFloatCast(t *testing.T) {
	cases := map[string]float64{
		"30":     30,
		"10":     10,
		"0.19":   0.19,
		"4.99":   4.99,
		"2000.0": 2000,
		"1.5x":   1.5,
		"":       0,
		"abc":    0,
	}
	for in, want := range cases {
		if got := phpFloatCast(in); got != want {
			t.Errorf("phpFloatCast(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestPhpRound(t *testing.T) {
	// Mirrors PHP round($x, 6): half away from zero, matching per_coin_usd.
	cases := []struct {
		x    float64
		want float64
	}{
		{0.19 / 15, 0.012667},
		{2000.0 / 200000, 0.01},
		{0.29 / 23, 0.012609},
	}
	for _, c := range cases {
		if got := phpRound(c.x, 6); math.Abs(got-c.want) > 1e-12 {
			t.Errorf("phpRound(%v, 6) = %v, want %v", c.x, got, c.want)
		}
	}
}

func TestFilterValidateBool(t *testing.T) {
	truthy := []string{"1", "true", "on", "yes", "TRUE", "On", "YES"}
	falsy := []string{"0", "false", "off", "no", "", "2", "anything"}
	for _, s := range truthy {
		if !filterValidateBool(s) {
			t.Errorf("filterValidateBool(%q) = false, want true", s)
		}
	}
	for _, s := range falsy {
		if filterValidateBool(s) {
			t.Errorf("filterValidateBool(%q) = true, want false", s)
		}
	}
}

func TestResolveCurrentPage(t *testing.T) {
	cases := map[string]int{"": 1, "1": 1, "3": 3, "0": 1, "-2": 1, "abc": 1}
	for in, want := range cases {
		if got := resolveCurrentPage(in); got != want {
			t.Errorf("resolveCurrentPage(%q) = %d, want %d", in, got, want)
		}
	}
}
