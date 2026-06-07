/**
 * Xiaomi MiMo Proxy Server
 * 用于代理小米MiMo API请求，自动处理reasoning_content的缓存和注入
 */

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import dotenv from 'dotenv';
import { OpenAIHandler } from './handlers/openai-handler.js';
import { AnthropicHandler } from './handlers/anthropic-handler.js';
import { getReasoningCache } from './cache/reasoning-cache.js';
import { getLogger } from './logger.js';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PROXY_PORT || 3000;
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com';

// 初始化日志管理器
const logger = getLogger();

// 初始化处理器
const openaiHandler = new OpenAIHandler();
const anthropicHandler = new AnthropicHandler();

// 中间件配置
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 请求日志中间件 - 只记录最重要的信息
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  req.requestId = requestId;

  // 只记录收到请求
  logger.writeLog('INFO', `📥 收到请求 [${requestId}] ${req.method} ${req.path}`);

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.writeLog('INFO', `📤 响应完成 [${requestId}] 状态码: ${res.statusCode} 耗时: ${duration}ms`);
  });

  next();
});

// 健康检查端点
app.get('/health', (req, res) => {
  const cache = getReasoningCache();
  const stats = cache.getStats();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    cacheStats: stats,
    proxyConfig: {
      targetUrl: MIMO_BASE_URL,
      port: PORT
    }
  });
});

// 缓存统计端点
app.get('/stats', (req, res) => {
  const cache = getReasoningCache();
  res.json(cache.getStats());
});

// 清空缓存端点
app.post('/cache/clear', (req, res) => {
  const cache = getReasoningCache();
  cache.clear();
  res.json({ message: 'Cache cleared successfully' });
});

// OpenAI格式的chat completions端点
app.post('/v1/chat/completions', async (req, res, next) => {
  await openaiHandler.processRequest(req, res, () => {
    openaiHandler.processResponse(req, res, () => {
      next();
    });
  });
});

// Anthropic格式的messages端点
app.post('/v1/messages', async (req, res, next) => {
  await anthropicHandler.processRequest(req, res, () => {
    anthropicHandler.processResponse(req, res, () => {
      next();
    });
  });
});

// 通用的代理中间件 - 处理所有其他请求
app.use('*', createProxyMiddleware({
  target: MIMO_BASE_URL,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    if (path.startsWith('/v1/chat/completions')) {
      const openaiBaseUrl = MIMO_BASE_URL.replace('/anthropic', '');
      req.targetUrl = openaiBaseUrl;
      return path;
    }
    if (path.startsWith('/v1/')) {
      return path;
    }
    return path.replace(/^\//, '');
  },
  router: (req) => {
    if (req.path.startsWith('/v1/chat/completions')) {
      const openaiBaseUrl = MIMO_BASE_URL.replace('/anthropic', '');
      return openaiBaseUrl;
    }
    return MIMO_BASE_URL;
  },
  proxyTimeout: 300000,
  secure: false,
  selfHandleResponse: false,
  onProxyReq: (proxyReq, req, res) => {
    if (req.headers.authorization) {
      proxyReq.setHeader('Authorization', req.headers.authorization);
    }

    const requestId = req.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    proxyReq.setHeader('X-Request-ID', requestId);

    const baseUrl = req.targetUrl || MIMO_BASE_URL;
    const targetUrl = `${baseUrl}${req.path}`;

    // 只记录转发请求
    logger.writeLog('INFO', `🔄 转发请求 [${requestId}] -> ${targetUrl}`);

    if (req.body) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
      proxyReq.end();
      return;
    }

    proxyReq.on('error', (err) => {
      logger.writeLog('ERROR', `❌ 转发失败 [${requestId}] ${err.message}`);
    });
  },
  onProxyRes: (proxyRes, req, res) => {
    proxyRes.headers['x-proxy-server'] = 'xiaomi-mimo-proxy';
    proxyRes.headers['x-proxy-version'] = '1.0.0';
  },
  onError: (err, req, res) => {
    logger.writeLog('ERROR', `❌ 代理错误 [${req.requestId || 'unknown'}] ${err.message}`);

    res.status(500).json({
      error: 'Proxy Error',
      message: err.message
    });
  }
}));

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.writeLog('ERROR', `❌ 服务器错误 [${req.requestId || 'unknown'}] ${err.message}`);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// 启动服务器
app.listen(PORT, () => {
  logger.writeLog('INFO', `🚀 Proxy服务器启动 端口: ${PORT} 目标: ${MIMO_BASE_URL}`);
});

// 优雅关闭
process.on('SIGINT', () => {
  logger.writeLog('INFO', '🛑 服务器关闭');
  const cache = getReasoningCache();
  cache.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.writeLog('INFO', '🛑 服务器关闭');
  const cache = getReasoningCache();
  cache.destroy();
  process.exit(0);
});

export default app;
