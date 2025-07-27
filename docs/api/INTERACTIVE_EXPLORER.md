# Interactive API Explorer Setup

## Overview

The MCP Kanban API includes an interactive API explorer that allows you to test endpoints directly in your browser. This provides a user-friendly interface for exploring and testing the API without writing code.

## Setup Instructions

### 1. Install Swagger UI Dependencies

First, install the required dependencies:

```bash
npm install swagger-ui-express @types/swagger-ui-express
```

### 2. Add Swagger UI to Server

Update your server configuration to include Swagger UI:

```typescript
// src/server.ts
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

// Load OpenAPI specification
const openApiSpec = YAML.load(path.join(__dirname, '../docs/api/openapi.yaml'));

// Add Swagger UI route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'MCP Kanban API Explorer',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    docExpansion: 'list',
    filter: true,
    showRequestHeaders: true,
    tryItOutEnabled: true,
    requestInterceptor: (req: any) => {
      // Add authentication header
      if (req.headers && !req.headers.Authorization) {
        const apiKey = localStorage.getItem('api-key');
        if (apiKey) {
          req.headers.Authorization = `Bearer ${apiKey}`;
        }
      }
      return req;
    }
  }
}));
```

### 3. Configure Authentication

Create a simple authentication setup for the API explorer:

```typescript
// src/middleware/swagger-auth.ts
import { Request, Response, NextFunction } from 'express';

export const swaggerAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Allow access to API docs without authentication
  if (req.path.startsWith('/api-docs')) {
    return next();
  }
  
  // For API requests from Swagger UI, check for API key
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  if (!apiKey) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'API key required',
        timestamp: new Date().toISOString()
      }
    });
  }
  
  // Validate API key (implement your validation logic)
  // ...
  
  next();
};
```

### 4. Custom Swagger UI Configuration

Create a custom configuration file:

```javascript
// docs/api/swagger-config.js
module.exports = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { font-size: 2.5em; }
    .swagger-ui .scheme-container { margin: 0 0 20px; }
    .swagger-ui .auth-wrapper { margin: 20px 0; }
  `,
  customSiteTitle: 'MCP Kanban API Explorer',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    docExpansion: 'list',
    filter: true,
    showRequestHeaders: true,
    tryItOutEnabled: true,
    requestInterceptor: (req) => {
      // Add authentication header
      if (req.headers && !req.headers.Authorization) {
        const apiKey = localStorage.getItem('api-key');
        if (apiKey) {
          req.headers.Authorization = `Bearer ${apiKey}`;
        }
      }
      return req;
    },
    responseInterceptor: (res) => {
      // Log responses for debugging
      console.log('API Response:', res);
      return res;
    }
  }
};
```

### 5. API Key Management

Add a simple API key management interface:

```html
<!-- docs/api/explorer.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Kanban API Explorer</title>
    <style>
        .api-key-form {
            position: fixed;
            top: 10px;
            right: 10px;
            background: white;
            padding: 15px;
            border: 1px solid #ccc;
            border-radius: 5px;
            z-index: 1000;
        }
        .api-key-form input {
            width: 300px;
            padding: 5px;
            margin-right: 10px;
        }
        .api-key-form button {
            padding: 5px 10px;
            background: #007cba;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="api-key-form">
        <input type="password" id="api-key" placeholder="Enter your API key">
        <button onclick="setApiKey()">Set API Key</button>
        <button onclick="generateApiKey()">Generate New Key</button>
    </div>
    
    <div id="swagger-ui"></div>
    
    <script src="https://unpkg.com/swagger-ui-dist@5.0.0/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.0.0/swagger-ui-standalone-preset.js"></script>
    <script>
        function setApiKey() {
            const apiKey = document.getElementById('api-key').value;
            if (apiKey) {
                localStorage.setItem('api-key', apiKey);
                alert('API key set successfully!');
                location.reload();
            }
        }
        
        function generateApiKey() {
            fetch('/api/v1/auth/keys', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: 'Generated from API Explorer'
                })
            })
            .then(response => response.json())
            .then(data => {
                document.getElementById('api-key').value = data.key;
                setApiKey();
            })
            .catch(error => {
                alert('Failed to generate API key: ' + error.message);
            });
        }
        
        // Initialize Swagger UI
        window.onload = function() {
            const ui = SwaggerUIBundle({
                url: '/api-docs/openapi.yaml',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                requestInterceptor: (req) => {
                    const apiKey = localStorage.getItem('api-key');
                    if (apiKey && !req.headers.Authorization) {
                        req.headers.Authorization = `Bearer ${apiKey}`;
                    }
                    return req;
                }
            });
        };
    </script>
</body>
</html>
```

## Usage

### Accessing the API Explorer

1. Start your server:
   ```bash
   npm run dev
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:3000/api-docs
   ```

3. Set your API key using the form in the top-right corner

4. Start exploring the API endpoints!

### Features

- **Interactive Testing**: Try out any endpoint directly from the browser
- **Authentication**: Easy API key management
- **Request/Response Viewing**: See exactly what data is sent and received
- **Schema Documentation**: Browse all data models and their properties
- **Filtering**: Search for specific endpoints
- **Export**: Download the OpenAPI specification

### Example Workflow

1. **Set API Key**: Enter your API key in the form
2. **Create a Board**: Find the POST /boards endpoint and click "Try it out"
3. **Fill Parameters**: Enter board name and description
4. **Execute**: Click "Execute" to make the request
5. **View Response**: See the created board data
6. **Create Tasks**: Use the returned board ID to create tasks

### Customization

You can customize the API explorer by modifying the configuration:

```typescript
// Custom themes
const customTheme = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #3B82F6; }
    .swagger-ui .scheme-container { background: #f8fafc; }
  `
};

// Custom options
const customOptions = {
  docExpansion: 'none', // Start with all endpoints collapsed
  filter: true,
  showRequestHeaders: true,
  tryItOutEnabled: true,
  requestInterceptor: (req) => {
    // Add custom headers
    req.headers['X-Custom-Header'] = 'value';
    return req;
  }
};
```

## Security Considerations

### API Key Management

- Store API keys securely in localStorage
- Implement key rotation
- Use different keys for different environments
- Never expose API keys in client-side code

### CORS Configuration

Ensure proper CORS settings for the API explorer:

```typescript
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));
```

### Rate Limiting

The API explorer is subject to the same rate limiting as regular API calls:

```typescript
// Exclude API docs from rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  skip: (req) => req.path.startsWith('/api-docs')
});
```

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Ensure CORS is properly configured
   - Check that the API explorer domain is allowed

2. **Authentication Issues**
   - Verify API key format
   - Check that the key is valid and not expired
   - Ensure the Authorization header is being sent

3. **Swagger UI Not Loading**
   - Check that swagger-ui-express is installed
   - Verify the OpenAPI specification file path
   - Check browser console for errors

4. **Request Failures**
   - Verify the server is running
   - Check network connectivity
   - Review server logs for errors

### Debug Mode

Enable debug mode for more detailed information:

```typescript
const swaggerOptions = {
  ...customOptions,
  onComplete: () => {
    console.log('Swagger UI loaded successfully');
  },
  onFailure: (data) => {
    console.error('Swagger UI failed to load:', data);
  }
};
```

## Integration with Development Workflow

### Development Environment

For development, you can automatically generate API keys:

```typescript
// Auto-generate API key for development
if (process.env.NODE_ENV === 'development') {
  app.get('/api-docs/dev-key', (req, res) => {
    const devKey = generateApiKey();
    res.json({ key: devKey, message: 'Development API key generated' });
  });
}
```

### Testing Integration

Use the API explorer for manual testing:

```typescript
// Test endpoints using the explorer
describe('API Explorer Tests', () => {
  it('should create a board via explorer', async () => {
    // Use the explorer to create a board
    // Then verify via API calls
  });
});
```

### Documentation Generation

The API explorer can be used to generate documentation:

```typescript
// Generate markdown documentation from OpenAPI spec
import { generateMarkdown } from 'openapi-markdown';

const markdown = generateMarkdown(openApiSpec);
fs.writeFileSync('docs/api/README.md', markdown);
```

## Conclusion

The interactive API explorer provides a powerful tool for:

- **Development**: Quickly test new endpoints
- **Documentation**: Visual representation of the API
- **Debugging**: See exact request/response data
- **Onboarding**: Help new developers understand the API
- **Testing**: Manual testing of API functionality

By following this setup guide, you'll have a fully functional API explorer that makes working with the MCP Kanban API much easier and more intuitive. 