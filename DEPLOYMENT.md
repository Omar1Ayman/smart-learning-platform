# Deployment Guide

This document covers everything from running locally to deploying on a
production host (Railway, Render, DigitalOcean, or a plain VPS).

---

## 1. Local development

### Prerequisites
- Docker Desktop (or `docker` + `docker compose` plugin)
- ~4 GB free RAM (Postgres + backend + frontend)

### First run

```bash
git clone <repo> smart-learning-platform
cd smart-learning-platform
cp backend/.env.example backend/.env  # then edit if needed
docker compose up -d