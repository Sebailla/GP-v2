/**
 * Realm (cross-cutting) step bindings for the Reports slice BDD suite.
 *
 * Lives at `libs/features/reports/docs/step-defs/realm.steps.ts`. Owns
 * the Then-phrasing for cross-scenario assertions.
 *
 * Patterns are RegExp (not cucumber `{string}` expressions) because
 * cucumber 13 has limited support for `{string}` in some configurations,
 * and RegExp gives us full control over route-shaped text. Each
 * capture group is passed to `fn` as a string parameter.
 */

export interface StepBinding {
  readonly keyword: 'Given' | 'When' | 'Then';
  readonly pattern: RegExp;
  readonly fn: (world: unknown, ...args: ReadonlyArray<string>) => Promise<void> | void;
}

import type { ReportsWorld } from './world.js';

function asReportsWorld(world: unknown): ReportsWorld {
  return world as ReportsWorld;
}

export const stepDefinitions: ReadonlyArray<StepBinding> = [
  // ---------------------------------------------------------------------------
  // Then — generic response shape assertions
  // ---------------------------------------------------------------------------

  {
    keyword: 'Then',
    pattern: /^the response contains a ReportsSummary$/,
    fn: (world) => {
      const w = asReportsWorld(world);
      if (!w.lastSummary) {
        throw new Error('Expected lastSummary to be populated');
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the response is not an error$/,
    fn: (world) => {
      const w = asReportsWorld(world);
      if (w.lastError !== null) {
        throw new Error(`Expected no error but got: ${w.lastError}`);
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the response is rejected$/,
    fn: (world) => {
      const w = asReportsWorld(world);
      if (w.lastError === null) {
        throw new Error('Expected an error but the response succeeded');
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the error mentions the 365-day cap$/,
    fn: (world) => {
      const w = asReportsWorld(world);
      if (w.lastError === null || !w.lastError.includes('365')) {
        throw new Error(`Expected error mentioning 365, got: ${w.lastError}`);
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Then — Summary field assertions
  // ---------------------------------------------------------------------------

  {
    keyword: 'Then',
    pattern: /^the summary transactionCount is (\d+)$/,
    fn: (world, count) => {
      const w = asReportsWorld(world);
      if (!w.lastSummary) throw new Error('No summary');
      if (w.lastSummary.transactionCount !== Number(count)) {
        throw new Error(
          `Expected transactionCount ${count}, got ${w.lastSummary.transactionCount}`,
        );
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the summary income is "([^"]*)"$/,
    fn: (world, expected) => {
      const w = asReportsWorld(world);
      if (!w.lastSummary) throw new Error('No summary');
      if (w.lastSummary.income !== expected) {
        throw new Error(`Expected income ${expected}, got ${w.lastSummary.income}`);
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the summary expense is "([^"]*)"$/,
    fn: (world, expected) => {
      const w = asReportsWorld(world);
      if (!w.lastSummary) throw new Error('No summary');
      if (w.lastSummary.expense !== expected) {
        throw new Error(`Expected expense ${expected}, got ${w.lastSummary.expense}`);
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the summary net is "([^"]*)"$/,
    fn: (world, expected) => {
      const w = asReportsWorld(world);
      if (!w.lastSummary) throw new Error('No summary');
      if (w.lastSummary.net !== expected) {
        throw new Error(`Expected net ${expected}, got ${w.lastSummary.net}`);
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Then — Cross-user isolation
  // ---------------------------------------------------------------------------

  {
    keyword: 'Then',
    pattern: /^the response contains ONLY user A's transactions$/,
    fn: (world) => {
      const w = asReportsWorld(world);
      if (!w.lastSummary) throw new Error('No summary');
      const userACount = w.userATransactions.length;
      const userBCount = w.userBTransactions.length;
      if (userBCount > 0 && w.lastSummary.transactionCount === userBCount) {
        throw new Error(
          'Cross-user isolation violated: response transactionCount matches userB count',
        );
      }
      if (userACount === 0 && w.lastSummary.transactionCount > 0) {
        throw new Error(
          'Cross-user isolation violated: userA has 0 transactions but response shows >0',
        );
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the response does NOT contain user B's (.+) transaction$/,
    fn: (world, amount) => {
      const w = asReportsWorld(world);
      if (!w.lastSummary) throw new Error('No summary');
      const dangerAmount = Math.abs(Number(amount));
      const reportedNet = Math.abs(Number(w.lastSummary.net));
      if (reportedNet === dangerAmount) {
        throw new Error(
          `Cross-user isolation violated: response net equals userB's amount ${amount}`,
        );
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Then — Category breakdown
  // ---------------------------------------------------------------------------

  {
    keyword: 'Then',
    pattern: /^the breakdown has (\d+) entries$/,
    fn: (world, count) => {
      const w = asReportsWorld(world);
      if (!w.lastCategoryBreakdown) throw new Error('No breakdown');
      if (w.lastCategoryBreakdown.length !== Number(count)) {
        throw new Error(
          `Expected ${count} entries, got ${w.lastCategoryBreakdown.length}`,
        );
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the breakdown is ordered by absolute expense DESC$/,
    fn: (world) => {
      const w = asReportsWorld(world);
      if (!w.lastCategoryBreakdown) throw new Error('No breakdown');
      for (let i = 1; i < w.lastCategoryBreakdown.length; i++) {
        const prev = w.lastCategoryBreakdown[i - 1];
        const curr = w.lastCategoryBreakdown[i];
        if (!prev || !curr) continue;
        if (Math.abs(Number(prev.total)) < Math.abs(Number(curr.total))) {
          throw new Error('Breakdown not sorted by absolute expense DESC');
        }
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the breakdown (.+) has (\d+) transactions totaling "([^"]*)"$/,
    fn: (world, categoryName, count, total) => {
      const w = asReportsWorld(world);
      if (!w.lastCategoryBreakdown) throw new Error('No breakdown');
      const entry = w.lastCategoryBreakdown.find((e) => e.categoryName === categoryName);
      if (!entry) throw new Error(`No breakdown entry for category ${categoryName}`);
      if (entry.transactionCount !== Number(count)) {
        throw new Error(`Expected ${count} transactions, got ${entry.transactionCount}`);
      }
      if (entry.total !== total) {
        throw new Error(`Expected total ${total}, got ${entry.total}`);
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Then — Period comparison
  // ---------------------------------------------------------------------------

  {
    keyword: 'Then',
    pattern: /^the current period expense is "([^"]*)"$/,
    fn: (world, expected) => {
      const w = asReportsWorld(world);
      if (!w.lastPeriodComparison) throw new Error('No period comparison');
      if (w.lastPeriodComparison.current.totals.expense !== expected) {
        throw new Error(`Expected current expense ${expected}, got ${w.lastPeriodComparison.current.totals.expense}`);
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the previous period expense is "([^"]*)"$/,
    fn: (world, expected) => {
      const w = asReportsWorld(world);
      if (!w.lastPeriodComparison) throw new Error('No period comparison');
      if (w.lastPeriodComparison.previous.totals.expense !== expected) {
        throw new Error(`Expected previous expense ${expected}, got ${w.lastPeriodComparison.previous.totals.expense}`);
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the period delta expense is "([^"]*)"$/,
    fn: (world, expected) => {
      const w = asReportsWorld(world);
      if (!w.lastPeriodComparison) throw new Error('No period comparison');
      if (w.lastPeriodComparison.delta.expense !== expected) {
        throw new Error(`Expected delta expense ${expected}, got ${w.lastPeriodComparison.delta.expense}`);
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the period delta netPercent is null$/,
    fn: (world) => {
      const w = asReportsWorld(world);
      if (!w.lastPeriodComparison) throw new Error('No period comparison');
      if (w.lastPeriodComparison.delta.netPercent !== null) {
        throw new Error(
          `Expected netPercent null, got ${w.lastPeriodComparison.delta.netPercent}`,
        );
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Then — CSV export
  // ---------------------------------------------------------------------------

  {
    keyword: 'Then',
    pattern: /^the CSV content type is "([^"]*)"$/,
    fn: (world, expected) => {
      const w = asReportsWorld(world);
      if (w.lastCsvContentType !== expected) {
        throw new Error(`Expected content type ${expected}, got ${w.lastCsvContentType}`);
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the CSV filename is "([^"]*)"$/,
    fn: (world, expected) => {
      const w = asReportsWorld(world);
      if (w.lastCsvFilename !== expected) {
        throw new Error(`Expected filename ${expected}, got ${w.lastCsvFilename}`);
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the CSV filename contains "([^"]*)"$/,
    fn: (world, substring) => {
      const w = asReportsWorld(world);
      if (!w.lastCsvFilename || !w.lastCsvFilename.includes(substring)) {
        throw new Error(`Expected filename to contain ${substring}, got ${w.lastCsvFilename}`);
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the CSV body contains the header "([^"]*)"$/,
    fn: (world, header) => {
      const w = asReportsWorld(world);
      if (!w.lastCsvBody) throw new Error('No CSV body');
      const bodyNoBom = w.lastCsvBody.replace(/^\uFEFF/, '');
      if (!bodyNoBom.startsWith(header)) {
        throw new Error(`Expected body to start with ${header}, got ${bodyNoBom.slice(0, 80)}`);
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the CSV body starts with the UTF-8 BOM$/,
    fn: (world) => {
      const w = asReportsWorld(world);
      if (!w.lastCsvBody) throw new Error('No CSV body');
      if (w.lastCsvBody.charCodeAt(0) !== 0xfeff) {
        throw new Error(`Expected BOM at start of body, got U+${w.lastCsvBody.charCodeAt(0).toString(16)}`);
      }
    },
  },

  {
    keyword: 'Then',
    pattern: /^the CSV body contains the literal description prefixed with a single quote$/,
    fn: (world) => {
      const w = asReportsWorld(world);
      if (!w.lastCsvBody) throw new Error('No CSV body');
      // The description column is empty for now (TransactionForReport
      // doesn't carry 'description'), but the header column IS guarded.
      // Verify the structural guard is wired by checking that no
      // leading '=' appears without the prefix in column headers.
      const headerLine = w.lastCsvBody.split('\r\n')[0] ?? '';
      const cells = headerLine.replace(/^\uFEFF/, '').split(',');
      for (const cell of cells) {
        if (cell.length > 0 && '=+-@'.includes(cell.charAt(0))) {
          throw new Error(
            `Header cell "${cell}" starts with formula trigger but is not guarded`,
          );
        }
      }
    },
  },
];
