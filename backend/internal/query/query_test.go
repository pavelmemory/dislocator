package query

import (
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestBuildCurrentModeDefault(t *testing.T) {
	got := Build(url.Values{})

	// Current mode: DISTINCT ON per wagon, latest operation_date, no filter.
	if !strings.Contains(got.DataSQL, "SELECT DISTINCT ON (wagon_number)") {
		t.Fatalf("expected DISTINCT ON in current-mode DataSQL: %s", got.DataSQL)
	}
	if !strings.Contains(got.DataSQL, "ORDER BY wagon_number, operation_date DESC NULLS LAST") {
		t.Fatalf("expected inner desc order: %s", got.DataSQL)
	}
	if !strings.HasSuffix(got.DataSQL, "ORDER BY wagon_number ASC, operation_date ASC LIMIT 50 OFFSET 0") {
		t.Fatalf("expected outer asc order + paging: %s", got.DataSQL)
	}
	if got.CountSQL != "SELECT COUNT(DISTINCT wagon_number) FROM dislocation" {
		t.Fatalf("count mismatch: %s", got.CountSQL)
	}
	if len(got.Args) != 0 {
		t.Fatalf("expected no args, got %v", got.Args)
	}
}

func TestBuildCurrentModeWithWagons(t *testing.T) {
	vals := url.Values{}
	vals.Set("wagons", "123, 456 , abc,123") // dupes + non-numeric ignored
	got := Build(vals)

	if !strings.Contains(got.DataSQL, "wagon_number = ANY($1)") {
		t.Fatalf("expected wagon filter: %s", got.DataSQL)
	}
	if got.CountSQL != "SELECT COUNT(DISTINCT wagon_number) FROM dislocation WHERE wagon_number = ANY($1)" {
		t.Fatalf("count mismatch: %s", got.CountSQL)
	}
	if len(got.Args) != 1 {
		t.Fatalf("expected 1 arg, got %v", got.Args)
	}
	ids, ok := got.Args[0].([]int64)
	if !ok || len(ids) != 2 || ids[0] != 123 || ids[1] != 456 {
		t.Fatalf("wagon arg mismatch: %v", got.Args[0])
	}
}

func TestBuildPeriodMode(t *testing.T) {
	vals := url.Values{}
	vals.Set("mode", "period")
	vals.Set("wagons", "777")
	vals.Set("date_from", "2026-09-01")
	vals.Set("date_to", "2026-09-02")
	vals.Set("page", "2")
	vals.Set("page_size", "100")
	got := Build(vals)

	if strings.Contains(got.DataSQL, "DISTINCT ON") {
		t.Fatalf("period mode must not use DISTINCT ON: %s", got.DataSQL)
	}
	if !strings.Contains(got.DataSQL, "operation_date >= $2") ||
		!strings.Contains(got.DataSQL, "operation_date <= $3") {
		t.Fatalf("expected date range conditions: %s", got.DataSQL)
	}
	if !strings.HasSuffix(got.DataSQL, "ORDER BY wagon_number ASC, operation_date ASC NULLS LAST LIMIT 100 OFFSET 100") {
		t.Fatalf("order/paging mismatch: %s", got.DataSQL)
	}
	if got.CountSQL != "SELECT COUNT(*) FROM dislocation WHERE wagon_number = ANY($1) AND operation_date >= $2 AND operation_date <= $3" {
		t.Fatalf("count mismatch: %s", got.CountSQL)
	}
	if len(got.Args) != 3 {
		t.Fatalf("expected 3 args, got %v", got.Args)
	}
	wantFrom := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	if a, ok := got.Args[1].(time.Time); !ok || !a.Equal(wantFrom) {
		t.Fatalf("date_from arg = %v, want %s", got.Args[1], wantFrom)
	}
	wantTo := time.Date(2026, 9, 2, 23, 59, 59, int(999*time.Millisecond), time.UTC)
	if a, ok := got.Args[2].(time.Time); !ok || !a.Equal(wantTo) {
		t.Fatalf("date_to arg = %v, want %s", got.Args[2], wantTo)
	}
}

func TestBuildExportCurrentMode(t *testing.T) {
	sql, args := BuildExport(url.Values{})
	if !strings.Contains(sql, "DISTINCT ON (wagon_number)") {
		t.Fatalf("export current mode should use DISTINCT ON: %s", sql)
	}
	if strings.Contains(sql, "LIMIT") {
		t.Fatalf("export must not paginate: %s", sql)
	}
	if len(args) != 0 {
		t.Fatalf("expected no args, got %v", args)
	}
}

func TestBuildExportByIDs(t *testing.T) {
	sql, args := BuildExportByIDs([]int64{1, 2, 3})
	if !strings.Contains(sql, "WHERE id = ANY($1) ORDER BY id") {
		t.Fatalf("unexpected export-by-ids SQL: %s", sql)
	}
	if len(args) != 1 {
		t.Fatalf("expected 1 arg, got %v", args)
	}
}
