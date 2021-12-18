// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { core, sync, SyncOpts } from 'resolve';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { toNormalizedRealPath } from './common';

Object.keys(core).forEach((key) => {
  // 'resolve' hardcodes the list to host's one, but i need
  // to be able to allow 'worker_threads' (target 12) on host 8
  assert(typeof core[key] === 'boolean');
  core[key] = true;
});

export const natives = core;

const PROOF = 'a-proof-that-main-is-captured.js';

function parentDirectoriesContain(parent: string, directory: string) {
  let currentParent = parent;

  while (true) {
    if (currentParent === directory) {
      return true;
    }

    const newParent = path.dirname(currentParent);

    if (newParent === currentParent) {
      return false;
    }

    currentParent = newParent;
  }
}

interface FollowOptions
  extends Pick<SyncOpts, 'basedir' | 'extensions' | 'packageFilter'> {
  ignoreFile?: string;
  readFile?: (file: string) => void;
}

export function follow(x: string, opts: FollowOptions) {
  // TODO async version
  return new Promise<string>((resolve) => {
    resolve(
      sync(x, {
        basedir: opts.basedir,
        extensions: opts.extensions,
        isFile: (file) => {
          if (
            opts.ignoreFile &&
            path.join(path.dirname(opts.ignoreFile), PROOF) === file
          ) {
            return true;
          }

          let stat;

          try {
            stat = fs.statSync(file);
          } catch (e) {
            const ex = e as NodeJS.ErrnoException;

            if (ex && (ex.code === 'ENOENT' || ex.code === 'ENOTDIR'))
              return false;

            throw ex;
          }

          return stat.isFile() || stat.isFIFO();
        },
        isDirectory: (directory) => {
          if (
            opts.ignoreFile &&
            parentDirectoriesContain(opts.ignoreFile, directory)
          ) {
            return false;
          }

          let stat;

          try {
            stat = fs.statSync(directory);
          } catch (e) {
            const ex = e as NodeJS.ErrnoException;

            if (ex && (ex.code === 'ENOENT' || ex.code === 'ENOTDIR')) {
              return false;
            }

            throw ex;
          }

          return stat.isDirectory();
        },
        readFileSync: (file) => {
          if (opts.ignoreFile && opts.ignoreFile === file) {
            return Buffer.from(`{"main":"${PROOF}"}`);
          }

          if (opts.readFile) {
            opts.readFile(file);
          }

          return fs.readFileSync(file);
        },
        packageFilter: (config, base) => {
          if (opts.packageFilter) {
            opts.packageFilter(config, base);
          }

          return config;
        },

        /** function to synchronously resolve a potential symlink to its real path */
        // realpathSync?: (file: string) => string;
        realpathSync: (file) => {
          const file2 = toNormalizedRealPath(file);
          return file2;
        },
      })
    );
  });
}
