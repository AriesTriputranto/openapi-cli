import {
  bundle,
  formatProblems,
  getTotals,
  loadConfig,
  OutputFormat,
  lint,
} from '@redocly/openapi-core';
import {
  dumpBundle,
  getExecutionTime,
  getFallbackEntryPointsOrExit,
  getOutputFileName,
  handleError,
  printUnusedWarnings,
  saveBundle,
  printLintTotals,
} from '../utils';
import { OutputExtensions, Totals } from '../types';
import { performance } from 'perf_hooks';
import { blue, gray, green, yellow } from 'colorette';
import { writeFileSync } from 'fs';

export async function handleBundle(
  argv: {
    entrypoints: string[];
    output?: string;
    ext: OutputExtensions;
    'max-problems'?: number;
    'skip-rule'?: string[];
    'skip-preprocessor'?: string[];
    'skip-decorator'?: string[];
    dereferenced?: boolean;
    force?: boolean;
    config?: string;
    lint?: boolean;
    format: OutputFormat;
    metafile?: string;
    extends?: string[];
  },
  version: string,
) {
  const config = await loadConfig(argv.config, argv.extends);
  config.lint.skipRules(argv['skip-rule']);
  config.lint.skipPreprocessors(argv['skip-preprocessor']);
  config.lint.skipDecorators(argv['skip-decorator']);
  const entrypoints = await getFallbackEntryPointsOrExit(argv.entrypoints, config);
  const totals: Totals = { errors: 0, warnings: 0, ignored: 0 };
  const maxProblems = argv['max-problems'];

  for (const entrypoint of entrypoints) {
    try {
      const startedAt = performance.now();

      if (argv.lint) {
        if (config.lint.recommendedFallback) {
          process.stderr.write(
            `No configurations were defined in extends -- using built in ${blue(
              'recommended',
            )} configuration by default.\n\n`,
          );
        }
        const results = await lint({
          ref: entrypoint,
          config,
        });
        const fileLintTotals = getTotals(results);

        totals.errors += fileLintTotals.errors;
        totals.warnings += fileLintTotals.warnings;
        totals.ignored += fileLintTotals.ignored;

        formatProblems(results, {
          format: argv.format || 'codeframe',
          totals: fileLintTotals,
          version,
          maxProblems,
        });
        printLintTotals(fileLintTotals, 2);
      }

      process.stderr.write(gray(`bundling ${entrypoint}...\n`));
      const {
        bundle: result,
        problems,
        ...meta
      } = await bundle({
        config,
        ref: entrypoint,
        dereference: argv.dereferenced,
      });

      const fileTotals = getTotals(problems);
      const { outputFile, ext } = getOutputFileName(
        entrypoint,
        entrypoints.length,
        argv.output,
        argv.ext,
      );

      if (fileTotals.errors === 0 || argv.force) {
        if (!argv.output) {
          const output = dumpBundle(result.parsed, argv.ext || 'yaml', argv.dereferenced);
          process.stdout.write(output);
        } else {
          const output = dumpBundle(result.parsed, ext, argv.dereferenced);
          saveBundle(outputFile, output);
        }
      }

      totals.errors += fileTotals.errors;
      totals.warnings += fileTotals.warnings;
      totals.ignored += fileTotals.ignored;

      formatProblems(problems, {
        format: argv.format,
        maxProblems,
        totals: fileTotals,
        version,
      });

      if (argv.metafile) {
        if (entrypoints.length > 1) {
          process.stderr.write(
            yellow(`[WARNING] "--metafile" cannot be used with multiple entrypoints. Skipping...`),
          );
        }
        {
          writeFileSync(argv.metafile, JSON.stringify(meta), 'utf-8');
        }
      }

      const elapsed = getExecutionTime(startedAt);
      if (fileTotals.errors > 0) {
        if (argv.force) {
          process.stderr.write(
            `❓ Created a bundle for ${blue(entrypoint)} at ${blue(outputFile)} with errors ${green(
              elapsed,
            )}.\n${yellow('Errors ignored because of --force')}.\n`,
          );
        } else {
          process.stderr.write(
            `❌ Errors encountered while bundling ${blue(
              entrypoint,
            )}: bundle not created (use --force to ignore errors).\n`,
          );
        }
      } else {
        process.stderr.write(
          `📦 Created a bundle for ${blue(entrypoint)} at ${blue(outputFile)} ${green(elapsed)}.\n`,
        );
      }
    } catch (e) {
      handleError(e, entrypoint);
    }
  }

  printUnusedWarnings(config.lint);
  process.exit(totals.errors === 0 || argv.force ? 0 : 1);
}
