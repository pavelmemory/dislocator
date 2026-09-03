package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"dislocator/backend/internal/columns"
	"dislocator/backend/internal/parser"
	"dislocator/backend/internal/query"
)

// parseIDList parses a comma-separated list of positive int64 ids, ignoring
// blanks and non-numeric tokens, de-duplicating while preserving order.
func parseIDList(raw string) []int64 {
	seen := make(map[int64]bool)
	var out []int64
	for _, tok := range strings.Split(raw, ",") {
		tok = strings.TrimSpace(tok)
		if tok == "" {
			continue
		}
		n, err := strconv.ParseInt(tok, 10, 64)
		if err != nil || n <= 0 || seen[n] {
			continue
		}
		seen[n] = true
		out = append(out, n)
	}
	return out
}

// vcol is a column selected for the export: its registry metadata, its index
// within columns.All() (for reading values), and its 1-based output position.
type vcol struct {
	meta   columns.Column
	regIdx int
	pos    int
}

// visibleColumns returns the columns to write, in registry order, filtered to
// the requested keys (comma-separated). № п/п occupies output column 1, so the
// first data column is at position 2. An empty/absent list means all columns.
func visibleColumns(param string) []vcol {
	all := columns.All()
	var want map[string]bool
	if s := strings.TrimSpace(param); s != "" {
		want = make(map[string]bool)
		for _, tok := range strings.Split(s, ",") {
			if tok = strings.TrimSpace(tok); tok != "" {
				want[tok] = true
			}
		}
	}
	var out []vcol
	pos := 2
	for i, c := range all {
		if want != nil && !want[c.Key] {
			continue
		}
		out = append(out, vcol{meta: c, regIdx: i, pos: pos})
		pos++
	}
	if len(out) == 0 { // nothing matched → fall back to all columns
		pos = 2
		for i, c := range all {
			out = append(out, vcol{meta: c, regIdx: i, pos: pos})
			pos++
		}
	}
	return out
}

// Export streams the filtered/sorted rows (no pagination) as an .xlsx file that
// mirrors the source format: a two-row header with the ВРП ВУ-23 / ВРП ВУ-36
// groups, native date cells, and a leading "№ п/п" column numbered from 1.
func (a *API) Export(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// When `ids` is provided, export exactly those rows (a manual selection),
	// ignoring the column filters. Otherwise export the current filtered/sorted
	// view.
	var sql string
	var args []interface{}
	if raw := strings.TrimSpace(r.URL.Query().Get("ids")); raw != "" {
		ids := parseIDList(raw)
		if len(ids) == 0 {
			writeErr(w, http.StatusBadRequest, "no valid ids provided")
			return
		}
		sql, args = query.BuildExportByIDs(ids)
	} else {
		sql, args = query.BuildExport(r.URL.Query())
	}

	rows, err := a.Pool.Query(ctx, sql, args...)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "query error: "+err.Error())
		return
	}
	defer rows.Close()

	f := excelize.NewFile()
	defer f.Close()

	sheet := parser.SheetName // "Висновок"
	f.SetSheetName(f.GetSheetName(0), sheet)

	// Determine which columns to include. The frontend passes `columns` = the
	// user's currently visible column keys; hidden columns are omitted. Order is
	// the original registry order (regardless of the order the keys arrive in),
	// so the source file layout — including the group headers — stays stable.
	// Absent/empty `columns` means all columns.
	vcols := visibleColumns(r.URL.Query().Get("columns"))

	// Number-format styles for date / datetime columns.
	dateFmt := "dd.mm.yyyy"
	dateTimeFmt := "dd.mm.yyyy hh:mm"
	styleDate, err := f.NewStyle(&excelize.Style{CustomNumFmt: &dateFmt})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "export error: "+err.Error())
		return
	}
	styleDateTime, err := f.NewStyle(&excelize.Style{CustomNumFmt: &dateTimeFmt})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "export error: "+err.Error())
		return
	}
	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
	})

	setCell := func(col, row int, v interface{}) {
		axis, _ := excelize.CoordinatesToCellName(col, row)
		_ = f.SetCellValue(sheet, axis, v)
	}
	mergeRange := func(c1, r1, c2, r2 int) {
		a1, _ := excelize.CoordinatesToCellName(c1, r1)
		a2, _ := excelize.CoordinatesToCellName(c2, r2)
		_ = f.MergeCell(sheet, a1, a2)
	}

	// --- headers ---
	// Column 1: "№ п/п", spanning both header rows.
	setCell(1, 1, "№ п/п")
	mergeRange(1, 1, 1, 2)

	for i := 0; i < len(vcols); {
		c := vcols[i]
		if c.meta.Group == nil {
			// Standalone column: label spans both header rows.
			setCell(c.pos, 1, c.meta.Label)
			mergeRange(c.pos, 1, c.pos, 2)
			i++
			continue
		}
		// Grouped run: group label on row 1 spanning the run; sub-labels on row 2.
		g := *c.meta.Group
		start := i
		for i < len(vcols) && vcols[i].meta.Group != nil && *vcols[i].meta.Group == g {
			i++
		}
		end := i - 1
		setCell(vcols[start].pos, 1, g)
		mergeRange(vcols[start].pos, 1, vcols[end].pos, 1)
		for j := start; j <= end; j++ {
			setCell(vcols[j].pos, 2, vcols[j].meta.Label)
		}
	}

	// Style header block A1:..row 2.
	lastCol := 1 + len(vcols)
	h1, _ := excelize.CoordinatesToCellName(1, 1)
	h2, _ := excelize.CoordinatesToCellName(lastCol, 2)
	_ = f.SetCellStyle(sheet, h1, h2, headerStyle)

	// --- data rows (start at row 3) ---
	rowIdx := 3
	n := 1
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error: "+err.Error())
			return
		}
		setCell(1, rowIdx, n) // № п/п
		for _, c := range vcols {
			v := vals[c.regIdx+1] // vals[0] = id
			if v == nil {
				continue
			}
			axis, _ := excelize.CoordinatesToCellName(c.pos, rowIdx)
			switch t := v.(type) {
			case time.Time:
				_ = f.SetCellValue(sheet, axis, t)
				if c.meta.Type == columns.TypeDate {
					_ = f.SetCellStyle(sheet, axis, axis, styleDate)
				} else {
					_ = f.SetCellStyle(sheet, axis, axis, styleDateTime)
				}
			default:
				_ = f.SetCellValue(sheet, axis, v)
			}
		}
		rowIdx++
		n++
	}
	if err := rows.Err(); err != nil {
		writeErr(w, http.StatusInternalServerError, "query error: "+err.Error())
		return
	}

	// Freeze the two header rows for convenience.
	_ = f.SetPanes(sheet, &excelize.Panes{
		Freeze:      true,
		YSplit:      2,
		TopLeftCell: "A3",
		ActivePane:  "bottomLeft",
	})

	filename := fmt.Sprintf("dislocation_export_%s.xlsx", time.Now().Format("20060102_1504"))
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	if err := f.Write(w); err != nil {
		// Response already partially written; nothing more we can do.
		return
	}
}
