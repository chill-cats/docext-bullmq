# This is the demo of BullMQ Queue with Redis for implement HTTP polling

## Prerequisite:

You must have a running redis on localhost:6379 with no authentication, you can quickly spin one up using Docker
```bash
docker run -d --name doctext-bullmq-redis -p6379:6379 redis
```
You must also have GhostScript and Tesseract installed on your system and is in `PATH`

## Instructions:

Go to the project folder
```bash
cd docext-bullmq
```

Install dependency
```bash
yarn install
```

Run dev server
```bash
yarn start
```
