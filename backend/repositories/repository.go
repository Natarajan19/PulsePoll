package repositories

import (
	"context"
	"errors"
	"time"

	"pulsepoll/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Repository struct {
	DB *mongo.Database
}

func NewRepository(db *mongo.Database) *Repository {
	return &Repository{DB: db}
}

func (r *Repository) Init(ctx context.Context) error {
	return r.CreateIndexes(ctx)
}

func (r *Repository) CreateIndexes(ctx context.Context) error {
	polls := r.DB.Collection("polls")
	users := r.DB.Collection("users")
	votes := r.DB.Collection("votes")

	_, err := polls.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "shareCode", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return err
	}

	_, err = users.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return err
	}

	_, err = votes.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "pollId", Value: 1},
			{Key: "voterId", Value: 1},
		},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return err
	}

	return nil
}

func IsNotFound(err error) bool {
	return errors.Is(err, mongo.ErrNoDocuments)
}

func (r *Repository) CreateUser(ctx context.Context, user *models.User) error {
	_, err := r.DB.Collection("users").InsertOne(ctx, user)
	return err
}

func (r *Repository) FindUserByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	if err := r.DB.Collection("users").FindOne(ctx, bson.M{"email": email}).Decode(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *Repository) GetPollByCode(ctx context.Context, code string) (*models.Poll, error) {
	var poll models.Poll
	if err := r.DB.Collection("polls").FindOne(ctx, bson.M{"shareCode": code}).Decode(&poll); err != nil {
		return nil, err
	}
	return &poll, nil
}

func (r *Repository) GetPollByID(ctx context.Context, id string) (*models.Poll, error) {
	var poll models.Poll
	if err := r.DB.Collection("polls").FindOne(ctx, bson.M{"_id": id}).Decode(&poll); err != nil {
		return nil, err
	}
	return &poll, nil
}

func (r *Repository) CreatePoll(ctx context.Context, poll *models.Poll) error {
	_, err := r.DB.Collection("polls").InsertOne(ctx, poll)
	return err
}

func (r *Repository) CreateVote(ctx context.Context, vote *models.Vote) error {
	_, err := r.DB.Collection("votes").InsertOne(ctx, vote)
	return err
}

func (r *Repository) Results(ctx context.Context, pollID string) ([]models.ResultCount, error) {
	pipeline := bson.A{
		bson.D{{Key: "$match", Value: bson.D{{Key: "pollId", Value: pollID}}}},
		bson.D{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: "$optionId"},
			{Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}},
		}}},
		bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
	}

	cur, err := r.DB.Collection("votes").Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var results []models.ResultCount
	if err := cur.All(ctx, &results); err != nil {
		return nil, err
	}
	return results, nil
}

// Keep this helper available for repositories that need timestamps.
func nowUTC() time.Time {
	return time.Now().UTC()
}
