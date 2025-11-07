"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../config");
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json());
const consoleFormat = winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
        log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    return log;
}));
const transports = [
    new winston_1.default.transports.Console({
        format: config_1.config.isProduction ? logFormat : consoleFormat,
    }),
];
// Add file transport in production
if (config_1.config.isProduction) {
    transports.push(new winston_1.default.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: logFormat,
    }), new winston_1.default.transports.File({
        filename: 'logs/combined.log',
        format: logFormat,
    }));
}
exports.logger = winston_1.default.createLogger({
    level: config_1.config.logLevel,
    format: logFormat,
    transports,
    // Don't exit on uncaught exceptions
    exitOnError: false,
});
// Handle uncaught exceptions and rejections
if (config_1.config.isProduction) {
    exports.logger.exceptions.handle(new winston_1.default.transports.File({ filename: 'logs/exceptions.log' }));
    exports.logger.rejections.handle(new winston_1.default.transports.File({ filename: 'logs/rejections.log' }));
}
exports.default = exports.logger;
