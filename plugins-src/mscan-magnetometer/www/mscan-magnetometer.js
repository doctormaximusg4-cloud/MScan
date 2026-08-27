var exec = require('cordova/exec');

module.exports = {
  start: function(success, error, options) {
    exec(success, error, 'MScanMagnetometer', 'start', [options || {}]);
  },
  stop: function(success, error) {
    exec(success, error, 'MScanMagnetometer', 'stop', []);
  }
};
