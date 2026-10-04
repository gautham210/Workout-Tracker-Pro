const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

// ../shared holds the exercise catalogue, drawn scenes and bundled exercise
// photographs used by web, mobile and the API.
const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, '../shared')];
module.exports = config;
