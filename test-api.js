const { startServer } = require('./dist/server');

async function testAPI() {
  try {
    console.log('Starting server...');
    const { app, server } = await startServer();

    console.log('Server started successfully!');
    console.log('Testing endpoints...');

    // Test health endpoint
    const http = require('http');
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/health',
      method: 'GET',
    };

    const req = http.request(options, res => {
      console.log(`Health check status: ${res.statusCode}`);
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        console.log('Health response:', JSON.parse(data));
        server.close();
        process.exit(0);
      });
    });

    req.on('error', error => {
      console.error('Request failed:', error);
      server.close();
      process.exit(1);
    });

    req.end();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  testAPI();
}
