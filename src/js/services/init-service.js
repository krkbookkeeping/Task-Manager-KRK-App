import { workspaceService } from './workspace-service.js';
import { boardService } from './board-service.js';
import { labelService } from './label-service.js';

/**
 * Ensures the user has at least one workspace and board.
 * Returns the active { workspaceId, boardId } context for the dashboard to use.
 */
export async function ensureDefaultData(uid) {
    try {
        let workspaces = await workspaceService.getAll(uid);
        let activeWorkspaceId = null;

        if (workspaces.length === 0) {
            console.log("No workspaces found. Provisioning default Workspace...");
            const ws = await workspaceService.create(uid, "My Workspace");
            activeWorkspaceId = ws.id;
        } else {
            activeWorkspaceId = workspaces[0].id;
        }

        let boards = await boardService.getAllUnarchived(uid, activeWorkspaceId);
        let activeBoardId = null;

        if (boards.length === 0) {
            console.log("No boards found. Provisioning default Board and Labels...");
            const board = await boardService.create(uid, activeWorkspaceId, "Main Board", "My first task board");
            activeBoardId = board.id;

            // Provision some default starter labels for the empty board
            await labelService.create(uid, activeWorkspaceId, "To Do", "#3b82f6");      // Blue
            await labelService.create(uid, activeWorkspaceId, "In Progress", "#f59e0b"); // Yellow
            await labelService.create(uid, activeWorkspaceId, "Review", "#a855f7");      // Purple
            await labelService.create(uid, activeWorkspaceId, "Done", "#22c55e");        // Green

        } else {
            activeBoardId = boards[0].id;
        }

        return {
            workspaceId: activeWorkspaceId,
            boardId: activeBoardId
        };
    } catch (err) {
        console.error("Error during init provision:", err);
        return null;
    }
}
