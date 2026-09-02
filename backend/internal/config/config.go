// Package config loads runtime configuration from environment variables.
package config

import (
	"fmt"
	"os"
)

// Config holds all backend runtime configuration.
type Config struct {
	DatabaseURL string
	JWTSecret   string
	FrontendURL string
	Port        string
	// Initial admin, seeded on first startup only (if the login does not yet
	// exist). Defaults to test/test for local development; set strong values in
	// any public deployment.
	AdminLogin    string
	AdminPassword string
}

// Load reads configuration from the environment, applying defaults where
// allowed. Only PORT and the initial admin credentials have defaults.
func Load() (Config, error) {
	c := Config{
		DatabaseURL:   os.Getenv("DATABASE_URL"),
		JWTSecret:     os.Getenv("JWT_SECRET"),
		FrontendURL:   os.Getenv("FRONTEND_URL"),
		Port:          os.Getenv("PORT"),
		AdminLogin:    os.Getenv("ADMIN_LOGIN"),
		AdminPassword: os.Getenv("ADMIN_PASSWORD"),
	}
	if c.Port == "" {
		c.Port = "8080"
	}
	if c.AdminLogin == "" {
		c.AdminLogin = "test"
	}
	if c.AdminPassword == "" {
		c.AdminPassword = "test"
	}
	if c.DatabaseURL == "" {
		return c, fmt.Errorf("DATABASE_URL is required")
	}
	if c.JWTSecret == "" {
		return c, fmt.Errorf("JWT_SECRET is required")
	}
	return c, nil
}
