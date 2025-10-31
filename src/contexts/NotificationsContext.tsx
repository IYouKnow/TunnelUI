import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type NotificationItem = {
	id: string;
	title: string;
	description?: string;
	timestamp: number; // ms epoch
	read: boolean;
	type?: "info" | "success" | "warning" | "error";
	linkHref?: string;
};

export type NotificationsContextType = {
	notifications: NotificationItem[];
	unreadCount: number;
	addNotification: (n: Omit<NotificationItem, "id" | "timestamp" | "read"> & Partial<Pick<NotificationItem, "read" | "timestamp">>) => NotificationItem;
	markAllRead: () => void;
	markRead: (id: string) => void;
	remove: (id: string) => void;
	clearAll: () => void;
};

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const STORAGE_KEY = "cf-gui.notifications";
const STORAGE_LIMIT = 50;

function generateId(): string {
	const g: any = (typeof globalThis !== "undefined" ? globalThis : window) as any;
	if (g && g.crypto && typeof g.crypto.randomUUID === "function") {
		return g.crypto.randomUUID();
	}
	if (g && g.crypto && typeof g.crypto.getRandomValues === "function") {
		const bytes = new Uint8Array(16);
		g.crypto.getRandomValues(bytes);
		// RFC4122 v4 variant
		bytes[6] = (bytes[6] & 0x0f) | 0x40;
		bytes[8] = (bytes[8] & 0x3f) | 0x80;
		const toHex = (n: number) => n.toString(16).padStart(2, "0");
		return (
			toHex(bytes[0]) + toHex(bytes[1]) + toHex(bytes[2]) + toHex(bytes[3]) + "-" +
			toHex(bytes[4]) + toHex(bytes[5]) + "-" +
			toHex(bytes[6]) + toHex(bytes[7]) + "-" +
			toHex(bytes[8]) + toHex(bytes[9]) + "-" +
			toHex(bytes[10]) + toHex(bytes[11]) + toHex(bytes[12]) + toHex(bytes[13]) + toHex(bytes[14]) + toHex(bytes[15])
		);
	}
	// Last resort: not cryptographically strong
	return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadFromStorage(): NotificationItem[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as NotificationItem[];
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(Boolean)
			.map((n) => ({ ...n, read: Boolean(n.read), timestamp: Number(n.timestamp) }))
			.sort((a, b) => b.timestamp - a.timestamp)
			.slice(0, STORAGE_LIMIT);
	} catch {
		return [];
	}
}

function saveToStorage(items: NotificationItem[]) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, STORAGE_LIMIT)));
	} catch {
		// ignore
	}
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
	const [notifications, setNotifications] = useState<NotificationItem[]>([]);
	const initializedRef = useRef(false);

	useEffect(() => {
		if (initializedRef.current) return;
		initializedRef.current = true;
		setNotifications(loadFromStorage());
	}, []);

	useEffect(() => {
		if (!initializedRef.current) return;
		saveToStorage(notifications);
	}, [notifications]);

	const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

	const addNotification: NotificationsContextType["addNotification"] = useCallback((n) => {
		const item: NotificationItem = {
			id: generateId(),
			title: n.title,
			description: n.description,
			timestamp: n.timestamp ?? Date.now(),
			read: n.read ?? false,
			type: n.type ?? "info",
			linkHref: n.linkHref,
		};
		setNotifications((prev) => {
			const next = [item, ...prev].sort((a, b) => b.timestamp - a.timestamp).slice(0, STORAGE_LIMIT);
			return next;
		});
		return item;
	}, []);

	const markAllRead = useCallback(() => {
		setNotifications((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
	}, []);

	const markRead = useCallback((id: string) => {
		setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
	}, []);

	const remove = useCallback((id: string) => {
		setNotifications((prev) => prev.filter((n) => n.id !== id));
	}, []);

	const clearAll = useCallback(() => {
		setNotifications([]);
	}, []);

	const value = useMemo<NotificationsContextType>(() => ({
		notifications,
		unreadCount,
		addNotification,
		markAllRead,
		markRead,
		remove,
		clearAll,
	}), [notifications, unreadCount, addNotification, markAllRead, markRead, remove, clearAll]);

	return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
	const ctx = useContext(NotificationsContext);
	if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
	return ctx;
}
