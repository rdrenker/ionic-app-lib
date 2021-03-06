//Cross walk process

//See the cordova-engine-crosswalk plugin for how to install the browser as a plugin
//https://github.com/MobileChromeApps/cordova-crosswalk-engine

//Find CrossWalk webviews here:
//https://download.01.org/crosswalk/releases/crosswalk/android/stable/

//Download the release for cordova-crosswalk-engine
//Download the release for cordova-android with crosswalk
//Ensure Android API 19 is installed
//Run ionic platform rm android
//Run ionic platform add ./engine/cordova-android-crosswalk
//Run ionic plugin add ./engine/cordova-crosswalk-engine
//Run android update project on android file
//Run project - cordova run android BUILD_MULTIPLE_APKS=true

var Cordova = require('./cordova'),
    events = require('./events'),
    fs = require('fs'),
    IonicInfo = require('./info'),
    IonicProject = require('./project'),
    path = require('path'),
    proxyMiddleware = require('proxy-middleware'),
    Q = require('q'),
    request = require('request'),
    shelljs = require('shelljs'),
    Task = require('./task').Task,
    Utils = require('./utils'),
    _ = require('underscore');

var Browser = module.exports;
var currentAppDirectory;

shelljs.config.silent = true;

var crosswalkEngineVersion = 'c0.7.1',
    cordovaAndroidVersion = 'c0.6.1',
    platforms = ['android', 'ios'];

Browser.crosswalkVersions = [
  {
    version: '8.37.189.14',
    publish_date: '2014-10-10 03:26'
  },
  {
    version: '9.38.208.10',
    publish_date: '2014-11-25 11:45'
  },
  {
    version: '10.39.235.15',
    publish_date: '2014-12-31 13:16'
  },
  {
    version: '11.40.277.7',
    publish_date: '2015-02-26 07:03'
  },
  {
    version: '12.41.296.5',
    publish_date: '2015-03-05 13:19'
  },
  {
    version: '13.42.319.6',
    publish_date: '2015-04-14 14:24',
    beta: true
  },
  {
    version: '14.42.334.0',
    publish_date: '2015-04-13 09:16',
    canary: true
  }
];

Browser.defaultCrosswalkVersion = Browser.crosswalkVersions[4].version;

Browser.crosswalkLiteVersions = [
  {
    version: '10.39.234.1',
    publish_date: '2015-03-06 03:06',
    canary: true
  }
];

Browser.defaultCrosswalkLiteVersion = Browser.crosswalkLiteVersions[0].version;

var iosBrowsers = [
  {
    platform: 'iOS',
    name: 'WKWebView',
    available: false,
    command: 'ionic browser add wkwebview'
  },
  {
    platform: 'iOS',
    name: 'UIWebView',
    available: false,
    command: 'ionic browser revert ios'
  }
],
androidBrowsers = [
  {
    platform: 'Android',
    name: 'Crosswalk',
    available: true,
    command: 'ionic browser add crosswalk',
    versions: Browser.crosswalkVersions
  },
  {
    platform: 'Android',
    name: 'Crosswalk-lite',
    available: true,
    command: 'ionic browser add crosswalk-lite',
    versions: Browser.crosswalkLiteVersions
  },
  {
    platform: 'Android',
    name: 'Browser (default)',
    available: true,
    command: 'ionic browser revert android'
  },
  {
    platform: 'Android',
    name: 'GeckoView',
    available: false,
    command: 'ionic browser add geckoview'
  }
];

Browser.downloadCordovaCrosswalkEngine = function downloadCordovaCrosswalkEngine(appDirectory) {
  var q = Q.defer();

  if (!fs.existsSync(path.join(appDirectory, 'engine'))) {
    shelljs.mkdir(path.join(appDirectory, 'engine'));
  }

  var cordovaCrosswalkFolderName = ['cordova-crosswalk-engine-', crosswalkEngineVersion].join('');

  if (fs.existsSync(path.join(appDirectory, 'engine', cordovaCrosswalkFolderName))) {
    events.emit('verbose', 'The Engine already exists for version ', crosswalkEngineVersion);
    q.resolve();
    return q.promise;
  }

  var downloadUrl = ['https://github.com/driftyco/cordova-crosswalk-engine/archive/', crosswalkEngineVersion, '.zip'].join('');

  var tempZipFilePath = path.join(appDirectory, 'engine', 'cordova-crosswalk-engine.zip');
  var zipOutPath = path.join(appDirectory, 'engine');

  Utils.fetchArchive(zipOutPath, downloadUrl)
  .then(function(data) {
    q.resolve();
  }, function(error) {
    events.emit('log', 'Failed to download cordova-crosswalk-engine - ', error);
    q.reject();
  })

  return q.promise;
};

// Browser.getAndroidRuntimes = function getAndroidRuntimes() {
//   var command = 'echo "y" | android update sdk --no-ui --all --filter 10';
//   events.emit('log', '\nFetching Android SDK API 19.1.0')
//   // var result = shelljs.exec(command, { silent: true } );

//   // if(result.code != 0) {
//   //   var errorMessage = 'Had an error fetching the Android SDK required for Crosswalk.';
//   //   this.ionic.fail(errorMessage);
//   //   throw new Error(errorMessage);
//   // }
// }

Browser.copyInCrosswalkLibrariesToCrosswalkEngine = function copyInCrosswalkLibrariesToCrosswalkEngine(appDirectory, architecture, version) {
  var copyMessage = ['\nCopying over Crosswalk Webview (', architecture, ') to the Crosswalk Engine\n'].join('');
  events.emit('log', copyMessage);
  var xwalkFilePath = path.join(appDirectory, 'engine', 'xwalk-webviews', architecture);
  var fileName = fs.readdirSync(xwalkFilePath);
  var cordovaCrosswalkFolder = ['cordova-crosswalk-engine-', crosswalkEngineVersion].join('');
  var copySource = path.join(xwalkFilePath, fileName[0], '*');

  var copyDestination = path.join(appDirectory, 'engine', cordovaCrosswalkFolder, 'libs', 'xwalk_core_library', '/');

  shelljs.cp('-R', copySource, copyDestination);
  var copyCompleteMessage = ['Finished copying Crosswalk Webview (', architecture, ') to the Crosswalk Engine'].join('');
  events.emit('log', copyCompleteMessage);
};

Browser.downloadCrosswalkWebview = function downloadCrosswalkWebview(appDirectory, architecture, version, releaseStatus, isLiteVersion) {
  var q = Q.defer();
  if (isLiteVersion) {
    crosswalkType = 'crosswalk-lite';
  } else {
    crosswalkType = 'crosswalk';
  }
  // https://download.01.org/crosswalk/releases/crosswalk-lite/android/canary/10.39.234.1/
  var downloadUrl = ['https://download.01.org/crosswalk/releases/', crosswalkType, '/android/', releaseStatus, '/',
    version, '/', architecture, '/crosswalk-webview-', version, '-', architecture, '.zip'].join('');

  var tempZipFilePath = path.join(appDirectory, 'engine', 'xwalk-webviews', architecture);

  if (!fs.existsSync(path.join(appDirectory, 'engine', 'xwalk-webviews'))) {
    shelljs.mkdir(path.join(appDirectory, 'engine', 'xwalk-webviews'));
  }

  var xwalkPath = ['crosswalk-webview-', version, '-', architecture].join('');
  var xwalkArchPath = path.join(tempZipFilePath, xwalkPath);

  if(fs.existsSync(xwalkArchPath)) {
    //We've already downloaded it. Copy it over!
    Browser.copyInCrosswalkLibrariesToCrosswalkEngine(appDirectory, architecture, version);
    q.resolve();
    return;
  }

  Utils.fetchArchive(tempZipFilePath, downloadUrl)
  .then(function(data) {
    Browser.copyInCrosswalkLibrariesToCrosswalkEngine(appDirectory, architecture, version);
    q.resolve(data);
  }, function(error) {
    events.emit('log', 'Crosswalk webviews failed to download - ', error);
    q.reject(error);
  });

  return q.promise;
};

Browser.downloadCrosswalkWebviews = function downloadCrosswalkWebviews(appDirectory, version, isLiteVersion) {
  // var version = version ? version : '8.37.189.14';

  events.emit('verbose', 'Attempting to install crosswalk version: ', version);

  var xwalkVersion;

  if (isLiteVersion) {
    xwalkVersion = _.findWhere(Browser.crosswalkLiteVersions, { version: version });
  } else {
    xwalkVersion = _.findWhere(Browser.crosswalkVersions, { version: version });
  }

  // events.emit('log', 'xwalk', xwalkVersion)

  if (!xwalkVersion) {
    events.emit('log', '\nYou must specify a valid version from crosswalk. Run `ionic browser list` to see versions')
    // q.reject('You must specify a valid version from crosswalk. Run `ionic browser list` to see versions')
    throw new Error('Invalid version of Crosswalk specified');
  }

  var releaseStatus = 'stable';

  if (xwalkVersion.beta) {
    releaseStatus = 'beta';
  } else if (xwalkVersion.canary) {
    releaseStatus = 'canary';
  }

  var armPromise = Browser.downloadCrosswalkWebview(appDirectory, 'arm', version, releaseStatus, isLiteVersion);
  var x86Promise = Browser.downloadCrosswalkWebview(appDirectory, 'x86', version, releaseStatus, isLiteVersion);

  return Q.all([armPromise, x86Promise]);
};

Browser.downloadCordova40x = function downloadCordova40x(appDirectory) {
  var q = Q.defer();

  var crosswalkEngineUnzipName = ['cordova-android-', cordovaAndroidVersion].join('');
  var downloadUrl = ['https://github.com/driftyco/cordova-android/archive/', cordovaAndroidVersion, '.zip'].join('');

  var tempZipFilePath = path.join(appDirectory, 'engine');
  var cordovaAndroid4Path = path.join(tempZipFilePath, crosswalkEngineUnzipName, 'bin');
  var android4BinPath = path.join(cordovaAndroid4Path, 'templates', 'cordova');

  if (fs.existsSync(path.join(tempZipFilePath, crosswalkEngineUnzipName))) {

    Browser.setPermissionsForFolder(cordovaAndroid4Path);
    Browser.setPermissionsForFolder(android4BinPath);

    q.resolve();
    return;
  }

  Utils.fetchArchive(tempZipFilePath, downloadUrl)
  .then(function(data) {
    events.emit('log', '\nFinished downloading cordova-android v4.0.x');
    //Need to make certain files executable
    Browser.setPermissionsForFolder(cordovaAndroid4Path);
    Browser.setPermissionsForFolder(android4BinPath);
    events.emit('log', '\nAltered permissions for Android Paths');
    q.resolve();
  }, function(error) {
    events.emit('log', 'Failed to download cordova-android v4.0.x ', error);
    q.reject();
  })

  return q.promise;
};

Browser.setPermissionsForFolder = function setPermissionsForFolder(folderName) {
  fs.readdir(folderName, function(err, files){
    if(err) return;
    for(var x=0; x<files.length; x++) {
      var file = path.join(folderName, files[x]);
      try {
        fs.chmodSync(file, '755');
      }catch (ex) {
        Utils.fail(['Error setting file permissions for file', file, ex].join(' '));
      }
    }
  });
};

Browser.removeAndroidProject = function removeAndroidProject(appDirectory, saveToPackageJson) {
  return Cordova.removePlatform(appDirectory, 'android', saveToPackageJson)
  .then(function() {
    events.emit('log', '\nRemoved old Cordova Android platform');
  })
};

Browser.addCordova40xProject = function addCordova40xProject(appDirectory, saveToPackageJson) {
  var cordovaAndroidPath = ['./engine/cordova-android-', cordovaAndroidVersion, '/'].join('');
  // var cordovaAndroidPath = 'android@4.0.0';
  return Cordova.addPlatform(appDirectory, cordovaAndroidPath, saveToPackageJson)
  .then(function() {
    events.emit('log', '\nAdded Cordova Android 4.0');
  })
  .catch(function(error) {
    var errorMessage = ['There was an error adding the Cordova Android library', error.message].join('\n');
    // throw error;
    throw new Error(errorMessage);
  });
};

Browser.addGradleProperties = function addGradleProperties(appDirectory) {
  var gradlePropertiesPath = path.resolve(__dirname, 'assets', 'gradle.properties');
  var copyPath = path.join(appDirectory, 'platforms', 'android', 'gradle.properties');
  events.emit('log', '\nCopying default gradle.properties file');
  shelljs.cp(gradlePropertiesPath, copyPath);
};

Browser.addWhitelistPlugin = function addWhitelistPlugin(appDirectory, saveToPackageJson) {
  var whitelistPlugin = 'https://github.com/apache/cordova-plugin-whitelist.git#r1.0.0';
  return Cordova.addPlugin(appDirectory, whitelistPlugin, null, saveToPackageJson)
  .then(function() {
    events.emit('log', '\nAdded Crosswalk Whitelist Plugin');
  });
};

Browser.addCrosswalkPlugin = function addCrosswalkPlugin(appDirectory, saveToPackageJson) {
  // var command = ['ionic plugin add ./engine/cordova-crosswalk-engine-', crosswalkEngineVersion].join('');
  var crosswalkEnginePath = ['engine/cordova-crosswalk-engine-', crosswalkEngineVersion].join('');
  return Cordova.addPlugin(appDirectory, crosswalkEnginePath, null, saveToPackageJson)
  .then(function() {
    events.emit('log', '\nAdded Crosswalk Webview Engine');
  })
  .catch(function(error) {
    throw error;
  });
};

Browser.removeCrosswalkEngines = function removeCrosswalkEngines(appDirectory, saveToPackageJson) {
  Cordova.removePlugin(appDirectory, 'org.apache.cordova.engine.crosswalk', saveToPackageJson);
  Cordova.removePlugin(appDirectory, 'org.crosswalk.engine', saveToPackageJson);
  Cordova.removePlugin(appDirectory, 'cordova-plugin-crosswalk-webview', saveToPackageJson);
};

Browser.addSplashScreenPlugin = function addSplashScreenPlugin(appDirectory, saveToPackageJson) {
  return Cordova.addPlugin(appDirectory, 'org.apache.cordova.splashscreen', null, saveToPackageJson);
};

// Browser.updateAndroidProject = function updateAndroidProject() {
//   var crosswalkEnginePath = ['cordova-crosswalk-engine-', crosswalkEngineVersion].join('');
//   var xwalkLibraryPath = path.join(process.cwd(), 'engine', crosswalkEnginePath, 'libs', 'xwalk_core_library');
//   var updateCommand = ['android update lib-project --path "', xwalkLibraryPath, '" --target "4"'].join('');

//   shelljs.cd(path.join(process.cwd(), 'platforms', 'android'));

//   shelljs.exec(updateCommand, {silent: true});

//   shelljs.cd('../../');
// }

Browser.downloadFiles = function downloadFiles(appDirectory, version, isLiteVersion) {
  // var q = Q.defer();

  return Browser.downloadCordovaCrosswalkEngine(appDirectory)
  .then(function(data) {
    events.emit('log', '\nDownloaded cordova-crosswalk-engine');
    return Browser.downloadCordova40x(appDirectory);
  })
  .then(function(data) {
    events.emit('log', '\nDownloaded Cordova Android for Crosswalk');
    return Browser.downloadCrosswalkWebviews(appDirectory, version, isLiteVersion);
  })
  // .then(function(data) {
  //   events.emit('log', '\nDownloaded Crosswalk webviews');
  //   return self.getAndroidRuntimes();
  // })
  .then(function(data) {
    events.emit('log', '\nDownloaded Crosswalk webviews');
  })
  .catch(function(error){
    events.emit('log', 'There was an error finishing the browser command - ', error);
    // q.reject(error);
    throw error;
  });

  // return q.promise;
}

Browser.removeCrosswalk = function removeCrosswalk() {
  shelljs.exec('ionic plugin rm org.apache.cordova.engine.crosswalk');
  shelljs.exec('ionic plugin rm org.crosswalk.engine');
  shelljs.exec('ionic platform rm android');
  shelljs.exec('ionic platform add android');
};

Browser.installCrosswalk = function installCrosswalk(appDirectory, version, saveToPackageJson, isLiteVersion) {

  var info = IonicInfo.gatherInfo();
  var semver = require('semver');

  if (!info.cordova) {
    var cordovaMessage = 'You must have the Cordova CLI installed (npm install -g cordova)'.red.bold;
    events.emit('log', cordovaMessage);
    return Q(cordovaMessage);
  } else if (semver.satisfies(info.cordova, '5.0.x')) {
    events.emit('log', '*Info*\nCordova CLI v5.0 no longer requires you to use the ionic browser command to get Crosswalk installed'.yellow);
    events.emit('log', 'The ionic browser command will install Cordova Android, the Crosswalk plugin, the whitelist plugin, and the splashscreen plugin for your convenience.'.yellow);
    events.emit('log', 'Due to this, if you need to specify a version of Crosswalk, see this link: https://github.com/crosswalk-project/cordova-plugin-crosswalk-webview#configure'.yellow);
    events.emit('log', 'Enjoy! :)'.green);
    shelljs.exec('cordova platform add android');
    events.emit('log', 'Added Android'.green);
    shelljs.exec('cordova plugin add cordova-plugin-crosswalk-webview');
    events.emit('log', 'Added Crosswalk plugin'.green);
    shelljs.exec('cordova plugin add cordova-plugin-whitelist');
    events.emit('log', 'Added whitelist plugin'.green);
    shelljs.exec('cordova plugin add cordova-plugin-splashscreen');
    events.emit('log', 'Added splash screen plugin'.green);
    // return
    var completeMessage = 'Completed installing Crosswalk'.green.bold;
    events.emit('log', completeMessage);
    return Q(completeMessage);
  } 

  events.emit('log', ['You are running Cordova CLI', info.cordova, '- installing Cordova Android and Crosswalk manually'.yellow.bold].join(' '));

  return Browser.downloadFiles(appDirectory, version, isLiteVersion)
  .then(function(data) {
    return Browser.removeAndroidProject(appDirectory, saveToPackageJson);
  })
  .then(function(){
    return Browser.removeCrosswalkEngines(appDirectory, saveToPackageJson);
  })
  .then(function() {
    return Browser.addCordova40xProject(appDirectory, saveToPackageJson);
  })
  .then(function() {
    return Browser.addCrosswalkPlugin(appDirectory, saveToPackageJson);
  })
  .then(function() {
    return Browser.addSplashScreenPlugin(appDirectory, saveToPackageJson);
    // return Browser.addWhitelistPlugin(appDirectory, saveToPackageJson);
  })
  .then(function() {
    Browser.addGradleProperties(appDirectory);
    return Browser.addWhitelistPlugin(appDirectory, saveToPackageJson);
    // self.updateAndroidProject();
  })
  .then(function(){
    events.emit('log', '\nIonic Browser Add completed for Crosswalk');
  })
  .catch(function(error){
    console.error('\nAn error with adding Crosswalk browser occured', error);
    Utils.fail(error);
    throw error;
    // events.emit('log', error)
  });
};

Browser.clean = function clean(appDirectory) {
  events.emit('log', 'Cleaning up Ionic browser artifacts'.green);
  shelljs.rm('-rf', path.join(appDirectory, './engine'));
  events.emit('log', 'Cleaned'.yellow);
};

Browser.upgradeCrosswalk = function upgradeCrosswalk(appDirectory) {
  events.emit('log', 'Updating your Ionic project with the latest build of Crosswalk'.green);
  Browser.clean(appDirectory);
  Browser.installCrosswalk(appDirectory, Browser.defaultCrosswalkVersion);
};

Browser.revertBrowser = function revertBrowser(appDirectory, platform) {
  if (!platform) {
    events.emit('log', 'You did not specify a platform to revert the browser');
    return
  }

  if(platforms.indexOf(platform) == -1) {
    events.emit('log', 'You did not specify a valid platform.');
    return
  }

  events.emit('log', 'Reverting', platform, 'browser');

  var rmCommand = ['ionic platform rm', platform].join(' ');
  var addCommand = ['ionic platform add', platform].join(' ');

  shelljs.exec(rmCommand);

  if(platform == 'android') {
    Browser.removeCrosswalk();
  }

  shelljs.exec(addCommand);

  events.emit('log', 'Reverted', platform, 'browser');
}

Browser.saveBrowserInstallation = function saveBrowserInstallation(platform, browser, version) {
  var project = IonicProject.load();
  var browsers = project.get('browsers') || [];
  var platformExists = false, platformIndex = 0;
  var browserEntry = { platform: platform, browser: browser, version: version };

  for( ; platformIndex < browsers.length; platformIndex++) {
    var platformBrowser = browsers[platformIndex];
    if(platformBrowser.platform == platform) {
      platformExists = true;
      break;
    }
  }

  if(platformExists) {
    browsers[platformIndex] = browserEntry;
  } else {
    browsers.push(browserEntry);
  }

  project.set('browsers', browsers);
  project.save();
};

Browser.addBrowser = function addBrowser(appDirectory, browserToInstall, saveToPackageJson) {

  if (!appDirectory) { 
    throw 'You must pass a directory to run this command';
  }

  if (!browserToInstall) {
    throw 'You must pass a browser to be installed';
  }

  var platform = 'android',
      browserVersion = null,
      validBrowserSpecified = false,
      browserVersionAttempt;

  if (browserToInstall.indexOf('@') !== -1) {
    //Browser version specified. Find version number.
    browserVersionAttempt = browserToInstall.split('@');
    browserToInstall = browserVersionAttempt[0];
    browserVersion = browserVersionAttempt[1];
  } else {
    browserVersion = Browser.defaultCrosswalkVersion;
  }

  var promise;

  switch (browserToInstall) {
    case 'crosswalk':
      events.emit('log', ['Adding', browserToInstall, 'browser'].join(' '));
      promise = Browser.installCrosswalk(appDirectory, browserVersion, saveToPackageJson);
      validBrowserSpecified = true;
      break;
    case 'crosswalk-lite':
      events.emit('log', 'Adding', browserToInstall, 'browser');
      promise = Browser.installCrosswalk(appDirectory, Browser.defaultCrosswalkLiteVersion, saveToPackageJson, true);
      validBrowserSpecified = true;
      break;
    // case 'wkwebview':
    //   events.emit('log', 'Adding', browserToInstall, 'browser');
    //   Browser.installWkWebView();
    //   validBrowserSpecified = true;
    //   break;
    default:
      events.emit('log', 'No accepted browser was specified.'.red.bold);
      validBrowserSpecified = false;
      promise = Q();
      break;
  }

  return promise
  .then(function() {
    if (validBrowserSpecified) {
      Browser.saveBrowserInstallation(platform, browserToInstall, browserVersion);
    }
  })
  .catch(function(error) {
    events.emit('log', 'An error occured with addBrowser', error);
    throw error;
  });
};

Browser.removeBrowser = function removeBrowser(appDirectory) {
  var browser = 'crosswalk';

  if (argv._[2]) {
    browser = argv._[2];
    events.emit('log', 'Removing', browser, 'browser');
  } else {
    events.emit('log', 'You did not specify a browser to remove.'.red);
    return;
  }

  switch (browser) {
    case 'crosswalk':
      Browser.removeCrosswalk();
      break;
    case 'default':
      Browser.removeDefault();
      break;
  }

}

var printBrowsers = function printBrowsers(browsers) {
  for(var x = 0, y = browsers.length; x < y; x++) {
    var browser = browsers[x];
    var avail = browser.available ? 'Yes' : 'No';
    var installCommand = browser.command ? browser.command : '';

    if (browser.available) {
      events.emit('log', '\nAvailable'.green.bold, '-', browser.name.green, '-', installCommand);
      if (browser.versions) {
        for (version in browser.versions) {
          var ver = browser.versions[version];

          var betaCanaryMessage = null;

          if (ver.beta) {
            betaCanaryMessage = '(beta)\t'
          } else if (ver.canary) {
            betaCanaryMessage = '(canary)'
          } else {
            betaCanaryMessage = '\t';
          }

          // events.emit('log', 'betacanary', betaCanaryMessage)
          // events.emit('log', 'beta canary msg', betaCanaryMessage)
          events.emit('log', betaCanaryMessage, 'Version'.blue, ver.version.yellow, 'Published'.cyan, new Date(ver.publish_date));
        }
      }
    } else {
      events.emit('log', 'Not Available Yet'.red.bold, '-', browser.name.green);
    }
  }
};

Browser.listBrowsers = function listBrowsers(appDirectory) {
  events.emit('log', 'iOS - Browsers Listing:\n');

  printBrowsers(iosBrowsers);

  events.emit('log', '\n\nAndroid - Browsers Listing:\n');

  printBrowsers(androidBrowsers);
};

Browser.listInstalledBrowsers = function listInstalledBrowsers(appDirectory) {
  var project = IonicProject.load();

  var browsers = project.get('browsers');

  events.emit('log', '\nInstalled browsers:\n'.green);

  for(browserIndex in browsers) {
    var browser = browsers[browserIndex];
    events.emit('log', 'For', browser.platform, '-', browser.browser, browser.version);
  }

  events.emit('log', '\n');
};
