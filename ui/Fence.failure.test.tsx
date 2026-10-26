// @vitest-environment jsdom
import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type * as PluginSdkApp from "@get-bb/plugin-sdk/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExperimentalCodeFenceRendererProps, PluginSettingsState } from "@get-bb/plugin-sdk/app";
import { SlotFence } from "./SlotFence";

const settings = vi.hoisted(() => {
  let state: PluginSettingsState = { values: { animations: true }, isLoading: false };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(values: PluginSettingsState["values"]) {
      state = { values, isLoading: false };
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => ({
  ...(await importOriginal<typeof PluginSdkApp>()),
  useComposers: () => [],
  useSdk: () => ({}),
  useBbNavigate: () => ({}),
  useRpc: () => ({ call: vi.fn() }),
  useSettings: () => useSyncExternalStore(settings.subscribe, settings.get),
  Markdown: ({ content }: { content: string }) => <p>{content}</p>,
  experimental_Icon: () => <span aria-hidden="true" />,
}));
vi.mock("./useSuperseded", () => ({ useSuperseded: () => false, useReplyIndex: () => null }));

let container: HTMLDivElement;
let root: Root;
const message = { id: "orbit:assistant:1", threadId: "orbit", turnId: "turn", projectId: "project" };
const original = () => <pre>source</pre>;

function render(status: ExperimentalCodeFenceRendererProps["status"], code: string, id = message.id): void {
  act(() => root.render(<SlotFence language="ui" status={status} code={code} index={0} message={{ ...message, id }} Original={original} />));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ addEventListener() {}, removeEventListener() {} }));
  // jsdom has no ResizeObserver; the frames measure themselves with it.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  // jsdom has no Web Animations either; entrances play through it.
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: () => ({ cancel() {} }) });
  settings.set({ animations: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "animate");
});

// A state binding written as a quoted string: the whole spec fails, but the
// Card and its title parse on their own, so a prefix compiles.
const BROKEN = "Card(\"The fix is a removal, not a patch\", [\n  Before(\"play() awaited MusicSubscription.current before touching the player\"),\n  After(\"play() starts that read in the background and never waits for it\"),\n  Callout(\"On your iOS 27 phone this read throws `.privacyAcknowledgementRequired` in 414ms from a live view \u2014 and did not return at all from the launch path. Either way it was gating playback on an answer it could not get.\", tone: \"warn\")\n])";
// A reply that stopped mid-list: no closing bracket, and no closing fence either.
const TRUNCATED = `Card("Where to go next", [
  List([{title: "First", detail: "a"}, {title: "Second", detail: "b"}])`;

describe("a closed ui fence whose spec does not compile", () => {
  it("reports the error instead of drawing an empty frame", () => {
    render("closed", BROKEN);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("couldn't be rendered");
  });
});

describe("an unclosed ui fence (the reply stopped mid-block)", () => {
  it("draws what arrived rather than an error", () => {
    render("unclosed", TRUNCATED);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Where to go next");
  });
});
