/**
 * OpenAI API格式处理器
 */

import { getReasoningCache } from '../cache/reasoning-cache.js';
import { getLogger } from '../logger.js';

export class OpenAIHandler {
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
        this.logger.writeLog('DEBUG', `  [OpenAI] 缓存: ${storedCount} 条reasoning_content 对话ID: ${conversationId}`);
      }

      req.body.messages = this.cache.injectReasoningContent(body.messages, conversationId);
      req.conversationId = conversationId;

      next();
    } catch (error) {
      this.logger.writeLog('ERROR', `❌ OpenAI handler error: ${error.message}`);
      next(error);
    }
  }

  async processResponse(req, res, next) {
    try {
      const originalJson = res.json.bind(res);

      res.json = function(data) {
        if (data && data.choices) {
          for (const choice of data.choices) {
            if (choice.message && choice.message.reasoning_content) {
              const conversationId = req.conversationId;
              if (conversationId) {
                const cache = getReasoningCache();
                cache.storeConversationReasoning(conversationId, [
                  ...(req.body.messages || []),
                  {
                    role: 'assistant',
                    content: choice.message.content,
                    reasoning_content: choice.message.reasoning_content,
                    tool_calls: choice.message.tool_calls
                  }
                ]);

                const logger = getLogger();
                logger.writeLog('DEBUG', `  [OpenAI] 存储reasoning_content 对话ID: ${conversationId}`);
              }
            }
          }
        }

        return originalJson(data);
      };

      next();
    } catch (error) {
      const logger = getLogger();
      logger.writeLog('ERROR', `❌ OpenAI response handler error: ${error.message}`);
      next(error);
    }
  }
}

export default OpenAIHandler;
