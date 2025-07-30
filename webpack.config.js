const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: {
    'input-sanitizer': './src/cli/utils/input-sanitizer.ts',
    'command-injection-prevention': './src/cli/utils/command-injection-prevention.ts',
    'secure-cli-wrapper': './src/cli/utils/secure-cli-wrapper.ts',
    spinner: './src/cli/utils/spinner.ts',
    validators: './src/cli/prompts/validators.ts',
    'task-prompts': './src/cli/prompts/task-prompts.ts',
    'board-prompts': './src/cli/prompts/board-prompts.ts',
    'task-size-estimator': './src/cli/estimation/task-size-estimator.ts',
    'board-formatter': './src/cli/utils/board-formatter.ts',
    'task-list-formatter': './src/cli/utils/task-list-formatter.ts',
    'api-client-wrapper': './src/cli/api-client-wrapper.ts',
    'cli-index': './src/cli/index.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist/security'),
    filename: '[name].js',
    library: '[name]',
    libraryTarget: 'commonjs2',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@cli': path.resolve(__dirname, 'src/cli'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@types': path.resolve(__dirname, 'src/types'),
      '@config': path.resolve(__dirname, 'src/config'),
    },
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, 'tsconfig.build.json'),
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  externals: {
    // Node.js built-ins
    fs: 'commonjs fs',
    path: 'commonjs path',
    os: 'commonjs os',
    crypto: 'commonjs crypto',
    util: 'commonjs util',
    events: 'commonjs events',
    buffer: 'commonjs buffer',
    stream: 'commonjs stream',
    child_process: 'commonjs child_process',

    // External dependencies - keep as external
    dompurify: 'commonjs dompurify',
    jsdom: 'commonjs jsdom',
    ora: 'commonjs ora',
    chalk: 'commonjs chalk',
    zod: 'commonjs zod',
    commander: 'commonjs commander',
    enquirer: 'commonjs enquirer',
    prompts: 'commonjs prompts',
    ink: 'commonjs ink',
    react: 'commonjs react',
    inquirer: 'commonjs inquirer',
    'date-fns': 'commonjs date-fns',
    'cli-table3': 'commonjs cli-table3',
    blessed: 'commonjs blessed',
    'blessed-contrib': 'commonjs blessed-contrib',
  },
  optimization: {
    minimize: true,
    minimizer: [
      new (require('terser-webpack-plugin'))({
        terserOptions: {
          parse: {
            ecma: 2020,
          },
          compress: {
            ecma: 2020,
            drop_console: false,
            drop_debugger: false,
          },
          mangle: {
            safari10: true,
          },
          format: {
            ecma: 2020,
            comments: false,
            safari10: true,
          },
        },
        extractComments: false,
      }),
    ],
    sideEffects: false,
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
        common: {
          name: 'common',
          minChunks: 2,
          chunks: 'all',
          enforce: true,
        },
      },
    },
  },
  stats: {
    warnings: false,
    modules: false,
    entrypoints: false,
  },
  performance: {
    hints: 'warning',
    maxEntrypointSize: 512000,
    maxAssetSize: 512000,
  },
};
