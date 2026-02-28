import { workspaceService } from './workspace-service.js';
import { boardService } from './board-service.js';

/**
 * Ensures the user has at least one workspace and board.
 * Returns the active { workspaceId, boardId } context for the dashboard to use.
 * Remembers the last-used workspace via localStorage.
 */
export async function ensureDefaultData(uid) {
    try {
        let workspaces = await workspaceService.getAll(uid);
        let activeWorkspaceId = null;

        if (workspaces.length === 0) {
            console.log("No workspaces found. Provisioning default Workspace...");
            const ws = await workspaceService.create(uid, "My Workspace", "#6366f1");
            activeWorkspaceId = ws.id;
        } else {
            // Check localStorage for last-used workspace
            const lastUsedId = localStorage.getItem(`lastWorkspaceId_${uid}`);
            if (lastUsedId && workspaces.some(ws => ws.id === lastUsedId)) {
                activeWorkspaceId = lastUsedId;
            } else {
                activeWorkspaceId = workspaces[0].id;
            }
        }

        // Save the active workspace to localStorage
        localStorage.setItem(`lastWorkspaceId_${uid}`, activeWorkspaceId);

        const boardResult = await ensureBoardAndLabels(uid, activeWorkspaceId);

        return {
            workspaceId: activeWorkspaceId,
            boardId: boardResult.boardId
        };
    } catch (err) {
        console.error("Error during init provision:", err);
        return null;
    }
}

/**
 * Ensures a workspace has at least one board and starter labels.
 * Used both on initial boot and when switching to a new workspace.
 */
export async function ensureBoardAndLabels(uid, workspaceId) {
    let boards = await boardService.getAllUnarchived(uid, workspaceId);
    let activeBoardId = null;

    if (boards.length === 0) {
        console.log("No boards found. Provisioning default Board...");
        const board = await boardService.create(uid, workspaceId, "Main Board", "My first task board");
        activeBoardId = board.id;
    } else {
        activeBoardId = boards[0].id;
    }

    return { boardId: activeBoardId };
}
