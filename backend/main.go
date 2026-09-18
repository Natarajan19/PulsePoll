package main

import (
	"context"
	"log"
	"os"
	"strings"
	"time"

	"pulsepoll/controllers"
	"pulsepoll/middleware"
	"pulsepoll/realtime"
	"pulsepoll/repositories"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func main() {
	_ = godotenv.Load()
	port := env("PORT", "8080")
	mongoURI := os.Getenv("MONGODB_URI")
	if mongoURI == "" {
		log.Fatal("MONGODB_URI is required")
	}
	dbName := env("MONGODB_DATABASE", "pulsepoll")
	redisURL := env("REDIS_URL", "redis://localhost:6379/0")
	jwtSecret := os.Getenv("JWT_SECRET")
	if len(jwtSecret) < 32 {
		log.Fatal("JWT_SECRET must be at least 32 characters")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	client, err := mongo.Connect(options.Client().ApplyURI(mongoURI))
	if err != nil {
		log.Fatal(err)
	}
	defer client.Disconnect(context.Background())
	if err = client.Ping(ctx, nil); err != nil {
		log.Fatalf("MongoDB connection failed: %v", err)
	}
	redisOpts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatal(err)
	}
	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()
	if err = rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("Redis connection failed: %v", err)
	}
	repo := repositories.NewRepository(client.Database(dbName))
	if err := repo.Init(ctx); err != nil {
		log.Fatal(err)
	}
	auth := controllers.NewAuthController(repo, jwtSecret)
	polls := controllers.NewPollController(repo, rdb)
	r := gin.Default()
	frontend := env("FRONTEND_URL", "http://localhost:5173")
	r.Use(cors.New(cors.Config{AllowOrigins: []string{frontend}, AllowMethods: []string{"GET", "POST", "OPTIONS"}, AllowHeaders: []string{"Origin", "Content-Type", "Authorization", "X-Voter-ID"}, AllowCredentials: false}))
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok", "service": "PulsePoll API"}) })
	api := r.Group("/api")
	authGroup := api.Group("/auth")
	authGroup.POST("/register", auth.Register)
	authGroup.POST("/login", auth.Login)
	authGroup.GET("/me", middleware.RequireAuth(jwtSecret), auth.Me)
	public := api.Group("/polls")
	public.GET("/:shareCode", polls.GetPoll)
	public.GET("/:shareCode/results", polls.Results)
	public.POST("/:shareCode/vote", polls.Vote)
	creator := api.Group("/polls", middleware.RequireAuth(jwtSecret))
	creator.POST("", polls.CreatePoll)
	api.GET("/ws/:pollID", realtime.HandleWebSocket(repo, rdb))
	log.Printf("PulsePoll API running on http://localhost:%s", port)
	log.Printf("Frontend origin: %s", frontend)
	log.Fatal(r.Run(":" + port))
}
