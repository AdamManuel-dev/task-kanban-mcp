#!/bin/bash

# MCP Kanban Production Deployment Script
# This script automates the deployment process for the MCP Kanban server

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-production}"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-}"
DOCKER_IMAGE="${DOCKER_IMAGE:-mcp-kanban}"
DOCKER_TAG="${DOCKER_TAG:-latest}"
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-http://localhost:3000/health}"
ROLLBACK_ENABLED="${ROLLBACK_ENABLED:-true}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to validate prerequisites
validate_prerequisites() {
    log_info "Validating deployment prerequisites..."
    
    local missing_deps=()
    
    if ! command_exists docker; then
        missing_deps+=("docker")
    fi
    
    if ! command_exists docker-compose; then
        missing_deps+=("docker-compose")
    fi
    
    if ! command_exists curl; then
        missing_deps+=("curl")
    fi
    
    if ! command_exists jq; then
        missing_deps+=("jq")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        exit 1
    fi
    
    log_success "All prerequisites validated"
}

# Function to build Docker image
build_image() {
    log_info "Building Docker image..."
    
    cd "$PROJECT_ROOT"
    
    local build_args=""
    if [ -n "$DOCKER_REGISTRY" ]; then
        build_args="--build-arg DOCKER_REGISTRY=$DOCKER_REGISTRY"
    fi
    
    docker build \
        --target production \
        --tag "${DOCKER_IMAGE}:${DOCKER_TAG}" \
        --tag "${DOCKER_IMAGE}:${DEPLOYMENT_ENV}" \
        $build_args \
        .
    
    log_success "Docker image built successfully"
}

# Function to push image to registry
push_image() {
    if [ -z "$DOCKER_REGISTRY" ]; then
        log_warning "No Docker registry configured, skipping push"
        return 0
    fi
    
    log_info "Pushing Docker image to registry..."
    
    local full_image_name="${DOCKER_REGISTRY}/${DOCKER_IMAGE}:${DOCKER_TAG}"
    
    docker tag "${DOCKER_IMAGE}:${DOCKER_TAG}" "$full_image_name"
    docker push "$full_image_name"
    
    log_success "Docker image pushed successfully"
}

# Function to create backup
create_backup() {
    log_info "Creating backup before deployment..."
    
    local backup_dir="/backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    # Backup database
    if docker ps --format "table {{.Names}}" | grep -q "mcp-kanban"; then
        docker exec mcp-kanban sqlite3 /app/data/kanban.db ".backup '$backup_dir/database.db'"
        log_success "Database backup created: $backup_dir/database.db"
    fi
    
    # Backup configuration
    if [ -f "/etc/mcp-kanban/config.json" ]; then
        cp "/etc/mcp-kanban/config.json" "$backup_dir/config.json"
        log_success "Configuration backup created: $backup_dir/config.json"
    fi
    
    echo "$backup_dir" > /tmp/last_backup_path
}

# Function to deploy application
deploy_application() {
    log_info "Deploying application..."
    
    cd "$PROJECT_ROOT"
    
    # Stop existing container
    if docker ps --format "table {{.Names}}" | grep -q "mcp-kanban"; then
        log_info "Stopping existing container..."
        docker stop mcp-kanban || true
        docker rm mcp-kanban || true
    fi
    
    # Start new container
    log_info "Starting new container..."
    
    docker run -d \
        --name mcp-kanban \
        --restart unless-stopped \
        --network host \
        --volume /app/data:/app/data \
        --volume /app/logs:/app/logs \
        --volume /app/backups:/app/backups \
        --env-file .env.production \
        --env NODE_ENV=production \
        "${DOCKER_IMAGE}:${DOCKER_TAG}"
    
    log_success "Application deployed successfully"
}

# Function to wait for health check
wait_for_health() {
    log_info "Waiting for application to be healthy..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$HEALTH_CHECK_URL" >/dev/null 2>&1; then
            log_success "Application is healthy"
            return 0
        fi
        
        log_info "Health check attempt $attempt/$max_attempts failed, retrying in 10 seconds..."
        sleep 10
        ((attempt++))
    done
    
    log_error "Application failed to become healthy after $max_attempts attempts"
    return 1
}

# Function to rollback deployment
rollback_deployment() {
    if [ "$ROLLBACK_ENABLED" != "true" ]; then
        log_warning "Rollback disabled, skipping rollback"
        return 1
    fi
    
    log_warning "Rolling back deployment..."
    
    # Stop current container
    docker stop mcp-kanban || true
    docker rm mcp-kanban || true
    
    # Restore from backup
    if [ -f /tmp/last_backup_path ]; then
        local backup_path=$(cat /tmp/last_backup_path)
        
        if [ -f "$backup_path/database.db" ]; then
            log_info "Restoring database from backup..."
            cp "$backup_path/database.db" /app/data/kanban.db
        fi
        
        if [ -f "$backup_path/config.json" ]; then
            log_info "Restoring configuration from backup..."
            cp "$backup_path/config.json" /etc/mcp-kanban/config.json
        fi
    fi
    
    # Start previous version
    docker run -d \
        --name mcp-kanban \
        --restart unless-stopped \
        --network host \
        --volume /app/data:/app/data \
        --volume /app/logs:/app/logs \
        --volume /app/backups:/app/backups \
        --env-file .env.production \
        --env NODE_ENV=production \
        "${DOCKER_IMAGE}:previous"
    
    log_success "Rollback completed"
}

# Function to run post-deployment checks
post_deployment_checks() {
    log_info "Running post-deployment checks..."
    
    # Check container status
    if ! docker ps --format "table {{.Names}}" | grep -q "mcp-kanban"; then
        log_error "Container is not running"
        return 1
    fi
    
    # Check application health
    if ! curl -f -s "$HEALTH_CHECK_URL" >/dev/null 2>&1; then
        log_error "Application health check failed"
        return 1
    fi
    
    # Check logs for errors
    local error_count=$(docker logs mcp-kanban 2>&1 | grep -c "ERROR\|FATAL" || true)
    if [ "$error_count" -gt 0 ]; then
        log_warning "Found $error_count errors in application logs"
    fi
    
    # Check resource usage
    local memory_usage=$(docker stats mcp-kanban --no-stream --format "table {{.MemUsage}}" | tail -n 1)
    log_info "Memory usage: $memory_usage"
    
    log_success "Post-deployment checks completed"
}

# Function to cleanup old images
cleanup_old_images() {
    log_info "Cleaning up old Docker images..."
    
    # Remove dangling images
    docker image prune -f
    
    # Remove old versions (keep last 3)
    docker images "${DOCKER_IMAGE}" --format "table {{.Repository}}:{{.Tag}}" | \
        grep -v "latest" | \
        grep -v "$DEPLOYMENT_ENV" | \
        tail -n +4 | \
        xargs -r docker rmi || true
    
    log_success "Cleanup completed"
}

# Function to send deployment notification
send_notification() {
    local status="$1"
    local message="$2"
    
    # Example: Send to Slack webhook
    if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"Deployment $status: $message\"}" \
            "$SLACK_WEBHOOK_URL" || true
    fi
    
    # Example: Send email notification
    if [ -n "${EMAIL_RECIPIENTS:-}" ]; then
        echo "Deployment $status: $message" | \
            mail -s "MCP Kanban Deployment $status" "$EMAIL_RECIPIENTS" || true
    fi
}

# Main deployment function
main() {
    local start_time=$(date +%s)
    
    log_info "Starting deployment to $DEPLOYMENT_ENV environment"
    
    # Validate prerequisites
    validate_prerequisites
    
    # Create backup
    create_backup
    
    # Build and push image
    build_image
    push_image
    
    # Deploy application
    deploy_application
    
    # Wait for health check
    if ! wait_for_health; then
        log_error "Deployment failed - application not healthy"
        rollback_deployment
        send_notification "FAILED" "Application failed health check"
        exit 1
    fi
    
    # Run post-deployment checks
    if ! post_deployment_checks; then
        log_error "Deployment failed - post-deployment checks failed"
        rollback_deployment
        send_notification "FAILED" "Post-deployment checks failed"
        exit 1
    fi
    
    # Cleanup
    cleanup_old_images
    
    # Calculate deployment time
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log_success "Deployment completed successfully in ${duration} seconds"
    send_notification "SUCCESS" "Deployment completed in ${duration}s"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "rollback")
        rollback_deployment
        ;;
    "health")
        wait_for_health
        ;;
    "cleanup")
        cleanup_old_images
        ;;
    "backup")
        create_backup
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|health|cleanup|backup}"
        echo ""
        echo "Commands:"
        echo "  deploy   - Deploy the application (default)"
        echo "  rollback - Rollback to previous version"
        echo "  health   - Check application health"
        echo "  cleanup  - Clean up old Docker images"
        echo "  backup   - Create backup only"
        echo ""
        echo "Environment variables:"
        echo "  DEPLOYMENT_ENV     - Deployment environment (default: production)"
        echo "  DOCKER_REGISTRY    - Docker registry URL"
        echo "  DOCKER_IMAGE       - Docker image name (default: mcp-kanban)"
        echo "  DOCKER_TAG         - Docker image tag (default: latest)"
        echo "  HEALTH_CHECK_URL   - Health check URL (default: http://localhost:3000/health)"
        echo "  ROLLBACK_ENABLED   - Enable rollback (default: true)"
        echo "  SLACK_WEBHOOK_URL  - Slack webhook for notifications"
        echo "  EMAIL_RECIPIENTS   - Email recipients for notifications"
        exit 1
        ;;
esac 