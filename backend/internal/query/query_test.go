package query

import (
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestBuildMultiTextAndDatetimeRange(t *testing.T) {
	vals := url.Values{}
	vals.Set("f_rps", "ПВ,ЦС")
	vals.Set("f_operation_date_from", "2026-09-01")
	vals.Set("f_operation_date_to", "2026-09-02")

	got := Build(vals)

	wantCount := `SELECT COUNT(*) FROM dislocation WHERE ` +
		`("rps" ILIKE $1 OR "rps" ILIKE $2) AND ` +
		`("operation_date" >= $3 AND "operation_date" <= $4)`
	if got.CountSQL != wantCount {
		t.Fatalf("CountSQL mismatch:\n got: %s\nwant: %s", got.CountSQL, wantCount)
	}

	if !strings.HasSuffix(got.DataSQL, "ORDER BY id ASC LIMIT 50 OFFSET 0") {
		t.Fatalf("DataSQL suffix mismatch: %s", got.DataSQL)
	}
	if !strings.HasPrefix(got.DataSQL, `SELECT id, "wagon_number",`) {
		t.Fatalf("DataSQL prefix mismatch: %s", got.DataSQL)
	}

	if len(got.Args) != 4 {
		t.Fatalf("expected 4 args, got %d: %v", len(got.Args), got.Args)
	}
	if got.Args[0] != "%ПВ%" {
		t.Fatalf("arg0 = %v, want %%ПВ%%", got.Args[0])
	}
	if got.Args[1] != "%ЦС%" {
		t.Fatalf("arg1 = %v, want %%ЦС%%", got.Args[1])
	}
	wantFrom := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	if a, ok := got.Args[2].(time.Time); !ok || !a.Equal(wantFrom) {
		t.Fatalf("arg2 = %v, want %s", got.Args[2], wantFrom)
	}
	wantTo := time.Date(2026, 9, 2, 23, 59, 59, int(999*time.Millisecond), time.UTC)
	if a, ok := got.Args[3].(time.Time); !ok || !a.Equal(wantTo) {
		t.Fatalf("arg3 = %v, want %s", got.Args[3], wantTo)
	}

	if got.Page != 1 || got.PageSize != 50 {
		t.Fatalf("page/pageSize = %d/%d, want 1/50", got.Page, got.PageSize)
	}
}

func TestBuildIntegerFilterSkipsNonNumericAndPaging(t *testing.T) {
	vals := url.Values{}
	vals.Set("f_wagon_number", "123,abc,456")
	vals.Set("page", "3")
	vals.Set("page_size", "100")
	vals.Set("sort", "wagon_number:desc,bogus:asc,operation_date:asc")

	got := Build(vals)

	wantCount := `SELECT COUNT(*) FROM dislocation WHERE ` +
		`("wagon_number" = $1 OR "wagon_number" = $2)`
	if got.CountSQL != wantCount {
		t.Fatalf("CountSQL mismatch:\n got: %s\nwant: %s", got.CountSQL, wantCount)
	}
	if len(got.Args) != 2 || got.Args[0] != int64(123) || got.Args[1] != int64(456) {
		t.Fatalf("args = %v, want [123 456]", got.Args)
	}
	// offset = (3-1)*100 = 200; invalid sort key "bogus" dropped.
	if !strings.HasSuffix(got.DataSQL, `ORDER BY "wagon_number" DESC, "operation_date" ASC LIMIT 100 OFFSET 200`) {
		t.Fatalf("DataSQL ordering/paging mismatch: %s", got.DataSQL)
	}
}

func TestBuildDefaultsAndNoFilters(t *testing.T) {
	got := Build(url.Values{})
	if got.CountSQL != "SELECT COUNT(*) FROM dislocation" {
		t.Fatalf("empty CountSQL mismatch: %s", got.CountSQL)
	}
	if !strings.HasSuffix(got.DataSQL, "ORDER BY id ASC LIMIT 50 OFFSET 0") {
		t.Fatalf("default DataSQL suffix mismatch: %s", got.DataSQL)
	}
	if len(got.Args) != 0 {
		t.Fatalf("expected no args, got %v", got.Args)
	}
}

func TestBuildDateSingleDayOnDateColumn(t *testing.T) {
	vals := url.Values{}
	// planned_repair_date is a DATE column (search=range).
	vals.Set("f_planned_repair_date", "2028-02-08")
	got := Build(vals)
	wantCount := `SELECT COUNT(*) FROM dislocation WHERE ` +
		`("planned_repair_date" >= $1 AND "planned_repair_date" <= $2)`
	if got.CountSQL != wantCount {
		t.Fatalf("CountSQL mismatch:\n got: %s\nwant: %s", got.CountSQL, wantCount)
	}
	// For a DATE column, upper bound is the day itself (no end-of-day time).
	wantDay := time.Date(2028, 2, 8, 0, 0, 0, 0, time.UTC)
	if a, ok := got.Args[1].(time.Time); !ok || !a.Equal(wantDay) {
		t.Fatalf("arg1 = %v, want %s", got.Args[1], wantDay)
	}
}
