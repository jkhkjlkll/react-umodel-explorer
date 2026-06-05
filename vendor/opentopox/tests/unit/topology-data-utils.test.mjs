import assert from "node:assert/strict";
import test from "node:test";

import { filterTopologyData } from "../../src/framework/index.js";

test("filterTopologyData expands node search results from matched nodes only", () => {
  const nodes = [
    { id: "gateway", data: { title: "API Gateway", domain: "gateway", status: "ok" } },
    { id: "checkout", data: { title: "Checkout", domain: "service", status: "ok" } },
    { id: "redis", data: { title: "Session Redis", domain: "cache", status: "ok" } },
    { id: "payment", data: { title: "Payment", domain: "service", status: "warn" } },
    { id: "orders-db", data: { title: "Orders DB", domain: "database", status: "ok" } },
  ];
  const edges = [
    { id: "gateway->checkout:REST", source: "gateway", target: "checkout", label: "REST", data: { status: "ok" } },
    { id: "checkout->redis:session", source: "checkout", target: "redis", label: "session", data: { status: "ok" } },
    { id: "checkout->payment:charge", source: "checkout", target: "payment", label: "charge", data: { status: "warn" } },
    { id: "checkout->orders-db:read", source: "checkout", target: "orders-db", label: "read", data: { status: "ok" } },
  ];

  const result = filterTopologyData({
    nodes,
    edges,
    query: "redis",
    includeRelated: true,
    degree: 1,
  });

  assert.deepEqual(result.matches.nodeIds, ["redis"]);
  assert.deepEqual(result.matches.edgeIds, ["checkout->redis:session"]);
  assert.deepEqual(result.nodes.map((node) => node.id), ["checkout", "redis"]);
  assert.deepEqual(result.edges.map((edge) => edge.id), ["checkout->redis:session"]);
});

test("filterTopologyData continues expanding from one-hop neighbors at higher degrees", () => {
  const nodes = [
    { id: "gateway", data: { title: "API Gateway", domain: "gateway", status: "ok" } },
    { id: "checkout", data: { title: "Checkout", domain: "service", status: "ok" } },
    { id: "redis", data: { title: "Session Redis", domain: "cache", status: "ok" } },
    { id: "payment", data: { title: "Payment", domain: "service", status: "warn" } },
    { id: "orders-db", data: { title: "Orders DB", domain: "database", status: "ok" } },
  ];
  const edges = [
    { id: "gateway->checkout:REST", source: "gateway", target: "checkout", label: "REST", data: { status: "ok" } },
    { id: "checkout->redis:session", source: "checkout", target: "redis", label: "session", data: { status: "ok" } },
    { id: "checkout->payment:charge", source: "checkout", target: "payment", label: "charge", data: { status: "warn" } },
    { id: "checkout->orders-db:read", source: "checkout", target: "orders-db", label: "read", data: { status: "ok" } },
  ];

  const result = filterTopologyData({
    nodes,
    edges,
    query: "redis",
    includeRelated: true,
    degree: 2,
  });

  assert.deepEqual(result.nodes.map((node) => node.id), ["gateway", "checkout", "redis", "payment", "orders-db"]);
  assert.deepEqual(result.edges.map((edge) => edge.id), [
    "gateway->checkout:REST",
    "checkout->redis:session",
    "checkout->payment:charge",
    "checkout->orders-db:read",
  ]);
});
