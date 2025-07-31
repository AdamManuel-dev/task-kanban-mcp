/**
 * @fileoverview Comprehensive path alias resolution configuration
 * @lastmodified 2025-07-28T15:30:00Z
 *
 * Features: Runtime alias resolution, build-time transformation, development support
 * Main APIs: register(), resolve(), transform()
 * Constraints: Works with Node.js, TypeScript, and bundlers
 * Patterns: Module path mapping, runtime registration, build pipeline integration
 */

const path = require('path');
const fs = require('fs');

// Read TypeScript configuration (handle comments)
const readTsConfig = () => {
  try {
    // Try main tsconfig first
    const mainPath = path.resolve(__dirname, 'tsconfig.json');
    const content = fs.readFileSync(mainPath, 'utf8');

    // Since tsconfig.json extends base, we need to manually define paths
    return { compilerOptions: {, baseUrl: './', paths: {, '@/*': ['src/*'], '@config/*': ['src/config/*'], '@services/*': ['src/services/*'], '@repositories/*': ['src/repositories/*'], '@controllers/*': ['src/controllers/*'], '@middleware/*': ['src/middleware/*'], '@utils/*': ['src/utils/*'], '@types/*': ['src/types/*'], '@mcp/*': ['src/mcp/*'], '@cli/*': ['src/cli/*'] },
      },
    };
  } catch (error) {
    console.warn('Could not read tsconfig, using default paths');
    return { compilerOptions: { baseUrl: './', paths: {} } };
  }
};

const tsconfig = readTsConfig();

// Extract base URL and path mappings
const baseUrl = tsconfig.compilerOptions.baseUrl || './';
const paths = tsconfig.compilerOptions.paths || {};

// Convert TypeScript paths to runtime mappings
const createAliasMapping = (basePath = __dirname) => {
  const mapping = {};

  for (const [alias, targets] of Object.entries(paths)) {
    // Remove /* from alias and targets
    const cleanAlias = alias.replace('/*', '');
    const cleanTargets = targets.map(target => path.resolve(basePath, target.replace('/*', '')));

    mapping[cleanAlias] = cleanTargets[0]; // Use first target
  }

  return mapping;
};

// Runtime alias mapping
const aliasMapping = createAliasMapping();

// Module resolution function
const resolveAlias = (modulePath, fromFile = __filename) => {
  // Check if path starts with an alias
  for (const [alias, target] of Object.entries(aliasMapping)) {
    if (modulePath.startsWith(alias)) {
      const relativePath = modulePath.substring(alias.length);
      return path.join(target, relativePath);
    }
  }

  return modulePath;
};

// Register runtime resolver (for development)
const registerRuntimeResolver = () => {
  const Module = require('module');
  const originalResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function (request, parent, isMain, options) {
    // Try to resolve alias first
    const resolvedRequest = resolveAlias(request, parent?.filename);

    try {
      return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options);
    } catch (error) {
      // Fallback to original request
      return originalResolveFilename.call(this, request, parent, isMain, options);
    }
  };
};

// Configuration for different environments
const config = {
  // Development configuration
  development: {
    register: registerRuntimeResolver,
    mapping: aliasMapping,
    resolve: resolveAlias,
  },

  // Production build configuration
  production: {
    // For tsc-alias
    tscAlias: {
      compilerOptions: {
        baseUrl: './dist',
        paths: Object.entries(paths).reduce((acc, [alias, targets]) => {
          // Convert src/* to dist/* for production
          acc[alias] = targets.map(target => target.replace('src/', ''));
          return acc;
        }, {}),
      },
    },

    // For webpack or other bundlers
    webpack: {
      resolve: {
        alias: Object.entries(aliasMapping).reduce((acc, [alias, target]) => {
          acc[alias] = target;
          return acc;
        }, {}),
      },
    },

    // For Node.js runtime in production
    runtime: aliasMapping,
  },

  // Test configuration
  test: {
    // Jest moduleNameMapper
    jest: Object.entries(paths).reduce((acc, [alias, targets]) => {
      const jestAlias = alias.replace('/*', '/(.*)');
      const jestTarget = '<rootDir>/' + targets[0].replace('/*', '/$1');
      acc['^' + jestAlias + '$'] = jestTarget;
      return acc;
    }, {}),
  },
};

// Auto-register if running in development
if (process.env.NODE_ENV !== 'production' && require.main !== module) {
  try {
    registerRuntimeResolver();
    console.log('✅ Path aliases registered for runtime resolution');
  } catch (error) {
    console.warn('⚠️ Failed to register path alias resolver:', error.message);
  }
}

module.exports = config;

// CLI usage
if (require.main === module) {
  console.log('🔧 **PATH ALIAS CONFIGURATION**\n');

  console.log('📊 **Detected Aliases:**');
  for (const [alias, target] of Object.entries(aliasMapping)) {
    console.log(`  ${alias} -> ${target}`);
  }

  console.log('\n🏗️ **Generated Configurations:**');

  // Write tsc-alias configuration
  fs.writeFileSync(
    path.join(__dirname, 'tsconfig.tsc-alias.json'),
    JSON.stringify(config.production.tscAlias, null, 2)
  );
  console.log('✅ Created tsconfig.tsc-alias.json');

  // Write Jest configuration snippet
  fs.writeFileSync(
    path.join(__dirname, 'jest.aliases.json'),
    JSON.stringify({ moduleNameMapper: config.test.jest }, null, 2)
  );
  console.log('✅ Created jest.aliases.json');

  // Write webpack configuration snippet
  fs.writeFileSync(
    path.join(__dirname, 'webpack.aliases.json'),
    JSON.stringify(config.production.webpack, null, 2)
  );
  console.log('✅ Created webpack.aliases.json');

  console.log('\n🎯 **Integration Instructions:**');
  console.log('1. Build: Use tsconfig.tsc-alias.json with tsc-alias');
  console.log('2. Jest: Merge jest.aliases.json into jest.config.js');
  console.log('3. Webpack: Use webpack.aliases.json in webpack config');
  console.log('4. Runtime: Require this file in your entry point');
}
