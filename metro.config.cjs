// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web: load the SQLite WebAssembly binary and enable
// SharedArrayBuffer via cross-origin isolation headers.
// Setup from https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/ (web section).
config.resolver.assetExts.push('wasm');

// The HTML page gets these headers from the expo-router plugin in app.json.
// This middleware adds them to the JS bundles too, which the SQLite web
// worker needs. Metro marks enhanceMiddleware as deprecated, but it is still
// what the expo-sqlite docs prescribe and router "headers" skip bundles.
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  };
};

module.exports = config;
