#!/usr/bin/env node

import {installNodeHeaders, rebuildNativeModules, shouldRebuildNativeModules} from './main.js';
import {preGypFixRun} from './node-pre-gyp-fix.js'
import {locateElectronPrebuilt} from './electron-locater';
import logger from './logger';
import path from 'path';
import fs from 'fs';

const yargs = require('yargs')
  .usage('Usage: electron-rebuild --version [version] --module-dir [path]')
  .help('h')
  .alias('h', 'help')
  .describe('v', 'The version of Electron to build against')
  .alias('v', 'version')
  .describe('n', 'The NODE_MODULE_VERSION to compare against (process.versions.modules)')
  .alias('n', 'node-module-version')
  .describe('f', 'Force rebuilding modules, even if we would skip it otherwise')
  .alias('f', 'force')
  .describe('a', "Override the target architecture to something other than your system's")
  .alias('a', 'arch')
  .describe('m', 'The path to the node_modules directory to rebuild')
  .alias('m', 'module-dir')
  .describe('w', 'A specific module to build, or comma separated list of modules')
  .alias('w', 'which-module')
  .describe('e', 'The path to electron-prebuilt')
  .alias('e', 'electron-prebuilt-dir')
  .describe('p', 'Enable the ugly (and hopefully not needed soon enough) node-pre-gyp path fixer')
  .alias('p', 'pre-gyp-fix')
  .describe('c', 'The npm command to run')
  .alias('c', 'command')
  .describe('d', 'Custom header tarball URL')
  .alias('d', 'dist-url')
  .describe('verbose', 'Print debugging information')
  .describe('id', 'Ignore devDependencies')
  .alias('id', 'ignore-devdeps')
  .describe('io', 'Ignore optionalDependencies')
  .alias('io', 'ignore-optdeps')
  .describe('l', 'Log the rebuild process')
  .alias('l', 'log')
  .epilog('Copyright 2016');

const argv = yargs.argv;

if (argv.h) {
  yargs.showHelp();
  process.exit(0);
}

if (!argv.e) {
  argv.e = locateElectronPrebuilt();
} else {
  argv.e = path.resolve(process.cwd(), argv.e);
}

if (!argv.c) {
  argv.c = 'rebuild';
}

if (argv.verbose) {
  logger.enabled = true;
}

if (!argv.v) {
  // NB: We assume here that electron-prebuilt is a sibling package of ours
  let pkg = null;
  try {
    let pkgJson = path.join(argv.e, 'package.json');

    pkg = require(pkgJson);

    argv.v = pkg.version;
  } catch (e) {
    console.error("Unable to find electron-prebuilt's version number, either install it or specify an explicit version");
    process.exit(-1);
  }
}

let electronPath = null;
let nodeModuleVersion = null;

if (!argv.n) {
  try {
    let pathDotText = path.join(argv.e, 'path.txt');
    electronPath = path.resolve(argv.e, fs.readFileSync(pathDotText, 'utf8'));
  } catch (e) {
    console.error("Couldn't find electron-prebuilt and no --node-module-version parameter set, always rebuilding");
  }
} else {
  nodeModuleVersion = parseInt(argv.n);
}

if (!argv.m) {
  // NB: We assume here that we're going to rebuild the immediate parent's
  // node modules, which might not always be the case but it's at least a
  // good guess
  try {
    argv.m = path.resolve(__dirname, '../..');
  } catch (e) {
    console.error("Unable to find parent node_modules directory, specify it via --module-dir");
    process.exit(-1);
  }
}

if (!argv.w) {
  argv.w = null;
}

let shouldRebuildPromise = null;
if (!electronPath && !nodeModuleVersion) {
  shouldRebuildPromise = Promise.resolve(true);
} else if (argv.f) {
  shouldRebuildPromise = Promise.resolve(true);
} else if (argv.c == 'install') {
  shouldRebuildPromise = Promise.resolve(true);
} else {
  shouldRebuildPromise = shouldRebuildNativeModules(electronPath, nodeModuleVersion);
}

shouldRebuildPromise
  .then(x => {
    if (!x) process.exit(0);
  })
  .then((x, beforeRebuild) => {
    return installNodeHeaders(argv.v, argv.d, null, argv.a)
      .then(() => rebuildNativeModules(argv.v, argv.m, argv.w, null, argv.a, argv.c, argv.id, argv.io, argv.log))
      .then(() => preGypFixRun(argv.m, argv.p, electronPath, nodeModuleVersion))
      .then(() => process.exit(0));
  })
  .catch((e) => {
    console.error(e.message);
    console.error(e.stack);
    process.exit(-1);
  });
