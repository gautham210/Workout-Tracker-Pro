# Workout Tracker Pro 💪

A React web app and Expo mobile app for workout and bodyweight tracking, backed by Supabase.

## 🚀 Features

- Smart training splits:
  - PPL (Push Pull Legs)
  - Bro Split
  - Custom Split (user-defined)
- Loop-based workout system (auto-rotating sessions)
- Workout logging with sets, reps, and weight tracking
- Bodyweight tracking with date-based logs
- Deterministic next-session and insight heuristics based on recorded data
- Offline mobile workout persistence with a durable sync outbox

## 🧠 Smart System

Workout Tracker Pro:
- Detects your training pattern
- Suggests your next workout
- Tracks consistency and streaks
- Supports rest-day logic

## 🛠 Tech Stack

- React (Vite) and Expo React Native
- Supabase (Auth + PostgreSQL + RLS)
- Vercel serverless AI routes

## ⚡ Local Setup

npm install  
npm run dev  

For the security, schema, offline-sync, environment, and validation contract, read [PRODUCTION_NOTES.md](./PRODUCTION_NOTES.md). Remote Supabase migration/RLS and production deployment are not verified by this repository alone.

## 🌐 Deployment

Deployed with Vercel.

## 👤 Author

Gautham Krishna
