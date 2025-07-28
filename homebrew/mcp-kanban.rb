class McpKanban < Formula
  desc "AI-powered task management system with Model Context Protocol integration"
  homepage "https://github.com/yourusername/mcp-kanban"
  url "https://github.com/yourusername/mcp-kanban/archive/v1.0.0.tar.gz"
  sha256 "your-sha256-hash-here"
  license "MIT"
  
  head "https://github.com/yourusername/mcp-kanban.git", branch: "main"

  depends_on "node@18"
  depends_on "sqlite"

  def install
    # Install npm dependencies
    system "npm", "ci", "--production"
    
    # Build the project
    system "npm", "run", "build"
    
    # Install to Homebrew prefix
    libexec.install Dir["*"]
    
    # Create executable wrappers
    (bin/"mcp-kanban").write_env_script(
      libexec/"dist/index.js",
      PATH: "#{Formula["node@18"].opt_bin}:#{ENV["PATH"]}"
    )
    
    (bin/"kanban").write_env_script(
      libexec/"dist/cli/index.js",
      PATH: "#{Formula["node@18"].opt_bin}:#{ENV["PATH"]}"
    )
    
    # Create data directory
    (var/"mcp-kanban").mkpath
    (var/"mcp-kanban/data").mkpath
    (var/"mcp-kanban/logs").mkpath
    (var/"mcp-kanban/backups").mkpath
    
    # Install configuration files
    etc.install "config/default.json" => "mcp-kanban/config.json" if File.exist?("config/default.json")
    
    # Create environment configuration
    (etc/"mcp-kanban/environment").write <<~EOS
      NODE_ENV=production
      DATABASE_URL=#{var}/mcp-kanban/data/kanban.db
      LOG_LEVEL=info
      PORT=3000
      MCP_PORT=3456
    EOS
  end

  def post_install
    # Initialize database
    system bin/"mcp-kanban", "migrate"
    
    # Set proper permissions
    chmod 0755, var/"mcp-kanban"
    chmod 0644, Dir[var/"mcp-kanban/**/*"]
  end

  service do
    run [opt_bin/"mcp-kanban"]
    working_dir var/"mcp-kanban"
    environment_variables NODE_ENV: "production", 
                          DATABASE_URL: var/"mcp-kanban/data/kanban.db",
                          LOG_LEVEL: "info"
    keep_alive successful_exit: false
    log_path var/"log/mcp-kanban.log"
    error_log_path var/"log/mcp-kanban-error.log"
    restart_delay 5
  end

  test do
    # Test CLI functionality
    output = shell_output("#{bin}/kanban --version")
    assert_match version.to_s, output
    
    # Test server can start (basic check)
    port = free_port
    pid = fork do
      exec bin/"mcp-kanban", "--port=#{port}"
    end
    
    sleep 3
    system "curl", "-f", "http://localhost:#{port}/api/health"
    assert $?.success?
    
    Process.kill("TERM", pid)
    Process.wait(pid)
  end

  def caveats
    <<~EOS
      MCP Kanban has been installed successfully!

      Configuration:
        • Config file: #{etc}/mcp-kanban/config.json
        • Environment: #{etc}/mcp-kanban/environment
        • Data directory: #{var}/mcp-kanban/data
        • Logs directory: #{var}/mcp-kanban/logs

      Usage:
        • Start server: brew services start mcp-kanban
        • Stop server: brew services stop mcp-kanban
        • CLI tool: kanban --help
        • Server URL: http://localhost:3000

      For Claude Desktop integration, add this to your MCP configuration:
        {
          "mcpServers": {
            "mcp-kanban": {
              "command": "#{opt_bin}/mcp-kanban",
              "args": ["--mode", "mcp"]
            }
          }
        }

      Documentation: #{prefix}/docs/
    EOS
  end
end 