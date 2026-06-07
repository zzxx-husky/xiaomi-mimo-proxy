/**
 * Reasoning Content Cache Manager
 * 管理多轮对话中的reasoning_content缓存
 */

import { v4 as uuidv4 } from 'uuid';

class ReasoningCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.ttlHours = options.ttlHours || 24;
    this.cache = new Map();
    this.conversationMetadata = new Map();

    // 定期清理过期缓存
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000); // 每小时清理一次
  }

  /**
   * 生成对话标识符
   * 基于messages数组的内容生成唯一标识
   */
  generateConversationId(messages) {
    // 使用前几条消息的hash作为对话标识
    const keyMessages = messages.slice(0, 3).map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content.substring(0, 100) : '',
      tool_call_id: m.tool_call_id
    }));

    const content = JSON.stringify(keyMessages);
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return `conv_${Math.abs(hash).toString(36)}`;
  }

  /**
   * 提取消息中的reasoning_content
   */
  extractReasoningContent(message) {
    if (!message) return null;

    // OpenAI格式
    if (message.reasoning_content) {
      return message.reasoning_content;
    }

    // Anthropic格式 - reasoning可能在不同位置
    if (message.content && Array.isArray(message.content)) {
      const reasoningBlock = message.content.find(
        block => block.type === 'reasoning' || block.type === 'thinking'
      );
      if (reasoningBlock) {
        return reasoningBlock.text || reasoningBlock.content;
      }
    }

    return null;
  }

  /**
   * 提取消息中的tool_calls
   */
  extractToolCalls(message) {
    if (!message) return [];

    // OpenAI格式
    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      return message.tool_calls;
    }

    // Anthropic格式
    if (message.content && Array.isArray(message.content)) {
      return message.content.filter(
        block => block.type === 'tool_use'
      );
    }

    return [];
  }

  /**
   * 检查消息是否包含tool calls
   */
  hasToolCalls(message) {
    return this.extractToolCalls(message).length > 0;
  }

  /**
   * 存储对话的reasoning_content历史
   */
  storeConversationReasoning(conversationId, messages) {
    const reasoningHistory = [];

    for (const message of messages) {
      if (message.role === 'assistant') {
        const reasoning = this.extractReasoningContent(message);
        const hasTools = this.hasToolCalls(message);

        if (reasoning || hasTools) {
          reasoningHistory.push({
            reasoning_content: reasoning,
            has_tool_calls: hasTools,
            timestamp: Date.now()
          });
        }
      }
    }

    this.cache.set(conversationId, {
      reasoningHistory,
      lastUpdated: Date.now(),
      messageCount: messages.length
    });

    // 更新元数据
    this.conversationMetadata.set(conversationId, {
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: (this.conversationMetadata.get(conversationId)?.accessCount || 0) + 1
    });

    // 检查缓存大小
    if (this.cache.size > this.maxSize) {
      this.evictOldest();
    }

    return reasoningHistory;
  }

  /**
   * 获取对话的reasoning_content历史
   */
  getConversationReasoning(conversationId) {
    const cached = this.cache.get(conversationId);
    if (!cached) {
      return null;
    }

    // 更新访问时间
    const metadata = this.conversationMetadata.get(conversationId);
    if (metadata) {
      metadata.lastAccessed = Date.now();
      metadata.accessCount++;
    }

    return cached.reasoningHistory;
  }

  /**
   * 在请求中注入reasoning_content
   */
  injectReasoningContent(messages, conversationId) {
    const reasoningHistory = this.getConversationReasoning(conversationId);
    if (!reasoningHistory || reasoningHistory.length === 0) {
      return messages;
    }

    const enhancedMessages = [];
    let reasoningIndex = 0;

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      enhancedMessages.push(message);

      // 在assistant消息后，如果有tool results，需要注入reasoning_content
      if (message.role === 'assistant' && this.hasToolCalls(message)) {
        const reasoning = this.extractReasoningContent(message);

        // 如果当前assistant消息没有reasoning_content，从历史中获取
        if (!reasoning && reasoningIndex < reasoningHistory.length) {
          const historicalReasoning = reasoningHistory[reasoningIndex];
          if (historicalReasoning.reasoning_content) {
            // 创建增强的assistant消息
            const enhancedMessage = { ...message };

            // OpenAI格式
            if (typeof enhancedMessage.content === 'string' || enhancedMessage.content === null) {
              enhancedMessage.reasoning_content = historicalReasoning.reasoning_content;
            }
            // Anthropic格式
            else if (Array.isArray(enhancedMessage.content)) {
              enhancedMessage.content = [
                {
                  type: 'reasoning',
                  text: historicalReasoning.reasoning_content
                },
                ...enhancedMessage.content
              ];
            }

            // 替换最后添加的消息
            enhancedMessages[enhancedMessages.length - 1] = enhancedMessage;
          }
        }

        reasoningIndex++;
      }
    }

    return enhancedMessages;
  }

  /**
   * 清理过期缓存
   */
  cleanup() {
    const now = Date.now();
    const ttlMs = this.ttlHours * 60 * 60 * 1000;

    for (const [conversationId, metadata] of this.conversationMetadata.entries()) {
      if (now - metadata.lastAccessed > ttlMs) {
        this.cache.delete(conversationId);
        this.conversationMetadata.delete(conversationId);
      }
    }
  }

  /**
   * 淘汰最旧的缓存
   */
  evictOldest() {
    let oldestId = null;
    let oldestTime = Infinity;

    for (const [conversationId, metadata] of this.conversationMetadata.entries()) {
      if (metadata.lastAccessed < oldestTime) {
        oldestTime = metadata.lastAccessed;
        oldestId = conversationId;
      }
    }

    if (oldestId) {
      this.cache.delete(oldestId);
      this.conversationMetadata.delete(oldestId);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      metadataSize: this.conversationMetadata.size,
      maxSize: this.maxSize,
      ttlHours: this.ttlHours
    };
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.cache.clear();
    this.conversationMetadata.clear();
  }

  /**
   * 销毁缓存管理器
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

// 单例实例
let instance = null;

export function getReasoningCache(options) {
  if (!instance) {
    instance = new ReasoningCache(options);
  }
  return instance;
}

export default ReasoningCache;
