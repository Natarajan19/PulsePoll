package models

import "time"

type User struct {
	ID           string    `bson:"_id" json:"id"`
	Email        string    `bson:"email" json:"email"`
	PasswordHash string    `bson:"passwordHash" json:"-"`
	CreatedAt    time.Time `bson:"createdAt" json:"createdAt"`
}

type PollOption struct {
	ID   string `bson:"id" json:"id"`
	Text string `bson:"text" json:"text"`
}

type Poll struct {
	ID        string       `bson:"_id" json:"id"`
	ShareCode string       `bson:"shareCode" json:"shareCode"`
	Question  string       `bson:"question" json:"question"`
	Type      string       `bson:"type" json:"type"`
	Options   []PollOption `bson:"options" json:"options"`
	CreatedBy string       `bson:"createdBy" json:"createdBy"`
	Status    string       `bson:"status" json:"status"`
	CreatedAt time.Time    `bson:"createdAt" json:"createdAt"`
}

type Vote struct {
	ID        string    `bson:"_id" json:"id"`
	PollID    string    `bson:"pollId" json:"pollId"`
	OptionID  string    `bson:"optionId" json:"optionId"`
	VoterID   string    `bson:"voterId" json:"voterId"`
	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
}

type ResultCount struct {
	OptionID string `json:"optionId" bson:"_id"`
	Count    int64  `json:"count" bson:"count"`
}
