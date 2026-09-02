// Package migrations embeds the SQL migration files so the binary is
// self-contained (no runtime dependency on the migrations directory).
package migrations

import "embed"

// FS holds all migration SQL files.
//
//go:embed *.sql
var FS embed.FS
