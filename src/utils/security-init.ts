/**
 * @fileoverview Security initialization and validation
 * @lastmodified 2025-07-31T01:50:00Z
 * 
 * Features: Production security validation, secret generation helper, startup checks
 * Main APIs: initializeSecurity(), validateSecurityConfig(), generateProductionSecrets()
 * Constraints: Must run before server start, blocks on security errors in production
 * Patterns: Throws SecurityError on invalid config, logs security warnings
 */

import { config } from '@/config';
import { logger } from './logger';
import { 
  isSecureSecret, 
  generateSecureSecret, 
  SecurityError,
  generateApiKey,
  validateProductionSecurity,
  securityConfigSchema
} from '@/config/security';

/**
 * Initialize and validate security configuration
 */
export async function initializeSecurity(): Promise<void> {
  try {
    logger.info('Initializing security configuration...');
    
    const isProduction = process.env.NODE_ENV === 'production';
    const securityConfig = {
      jwt: {
        secret: config.api.keySecret,
        expiresIn: '24h',
        refreshExpiresIn: '7d',
        algorithm: 'HS512' as const,
      },
      apiKey: {
        secret: config.api.keySecret,
        hashAlgorithm: 'sha512' as const,
      },
      cors: {
        origin: config.api.corsOrigin,
        credentials: config.api.corsCredentials,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
        exposedHeaders: ['X-Request-ID', 'X-Rate-Limit-Remaining'],
        maxAge: 86400,
        preflightContinue: false,
        optionsSuccessStatus: 204,
      },
      password: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        bcryptRounds: 12,
      },
      session: {
        secret: config.api.keySecret,
        name: 'mcp.kanban.sid',
        cookie: {
          secure: isProduction,
          httpOnly: true,
          sameSite: 'strict' as const,
          maxAge: 86400000,
        },
      },
    };
    
    // Validate security configuration
    const validatedConfig = securityConfigSchema.parse(securityConfig);
    
    // Additional production validation
    validateProductionSecurity(validatedConfig);
    
    // Log security status
    if (isProduction) {
      logger.info('Production security validation passed');
      
      // Log CORS configuration (without exposing secrets)
      logger.info('CORS configuration:', {
        origin: typeof config.api.corsOrigin === 'string' 
          ? config.api.corsOrigin 
          : 'Multiple origins configured',
        credentials: config.api.corsCredentials,
      });
      
      // Verify API keys are configured
      if (!config.api.keys || config.api.keys.length === 0) {
        throw new SecurityError('No API keys configured for production');
      }
      
      logger.info(`${config.api.keys.length} API keys configured`);
    } else {
      logger.warn('Running in development mode - relaxed security settings active');
      
      // Generate example secure values for development
      logger.info('Example secure values for production:');
      logger.info(`  JWT_SECRET="${generateSecureSecret()}"`);
      logger.info(`  API_KEY_SECRET="${generateSecureSecret()}"`);
      logger.info(`  API_KEYS="${generateApiKey('prod')}"`);
      logger.info(`  CORS_ORIGIN="https://yourdomain.com"`);
      logger.info(`  CORS_CREDENTIALS="false"`);
    }
    
    // Check for security warnings
    const warnings: string[] = [];
    
    if (!isProduction && config.api.corsCredentials && config.api.corsOrigin === '*') {
      warnings.push('CORS credentials enabled with wildcard origin - security risk');
    }
    
    if (config.api.keys.some(key => key.length < 32)) {
      warnings.push('Some API keys are shorter than recommended 32 characters');
    }
    
    if (warnings.length > 0) {
      logger.warn('Security warnings:', warnings);
    }
    
    logger.info('Security initialization complete');
  } catch (error) {
    if (error instanceof SecurityError) {
      logger.error('Security configuration error:', error.message);
      if (process.env.NODE_ENV === 'production') {
        logger.error('Cannot start server with invalid security configuration in production');
        process.exit(1);
      }
    } else {
      logger.error('Unexpected error during security initialization:', error);
      throw error;
    }
  }
}

/**
 * Generate production-ready secrets
 */
export function generateProductionSecrets(): void {
  console.log('Production Security Configuration:');
  console.log('=================================');
  console.log('');
  console.log('# Add these to your .env file:');
  console.log(`JWT_SECRET="${generateSecureSecret()}"`);
  console.log(`API_KEY_SECRET="${generateSecureSecret()}"`);
  console.log(`SESSION_SECRET="${generateSecureSecret()}"`);
  console.log('');
  console.log('# Generate API keys for your users:');
  console.log(`API_KEYS="${generateApiKey('prod')},${generateApiKey('prod')}"`);
  console.log('');
  console.log('# Configure CORS for your domain:');
  console.log('CORS_ORIGIN="https://yourdomain.com"');
  console.log('CORS_CREDENTIALS="false"');
  console.log('');
  console.log('# Enable production mode:');
  console.log('NODE_ENV="production"');
  console.log('');
  console.log('=================================');
  console.log('Save these values securely!');
}

/**
 * Check if running with default/insecure configuration
 */
export function hasInsecureDefaults(): boolean {
  const insecurePatterns = [
    /^dev-/i,
    /^test-/i,
    /^default/i,
    /^change-?me/i,
  ];
  
  return (
    insecurePatterns.some(pattern => pattern.test(config.api.keySecret)) ||
    config.api.corsOrigin === '*' ||
    (config.api.corsCredentials && config.api.corsOrigin === '*')
  );
}