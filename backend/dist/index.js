"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = __importDefault(require("./app"));
const config_1 = require("./config");
const logger_1 = require("./config/logger");
const port = config_1.config.port;
app_1.default.listen(port, () => {
    logger_1.logger.info(`VSCode Platform API server running on port ${port}`);
    logger_1.logger.info(`Environment: ${config_1.config.nodeEnv}`);
});
// Graceful shutdown
process.on('SIGTERM', () => {
    logger_1.logger.info('SIGTERM signal received: closing HTTP server');
    process.exit(0);
});
process.on('SIGINT', () => {
    logger_1.logger.info('SIGINT signal received: closing HTTP server');
    process.exit(0);
});
