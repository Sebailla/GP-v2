import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests handled.",
  labelNames: ["method", "path", "status"] as const,
  registers: [metricsRegistry],
});

export const httpErrors5xxTotal = new Counter({
  name: "http_errors_5xx_total",
  help: "HTTP requests that returned a 5xx status.",
  labelNames: ["method", "path"] as const,
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "path"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const rateLimitBlockedTotal = new Counter({
  name: "rate_limit_blocked_total",
  help: "HTTP requests blocked by the rate limiter.",
  labelNames: ["endpoint"] as const,
  registers: [metricsRegistry],
});
