const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = (_env, argv) => {
  const isProduction = argv.mode === 'production';
  const buildId = process.env.BUILD_ID || `dev-${Date.now()}`;

  return {
    entry: './src/index.tsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? '[name].[contenthash].js' : '[name].js',
      publicPath: '/',
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx|js|jsx)$/,
          exclude: /node_modules/,
          use: 'babel-loader',
        },
        {
          test: /\.module\.scss$/,
          use: [
            'style-loader',
            {
              loader: 'css-loader',
              options: { modules: { localIdentName: '[name]__[local]__[hash:base64:5]' } },
            },
            'sass-loader',
          ],
        },
        {
          test: /\.scss$/,
          exclude: /\.module\.scss$/,
          use: ['style-loader', 'css-loader', 'sass-loader'],
        },
        {
          // Plain CSS — the McDermott design-system layer under src/mws/. css-loader
          // resolves and inlines the @import chain in mws/styles.css.
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './public/index.html',
        templateParameters: { buildId },
      }),
      new webpack.DefinePlugin({
        __BUILD_ID__: JSON.stringify(buildId),
      }),
      new webpack.optimize.SplitChunksPlugin({
        cacheGroups: {
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
            name: 'react',
            chunks: 'all',
          },
        },
      }),
    ],
    optimization: isProduction
      ? {
          minimize: true,
          minimizer: [
            new (require('terser-webpack-plugin'))({
              terserOptions: {
                compress: { drop_console: true, drop_debugger: true },
              },
            }),
          ],
        }
      : {},
    devServer: {
      static: path.resolve(__dirname, 'public'),
      historyApiFallback: true,
      port: 5173,
      hot: true,
      proxy: [
        {
          context: ['/api'],
          target: 'http://localhost:5080',
          secure: false,
        },
      ],
    },
    // Non-eval source maps in dev too: the app ships a strict CSP (no 'unsafe-eval'),
    // and eval-based devtools would be blocked, leaving a blank page under that CSP.
    devtool: isProduction ? 'source-map' : 'cheap-module-source-map',
  };
};
