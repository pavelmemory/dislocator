// Package query builds parameterized SQL for GET /api/data from request
// parameters, using only whitelisted column keys from the registry.
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
	// DataSQL selects id + all columns with WHERE/ORDER/LIMIT/OFFSET.
	DataSQL string
	// CountSQL counts all matching rows (WHERE only).
	CountSQL string
	// Args are positional args for the WHERE clause ($1..$n). They are shared
	// by DataSQL and CountSQL (DataSQL appends LIMIT/OFFSET as literals).
	Args     []interface{}
	Page     int
	PageSize int
}

type sortSpec struct {
	key string
	dir string // "ASC" | "DESC"
}

// Build constructs the query from url values.
func Build(vals url.Values) Built {
	page := 1
	if p, err := strconv.Atoi(vals.Get("page")); err == nil && p > 0 {
		page = p
	}
	pageSize := 50
	if ps, err := strconv.Atoi(vals.Get("page_size")); err == nil && allowedPageSizes[ps] {
		pageSize = ps
	}

	where, args := buildWhere(vals)
	orderBy := buildOrderBy(vals.Get("sort"))

	selectCols := selectList()
	whereSQL := ""
	if where != "" {
		whereSQL = " WHERE " + where
	}

	offset := (page - 1) * pageSize
	dataSQL := fmt.Sprintf(
		"SELECT %s FROM %s%s ORDER BY %s LIMIT %d OFFSET %d",
		selectCols, Table, whereSQL, orderBy, pageSize, offset,
	)
	countSQL := fmt.Sprintf("SELECT COUNT(*) FROM %s%s", Table, whereSQL)

	return Built{
		DataSQL:  dataSQL,
		CountSQL: countSQL,
		Args:     args,
		Page:     page,
		PageSize: pageSize,
	}
}

// BuildExport builds SQL selecting id + all columns for every row matching the
// same filters and sort as Build, but without pagination (used by xlsx export).
func BuildExport(vals url.Values) (string, []interface{}) {
	where, args := buildWhere(vals)
	orderBy := buildOrderBy(vals.Get("sort"))
	whereSQL := ""
	if where != "" {
		whereSQL = " WHERE " + where
	}
	sql := fmt.Sprintf("SELECT %s FROM %s%s ORDER BY %s", selectList(), Table, whereSQL, orderBy)
	return sql, args
}

// BuildExportByIDs builds SQL selecting id + all columns for the given row ids,
// ordered by id. Used to export a manual selection.
func BuildExportByIDs(ids []int64) (string, []interface{}) {
	sql := fmt.Sprintf("SELECT %s FROM %s WHERE id = ANY($1) ORDER BY id", selectList(), Table)
	return sql, []interface{}{ids}
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

// buildWhere returns the WHERE body (without the WHERE keyword) and args.
func buildWhere(vals url.Values) (string, []interface{}) {
	var clauses []string
	var args []interface{}
	ph := func(v interface{}) string {
		args = append(args, v)
		return "$" + strconv.Itoa(len(args))
	}

	for _, col := range columns.All() {
		ident := quoteIdent(col.Key)
		switch col.Search {
		case "multi":
			raw := vals.Get("f_" + col.Key)
			if raw == "" {
				continue
			}
			values := splitValues(raw)
			var ors []string
			for _, v := range values {
				v = strings.TrimSpace(v)
				if v == "" {
					continue
				}
				if col.Type == columns.TypeInteger {
					if n, err := strconv.ParseInt(v, 10, 64); err == nil {
						ors = append(ors, ident+" = "+ph(n))
					}
					// non-numeric values are ignored
				} else {
					ors = append(ors, ident+" ILIKE "+ph("%"+v+"%"))
				}
			}
			if len(ors) > 0 {
				clauses = append(clauses, "("+strings.Join(ors, " OR ")+")")
			}

		case "range":
			from := strings.TrimSpace(vals.Get("f_" + col.Key + "_from"))
			to := strings.TrimSpace(vals.Get("f_" + col.Key + "_to"))
			single := strings.TrimSpace(vals.Get("f_" + col.Key))

			var conds []string
			if from != "" || to != "" {
				if from != "" {
					if t, ok := parseDay(from); ok {
						conds = append(conds, ident+" >= "+ph(t))
					}
				}
				if to != "" {
					if t, ok := parseDay(to); ok {
						conds = append(conds, ident+" <= "+ph(upperBound(col, t)))
					}
				}
			} else if single != "" {
				if t, ok := parseDay(single); ok {
					conds = append(conds, ident+" >= "+ph(t))
					conds = append(conds, ident+" <= "+ph(upperBound(col, t)))
				}
			}
			if len(conds) > 0 {
				clauses = append(clauses, "("+strings.Join(conds, " AND ")+")")
			}
		}
	}

	return strings.Join(clauses, " AND "), args
}

// upperBound returns the inclusive upper bound for a day. For datetime columns
// it is the end of the day; for date columns it is the day itself.
func upperBound(col columns.Column, day time.Time) time.Time {
	if col.Type == columns.TypeDateTime {
		return time.Date(day.Year(), day.Month(), day.Day(), 23, 59, 59, int(999*time.Millisecond), time.UTC)
	}
	return day
}

func parseDay(s string) (time.Time, bool) {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}

// splitValues splits a comma-separated filter value.
func splitValues(s string) []string {
	return strings.Split(s, ",")
}

func buildOrderBy(sortParam string) string {
	specs := parseSort(sortParam)
	if len(specs) == 0 {
		return "id ASC"
	}
	var parts []string
	for _, s := range specs {
		if s.key == "id" {
			parts = append(parts, "id "+s.dir)
		} else {
			parts = append(parts, quoteIdent(s.key)+" "+s.dir)
		}
	}
	return strings.Join(parts, ", ")
}

func parseSort(sortParam string) []sortSpec {
	if strings.TrimSpace(sortParam) == "" {
		return nil
	}
	var out []sortSpec
	for _, tok := range strings.Split(sortParam, ",") {
		tok = strings.TrimSpace(tok)
		if tok == "" {
			continue
		}
		key := tok
		dir := "ASC"
		if i := strings.IndexByte(tok, ':'); i >= 0 {
			key = strings.TrimSpace(tok[:i])
			d := strings.ToLower(strings.TrimSpace(tok[i+1:]))
			if d == "desc" {
				dir = "DESC"
			}
		}
		if key == "id" || columns.Has(key) {
			out = append(out, sortSpec{key: key, dir: dir})
		}
	}
	return out
}
