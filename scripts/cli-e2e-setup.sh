#!/bin/bash

# CLI E2E Test Setup Script
# Prepares environment for running CLI end-to-end tests

set -e

echo "🚀 Setting up CLI E2E test environment..."

# Build the CLI if not already built
if [ ! -f "dist/cli/index.js" ]; then
    echo "📦 Building CLI..."
    npm run build
fi

# Create test directories
TEST_DIR="/tmp/kanban-cli-e2e-$(date +%s)"
mkdir -p "$TEST_DIR"

# Set environment variables for isolated testing
export KANBAN_CONFIG_DIR="$TEST_DIR/config"
export KANBAN_DB_PATH="$TEST_DIR/test.db"
export NODE_ENV="test"

echo "✅ Test environment prepared at: $TEST_DIR"

# Function to cleanup test environment
cleanup() {
    echo "🧹 Cleaning up test environment..."
    rm -rf "$TEST_DIR"
}

# Register cleanup function to run on script exit
trap cleanup EXIT

# Run the specified test or all CLI tests
if [ "$1" = "basic" ]; then
    echo "🧪 Running basic CLI tests..."
    npm run test:cli
elif [ "$1" = "advanced" ]; then
    echo "🧪 Running advanced CLI tests..."
    npm run test:cli:advanced
elif [ "$1" = "errors" ]; then
    echo "🧪 Running CLI error scenario tests..."
    npm run test:cli:errors
elif [ "$1" = "all" ]; then
    echo "🧪 Running all CLI tests..."
    npm run test:cli:all
else
    echo "🧪 Running basic CLI tests (default)..."
    npm run test:cli
fi

echo "✨ CLI E2E tests completed!"