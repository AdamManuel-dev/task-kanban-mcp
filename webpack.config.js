const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: {
    'input-sanitizer': './src/cli/utils/input-sanitizer.ts',
    'command-injection-prevention': './src/cli/utils/command-injection-prevention.ts',
    'secure-cli-wrapper': './src/cli/utils/secure-cli-wrapper.ts',
    'spinner': './src/cli/utils/spinner.ts',
    'validators': './src/cli/prompts/validators.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist/security'),
    filename: '[name].js',
    library: '[name]',
    libraryTarget: 'commonjs2'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@cli': path.resolve(__dirname, 'src/cli'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@types': path.resolve(__dirname, 'src/types'),
      '@config': path.resolve(__dirname, 'src/config')
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, 'tsconfig.build.json'),
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      }
    ]
  },
  externals: {
    // Node.js built-ins
    'fs': 'commonjs fs',
    'path': 'commonjs path',
    'os': 'commonjs os',
    'crypto': 'commonjs crypto',
    'util': 'commonjs util',
    'events': 'commonjs events',
    'buffer': 'commonjs buffer',
    'stream': 'commonjs stream',
    'child_process': 'commonjs child_process',
    
    // External dependencies - keep as external
    'dompurify': 'commonjs dompurify',
    'jsdom': 'commonjs jsdom',
    'ora': 'commonjs ora',
    'chalk': 'commonjs chalk',
    'zod': 'commonjs zod',
    'commander': 'commonjs commander'
  },
  optimization: {
    minimize: true,
    sideEffects: false
  },
  stats: {
    warnings: false,
    modules: false,
    entrypoints: false
  }
};