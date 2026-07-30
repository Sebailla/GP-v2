import type { StepBinding } from './realm.steps.js';
import type { ReportsWorld, SeedTransaction } from './world.js';
import {
  resetRepository,
  getSummary,
  getByCategory,
  getByPeriod,
  exportCsv,
} from '../support/fixture-loader.js';

export const stepDefinitions: ReadonlyArray<StepBinding> = [
  // ---------------------------------------------------------------------------
  // Given — user & state setup
  // ---------------------------------------------------------------------------

  {
    keyword: 'Given',
    pattern: /^an authenticated user$/,
    fn: (world) => {
      const w = world as ReportsWorld;
      w.currentUser = {
        ...w.currentUser,
        role: 'user',
      };
    },
  },

  {
    keyword: 'Given',
    pattern: /^an authenticated user with role "([^"]*)"$/,
    fn: (world, role) => {
      const w = world as ReportsWorld;
      w.currentUser = {
        ...w.currentUser,
        role: role as 'user' | 'admin',
      };
    },
  },

  {
    keyword: 'Given',
    pattern: /^the authenticated user is "([^"]*)"$/,
    fn: (world, which) => {
      const w = world as ReportsWorld;
      w.currentUser = which === 'userB' ? w.userB : w.userA;
    },
  },

  {
    keyword: 'Given',
    pattern: /^user A has 0 transactions in (.+)$/,
    fn: (world, _yearMonth) => {
      const w = world as ReportsWorld;
      w.userATransactions = [];
      resetRepository(w);
    },
  },

  {
    keyword: 'Given',
    pattern: /^user A has 1 transaction in (\d{4}-\d{2})$/,
    fn: (world, period) => {
      const w = world as ReportsWorld;
      // Generic 1-transaction fixture for scenarios that don't pin the amount.
      w.userATransactions = [
        {
          amount: '-10.00',
          currencyCode: 'USD',
          categoryId: 'cat1',
          categoryName: 'Food',
          occurredAt: `${period}-15`,
        },
      ];
      resetRepository(w);
    },
  },

  {
    keyword: 'Given',
    pattern: /^user A has 1 transaction in (.+) totaling (.+)$/,
    fn: (world, _period, total) => {
      const w = world as ReportsWorld;
      w.userATransactions = [
        {
          amount: total,
          currencyCode: 'USD',
          categoryId: 'cat1',
          categoryName: 'Food',
          occurredAt: '2026-07-15',
        },
      ];
      resetRepository(w);
    },
  },

  {
    keyword: 'Given',
    pattern: /^user A has (\d+) transactions in (.+) with (.+) \(cat1 Food\), (.+) \(cat2 Transport\), (.+) \(cat1 Food\)$/,
    fn: (world, _count, _period, a1, a2, a3) => {
      const w = world as ReportsWorld;
      w.userATransactions = [
        { amount: a1, currencyCode: 'USD', categoryId: 'cat1', categoryName: 'Food', occurredAt: '2026-07-05' },
        { amount: a2, currencyCode: 'USD', categoryId: 'cat2', categoryName: 'Transport', occurredAt: '2026-07-10' },
        { amount: a3, currencyCode: 'USD', categoryId: 'cat1', categoryName: 'Food', occurredAt: '2026-07-15' },
      ];
      resetRepository(w);
    },
  },

  {
    keyword: 'Given',
    pattern: /^user A has (\d+) transactions in (.+) with ([^()]+) \(all USD\)$/,
    fn: (world, _count, _period, amountList) => {
      const w = world as ReportsWorld;
      // amountList is comma-separated, e.g. "-50.00, -25.00, -10.00, -15.00, -25.00".
      const amounts = amountList.split(',').map((s) => s.trim()).filter(Boolean);
      w.userATransactions = amounts.map((amount, i) => ({
        amount,
        currencyCode: 'USD',
        categoryId: 'cat1',
        categoryName: 'Food',
        occurredAt: `2026-07-${String(5 + i * 5).padStart(2, '0')}`,
      }));
      resetRepository(w);
    },
  },

  {
    keyword: 'Given',
    pattern: /^user A has exactly 2 transactions in (.+) totaling (.+)$/,
    fn: (world, period, total) => {
      const w = world as ReportsWorld;
      const monthPart = period.match(/\d{4}-(\d{2})/)?.[1] ?? '07';
      const totalNum = Number(total);
      // Split the total across 2 transactions (1/2 each).
      const half = (totalNum / 2).toFixed(2);
      w.userATransactions = [
        { amount: half, currencyCode: 'USD', categoryId: 'cat1', categoryName: 'Food', occurredAt: `2026-${monthPart}-10` },
        { amount: half, currencyCode: 'USD', categoryId: 'cat1', categoryName: 'Food', occurredAt: `2026-${monthPart}-20` },
      ];
      resetRepository(w);
    },
  },

  {
    keyword: 'Given',
    pattern: /^user A also has (\d+) transactions in (.+) totaling (.+) USD$/,
    fn: (world, count, period, total) => {
      const w = world as ReportsWorld;
      const monthPart = period.match(/\d{4}-(\d{2})/)?.[1] ?? '07';
      const perTx = (Number(total) / Number(count)).toFixed(2);
      // APPEND to existing transactions (don't replace).
      const newTxs = Array.from({ length: Number(count) }, (_, i) => ({
        amount: perTx,
        currencyCode: 'USD',
        categoryId: 'cat1',
        categoryName: 'Food',
        occurredAt: `2026-${monthPart}-${String(5 + i * 5).padStart(2, '0')}`,
      }));
      w.userATransactions = [...w.userATransactions, ...newTxs];
      resetRepository(w);
    },
  },

  {
    keyword: 'Given',
    pattern: /^user A has (\d+) transactions in (.+) totaling (.+) USD$/,
    fn: (world, count, period, total) => {
      const w = world as ReportsWorld;
      const monthPart = period.match(/\d{4}-(\d{2})/)?.[1] ?? '07';
      const perTx = (Number(total) / Number(count)).toFixed(2);
      w.userATransactions = Array.from({ length: Number(count) }, (_, i) => ({
        amount: perTx,
        currencyCode: 'USD',
        categoryId: 'cat1',
        categoryName: 'Food',
        occurredAt: `2026-${monthPart}-${String(5 + i * 5).padStart(2, '0')}`,
      }));
      resetRepository(w);
    },
  },

  {
    keyword: 'Given',
    pattern: /^user A has 5 transactions in 2 categories in (.+)$/,
    fn: (world, _period) => {
      const w = world as ReportsWorld;
      w.userATransactions = [
        { amount: '-100.00', currencyCode: 'USD', categoryId: 'cat1', categoryName: 'Food', occurredAt: '2026-07-05' },
        { amount: '-50.00', currencyCode: 'USD', categoryId: 'cat2', categoryName: 'Transport', occurredAt: '2026-07-10' },
        { amount: '-25.00', currencyCode: 'USD', categoryId: 'cat1', categoryName: 'Food', occurredAt: '2026-07-15' },
      ];
      resetRepository(w);
    },
  },

  {
    keyword: 'Given',
    pattern: /^user A has 1 transaction with description "([^"]*)"$/,
    fn: (world, description) => {
      const w = world as ReportsWorld;
      w.userATransactions = [
        {
          amount: '-10.00',
          currencyCode: 'USD',
          categoryId: 'cat1',
          categoryName: 'Food',
          occurredAt: '2026-07-15',
          ...({ description }),
        } as SeedTransaction,
      ];
      resetRepository(w);
    },
  },

  {
    keyword: 'Given',
    pattern: /^user A primary currency is "([^"]*)"$/,
    fn: (world, currency) => {
      const w = world as ReportsWorld;
      w.primaryCurrency = currency;
      resetRepository(w);
    },
  },

  {
    keyword: 'Given',
    pattern: /^user B has 1 transaction in (.+) totaling (.+)$/,
    fn: (world, _period, total) => {
      const w = world as ReportsWorld;
      w.userBTransactions = [
        {
          amount: total,
          currencyCode: 'USD',
          categoryId: 'cat1',
          categoryName: 'Food',
          occurredAt: '2026-07-15',
        },
      ];
      resetRepository(w);
    },
  },

  // ---------------------------------------------------------------------------
  // When — endpoint invocations (delegated to fixture-loader)
  // ---------------------------------------------------------------------------

  {
    keyword: 'When',
    pattern: /^the user requests GET \/api\/reports\/summary\?fromDate=([^&]+)&toDate=(.+)$/,
    fn: async (world, fromDate, toDate) => {
      await getSummary(world as ReportsWorld, fromDate, toDate);
    },
  },

  {
    keyword: 'When',
    pattern: /^the user requests GET \/api\/reports\/summary with a range exceeding 365 days$/,
    fn: async (world) => {
      await getSummary(world as ReportsWorld, '2024-01-01', '2026-01-01');
    },
  },

  {
    keyword: 'When',
    pattern: /^the user requests GET \/api\/reports\/by-category\?fromDate=([^&]+)&toDate=(.+)$/,
    fn: async (world, fromDate, toDate) => {
      await getByCategory(world as ReportsWorld, fromDate, toDate);
    },
  },

  {
    keyword: 'When',
    pattern: /^the user requests GET \/api\/reports\/by-period\?fromDate=([^&]+)&toDate=([^&]+)&bucket=(.+)$/,
    fn: async (world, fromDate, toDate, bucket) => {
      await getByPeriod(world as ReportsWorld, fromDate, toDate, bucket as 'week' | 'month');
    },
  },

  {
    keyword: 'When',
    pattern: /^the user requests GET \/api\/reports\/export\.csv\?fromDate=([^&]+)&toDate=([^&]+)&detail=(.+)$/,
    fn: async (world, fromDate, toDate, detail) => {
      await exportCsv(world as ReportsWorld, fromDate, toDate, detail as 'summary' | 'transactions');
    },
  },
];
