// Command server runs the dislocator backend HTTP API.
package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"dislocator/backend/internal/auth"
	"dislocator/backend/internal/config"
	"dislocator/backend/internal/db"
	"dislocator/backend/internal/handlers"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	if err := db.SeedAdmin(ctx, pool, cfg.AdminLogin, cfg.AdminPassword); err != nil {
		log.Fatalf("seed: %v", err)
	}

	mgr := auth.NewManager(cfg.JWTSecret)
	api := handlers.New(pool, mgr, cfg)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	allowedOrigins := []string{"*"}
	if cfg.FrontendURL != "" {
		allowedOrigins = []string{cfg.FrontendURL}
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Route("/api", func(r chi.Router) {
		// Public.
		r.Get("/health", api.Health)
		r.Get("/columns", api.Columns)
		r.Post("/auth/login", api.Login)
		r.Get("/signup-links/{token}", api.GetSignupLink)
		r.Post("/register", api.Register)

		// Authenticated.
		r.Group(func(r chi.Router) {
			r.Use(mgr.RequireAuth)
			r.Get("/auth/me", api.Me)
			r.Get("/data", api.Data)
			r.Get("/data/export", api.Export)

			// Admin-only.
			r.Group(func(r chi.Router) {
				r.Use(mgr.RequireAdmin)
				r.Post("/admin/signup-links", api.CreateSignupLink)
				r.Post("/admin/imports", api.Upload)
				r.Post("/admin/data/delete", api.DeleteData)
			})
		})
	})

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("dislocator backend listening on :%s", cfg.Port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server: %v", err)
	}
}
