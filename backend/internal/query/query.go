// Package query builds parameterized SQL for GET /api/data and the xlsx export.
//
// Filtering is limited to two fields:
//   - wagons: a set of № вагона (wagon_number) values.
//   - operation_date, only in "period" mode, as an inclusive date range.
//
// Two modes:
//   - "current" (default) — поточна дислокація: the single most recent row per
//     wagon (DISTINCT ON wagon_number, latest operation_date).
//   - "period" — дислокація за період: every row whose operation_date falls in
//     [date_from, date_to] (inclusive).
//
// Ordering is always wagon_number ASC, then operation_date ASC.
package query

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"dislocator/backend/internal/columns"
)

// Table is the data table name.
const Table = "dislocation"

var allowedPageSizes = map[int]bool{25: true, 50: true, 100: true, 200: true}

// Built is a fully constructed query.
type Built struct {
	DataSQL  string
	CountSQL string
	// Args are positional args ($1..$n) shared by DataSQL and CountSQL.
	Args     []interface{}
	Page     int
	PageSize int
}

// Build constructs the paginated data query and its matching count query.
func Build(vals url.Values) Built {
	page := 1
	if p, err := strconv.Atoi(vals.Get("page")); err == nil && p > 0 {
		page = p
	}
	pageSize := 50
	if ps, err := strconv.Atoi(vals.Get("page_size")); err == nil && allowedPageSizes[ps] {
		pageSize = ps
	}

	conds, args, wagonPos := buildConditions(vals)
	where := whereClause(conds)
	current := isCurrent(vals)

	core := coreSelect(current, where, wagonPos)
	offset := (page - 1) * pageSize
	dataSQL := fmt.Sprintf("%s LIMIT %d OFFSET %d", core, pageSize, offset)

	var countSQL string
	if current {
		// One row per wagon → count distinct wagons matching the filter.
		countSQL = fmt.Sprintf("SELECT COUNT(DISTINCT wagon_number) FROM %s%s", Table, where)
	} else {
		countSQL = fmt.Sprintf("SELECT COUNT(*) FROM %s%s", Table, where)
	}

	return Built{
		DataSQL:  dataSQL,
		CountSQL: countSQL,
		Args:     args,
		Page:     page,
		PageSize: pageSize,
	}
}

// BuildExport builds SQL selecting id + all columns for every matching row
// (no pagination), honoring the same filters/mode/order as Build.
func BuildExport(vals url.Values) (string, []interface{}) {
	conds, args, wagonPos := buildConditions(vals)
	where := whereClause(conds)
	return coreSelect(isCurrent(vals), where, wagonPos), args
}

// BuildExportByIDs builds SQL selecting id + all columns for the given row ids,
// ordered by id. Used to export a manual selection.
func BuildExportByIDs(ids []int64) (string, []interface{}) {
	sql := fmt.Sprintf("SELECT %s FROM %s WHERE id = ANY($1) ORDER BY id", selectList(), Table)
	return sql, []interface{}{ids}
}

// coreSelect returns the ordered, un-paginated SELECT for the given mode.
//
// Row order: within each wagon, operation_date ASC. Across wagons, when a wagon
// list was provided (wagonPos > 0) rows follow the order the wagons were entered
// (array_position in that list); otherwise they fall back to wagon_number ASC.
func coreSelect(current bool, where string, wagonPos int) string {
	cols := selectList()

	// Leading ORDER BY expression for the wagon grouping.
	wagonOrder := "wagon_number ASC"
	if wagonPos > 0 {
		wagonOrder = fmt.Sprintf("array_position($%d, wagon_number)", wagonPos)
	}

	if current {
		// DISTINCT ON keeps the latest row per wagon (inner order picks it); the
		// outer query then arranges the wagons in the requested order.
		inner := fmt.Sprintf(
			"SELECT DISTINCT ON (wagon_number) %s FROM %s%s ORDER BY wagon_number, operation_date DESC NULLS LAST",
			cols, Table, where,
		)
		return fmt.Sprintf("SELECT * FROM (%s) t ORDER BY %s, operation_date ASC", inner, wagonOrder)
	}
	return fmt.Sprintf(
		"SELECT %s FROM %s%s ORDER BY %s, operation_date ASC NULLS LAST",
		cols, Table, where, wagonOrder,
	)
}

// isCurrent reports whether the request is in "current" mode (the default).
func isCurrent(vals url.Values) bool {
	return vals.Get("mode") != "period"
}

func whereClause(conds []string) string {
	if len(conds) == 0 {
		return ""
	}
	return " WHERE " + strings.Join(conds, " AND ")
}

// buildConditions builds the WHERE conditions and positional args, in a
// deterministic order so DataSQL and CountSQL can share the same args. It also
// returns wagonPos: the 1-based positional-arg index of the wagons array (or 0
// if no wagon list was given), used by ORDER BY to sort by input order.
func buildConditions(vals url.Values) ([]string, []interface{}, int) {
	var conds []string
	var args []interface{}
	ph := func(v interface{}) string {
		args = append(args, v)
		return "$" + strconv.Itoa(len(args))
	}

	wagonPos := 0
	if wagons := parseWagons(vals.Get("wagons")); len(wagons) > 0 {
		placeholder := ph(wagons) // e.g. "$1"
		wagonPos, _ = strconv.Atoi(strings.TrimPrefix(placeholder, "$"))
		conds = append(conds, "wagon_number = ANY("+placeholder+")")
	}

	if !isCurrent(vals) {
		if f := strings.TrimSpace(vals.Get("date_from")); f != "" {
			if t, ok := parseDay(f); ok {
				conds = append(conds, "operation_date >= "+ph(t))
			}
		}
		if to := strings.TrimSpace(vals.Get("date_to")); to != "" {
			if t, ok := parseDay(to); ok {
				conds = append(conds, "operation_date <= "+ph(endOfDay(t)))
			}
		}
	}

	return conds, args, wagonPos
}

// parseWagons parses a comma-separated list of wagon numbers into a
// deduplicated []int64 (non-numeric tokens are ignored).
func parseWagons(raw string) []int64 {
	seen := make(map[int64]bool)
	var out []int64
	for _, tok := range strings.Split(raw, ",") {
		tok = strings.TrimSpace(tok)
		if tok == "" {
			continue
		}
		n, err := strconv.ParseInt(tok, 10, 64)
		if err != nil || seen[n] {
			continue
		}
		seen[n] = true
		out = append(out, n)
	}
	return out
}

func selectList() string {
	parts := []string{"id"}
	for _, c := range columns.All() {
		parts = append(parts, quoteIdent(c.Key))
	}
	return strings.Join(parts, ", ")
}

func quoteIdent(id string) string {
	return `"` + strings.ReplaceAll(id, `"`, `""`) + `"`
}

func parseDay(s string) (time.Time, bool) {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}

func endOfDay(day time.Time) time.Time {
	return time.Date(day.Year(), day.Month(), day.Day(), 23, 59, 59, int(999*time.Millisecond), time.UTC)
}
