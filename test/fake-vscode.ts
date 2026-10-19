// A small stand-in for the "vscode" module (vitest.config.ts aliases it), with
// just what src/extension.ts uses, recording calls so tests can look at them.
type Listener<T> = (event: T) => unknown;

export class EventEmitter<T> {
  private listeners: Listener<T>[] = [];
  event = (listener: Listener<T>) => {
    this.listeners.push(listener);
    return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== listener)) };
  };
  fire(event: T): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

export const StatusBarAlignment = { Left: 1, Right: 2 };

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class MarkdownString {
  isTrusted?: boolean;
  supportHtml?: boolean;
  supportThemeIcons?: boolean;
  constructor(public value = "") {}
}

export class RelativePattern {
  constructor(
    public readonly base: { uri: FakeUri },
    public readonly pattern: string,
  ) {}
}

export interface FakeUri {
  scheme: string;
  fsPath: string;
  toString(): string;
}

export const Uri = {
  file: (fsPath: string): FakeUri => ({ scheme: "file", fsPath, toString: () => `file://${fsPath}` }),
  parse: (value: string): FakeUri => ({ scheme: value.split(":")[0] ?? "", fsPath: "", toString: () => value }),
};

export interface FakeItem {
  id: string;
  name?: string;
  text: string;
  command?: string;
  color?: ThemeColor;
  backgroundColor?: ThemeColor;
  tooltip?: MarkdownString;
  accessibilityInformation?: { label: string; role?: string };
  visible: boolean;
  show(): void;
  hide(): void;
  dispose(): void;
}

export interface FakeTerminal {
  options: { name: string; cwd: FakeUri; isTransient: boolean; env?: Record<string, string | undefined> };
  sent: string[];
  shown: boolean;
  show(): void;
  sendText(text: string): void;
  dispose(): void;
}

export interface FakeWatcher {
  pattern: RelativePattern;
  create: EventEmitter<FakeUri>;
  change: EventEmitter<FakeUri>;
  delete: EventEmitter<FakeUri>;
  onDidCreate: EventEmitter<FakeUri>["event"];
  onDidChange: EventEmitter<FakeUri>["event"];
  onDidDelete: EventEmitter<FakeUri>["event"];
  disposed: boolean;
  dispose(): void;
}

export const events = {
  windowState: new EventEmitter<{ focused: boolean }>(),
  activeEditor: new EventEmitter<{ document: { uri: FakeUri } } | undefined>(),
  folders: new EventEmitter<unknown>(),
  trust: new EventEmitter<void>(),
  closeTerminal: new EventEmitter<FakeTerminal>(),
};

export const recorded = {
  items: [] as FakeItem[],
  terminals: [] as FakeTerminal[],
  watchers: [] as FakeWatcher[],
  opened: [] as string[],
  executed: [] as string[],
  commands: new Map<string, (...args: unknown[]) => unknown>(),
};

export const window = {
  activeTextEditor: undefined as { document: { uri: FakeUri } } | undefined,
  createStatusBarItem(id: string): FakeItem {
    const item: FakeItem = {
      id,
      text: "",
      visible: false,
      show: () => (item.visible = true),
      hide: () => (item.visible = false),
      dispose: () => (item.visible = false),
    };
    recorded.items.push(item);
    return item;
  },
  createTerminal(options: FakeTerminal["options"]): FakeTerminal {
    const terminal: FakeTerminal = {
      options,
      sent: [],
      shown: false,
      show: () => (terminal.shown = true),
      sendText: (text) => terminal.sent.push(text),
      dispose: () => events.closeTerminal.fire(terminal),
    };
    recorded.terminals.push(terminal);
    return terminal;
  },
  onDidChangeWindowState: events.windowState.event,
  onDidChangeActiveTextEditor: events.activeEditor.event,
  onDidCloseTerminal: events.closeTerminal.event,
};

export interface FakeFolder {
  uri: FakeUri;
  name: string;
  index: number;
}

export const workspace = {
  workspaceFolders: [] as FakeFolder[],
  isTrusted: true,
  getWorkspaceFolder(uri: FakeUri): FakeFolder | undefined {
    return workspace.workspaceFolders.find((f) => uri.fsPath === f.uri.fsPath || uri.fsPath.startsWith(f.uri.fsPath + "/"));
  },
  createFileSystemWatcher(pattern: RelativePattern): FakeWatcher {
    const create = new EventEmitter<FakeUri>();
    const change = new EventEmitter<FakeUri>();
    const del = new EventEmitter<FakeUri>();
    const watcher: FakeWatcher = {
      pattern,
      create,
      change,
      delete: del,
      onDidCreate: create.event,
      onDidChange: change.event,
      onDidDelete: del.event,
      disposed: false,
      dispose: () => (watcher.disposed = true),
    };
    recorded.watchers.push(watcher);
    return watcher;
  },
  onDidChangeWorkspaceFolders: events.folders.event,
  onDidGrantWorkspaceTrust: events.trust.event,
};

export const commands = {
  registerCommand(id: string, handler: (...args: unknown[]) => unknown) {
    recorded.commands.set(id, handler);
    return { dispose: () => recorded.commands.delete(id) };
  },
  async executeCommand(id: string): Promise<void> {
    recorded.executed.push(id);
  },
};

export const env = {
  /** The default terminal shell. */
  shell: "/bin/bash",
  async openExternal(uri: FakeUri): Promise<boolean> {
    recorded.opened.push(uri.toString());
    return true;
  },
};

export const folder = (fsPath: string, index = 0): FakeFolder => ({ uri: Uri.file(fsPath), name: fsPath, index });

/** Back to an empty, trusted window with no listeners. */
export function reset(): void {
  for (const emitter of Object.values(events)) (emitter as unknown as { listeners: unknown[] }).listeners = [];
  recorded.items = [];
  recorded.terminals = [];
  recorded.watchers = [];
  recorded.opened = [];
  recorded.executed = [];
  recorded.commands.clear();
  window.activeTextEditor = undefined;
  workspace.workspaceFolders = [];
  workspace.isTrusted = true;
  env.shell = "/bin/bash";
}
