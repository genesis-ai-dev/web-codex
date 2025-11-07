"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = notFound;
function notFound(req, res) {
    res.status(404).json({
        message: `Route ${req.originalUrl} not found`,
        code: 'NOT_FOUND',
    });
}
