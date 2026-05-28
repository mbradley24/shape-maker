export async function saveTextFile(
  dialogTitle: string,
  defaultPath: string,
  contents: string,
): Promise<void> {
  if (isTauri()) {
    const [{ save }, { writeTextFile }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
    ]);
    const path = await save({ title: dialogTitle, defaultPath });
    if (!path) return;
    await writeTextFile(path, contents);
    return;
  }

  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = defaultPath;
  link.click();
  URL.revokeObjectURL(url);
}

export async function openProjectFile(): Promise<string | null> {
  if (isTauri()) {
    const [{ open }, { readTextFile }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
    ]);
    const path = await open({
      multiple: false,
      filters: [{ name: "Shape Maker Project", extensions: ["json"] }],
    });
    if (!path || Array.isArray(path)) return null;
    return readTextFile(path);
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.shapemaker.json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read project file."));
      reader.readAsText(file);
    };
    input.click();
  });
}

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
