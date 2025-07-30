#!/bin/bash

# Development script with parallel type checking
# This script runs the development server and TypeScript compiler in watch mode

echo "🚀 Starting development with type checking..."
echo "📝 TypeScript compiler will watch for changes"
echo "🔄 Development server will restart on changes"
echo ""

# Function to cleanup background processes
cleanup() {
    echo "🛑 Shutting down..."
    pkill -P $$
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start TypeScript compiler in watch mode in background
echo "Starting TypeScript compiler..."
npm run typecheck:watch &
TYPECHECK_PID=$!

# Give typecheck a moment to start
sleep 2

# Start development server
echo "Starting development server..."
npm run dev &
DEV_PID=$!

# Wait for any process to exit
wait $TYPECHECK_PID $DEV_PID

# If we get here, one of the processes exited
cleanup