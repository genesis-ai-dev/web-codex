"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceStatus = void 0;
var WorkspaceStatus;
(function (WorkspaceStatus) {
    WorkspaceStatus["RUNNING"] = "running";
    WorkspaceStatus["STOPPED"] = "stopped";
    WorkspaceStatus["STARTING"] = "starting";
    WorkspaceStatus["STOPPING"] = "stopping";
    WorkspaceStatus["ERROR"] = "error";
    WorkspaceStatus["PENDING"] = "pending";
})(WorkspaceStatus || (exports.WorkspaceStatus = WorkspaceStatus = {}));
