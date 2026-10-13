/**
 * Serializes async critical sections.
 *
 * Queue/session transitions read state and then write it back across several awaits, so two concurrent
 * requests (a double click, the rig app and staff acting at the same time, the background tick) could
 * otherwise both act on the same stale state.
 */
export function createLock() {
	let tail: Promise<unknown> = Promise.resolve();

	return function withLock<T>(fn: () => Promise<T>): Promise<T> {
		const run = tail.then(fn);
		tail = run.catch(() => undefined);
		return run;
	};
}
