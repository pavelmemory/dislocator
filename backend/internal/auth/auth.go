// Package auth provides JWT issuing/verification and HTTP middleware.
package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// TTL is the access-token lifetime.
const TTL = 12 * time.Hour

// Roles.
const (
	RoleAdmin  = "admin"
	RoleViewer = "viewer"
)

type ctxKey string

const claimsKey ctxKey = "claims"

// Claims is the JWT payload.
type Claims struct {
	Role string `json:"role"`
	jwt.RegisteredClaims
}

// Manager issues and verifies tokens with a fixed secret.
type Manager struct {
	secret []byte
}

// NewManager builds a token manager from the HS256 secret.
func NewManager(secret string) *Manager {
	return &Manager{secret: []byte(secret)}
}

// Issue creates a signed token for the given login and role.
func (m *Manager) Issue(login, role string) (string, time.Time, error) {
	exp := time.Now().Add(TTL)
	claims := Claims{
		Role: role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   login,
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := tok.SignedString(m.secret)
	return s, exp, err
}

// Parse verifies a token string and returns its claims.
func (m *Manager) Parse(tokenStr string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrTokenSignatureInvalid
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, err
	}
	return claims, nil
}

// FromContext returns the claims stored on the request context.
func FromContext(ctx context.Context) (*Claims, bool) {
	c, ok := ctx.Value(claimsKey).(*Claims)
	return c, ok
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// RequireAuth ensures a valid bearer token is present.
func (m *Manager) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			writeErr(w, http.StatusUnauthorized, "missing bearer token")
			return
		}
		claims, err := m.Parse(strings.TrimSpace(strings.TrimPrefix(h, "Bearer ")))
		if err != nil {
			writeErr(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}
		ctx := context.WithValue(r.Context(), claimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireAdmin ensures the authenticated user has the admin role. Must be
// chained after RequireAuth.
func (m *Manager) RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := FromContext(r.Context())
		if !ok {
			writeErr(w, http.StatusUnauthorized, "not authenticated")
			return
		}
		if claims.Role != RoleAdmin {
			writeErr(w, http.StatusForbidden, "admin role required")
			return
		}
		next.ServeHTTP(w, r)
	})
}
