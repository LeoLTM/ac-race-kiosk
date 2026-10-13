// Indirection over `new Date()` so tests can move time forward (session hard stops, call timeouts)
export const clock = {
	now: (): Date => new Date(),
};
