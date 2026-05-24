const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = merge(common, {
  mode: 'production',
  plugins: [
    new HtmlWebpackPlugin({
      template: './index.html',
      inject: false,
    }),
    new CopyPlugin({
      patterns: [
        { from: 'cart.html', to: 'cart.html' },
        { from: 'products.html', to: 'products.html' },
        { from: 'orders.html', to: 'orders.html' },
        { from: 'login.html', to: 'login.html' },
        { from: 'register.html', to: 'register.html' },
        { from: 'forgot-password.html', to: 'forgot-password.html' },
        { from: 'img', to: 'img' },
        { from: 'css', to: 'css' },
        { from: 'js/admin.js', to: 'js/admin.js' },
        { from: 'js/vendor', to: 'js/vendor' },
        { from: 'icon.svg', to: 'icon.svg' },
        { from: 'favicon.ico', to: 'favicon.ico' },
        { from: 'robots.txt', to: 'robots.txt' },
        { from: 'icon.png', to: 'icon.png' },
        { from: '404.html', to: '404.html' },
        { from: 'admin.html', to: 'admin.html' },
        { from: 'site.webmanifest', to: 'site.webmanifest' },
      ],
    }),
  ],
});
