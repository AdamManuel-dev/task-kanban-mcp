/**
 * Artillery custom functions for realistic load testing
 * Provides utilities for generating test data and simulating user behavior
 */

const crypto = require('crypto');
const { format, subDays } = require('date-fns');

module.exports = {
  // Generate random strings for task titles and descriptions
  randomString: function (context, events, done) {
    const adjectives = ['urgent', 'important', 'critical', 'minor', 'routine', 'complex', 'simple'];
    const nouns = ['bug', 'feature', 'task', 'issue', 'enhancement', 'refactor', 'test'];

    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const id = crypto.randomBytes(4).toString('hex');

    context.vars.randomString = `${adjective}-${noun}-${id}`;
    return done();
  },

  // Generate random integers within a range
  randomInt: function (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // Pick random item from array
  pick: function (items) {
    return items[Math.floor(Math.random() * items.length)];
  },

  // Generate ISO timestamp
  isoTimestamp: function () {
    return new Date().toISOString();
  },

  // Generate date offset for queries
  dateOffset: function (timestamp, offset, unit) {
    const date = new Date(timestamp);

    switch (unit) {
      case 'days':
        return subDays(date, Math.abs(offset)).toISOString();
      case 'hours':
        return new Date(date.getTime() - Math.abs(offset) * 60 * 60 * 1000).toISOString();
      case 'minutes':
        return new Date(date.getTime() - Math.abs(offset) * 60 * 1000).toISOString();
      default:
        return date.toISOString();
    }
  },

  // Setup test data before scenarios run
  setupTestData: function (context, events, done) {
    // Set up realistic board IDs and other test data
    context.vars.testBoardIds = [
      'development-board',
      'testing-board',
      'production-board',
      'backlog-board',
    ];

    context.vars.taskStatuses = ['todo', 'in_progress', 'review', 'done'];
    context.vars.priorities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    return done();
  },

  // Simulate realistic user think time
  thinkTime: function (context, events, done) {
    const thinkTimeMs = Math.floor(Math.random() * 3000) + 500; // 0.5-3.5 seconds
    setTimeout(done, thinkTimeMs);
  },

  // Log performance metrics during test
  logMetrics: function (context, events, done) {
    events.on('request', function (requestParams, response, context, ee, next) {
      const responseTime = Date.now() - requestParams.startTime;

      if (responseTime > 1000) {
        console.log(
          `SLOW REQUEST: ${requestParams.method} ${requestParams.url} - ${responseTime}ms`
        );
      }

      return next();
    });

    events.on('error', function (error, context, ee, next) {
      console.error(`REQUEST ERROR: ${error.message}`);
      return next();
    });

    return done();
  },

  // Custom authentication token generator
  generateAuthToken: function (context, events, done) {
    // In a real scenario, this would authenticate with the API
    // For testing, we'll use the development API key
    context.vars.authToken = process.env.TEST_API_KEY || 'dev-key-1';
    return done();
  },

  // Simulate different user roles with different behavior patterns
  setUserRole: function (context, events, done) {
    const roles = ['developer', 'manager', 'qa_tester', 'product_owner'];
    const role = roles[Math.floor(Math.random() * roles.length)];

    context.vars.userRole = role;

    // Adjust behavior based on role
    switch (role) {
      case 'developer':
        context.vars.taskFocus = ['bug', 'feature', 'technical_debt'];
        context.vars.updateFrequency = 'high';
        break;
      case 'manager':
        context.vars.taskFocus = ['planning', 'review', 'approval'];
        context.vars.updateFrequency = 'medium';
        break;
      case 'qa_tester':
        context.vars.taskFocus = ['testing', 'bug', 'verification'];
        context.vars.updateFrequency = 'high';
        break;
      case 'product_owner':
        context.vars.taskFocus = ['requirements', 'priority', 'planning'];
        context.vars.updateFrequency = 'low';
        break;
    }

    return done();
  },

  // Generate realistic task data based on user role
  generateTaskData: function (context, events, done) {
    const role = context.vars.userRole || 'developer';
    const taskTypes = context.vars.taskFocus || ['general'];

    const taskType = taskTypes[Math.floor(Math.random() * taskTypes.length)];
    const titles = {
      bug: [
        'Fix login authentication bug',
        'Resolve database connection issue',
        'Fix UI rendering problem',
      ],
      feature: [
        'Add user profile page',
        'Implement search functionality',
        'Create dashboard widgets',
      ],
      testing: ['Test user registration flow', 'Verify API endpoints', 'Validate form submissions'],
      planning: ['Define project requirements', 'Create project timeline', 'Review sprint goals'],
    };

    const taskTitles = titles[taskType] || ['Generic task'];
    const title = taskTitles[Math.floor(Math.random() * taskTitles.length)];

    context.vars.taskTitle = `${title} - ${crypto.randomBytes(3).toString('hex')}`;
    context.vars.taskDescription = `Task created by ${role} during load testing at ${new Date().toISOString()}`;

    return done();
  },

  // Performance monitoring and alerting
  checkPerformance: function (context, events, done) {
    events.on('response', function (response, context, ee, next) {
      const responseTime = response.elapsedTime;

      // Alert on slow responses
      if (responseTime > 2000) {
        console.warn(`PERFORMANCE ALERT: Response time ${responseTime}ms exceeds threshold`);
      }

      // Track error rates
      if (response.statusCode >= 400) {
        console.error(`ERROR RESPONSE: ${response.statusCode} ${response.statusMessage}`);
      }

      return next();
    });

    return done();
  },
};
