import assert from "node:assert/strict";
import { test } from "node:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { App } from "./App.js";
import { fixture } from "./fixture.js";

const consoleError = console.error;
console.error = (...args: unknown[]) => {
  if (String(args[0] ?? "").includes("not wrapped in act")) return;
  consoleError(...args);
};

test("dashboard navigation, charts, and locked topup", async () => {
  const setup = await testRender(<App initial={fixture} />, { width: 120, height: 40 });
  try {
    await setup.renderOnce();
    const wide = setup.captureCharFrame();
    assert.match(wide, /12\.500000/);
    assert.match(wide, /Mix/);
    assert.match(wide, /█/);
    assert.match(wide, /small/);
    assert.match(wide, /\$0\.04/);
    assert.match(wide, /██████░░░░░░░░░░░░/);
    assert.match(wide, /██████████████████/);

    await act(async () => {
      setup.resize(80, 40);
    });
    await setup.renderOnce();
    const narrow = setup.captureCharFrame();
    assert.match(narrow, /12\.500000/);
    assert.match(narrow, /Split/);
    assert.match(narrow, /█/);
    assert.doesNotMatch(narrow, /Mix/);

    await act(async () => {
      setup.resize(120, 40);
      setup.mockInput.pressKey("2");
    });
    const market = await setup.waitForFrame((frame) => frame.includes("▸ 2 Market"));
    assert.match(market, /node-alpha/);
    assert.match(market, /node-beta/);
    assert.doesNotMatch(market, /Mix/);

    await act(async () => {
      setup.mockInput.pressKey("4");
    });
    const wallet = await setup.waitForFrame((frame) => frame.includes("2 topups"));
    assert.match(wallet, /topped up/);
    assert.match(wallet, /2 topups/);
    assert.match(wallet, /needs AVM_PRIVATE_KEY/);
  } finally {
    setup.renderer.destroy();
  }
});

test("quit with a lease asks before releasing", async () => {
  const setup = await testRender(
    <App initial={{ ...fixture, lease: { leaseId: "lease-9", fundedUntil: "2099-01-01T00:00:00.000Z" }, openedAt: Date.now() }} />,
    { width: 100, height: 30 },
  );
  try {
    await setup.renderOnce();
    await act(async () => {
      setup.mockInput.pressKey("q");
    });
    const frame = await setup.waitForFrame((text) => text.includes("before quitting"));
    assert.match(frame, /lease-9/);
    assert.match(frame, /y release/);
  } finally {
    setup.renderer.destroy();
  }
});
