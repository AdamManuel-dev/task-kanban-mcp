# Directory Structure

```
mcp-kanban/
├── src/                          # Source code
│   ├── index.ts                  # Main entry point
│   ├── config/                   # Configuration management
│   ├── services/                 # Business logic layer
│   ├── repositories/             # Data access layer
│   ├── controllers/              # API controllers
│   ├── middleware/               # Express middleware
│   ├── utils/                    # Utility functions
│   ├── types/                    # TypeScript type definitions
│   ├── mcp/                      # MCP server implementation
│   ├── cli/                      # CLI implementation
│   └── database/                 # Database related files
│       ├── migrations/           # Database migrations
│       └── seeds/                # Database seed files
├── tests/                        # Test files
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   ├── e2e/                      # End-to-end tests
│   └── jest.setup.ts             # Jest setup
├── docs/                         # Documentation
├── scripts/                      # Utility scripts
├── dist/                         # Compiled output (generated)
├── node_modules/                 # Dependencies (generated)
├── coverage/                     # Test coverage (generated)
├── .env                          # Environment variables (local)
├── .env.example                  # Environment variables template
├── package.json                  # Project configuration
├── tsconfig.json                 # TypeScript configuration
├── tsconfig.test.json            # TypeScript test configuration
├── .eslintrc.json                # ESLint configuration
├── .prettierrc                   # Prettier configuration
├── .prettierignore               # Prettier ignore rules
├── .gitignore                    # Git ignore rules
├── jest.config.js                # Jest configuration
├── nodemon.json                  # Nodemon configuration
├── Dockerfile                    # Docker configuration
├── docker-compose.yml            # Docker Compose configuration
└── README.md                     # Project documentation
```

## Module Organization

### `/src/config/`
Configuration management, environment variables, and application settings.

### `/src/services/`
Business logic layer containing service classes for tasks, boards, notes, tags, etc.

### `/src/repositories/`
Data access layer implementing repository pattern for database operations.

### `/src/controllers/`
Express.js controllers handling HTTP requests and responses.

### `/src/middleware/`
Express.js middleware for authentication, validation, logging, etc.

### `/src/utils/`
Utility functions and helper modules used across the application.

### `/src/types/`
TypeScript type definitions, interfaces, and enums.

### `/src/mcp/`
MCP (Model Context Protocol) server implementation and tools.

### `/src/cli/`
Command-line interface implementation.

### `/src/database/`
Database schema, migrations, and seed files.

### `/tests/`
All test files organized by type (unit, integration, e2e).

### `/docs/`
Project documentation including API docs, guides, and specifications.

### `/scripts/`
Build, deployment, and maintenance scripts.