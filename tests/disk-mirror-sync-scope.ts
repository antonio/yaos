import * as Y from "yjs";
import { TFile } from "obsidian";
import { DiskMirror } from "../src/sync/diskMirror";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
	if (condition) {
		console.log(`  PASS  ${msg}`);
		passed++;
		return;
	}
	console.error(`  FAIL  ${msg}`);
	failed++;
}

type MirrorInternals = {
	debounceTimers: Map<string, ReturnType<typeof setTimeout>>;
	openWriteTimers: Map<string, ReturnType<typeof setTimeout>>;
	pendingOpenWrites: Set<string>;
	writeQueue: Set<string>;
	handleRemoteDelete(path: string, options?: { baselineText?: string | null }): Promise<void>;
	handleRemoteRename(oldPath: string, newPath: string): Promise<void>;
};

function internals(mirror: DiskMirror): MirrorInternals {
	return mirror as unknown as MirrorInternals;
}

function assertNoPendingWrites(mirror: DiskMirror, msg: string): void {
	const dm = internals(mirror);
	assert(
		dm.debounceTimers.size === 0
			&& dm.openWriteTimers.size === 0
			&& dm.pendingOpenWrites.size === 0
			&& dm.writeQueue.size === 0,
		msg,
	);
}

function makeFile(path: string, size = 10): TFile {
	const file = new TFile() as TFile & { path: string; stat: { mtime: number; size: number } };
	file.path = path;
	file.stat = { mtime: 1, size };
	return file;
}

function makeEditorBindings() {
	const renamed: Array<[string, string]> = [];
	const unbound: string[] = [];
	return {
		renamed,
		unbound,
		getLastEditorActivityForPath: () => null,
		isBound: () => false,
		unbindByPath: (path: string) => { unbound.push(path); },
		updatePathsAfterRename: (paths: Map<string, string>) => {
			for (const entry of paths) renamed.push(entry);
		},
	} as any;
}

function makeYHarness(options: {
	path: string;
	isMarkdownPathSyncable: (path: string) => boolean;
	initialMeta?: { path: string; deleted?: boolean; deletedAt?: number } | null;
}) {
	const doc = new Y.Doc();
	const meta = doc.getMap<{ path: string; deleted?: boolean; deletedAt?: number }>("meta");
	const ytext = doc.getText("content");
	const fileId = "file-001";
	const provider = { kind: "provider" };
	if (options.initialMeta !== null) {
		doc.transact(() => {
			meta.set(fileId, options.initialMeta ?? { path: options.path });
		}, "seed");
	}

	const app = {
		vault: {
			getAbstractFileByPath: () => null,
			read: async () => "",
			create: async () => { throw new Error("excluded path should not be created"); },
			modify: async () => { throw new Error("excluded path should not be modified"); },
			createFolder: async () => { throw new Error("excluded path folder should not be created"); },
			adapter: {},
		},
		workspace: {
			getActiveViewOfType: () => null,
		},
	} as any;
	const vaultSync = {
		provider,
		ydoc: doc,
		meta,
		getTextForPath: (path: string) => (path === options.path ? ytext : null),
		getFileIdForText: (text: Y.Text) => (text === ytext ? fileId : null),
		idToText: new Map([[fileId, ytext]]),
		isFileMetaDeleted: (m: { deleted?: boolean; deletedAt?: number } | undefined) => Boolean(m?.deleted || m?.deletedAt),
	} as any;
	const mirror = new DiskMirror(
		app,
		vaultSync,
		makeEditorBindings(),
		false,
		undefined,
		() => true,
		undefined,
		() => "test-device",
		[],
		undefined,
		options.isMarkdownPathSyncable,
	);

	return { doc, meta, ytext, fileId, provider, mirror };
}

console.log("\n--- Test 1: excluded closed-file remote content is not queued for disk write ---");
{
	const path = "references/www/stale.md";
	const { doc, ytext, provider, mirror } = makeYHarness({
		path,
		isMarkdownPathSyncable: () => false,
	});
	mirror.startMapObservers();

	doc.transact(() => { ytext.insert(0, "remote content"); }, provider);

	assertNoPendingWrites(mirror, "remote Y.Text change for excluded closed file does not schedule a write");
	assert(mirror.activeObserverCount === 0, "excluded closed file does not gain a text observer");
	mirror.destroy();
	doc.destroy();
}

console.log("\n--- Test 2: excluded open-file remote content is not queued for disk write ---");
{
	const path = "references/www/open.md";
	const { doc, ytext, provider, mirror } = makeYHarness({
		path,
		isMarkdownPathSyncable: () => false,
	});
	mirror.startMapObservers();
	mirror.notifyFileOpened(path);

	doc.transact(() => { ytext.insert(0, "remote content"); }, provider);

	assert(mirror.activeObserverCount === 0, "excluded open file is not observed by DiskMirror");
	assertNoPendingWrites(mirror, "remote Y.Text change for excluded open file does not schedule a write");
	mirror.destroy();
	doc.destroy();
}

console.log("\n--- Test 3: excluded remote metadata activation is not queued for disk write ---");
{
	const path = "archives/tasks/2026/04/completed.md";
	const { doc, meta, fileId, provider, mirror } = makeYHarness({
		path,
		initialMeta: null,
		isMarkdownPathSyncable: () => false,
	});
	mirror.startMapObservers();

	doc.transact(() => {
		meta.set(fileId, { path });
	}, provider);

	assertNoPendingWrites(mirror, "remote create/restore metadata for excluded path does not schedule a write");
	mirror.destroy();
	doc.destroy();
}

console.log("\n--- Test 4: direct excluded flushWrite cannot create or modify disk files ---");
{
	const path = "references/www/direct.md";
	const created: string[] = [];
	const modified: string[] = [];
	const folders: string[] = [];
	const doc = new Y.Doc();
	const ytext = doc.getText("content");
	ytext.insert(0, "stale remote content");
	const vaultSync = {
		provider: {},
		meta: { observe() {}, unobserve() {} },
		ydoc: { on() {}, off() {} },
		getFileIdForText: () => null,
		idToText: new Map(),
		getTextForPath: (requestedPath: string) => (requestedPath === path ? ytext : null),
		isFileMetaDeleted: () => false,
	} as any;
	const app = {
		vault: {
			getAbstractFileByPath: () => null,
			read: async () => "",
			createFolder: async (folder: string) => { folders.push(folder); },
			create: async (createdPath: string) => { created.push(createdPath); },
			modify: async (file: TFile) => { modified.push(file.path); },
			adapter: {},
		},
		workspace: { getActiveViewOfType: () => null },
	} as any;
	const mirror = new DiskMirror(
		app,
		vaultSync,
		makeEditorBindings(),
		false,
		undefined,
		() => true,
		undefined,
		() => "test-device",
		[],
		undefined,
		() => false,
	);

	await mirror.flushWrite(path, true);

	assert(created.length === 0, "excluded flushWrite does not create a file");
	assert(modified.length === 0, "excluded flushWrite does not modify a file");
	assert(folders.length === 0, "excluded flushWrite does not create parent folders");
	mirror.destroy();
	doc.destroy();
}

console.log("\n--- Test 5: excluded remote delete cannot delete local disk files ---");
{
	const path = "archives/tasks/2026/04/completed.md";
	const trashed: string[] = [];
	const deleted: string[] = [];
	const file = makeFile(path);
	const content = "completed local task";
	const app = {
		vault: {
			read: async () => content,
			getAbstractFileByPath: (requestedPath: string) => (requestedPath === path ? file : null),
			delete: async (deletedFile: TFile) => { deleted.push(deletedFile.path); },
			adapter: {},
		},
		workspace: { getActiveViewOfType: () => null },
		fileManager: {
			trashFile: async (trashedFile: TFile) => { trashed.push(trashedFile.path); },
		},
	} as any;
	const vaultSync = {
		provider: {},
		meta: { observe() {}, unobserve() {} },
		ydoc: { on() {}, off() {} },
		getFileIdForText: () => null,
		idToText: new Map(),
		getTextForPath: () => ({ toString: () => content }),
		isFileMetaDeleted: () => false,
	} as any;
	const mirror = new DiskMirror(
		app,
		vaultSync,
		makeEditorBindings(),
		false,
		undefined,
		() => true,
		undefined,
		() => "test-device",
		[],
		undefined,
		() => false,
	);

	await internals(mirror).handleRemoteDelete(path);

	assert(trashed.length === 0, "excluded remote delete does not trash the local file");
	assert(deleted.length === 0, "excluded remote delete does not hard-delete the local file");
	assertNoPendingWrites(mirror, "excluded remote delete leaves no pending writes");
	mirror.destroy();
}

console.log("\n--- Test 6: remote renames crossing the excluded boundary do not touch disk ---");
{
	const renamed: Array<[string, string]> = [];
	const trashed: string[] = [];
	const deleted: string[] = [];
	const folders: string[] = [];
	const oldSyncable = "tasks/current.md";
	const newExcluded = "archives/tasks/2026/04/current.md";
	const oldExcluded = "references/www/stale.md";
	const newSyncable = "tasks/stale.md";
	const files = new Map<string, TFile>([
		[oldSyncable, makeFile(oldSyncable)],
		[oldExcluded, makeFile(oldExcluded)],
	]);
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => files.get(path) ?? null,
			createFolder: async (folder: string) => { folders.push(folder); },
			delete: async (file: TFile) => { deleted.push(file.path); },
			adapter: {},
		},
		workspace: { getActiveViewOfType: () => null },
		fileManager: {
			renameFile: async (file: TFile, newPath: string) => { renamed.push([file.path, newPath]); },
			trashFile: async (file: TFile) => { trashed.push(file.path); },
		},
	} as any;
	const vaultSync = {
		provider: {},
		meta: { observe() {}, unobserve() {} },
		ydoc: { on() {}, off() {} },
		getFileIdForText: () => null,
		idToText: new Map(),
		getTextForPath: () => null,
		isFileMetaDeleted: () => false,
	} as any;
	const editorBindings = makeEditorBindings();
	const mirror = new DiskMirror(
		app,
		vaultSync,
		editorBindings,
		false,
		undefined,
		() => true,
		undefined,
		() => "test-device",
		[],
		undefined,
		(path) => !path.startsWith("archives/") && !path.startsWith("references/"),
	);
	internals(mirror).writeQueue.add(oldSyncable);
	internals(mirror).pendingOpenWrites.add(newSyncable);

	await internals(mirror).handleRemoteRename(oldSyncable, newExcluded);
	await internals(mirror).handleRemoteRename(oldExcluded, newSyncable);

	assert(renamed.length === 0, "excluded-boundary remote rename does not rename files");
	assert(trashed.length === 0, "excluded-boundary remote rename does not trash source files");
	assert(deleted.length === 0, "excluded-boundary remote rename does not hard-delete source files");
	assert(folders.length === 0, "excluded-boundary remote rename does not create target folders");
	assert(editorBindings.renamed.length === 0, "excluded-boundary remote rename does not update editor binding paths");
	assertNoPendingWrites(mirror, "excluded-boundary remote rename leaves no pending writes");
	mirror.destroy();
}

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${"─".repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
