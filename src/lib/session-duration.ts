export function formatSessionDuration(connectedAt: string, nowMs: number): string {
	// Older Core versions returned Unix seconds with a millisecond fraction and Z.
	const legacy = /^(\d+)\.(\d{3})Z$/.exec(connectedAt)
	const connectedMs = legacy
		? Number(legacy[1]) * 1000 + Number(legacy[2])
		: Date.parse(connectedAt)
	const elapsed = Math.max(0, Math.floor((nowMs - connectedMs) / 1000))
	if (!Number.isFinite(elapsed)) return '-'
	const days = Math.floor(elapsed / 86400)
	const hours = Math.floor((elapsed % 86400) / 3600)
	const minutes = Math.floor((elapsed % 3600) / 60)
	const seconds = elapsed % 60
	if (days > 0) return `${days}d ${hours}h ${minutes}m`
	if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
	if (minutes > 0) return `${minutes}m ${seconds}s`
	return `${seconds}s`
}
