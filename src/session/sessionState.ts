export type SessionMode = "pod" | "eod" | "video" | null;

interface UserSession {
    mode: SessionMode;
    pendingCleanedText?: string;
    taskId?: string;
}

const sessions = new Map<number, UserSession>();

export function getSession(chatId: number): UserSession {
    if (!sessions.has(chatId)) {
        sessions.set(chatId, { mode: null });
    }
    return sessions.get(chatId)!;
}

export function setMode(chatId: number, mode: SessionMode) {
    const session = getSession(chatId);
    session.mode = mode;
}

export function setPendingText(chatId: number, text: string) {
    const session = getSession(chatId);
    session.pendingCleanedText = text;
}

export function setTaskId(chatId: number, taskId: string) {
    const session = getSession(chatId);
    session.taskId = taskId;
}

export function clearSession(chatId: number) {
    const session = getSession(chatId);
    session.mode = null;
    session.pendingCleanedText = undefined;
}
