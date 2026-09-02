// Package handlers implements the HTTP API described in CONTRACT.md.
package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"dislocator/backend/internal/auth"
	"dislocator/backend/internal/columns"
	"dislocator/backend/internal/config"
	"dislocator/backend/internal/parser"
	"dislocator/backend/internal/query"
)

// API bundles handler dependencies.
type API struct {
	Pool *pgxpool.Pool
	Auth *auth.Manager
	Cfg  config.Config
}

// New builds an API.
func New(pool *pgxpool.Pool, mgr *auth.Manager, cfg config.Config) *API {
	return &API{Pool: pool, Auth: mgr, Cfg: cfg}
}

// --- helpers ---

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeJSON(r *http.Request, dst interface{}) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

// --- health & columns ---

// Health responds with service status.
func (a *API) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Columns returns the embedded columns array.
func (a *API) Columns(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(columns.RawJSON())
}

// --- auth ---

type loginReq struct {
	Login    string `json:"login"`
	Password string `json:"password"`
}

// Login verifies credentials and returns a JWT.
func (a *API) Login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Login == "" || req.Password == "" {
		writeErr(w, http.StatusBadRequest, "login and password are required")
		return
	}
	var hash, role string
	err := a.Pool.QueryRow(r.Context(),
		`SELECT password_hash, role FROM users WHERE login=$1`, req.Login,
	).Scan(&hash, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "database error")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	token, _, err := a.Auth.Issue(req.Login, role)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "cannot issue token")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token": token, "role": role, "login": req.Login,
	})
}

// Me returns the authenticated user's identity.
func (a *API) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"login": claims.Subject, "role": claims.Role,
	})
}

// --- signup links ---

type signupLinkReq struct {
	Role string `json:"role"`
}

// CreateSignupLink issues a one-time registration link (admin only).
func (a *API) CreateSignupLink(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())
	var req signupLinkReq
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Role != auth.RoleAdmin && req.Role != auth.RoleViewer {
		writeErr(w, http.StatusBadRequest, "role must be 'admin' or 'viewer'")
		return
	}
	token := uuid.New()
	expires := time.Now().Add(24 * time.Hour)
	_, err := a.Pool.Exec(r.Context(),
		`INSERT INTO signup_links(token, role, expires_at, created_by)
		 VALUES($1,$2,$3,$4)`, token, req.Role, expires, claims.Subject)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "cannot create signup link")
		return
	}
	url := a.Cfg.FrontendURL + "/register?token=" + token.String()
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"token":      token.String(),
		"role":       req.Role,
		"expires_at": expires.Format(time.RFC3339),
		"url":        url,
	})
}

// GetSignupLink validates a signup link and reports its status.
func (a *API) GetSignupLink(w http.ResponseWriter, r *http.Request) {
	tokenStr := chi.URLParam(r, "token")
	token, err := uuid.Parse(tokenStr)
	if err != nil {
		writeErr(w, http.StatusNotFound, "signup link not found")
		return
	}
	var role string
	var expires time.Time
	var usedAt *time.Time
	err = a.Pool.QueryRow(r.Context(),
		`SELECT role, expires_at, used_at FROM signup_links WHERE token=$1`, token,
	).Scan(&role, &expires, &usedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "signup link not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "database error")
		return
	}
	valid := usedAt == nil && expires.After(time.Now())
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"role":       role,
		"expires_at": expires.Format(time.RFC3339),
		"valid":      valid,
	})
}

type registerReq struct {
	Token    string `json:"token"`
	Login    string `json:"login"`
	Password string `json:"password"`
}

// Register consumes a signup link and creates a user.
func (a *API) Register(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Login == "" || len(req.Password) < 4 {
		writeErr(w, http.StatusBadRequest, "login required and password must be at least 4 characters")
		return
	}
	token, err := uuid.Parse(req.Token)
	if err != nil {
		writeErr(w, http.StatusGone, "signup link is invalid or expired")
		return
	}

	ctx := r.Context()
	tx, err := a.Pool.Begin(ctx)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "database error")
		return
	}
	defer tx.Rollback(ctx)

	var role string
	var expires time.Time
	var usedAt *time.Time
	err = tx.QueryRow(ctx,
		`SELECT role, expires_at, used_at FROM signup_links WHERE token=$1 FOR UPDATE`, token,
	).Scan(&role, &expires, &usedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusGone, "signup link is invalid or expired")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "database error")
		return
	}
	if usedAt != nil || !expires.After(time.Now()) {
		writeErr(w, http.StatusGone, "signup link is invalid or expired")
		return
	}

	// Login uniqueness.
	var exists bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE login=$1)`, req.Login,
	).Scan(&exists); err != nil {
		writeErr(w, http.StatusInternalServerError, "database error")
		return
	}
	if exists {
		writeErr(w, http.StatusConflict, "login already taken")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "cannot hash password")
		return
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO users(login, password_hash, role) VALUES($1,$2,$3)`,
		req.Login, string(hash), role); err != nil {
		writeErr(w, http.StatusInternalServerError, "cannot create user")
		return
	}
	if _, err := tx.Exec(ctx,
		`UPDATE signup_links SET used_at=now() WHERE token=$1`, token); err != nil {
		writeErr(w, http.StatusInternalServerError, "cannot consume signup link")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeErr(w, http.StatusInternalServerError, "database error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"login": req.Login, "role": role,
	})
}

// --- imports (upload) ---

// Upload parses an xlsx and appends its rows as a new import (admin only).
func (a *API) Upload(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())

	if err := r.ParseMultipartForm(64 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "missing file field")
		return
	}
	defer file.Close()

	result, err := parser.Parse(file)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]interface{}{
			"error": "cannot parse file: " + err.Error(),
		})
		return
	}
	if len(result.Rows) == 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]interface{}{
			"error":    "no data rows found in file",
			"warnings": result.Warnings,
		})
		return
	}

	ctx := r.Context()
	tx, err := a.Pool.Begin(ctx)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "database error")
		return
	}
	defer tx.Rollback(ctx)

	var importID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO imports(filename, uploaded_by, row_count)
		 VALUES($1,$2,$3) RETURNING id`,
		header.Filename, claims.Subject, len(result.Rows),
	).Scan(&importID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "cannot create import record")
		return
	}

	// Upsert on the business key (wagon_number, operation_station_code,
	// operation, operation_date). A matching existing row is UPDATED (all
	// columns + import_id) rather than duplicated. RETURNING (xmax = 0)
	// distinguishes inserts (true) from updates (false).
	upsertSQL := buildUpsertSQL()
	batch := &pgx.Batch{}
	for _, row := range result.Rows {
		args := make([]interface{}, 0, len(columns.All())+1)
		args = append(args, importID)
		for _, c := range columns.All() {
			args = append(args, row[c.Key])
		}
		batch.Queue(upsertSQL, args...)
	}

	br := tx.SendBatch(ctx, batch)
	inserted, updated := 0, 0
	batchErr := error(nil)
	for range result.Rows {
		var wasInsert bool
		if err := br.QueryRow().Scan(&wasInsert); err != nil {
			batchErr = err
			break
		}
		if wasInsert {
			inserted++
		} else {
			updated++
		}
	}
	if err := br.Close(); err != nil && batchErr == nil {
		batchErr = err
	}
	if batchErr != nil {
		writeErr(w, http.StatusInternalServerError, "cannot store rows: "+batchErr.Error())
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeErr(w, http.StatusInternalServerError, "database error")
		return
	}

	resp := map[string]interface{}{
		"import_id": importID,
		"row_count": len(result.Rows),
		"inserted":  inserted,
		"updated":   updated,
	}
	if len(result.Warnings) > 0 {
		resp["warnings"] = result.Warnings
	}
	writeJSON(w, http.StatusCreated, resp)
}

// buildUpsertSQL constructs the INSERT ... ON CONFLICT ... DO UPDATE statement
// for a single dislocation row (import_id + all registry columns), keyed on the
// business-key columns. Placeholders are $1..$N in (import_id, cols...) order.
func buildUpsertSQL() string {
	cols := columns.All()
	names := make([]string, 0, len(cols)+1)
	placeholders := make([]string, 0, len(cols)+1)
	names = append(names, "import_id")
	placeholders = append(placeholders, "$1")
	for i, c := range cols {
		names = append(names, `"`+c.Key+`"`)
		placeholders = append(placeholders, fmt.Sprintf("$%d", i+2))
	}

	// On conflict, refresh import_id and every column from the incoming row.
	setParts := []string{"import_id = EXCLUDED.import_id"}
	for _, c := range cols {
		setParts = append(setParts, fmt.Sprintf(`"%s" = EXCLUDED."%s"`, c.Key, c.Key))
	}

	return fmt.Sprintf(
		`INSERT INTO %s (%s) VALUES (%s)
		 ON CONFLICT (wagon_number, operation_station_code, operation, operation_date)
		 DO UPDATE SET %s
		 RETURNING (xmax = 0) AS inserted`,
		query.Table,
		strings.Join(names, ", "),
		strings.Join(placeholders, ", "),
		strings.Join(setParts, ", "),
	)
}

// --- data query ---

// Data returns filtered, sorted, paginated dislocation rows.
func (a *API) Data(w http.ResponseWriter, r *http.Request) {
	built := query.Build(r.URL.Query())
	ctx := r.Context()

	var total int64
	if err := a.Pool.QueryRow(ctx, built.CountSQL, built.Args...).Scan(&total); err != nil {
		writeErr(w, http.StatusInternalServerError, "query error: "+err.Error())
		return
	}

	rows, err := a.Pool.Query(ctx, built.DataSQL, built.Args...)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "query error: "+err.Error())
		return
	}
	defer rows.Close()

	cols := columns.All()
	out := make([]map[string]interface{}, 0)
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error: "+err.Error())
			return
		}
		obj := make(map[string]interface{}, len(cols)+1)
		// vals[0] = id, then columns in registry order.
		obj["id"] = vals[0]
		for i, c := range cols {
			obj[c.Key] = formatValue(vals[i+1])
		}
		out = append(out, obj)
	}
	if err := rows.Err(); err != nil {
		writeErr(w, http.StatusInternalServerError, "query error: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"rows":      out,
		"total":     total,
		"page":      built.Page,
		"page_size": built.PageSize,
	})
}

// DeleteData removes the given rows by id (admin only).
type deleteReq struct {
	IDs []int64 `json:"ids"`
}

func (a *API) DeleteData(w http.ResponseWriter, r *http.Request) {
	var req deleteReq
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if len(req.IDs) == 0 {
		writeErr(w, http.StatusBadRequest, "no ids provided")
		return
	}
	tag, err := a.Pool.Exec(r.Context(),
		`DELETE FROM dislocation WHERE id = ANY($1)`, req.IDs)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "delete error: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"deleted": tag.RowsAffected()})
}

// formatValue converts DB values to JSON-friendly forms: dates/datetimes to
// ISO 8601 strings, everything else unchanged (nil -> null).
func formatValue(v interface{}) interface{} {
	switch t := v.(type) {
	case time.Time:
		return t.Format("2006-01-02T15:04:05")
	default:
		return v
	}
}
