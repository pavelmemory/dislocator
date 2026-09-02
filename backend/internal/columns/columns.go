// Package columns loads and exposes the shared column registry embedded from
// columns.json (identical copy of docs/columns.json).
package columns

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed columns.json
var raw []byte

// Type enumerates the supported column value types.
type Type string

const (
	TypeText     Type = "text"
	TypeInteger  Type = "integer"
	TypeDate     Type = "date"
	TypeDateTime Type = "datetime"
)

// Column is a single entry of the registry.
type Column struct {
	Key     string  `json:"key"`
	Group   *string `json:"group"`
	Label   string  `json:"label"`
	Type    Type    `json:"type"`
	Search  string  `json:"search"`
	XlsxCol int     `json:"xlsx_col"`
}

type file struct {
	Columns []Column `json:"columns"`
}

var (
	all   []Column
	byKey map[string]Column
	// rawColumns is the exact JSON array served by GET /api/columns.
	rawColumns json.RawMessage
)

func init() {
	var f file
	if err := json.Unmarshal(raw, &f); err != nil {
		panic(fmt.Sprintf("columns: cannot parse embedded columns.json: %v", err))
	}
	if len(f.Columns) != 34 {
		panic(fmt.Sprintf("columns: expected 34 columns, got %d", len(f.Columns)))
	}
	all = f.Columns
	byKey = make(map[string]Column, len(all))
	for _, c := range all {
		byKey[c.Key] = c
	}

	// Preserve the raw ".columns" array for the API response.
	var probe struct {
		Columns json.RawMessage `json:"columns"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		panic(fmt.Sprintf("columns: cannot extract raw columns array: %v", err))
	}
	rawColumns = probe.Columns
}

// All returns the ordered column list.
func All() []Column { return all }

// RawJSON returns the raw JSON array of columns (as in columns.json).
func RawJSON() json.RawMessage { return rawColumns }

// Get returns the column for a key and whether it exists.
func Get(key string) (Column, bool) {
	c, ok := byKey[key]
	return c, ok
}

// Has reports whether key is a valid column key.
func Has(key string) bool {
	_, ok := byKey[key]
	return ok
}

// SQLType maps a column type to its Postgres column type.
func (c Column) SQLType() string {
	switch c.Type {
	case TypeInteger:
		return "BIGINT"
	case TypeText:
		return "TEXT"
	case TypeDate:
		return "DATE"
	case TypeDateTime:
		return "TIMESTAMP"
	default:
		return "TEXT"
	}
}
