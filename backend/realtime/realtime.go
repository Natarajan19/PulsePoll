package realtime

import (
	"context"
	"net/http"
	"time"

	"pulsepoll/repositories"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

func PublishVote(ctx context.Context, rdb *redis.Client, pollID, payload string) error {
	return rdb.Publish(ctx, "poll:"+pollID, payload).Err()
}

func HandleWebSocket(repo *repositories.Repository, rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		pollID := c.Param("pollID")
		if _, err := repo.GetPollByID(c.Request.Context(), pollID); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
			return
		}
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		pub := rdb.Subscribe(ctx, "poll:"+pollID)
		defer pub.Close()
		if err := pub.Ping(ctx); err != nil {
			return
		}
		if results, err := repo.Results(ctx, pollID); err == nil {
			_ = conn.WriteJSON(gin.H{"type": "snapshot", "results": results})
		}
		go func() {
			for {
				if _, _, err := conn.ReadMessage(); err != nil {
					cancel()
					return
				}
			}
		}()
		ch := pub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				results, err := repo.Results(ctx, pollID)
				if err != nil {
					continue
				}
				_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
				if err := conn.WriteJSON(gin.H{"type": "results", "results": results, "event": msg.Payload}); err != nil {
					return
				}
			}
		}
	}
}
