const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const { FileStore } = require("metro-cache");

const config = getDefaultConfig(__dirname);

// Store Metro cache inside the project to avoid macOS temp permission/SIP issues
config.cacheStores = [
  new FileStore({
    root: path.join(__dirname, ".metro-cache"),
  }),
];

module.exports = config;
