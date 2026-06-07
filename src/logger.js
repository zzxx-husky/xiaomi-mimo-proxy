/**
 * 日志管理器
 * 将日志写入本地文件
 */

import fs from 'fs';
import path from 'path';

class Logger {
  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.ensureLogDir();
  }

  /**
   * 确保日志目录存在
   */
  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 获取当前日期字符串
   */
  getDateStr() {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * 获取当前时间字符串
   */
  getTimeStr() {
    const now = new Date();
    return now.toISOString();
  }

  /**
   * 写入日志到文件
   */
  writeLog(level, message, data = null) {
    const dateStr = this.getDateStr();
    const timeStr = this.getTimeStr();
    const logFile = path.join(this.logDir, `proxy-${dateStr}.log`);

    let logEntry = `[${timeStr}] [${level}] ${message}`;
    if (data) {
      logEntry += `\n${JSON.stringify(data, null, 2)}`;
    }
    logEntry += '\n';

    // 追加到日志文件
    fs.appendFileSync(logFile, logEntry, 'utf8');

    // 同时输出到控制台
    if (level === 'ERROR') {
      console.error(logEntry.trim());
    } else {
      console.log(logEntry.trim());
    }
  }

  /**
   * 记录请求日志
   */
  logRequest(requestId, method, path, headers, bodySize) {
    this.writeLog('INFO', `📥 收到请求 [${requestId}]`, {
      method,
      path,
      headers: Object.keys(headers).join(', '),
      bodySize: bodySize ? `${bodySize}字节` : '无'
    });
  }

  /**
   * 记录处理日志
   */
  logProcessing(requestId, message) {
    this.writeLog('INFO', `📝 处理请求 [${requestId}]: ${message}`);
  }

  /**
   * 记录缓存操作日志
   */
  logCache(requestId, operation, details) {
    this.writeLog('INFO', `💾 缓存操作 [${requestId}]: ${operation}`, details);
  }

  /**
   * 记录代理转发日志
   */
  logProxy(requestId, targetUrl, headers) {
    this.writeLog('INFO', `🔄 转发请求 [${requestId}]`, {
      targetUrl,
      headers: Object.keys(headers).join(', ')
    });
  }

  /**
   * 记录响应日志
   */
  logResponse(requestId, statusCode, duration) {
    this.writeLog('INFO', `📤 响应完成 [${requestId}]`, {
      statusCode,
      duration: `${duration}ms`
    });
  }

  /**
   * 记录错误日志
   */
  logError(requestId, error, targetUrl) {
    this.writeLog('ERROR', `❌ 错误 [${requestId}]: ${error.message}`, {
      targetUrl,
      stack: error.stack
    });
  }

  /**
   * 记录reasoning_content日志
   */
  logReasoning(requestId, operation, details) {
    this.writeLog('INFO', `🧠 reasoning_content [${requestId}]: ${operation}`, details);
  }

  /**
   * 记录服务器启动日志
   */
  logServerStart(port, targetUrl) {
    this.writeLog('INFO', '🚀 服务器启动', {
      port,
      targetUrl,
      timestamp: this.getTimeStr()
    });
  }

  /**
   * 记录服务器关闭日志
   */
  logServerStop() {
    this.writeLog('INFO', '🛑 服务器关闭');
  }
}

// 单例实例
let instance = null;

export function getLogger() {
  if (!instance) {
    instance = new Logger();
  }
  return instance;
}

export default Logger;
