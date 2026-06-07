/**
 * Anthropic API格式处理器
 */

import { getReasoningCache } from '../cache/reasoning-cache.js';
import { getLogger } from '../logger.js';

export class AnthropicHandler {
  constructor() {
    this.cache = getReasoningCache();
    this.logger = getLogger();
  }

  async processRequest(req, res, next) {
    try {
      const body = req.body;

      if (!body || !body.messages || !Array.isArray(body.messages)) {
        return next();
      }

      const conversationId = this.cache.generateConversationId(body.messages);
      const storedCount = this.cache.storeConversationReasoning(conversationId, body.messages);

      // 只记录关键信息
      if (storedCount > 0) {
        this.logger.writeLog('DEBUG', `  [Anthropic] 缓存: ${storedCount} 条reasoning_content 对话ID: ${conversationId}`);
      }

      req.body.messages = this.cache.injectReasoningContent(body.messages, conversationId);
      req.conversationId = conversationId;

      next();
    } catch (error) {
      this.logger.writeLog('ERROR', `❌ Anthropic handler error: ${error.message}`);
      next(error);
    }
  }

  async processResponse(req, res, next) {
    try {
      const originalJson = res.json.bind(res);

      res.json = function(data) {
        if (data && data.content && Array.isArray(data.content)) {
          const reasoningBlocks = data.content.filter(
            block => block.type === 'reasoning' || block.type === 'thinking'
          );

          if (reasoningBlocks.length > 0) {
            const conversationId = req.conversationId;
            if (conversationId) {
              const reasoningContent = reasoningBlocks
                .map(block => block.text || block.content || '')
                .join('\n');

              const cache = getReasoningCache();
              cache.storeConversationReasoning(conversationId, [
                ...(req.body.messages || []),
                {
                  role: 'assistant',
                  content: data.content,
                  reasoning_content: reasoningContent
                }
              ]);

              const logger = getLogger();
              logger.writeLog('DEBUG', `  [Anthropic] 存储reasoning_content ${reasoningBlocks.length} 块 对话ID: ${conversationId}`);
            }
          }
        }

        return originalJson(data);
      };

      next();
    } catch (error) {
      const logger = getLogger();
      logger.writeLog('ERROR', `❌ Anthropic response handler error: ${error.message}`);
      next(error);
    }
  }
}

export default AnthropicHandler;
