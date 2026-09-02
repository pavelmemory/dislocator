// Package parser reads a dislocation .xlsx file into typed rows.
package parser

import (
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"dislocator/backend/internal/columns"
)

// SheetName is the expected sheet; if absent the first sheet is used.
const SheetName = "Висновок"

// Result is the outcome of parsing a file.
type Result struct {
	// Rows are ordered; each row maps column key -> value
	// (int64 | string | time.Time | nil).
	Rows     []map[string]interface{}
	Warnings []string
}

// dateLayouts are fallbacks for date/datetime cells stored as text.
var dateLayouts = []string{
	"2006-01-02T15:04:05",
	"2006-01-02 15:04:05",
	"2006-01-02 15:04",
	"02.01.2006 15:04:05",
	"02.01.2006 15:04",
	"2006-01-02",
	"02.01.2006",
}

// Parse reads xlsx bytes from r and returns typed rows plus warnings.
func Parse(r io.Reader) (*Result, error) {
	f, err := excelize.OpenReader(r)
	if err != nil {
		return nil, fmt.Errorf("open xlsx: %w", err)
	}
	defer f.Close()

	sheet := SheetName
	found := false
	for _, s := range f.GetSheetList() {
		if s == SheetName {
			found = true
			break
		}
	}
	if !found {
		list := f.GetSheetList()
		if len(list) == 0 {
			return nil, fmt.Errorf("workbook has no sheets")
		}
		sheet = list[0]
	}

	grid, err := f.GetRows(sheet)
	if err != nil {
		return nil, fmt.Errorf("read rows: %w", err)
	}
	rowCount := len(grid)

	res := &Result{}
	rawOpt := excelize.Options{RawCellValue: true}

	// Data starts at row 3 (1-based). Header rows 1-2 skipped.
	for rowIdx := 3; rowIdx <= rowCount; rowIdx++ {
		// Data row if xlsx col 2 (№ вагона) is non-empty.
		wagonCell, _ := excelize.CoordinatesToCellName(2, rowIdx)
		wagonVal, _ := f.GetCellValue(sheet, wagonCell, rawOpt)
		if strings.TrimSpace(wagonVal) == "" {
			continue
		}

		row := make(map[string]interface{}, len(columns.All()))
		for _, col := range columns.All() {
			axis, _ := excelize.CoordinatesToCellName(col.XlsxCol, rowIdx)
			raw, _ := f.GetCellValue(sheet, axis, rawOpt)
			val, warn := coerce(col, raw)
			row[col.Key] = val
			if warn != "" {
				res.Warnings = append(res.Warnings,
					fmt.Sprintf("row %d, column %q: %s", rowIdx, col.Key, warn))
			}
		}
		res.Rows = append(res.Rows, row)
	}
	return res, nil
}

// coerce converts a raw cell string to the column's typed value. A non-empty
// but uncoercible cell yields (nil, warning).
func coerce(col columns.Column, raw string) (interface{}, string) {
	switch col.Type {
	case columns.TypeText:
		t := strings.TrimSpace(raw)
		if t == "" {
			return nil, ""
		}
		return t, ""

	case columns.TypeInteger:
		t := strings.TrimSpace(raw)
		if t == "" {
			return nil, ""
		}
		// Cells may be stored as floats (e.g. "3884" or "0"); accept whole numbers.
		if fv, err := strconv.ParseFloat(t, 64); err == nil {
			return int64(fv), ""
		}
		if iv, err := strconv.ParseInt(t, 10, 64); err == nil {
			return iv, ""
		}
		return nil, fmt.Sprintf("cannot parse integer from %q", raw)

	case columns.TypeDate, columns.TypeDateTime:
		t := strings.TrimSpace(raw)
		if t == "" {
			return nil, ""
		}
		// Excel stores dates as serial numbers.
		if serial, err := strconv.ParseFloat(t, 64); err == nil {
			tm, err := excelize.ExcelDateToTime(serial, false)
			if err != nil {
				return nil, fmt.Sprintf("cannot convert serial date %q: %v", raw, err)
			}
			return tm, ""
		}
		for _, layout := range dateLayouts {
			if tm, err := time.Parse(layout, t); err == nil {
				return tm, ""
			}
		}
		return nil, fmt.Sprintf("cannot parse date from %q", raw)

	default:
		t := strings.TrimSpace(raw)
		if t == "" {
			return nil, ""
		}
		return t, ""
	}
}
