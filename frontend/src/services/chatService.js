import api from './api';

/**
 * Arshith Connect - Teams Chat Service
 * Supports 1:1 Direct Messages, Team Channels, Presence, Reactions, and WebSocket Real-Time synchronization.
 */

// WebSocket instance and event listeners
let socket = null;
let reconnectTimer = null;
const listeners = new Set();

const WS_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000')
  .replace(/^http/, 'ws');

export const chatService = {
  // ============================================================================
  // REST API Endpoints
  // ============================================================================

  /**
   * Fetch list of available contacts (employees and admins) for direct chat
   */
  async getContacts() {
    const res = await api.get('/api/chat/contacts');
    return res.data;
  },

  /**
   * Fetch list of accessible teams for team channels
   */
  async getTeams() {
    const res = await api.get('/api/chat/teams');
    return res.data;
  },

  /**
   * Fetch aggregated list of active conversations (both 1:1 and Team channels)
   */
  async getConversations() {
    const res = await api.get('/api/chat/conversations');
    return res.data;
  },

  /**
   * Fetch message history for a direct chat or team channel
   */
  async getMessages(chatType, targetId, limit = 60, conversationId = null) {
    const params = {
      chat_type: chatType,
      target_id: targetId,
      limit,
    };
    if (conversationId) {
      params.conversation_id = conversationId;
    }
    const res = await api.get('/api/chat/messages', { params });
    return res.data;
  },

  /**
   * Send a new message to direct user or team channel
   */
  async sendMessage({ chatType, targetId, conversationId = null, content, attachments = [], replyTo = null }) {
    const payload = {
      chat_type: chatType,
      target_id: targetId,
      content,
      attachments,
      reply_to: replyTo,
    };
    if (conversationId) {
      payload.conversation_id = conversationId;
    }
    const res = await api.post('/api/chat/messages', payload);
    return res.data;
  },

  /**
   * Toggle emoji reaction on a message
   */
  async toggleReaction(messageId, emoji) {
    const res = await api.post(`/api/chat/messages/${messageId}/reactions`, {
      emoji,
    });
    return res.data;
  },

  /**
   * Toggle pinned status on a message
   */
  async togglePin(messageId) {
    const res = await api.post(`/api/chat/messages/${messageId}/pin`);
    return res.data;
  },

  /**
   * Delete a message (author or admin)
   */
  async deleteMessage(messageId) {
    const res = await api.delete(`/api/chat/messages/${messageId}`);
    return res.data;
  },

  /**
   * Edit an existing message (author or admin)
   */
  async editMessage(messageId, content) {
    const res = await api.patch(`/api/chat/messages/${messageId}`, {
      content,
    });
    return res.data;
  },

  /**
   * Upload attachment (image, pdf, document, spreadsheet)
   */
  async uploadAttachment(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/api/chat/attachments/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },

  /**
   * Create a new team group channel
   */
  async createGroup({ name, description = '', memberIds = [] }) {
    const res = await api.post('/api/chat/conversations/group', {
      name,
      description,
      member_ids: memberIds,
    });
    return res.data;
  },

  /**
   * Add member to a team group channel
   */
  async addGroupMember(groupId, userId) {
    const res = await api.post(`/api/chat/conversations/${groupId}/members`, {
      user_id: userId,
    });
    return res.data;
  },

  /**
   * Remove member from a group channel or leave group
   */
  async removeGroupMember(groupId, userId) {
    const res = await api.delete(`/api/chat/conversations/${groupId}/members/${userId}`);
    return res.data;
  },

  /**
   * Mark all messages in a conversation as read
   */
  async markRead(chatType, targetId, conversationId = null) {
    const payload = {
      chat_type: chatType,
      target_id: targetId,
    };
    if (conversationId) {
      payload.conversation_id = conversationId;
    }
    const res = await api.post('/api/chat/read', payload);
    return res.data;
  },

  /**
   * Fast check for total unread chat messages for application navbar badges
   */
  async getUnreadCount() {
    try {
      const res = await api.get('/api/chat/unread-count');
      return res.data.total_unread || 0;
    } catch {
      return 0;
    }
  },

  // ============================================================================
  // Real-Time WebSocket Connection & Event Dispatcher
  // ============================================================================

  /**
   * Connect to WebSocket server for instant message dispatch
   */
  connectWebSocket(onEvent) {
    if (onEvent) {
      listeners.add(onEvent);
    }

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return () => {
        if (onEvent) listeners.delete(onEvent);
      };
    }

    const token = localStorage.getItem('arshith_auth_token') || '';
    const wsUrl = `${WS_BASE_URL}/api/chat/ws?token=${encodeURIComponent(token)}`;

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        // Send a ping to keep connection warm
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          listeners.forEach((listener) => {
            try {
              listener(data);
            } catch (err) {
              console.error('Error in chat listener:', err);
            }
          });
        } catch {
          // Ignore non-json
        }
      };

      socket.onclose = () => {
        socket = null;
        // Auto-reconnect after 4 seconds if token still exists
        if (localStorage.getItem('arshith_auth_token')) {
          reconnectTimer = setTimeout(() => {
            chatService.connectWebSocket();
          }, 4000);
        }
      };

      socket.onerror = (err) => {
        console.debug('Chat WebSocket error:', err);
      };
    } catch (e) {
      console.debug('Failed to initialize chat WebSocket:', e);
    }

    return () => {
      if (onEvent) {
        listeners.delete(onEvent);
      }
    };
  },

  /**
   * Emit typing event to WebSocket
   */
  sendTyping(chatType, targetId, isTyping = true) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(
          JSON.stringify({
            action: 'typing',
            chat_type: chatType,
            target_id: targetId,
            is_typing: isTyping,
          })
        );
      } catch {
        // ignore
      }
    }
  },
};

export default chatService;
