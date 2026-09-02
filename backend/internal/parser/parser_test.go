package parser

import (
	"os"
	"testing"
	"time"
)

func TestParseSample(t *testing.T) {
	f, err := os.Open("../../testdata/sample.xlsx")
	if err != nil {
		t.Fatalf("open sample: %v", err)
	}
	defer f.Close()

	res, err := Parse(f)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got := len(res.Rows); got != 459 {
		t.Fatalf("expected 459 data rows, got %d", got)
	}

	first := res.Rows[0]

	// operation_date of the first row must be 2026-09-01 06:23.
	od, ok := first["operation_date"].(time.Time)
	if !ok {
		t.Fatalf("operation_date is not a time.Time: %T (%v)", first["operation_date"], first["operation_date"])
	}
	want := time.Date(2026, 9, 1, 6, 23, 0, 0, time.UTC)
	if !od.Equal(want) {
		t.Fatalf("operation_date = %s, want %s", od.Format(time.RFC3339), want.Format(time.RFC3339))
	}
	if got := od.Format("2006-01-02T15:04"); got != "2026-09-01T06:23" {
		t.Fatalf("operation_date formatted = %s, want 2026-09-01T06:23", got)
	}

	// wagon_number should be a coerced integer.
	if wn, ok := first["wagon_number"].(int64); !ok || wn != 62939939 {
		t.Fatalf("wagon_number = %v (%T), want int64 62939939", first["wagon_number"], first["wagon_number"])
	}

	// text trimming.
	if rps, ok := first["rps"].(string); !ok || rps != "ПВ" {
		t.Fatalf("rps = %q (%T), want trimmed \"ПВ\"", first["rps"], first["rps"])
	}
}
