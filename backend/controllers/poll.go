package controllers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"pulsepoll/models"
	"pulsepoll/realtime"
	"pulsepoll/repositories"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type PollController struct {
	repo  *repositories.Repository
	redis *redis.Client
}

func NewPollController(repo *repositories.Repository, rdb *redis.Client) *PollController {
	return &PollController{repo: repo, redis: rdb}
}

type CreatePollRequest struct {
	Question string   `json:"question"`
	Type     string   `json:"type"`
	Options  []string `json:"options"`
}
type VoteRequest struct {
	OptionID string `json:"optionId"`
}

func (pc *PollController) CreatePoll(c *gin.Context) {
	var req CreatePollRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}
	req.Question = strings.TrimSpace(req.Question)
	if len(req.Question) < 5 || len(req.Question) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Question must be between 5 and 200 characters"})
		return
	}
	if req.Type != "single" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Only single-choice polls are supported"})
		return
	}
	if len(req.Options) < 2 || len(req.Options) > 10 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Provide between 2 and 10 options"})
		return
	}
	options := make([]models.PollOption, 0, len(req.Options))
	seen := map[string]bool{}
	for _, raw := range req.Options {
		text := strings.TrimSpace(raw)
		key := strings.ToLower(text)
		if len(text) < 1 || len(text) > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Each option must be between 1 and 100 characters"})
			return
		}
		if seen[key] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Options must be unique"})
			return
		}
		seen[key] = true
		options = append(options, models.PollOption{ID: uuid.NewString(), Text: text})
	}
	code := ""
	var err error
	for i := 0; i < 10; i++ {
		code = strings.ToUpper(uuid.NewString()[:6])
		_, err = pc.repo.GetPollByCode(c.Request.Context(), code)
		if repositories.IsNotFound(err) {
			break
		}
	}
	if err != nil && !repositories.IsNotFound(err) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not generate poll code"})
		return
	}
	p := &models.Poll{ID: uuid.NewString(), ShareCode: code, Question: req.Question, Type: req.Type, Options: options, CreatedBy: c.GetString("userID"), Status: "live", CreatedAt: time.Now()}
	if err := pc.repo.CreatePoll(c.Request.Context(), p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create poll"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Poll created successfully", "poll": p})
}

func (pc *PollController) GetPoll(c *gin.Context) {
	p, err := pc.repo.GetPollByCode(c, c.Param("shareCode"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"poll": p})
}
func (pc *PollController) Results(c *gin.Context) {
	p, err := pc.repo.GetPollByCode(c, c.Param("shareCode"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
		return
	}
	results, err := pc.repo.Results(c.Request.Context(), p.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load results"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"results": results})
}

func (pc *PollController) Vote(c *gin.Context) {
	var req VoteRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.OptionID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A valid optionId is required"})
		return
	}
	p, err := pc.repo.GetPollByCode(c, c.Param("shareCode"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
		return
	}
	if p.Status != "live" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Poll is not live"})
		return
	}
	valid := false
	for _, o := range p.Options {
		if o.ID == req.OptionID {
			valid = true
			break
		}
	}
	if !valid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid option"})
		return
	}
	voter := strings.TrimSpace(c.GetHeader("X-Voter-ID"))
	if len(voter) < 8 || len(voter) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid voter ID"})
		return
	}
	v := &models.Vote{ID: uuid.NewString(), PollID: p.ID, OptionID: req.OptionID, VoterID: voter, CreatedAt: time.Now()}
	if err := pc.repo.CreateVote(c.Request.Context(), v); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "You have already voted in this poll"})
		return
	}
	payload, _ := json.Marshal(gin.H{"type": "vote", "pollId": p.ID, "vote": v})
	_ = realtime.PublishVote(context.Background(), pc.redis, p.ID, string(payload))
	c.JSON(http.StatusCreated, gin.H{"message": "Vote submitted successfully", "vote": v})
}
