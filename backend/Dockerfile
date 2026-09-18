FROM golang:1.27-alpine AS build
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o pulsepoll .
FROM alpine:3.22
WORKDIR /app
COPY --from=build /app/pulsepoll .
EXPOSE 8080
CMD ["./pulsepoll"]
