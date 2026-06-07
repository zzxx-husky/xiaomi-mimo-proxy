/**
 * Redis缓存实现（可选）
 * 用于生产环境的分布式缓存
 */

import { createClient } from 'redis';

export class RedisReasoningCache {
  constructor(options = {}) {
    this.client = null;
    this.prefix = options.prefix || 'mimo:reasoning:';
    this.ttlSeconds = (options.ttlHours || 24) * 60 * 60;
    this.maxSize = options.maxSize || 1000;
    this.connected = false;
  }

  /**
   * 连接到Redis
   */
  async connect(url = 'redis://localhost:6379') {
    try {
      this.client = createClient({ url });
      this.client.on('error', (err) => console.error('Redis Client Error', err));
      await this.client.connect();
      this.connected = true;
      console.log('Connected to Redis');
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      this.connected = false;
    }
  }

  /**
   * 生成对话标识符
   */
  generateConversationId(messages) {
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
      hash = hash & hash;
    }

    return `conv_${Math.abs(hash).toString(36)}`;
  }

  /**
   * 提取消息中的reasoning_content
   */
  extractReasoningContent(message) {
    if (!message) return null;

    if (message.reasoning_content) {
      return message.reasoning_content;
    }

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

    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      return message.tool_calls;
    }

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
  async storeConversationReasoning(conversationId, messages) {
    if (!this.connected) {
      throw new Error('Redis not connected');
    }

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

    const key = `${this.prefix}${conversationId}`;
    await this.client.setEx(
      key,
      this.ttlSeconds,
      JSON.stringify({
        reasoningHistory,
        lastUpdated: Date.now(),
        messageCount: messages.length
      })
    );

    return reasoningHistory;
  }

  /**
   * 获取对话的reasoning_content历史
   */
  async getConversationReasoning(conversationId) {
    if (!this.connected) {
      throw new Error('Redis not connected');
    }

    const key = `${this.prefix}${conversationId}`;
    const data = await this.client.get(key);

    if (!data) {
      return null;
    }

    const parsed = JSON.parse(data);

    // 更新访问时间
    await this.client.setEx(key, this.ttlSeconds, data);

    return parsed.reasoningHistory;
  }

  /**
   * 在请求中注入reasoning_content
   */
  async injectReasoningContent(messages, conversationId) {
    const reasoningHistory = await this.getConversationReasoning(conversationId);
    if (!reasoningHistory || reasoningHistory.length === 0) {
      return messages;
    }

    const enhancedMessages = [];
    let reasoningIndex = 0;

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      enhancedMessages.push(message);

      if (message.role === 'assistant' && this.hasToolCalls(message)) {
        const reasoning = this.extractReasoningContent(message);

        if (!reasoning && reasoningIndex < reasoningHistory.length) {
          const historicalReasoning = reasoningHistory[reasoningIndex];
          if (historicalReasoning.reasoning_content) {
            const enhancedMessage = { ...message };

            if (typeof enhancedMessage.content === 'string' || enhancedMessage.content === null) {
              enhancedMessage.reasoning_content = historicalReasoning.reasoning_content;
            } else if (Array.isArray(enhancedMessage.content)) {
              enhancedMessage.content = [
                {
                  type: 'reasoning',
                  text: historicalReasoning.reasoning_content
                },
                ...enhancedMessage.content
              ];
            }

            enhancedMessages[enhancedMessages.length - 1] = enhancedMessage;
          }
        }

        reasoningIndex++;
      }
    }

    return enhancedMessages;
  }

  /**
   * 获取缓存统计信息
   */
  async getStats() {
    if (!this.connected) {
      return { connected: false };
    }

    const keys = await this.client.keys(`${this.prefix}*`);
    return {
      connected: true,
      cacheSize: keys.length,
      prefix: this.prefix,
      ttlSeconds: this.ttlSeconds
    };
  }

  /**
   * 清空所有缓存
   */
  async clear() {
    if (!this.connected) {
      return;
    }

    const keys = await this.client.keys(`${this.prefix}*`);
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
    }
  }
}

export default RedisReasoningCache;
