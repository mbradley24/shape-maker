import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Dispatch, ForwardedRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, appShortcutForKey, isEditableShortcutTarget } from "./App";
import type { EditorAction } from "./model/editorReducer";
import type { EditorState } from "./model/diagram";

type MockStageHandle = {
  toPng: () => string | null;
};

type MockCanvasProps = {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
};

type MockInspectorProps = {
  selected: EditorState["objects"][number] | null;
};

const fileMocks = vi.hoisted(() => ({
  openProjectFile: vi.fn<() => Promise<string | null>>(),
  saveTextFile:
    vi.fn<
      (
        dialogTitle: string,
        defaultPath: string,
        contents: string,
      ) => Promise<void>
    >(),
}));

vi.mock("./io/files", () => fileMocks);

vi.mock("./components/EditorCanvas", async () => {
  const React = await import("react");
  const EditorCanvas = React.forwardRef<MockStageHandle, MockCanvasProps>(
    function MockEditorCanvas(
      { dispatch }: MockCanvasProps,
      ref: ForwardedRef<MockStageHandle>,
    ) {
      React.useImperativeHandle(ref, () => ({
        toPng: () => "data:image/png;base64,shape-maker",
      }));
      return React.createElement(
        "button",
        {
          type: "button",
          onClick: () =>
            dispatch({
              type: "createObject",
              shape: "rectangle",
              x: 10,
              y: 20,
              id: "mock-rectangle",
            }),
        },
        "Mock canvas",
      );
    },
  );
  return { EditorCanvas };
});

vi.mock("./components/Inspector", async () => {
  const React = await import("react");
  return {
    Inspector: ({ selected }: MockInspectorProps) =>
      React.createElement(
        "aside",
        { "aria-label": "Inspector" },
        selected ? selected.id : "No selection",
      ),
  };
});

function shortcut(
  input: Partial<Parameters<typeof appShortcutForKey>[0]> &
    Pick<Parameters<typeof appShortcutForKey>[0], "key">,
) {
  return appShortcutForKey({
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...input,
  });
}

describe("app keyboard shortcuts", () => {
  it("maps MVP shortcuts to explicit app commands", () => {
    expect(shortcut({ key: "v" })).toEqual({
      type: "action",
      action: { type: "setTool", tool: "select" },
    });
    expect(shortcut({ key: "Delete" })).toEqual({
      type: "action",
      action: { type: "deleteSelected" },
    });
    expect(shortcut({ key: "d", metaKey: true })).toEqual({
      type: "action",
      action: { type: "duplicateSelected" },
    });
    expect(shortcut({ key: "ArrowLeft", shiftKey: true })).toEqual({
      type: "action",
      action: { type: "nudgeSelected", dx: -10, dy: 0 },
    });
    expect(shortcut({ key: "s", metaKey: true })).toEqual({
      type: "saveProject",
    });
    expect(shortcut({ key: "o", ctrlKey: true })).toEqual({
      type: "loadProject",
    });
    expect(shortcut({ key: "e", metaKey: true })).toEqual({
      type: "exportPng",
    });
    expect(shortcut({ key: "e", metaKey: true, shiftKey: true })).toEqual({
      type: "exportSvg",
    });
    expect(shortcut({ key: "c", metaKey: true, shiftKey: true })).toEqual({
      type: "action",
      action: { type: "copySelectedStyle" },
    });
  });

  it("ignores shortcut keys inside editable fields", () => {
    const input = document.createElement("input");
    const wrapper = document.createElement("div");
    wrapper.setAttribute("contenteditable", "true");
    const nested = document.createElement("span");
    wrapper.append(nested);

    expect(isEditableShortcutTarget(input)).toBe(true);
    expect(isEditableShortcutTarget(nested)).toBe(true);
    expect(isEditableShortcutTarget(document.createElement("button"))).toBe(
      false,
    );
  });
});

describe("App MVP polish", () => {
  beforeEach(() => {
    fileMocks.openProjectFile.mockResolvedValue(null);
    fileMocks.saveTextFile.mockResolvedValue();
  });

  it("shows a loading state and disables file commands while saving", async () => {
    let resolveSave: () => void = () => {};
    fileMocks.saveTextFile.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(<App />);
    fireEvent.keyDown(window, { key: "s", metaKey: true });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saving project...",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    resolveSave();

    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
  });

  it("switches back to the select tool with the explicit select shortcut", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
    expect(screen.getByRole("button", { name: "Rectangle" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.keyDown(window, { key: "v" });

    expect(screen.getByRole("button", { name: "Select (V)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("exports SVG from the keyboard shortcut", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "e", metaKey: true, shiftKey: true });

    await waitFor(() =>
      expect(fileMocks.saveTextFile).toHaveBeenCalledWith(
        "shape-maker-svg",
        "diagram.svg",
        expect.stringContaining("<svg"),
      ),
    );
  });
});
