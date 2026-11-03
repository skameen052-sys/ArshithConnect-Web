import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessageSquare,
  Users,
  Search,
  Plus,
  Send,
  Smile,
  Paperclip,
  Pin,
  Trash2,
  Reply,
  Edit2,
  Info,
  CheckCheck,
  X,
  Hash,
  Calendar,
  FileText,
  Download,
  UserPlus,
  UserMinus,
  ArrowLeft,
  Loader2,
  Image as ImageIcon,
  Check,
  Mic,
  Volume2,
  Square,
  Bell,
  BellOff,
  MoreVertical,
} from 'lucide-react';
import { chatService } from '../../services/chatService';
import '../../styles/teamsChat.css';

const QUICK_REPLIES = [
  'Working on it right away! 👍',
  'Please check the latest updates.',
  'Approved, please proceed.',
  'Let us connect in a quick meeting 📞',
  'Thanks for the update! 🎉',
  'Kindly share your attendance update.',
];

const EMOJIS = ['👍', '❤️', '👏', '🎉', '🚀', '😊', '🔥', '✅'];

const formatChatTime = (isoString) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();
    if (isYesterday) {
      return 'Yesterday';
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

export default function TeamsChatWorkspace() {
  const [searchParams] = useSearchParams();
  const queryTeam = searchParams.get('team');
  const queryUser = searchParams.get('user');

  // Stored current user profile
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('arshith_user')) || {};
    } catch {
      return {};
    }
  })();
  const userRole = localStorage.getItem('arshith_role') || currentUser.role || 'employee';
  const isAdmin = userRole.toLowerCase() === 'admin';
  const myPrimaryId = currentUser.employeeId || currentUser.employee_id || currentUser.id || (isAdmin ? 'ADM-001' : 'employee');

  const myKeys = [
    currentUser.employeeId,
    currentUser.employee_id,
    currentUser.id,
    currentUser.email,
    isAdmin ? 'adm-001' : null,
    isAdmin ? 'admin' : null,
    isAdmin ? 'administrator' : null,
    isAdmin ? 'admin@arshith.com' : null,
    myPrimaryId,
  ].filter(Boolean).map((k) => String(k).trim().toLowerCase());

  const getCanonicalId = (id) => {
    if (!id) return '';
    const clean = String(id).trim();
    const l = clean.toLowerCase();
    if (l === 'adm-001' || l === 'admin' || l === 'administrator' || l === 'admin@arshith.com') {
      return 'ADM-001';
    }
    return clean.toUpperCase();
  };

  // Data states
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const activeConversationRef = useRef(activeConversation);
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);
  const currentRequestIdRef = useRef(0);

  const [messages, setMessages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [teams, setTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // UI & Filter states
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'direct', 'teams', 'unread'
  const [searchQuery, setSearchQuery] = useState('');
  const [inputMessage, setInputMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState('members'); // 'members', 'files', 'pinned'
  const [isMuted, setIsMuted] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});

  // Attachments & Lightbox
  const [attachedFile, setAttachedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  // Group creation modal state
  const [modalTab, setModalTab] = useState('direct'); // 'direct' or 'group'
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupMemberSearch, setGroupMemberSearch] = useState('');

  // Add member dropdown state
  const [showAddMemberSelect, setShowAddMemberSelect] = useState(false);
  const [selectedAddMemberId, setSelectedAddMemberId] = useState('');

  // Voice message recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Scroll to bottom of message list
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // Load conversations and contacts
  const loadInitialData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [convsData, contactsData, teamsData] = await Promise.all([
        chatService.getConversations(),
        chatService.getContacts(),
        chatService.getTeams(),
      ]);

      const rawConvList = Array.isArray(convsData) ? convsData : [];
      const contactsList = Array.isArray(contactsData) ? contactsData : [];

      // Helper to find matching contact for direct conversations
      const matchContact = (targetId, title) => {
        const tId = String(targetId || '').trim().toLowerCase();
        const tName = String(title || '').trim().toLowerCase();
        return contactsList.find((ct) => {
          const ctId = String(ct.id || '').trim().toLowerCase();
          const ctEmpId = String(ct.employee_id || '').trim().toLowerCase();
          const ctEmail = String(ct.email || '').trim().toLowerCase();
          const ctName = String(ct.name || '').trim().toLowerCase();
          return (
            (ctId && (ctId === tId || ctId === tName)) ||
            (ctEmpId && (ctEmpId === tId || ctEmpId === tName)) ||
            (ctEmail && (ctEmail === tId || ctEmail === tName)) ||
            (ctName && (ctName === tId || ctName === tName))
          );
        });
      };

      // Enrich conversations with actual contact profile details
      const convList = rawConvList.map((c) => {
        if (c.type === 'direct') {
          const matched = matchContact(c.target_id, c.title);
          if (matched) {
            return {
              ...c,
              title: matched.name || c.title,
              subtitle: matched.designation
                ? `${matched.designation} • ${matched.department || 'Operations'}`
                : c.subtitle,
              profile_photo: matched.profile_photo || matched.photo_url || c.profile_photo || c.photo_url || null,
              photo_url: matched.photo_url || matched.profile_photo || c.photo_url || c.profile_photo || null,
              avatar: matched.name ? matched.name.charAt(0).toUpperCase() : c.avatar,
            };
          }
        }
        return c;
      });

      setConversations(convList);
      setContacts(contactsList);
      setTeams(Array.isArray(teamsData) ? teamsData : []);

      // Determine initial active conversation or preserve currently selected
      let selected = null;
      const currentActiveId = activeConversationRef.current?.conversation_id;
      if (currentActiveId) {
        selected = convList.find((c) => c.conversation_id === currentActiveId) || null;
      }

      if (!selected) {
        if (queryTeam) {
          selected = convList.find(
            (c) => c.type === 'team' && (c.target_id === queryTeam || c.title.toLowerCase() === queryTeam.toLowerCase())
          );
        } else if (queryUser) {
          selected = convList.find(
            (c) => c.type === 'direct' && c.target_id.toLowerCase() === queryUser.toLowerCase()
          );
          if (!selected) {
            const foundContact = matchContact(queryUser, queryUser);
            if (foundContact) {
              const myCanonical = getCanonicalId(myPrimaryId);
              const targetCanonical = getCanonicalId(foundContact.employee_id || foundContact.id);
              const pair = [myCanonical, targetCanonical].sort();
              selected = {
                conversation_id: `dm_${pair[0]}_${pair[1]}`,
                type: 'direct',
                target_id: foundContact.employee_id || foundContact.id,
                title: foundContact.name,
                subtitle: `${foundContact.designation || 'Staff'} • ${foundContact.department || 'Operations'}`,
                avatar: foundContact.name ? foundContact.name.charAt(0).toUpperCase() : (foundContact.avatar || 'U'),
                profile_photo: foundContact.profile_photo || foundContact.photo_url || null,
                photo_url: foundContact.photo_url || foundContact.profile_photo || null,
                is_online: foundContact.is_online,
                last_message: '',
                unread_count: 0,
              };
            }
          }
        }
      }

      // Default to first conversation
      if (!selected && convList.length > 0) {
        selected = convList[0];
      }

      if (selected) {
        if (selected.type === 'direct') {
          const matched = matchContact(selected.target_id, selected.title);
          if (matched) {
            selected = {
              ...selected,
              title: matched.name || selected.title,
              profile_photo: matched.profile_photo || matched.photo_url || selected.profile_photo || selected.photo_url || null,
              photo_url: matched.photo_url || matched.profile_photo || selected.photo_url || selected.profile_photo || null,
              avatar: matched.name ? matched.name.charAt(0).toUpperCase() : selected.avatar,
            };
          }
        }
        setActiveConversation(selected);
      }
    } catch (err) {
      console.error('Failed to load chat data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [queryTeam, queryUser, myPrimaryId]);

  // Load messages for currently active conversation
  const loadMessages = useCallback(async (conv, reqId) => {
    if (!conv) {
      setMessages([]);
      setIsMessagesLoading(false);
      return;
    }
    try {
      setIsMessagesLoading(true);
      const msgs = await chatService.getMessages(conv.type, conv.target_id, 60, conv.conversation_id);
      if (reqId !== currentRequestIdRef.current || activeConversationRef.current?.conversation_id !== conv.conversation_id) {
        return;
      }
      setMessages(Array.isArray(msgs) ? msgs : []);
      // Mark unread as read
      chatService.markRead(conv.type, conv.target_id, conv.conversation_id).catch(() => {});
      // Clear unread badge locally
      setConversations((prev) =>
        prev.map((c) => (c.conversation_id === conv.conversation_id ? { ...c, unread_count: 0 } : c))
      );
    } catch (err) {
      console.error('Failed to load messages:', err);
      if (reqId === currentRequestIdRef.current) {
        setMessages([]);
      }
    } finally {
      if (reqId === currentRequestIdRef.current) {
        setIsMessagesLoading(false);
        setTimeout(() => scrollToBottom(false), 80);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // When active conversation changes, fetch its messages
  useEffect(() => {
    if (activeConversation) {
      if (activeConversation.type !== 'team') {
        setIsDetailsOpen(false);
      }
      setMessages([]);
      setEditingMessage(null);
      setReplyingTo(null);
      setAttachedFile(null);
      currentRequestIdRef.current += 1;
      const reqId = currentRequestIdRef.current;
      loadMessages(activeConversation, reqId);
    } else {
      setMessages([]);
      setIsMessagesLoading(false);
      setIsDetailsOpen(false);
    }
  }, [activeConversation, loadMessages]);

  // WebSocket real-time subscription & Polling fallback
  useEffect(() => {
    const handleWsEvent = (event) => {
      if (event.type === 'new_message' && event.message) {
        const msg = event.message;
        const currentConv = activeConversationRef.current;

        // Check if message belongs strictly to currently open conversation
        if (currentConv) {
          const isCurrentConv = msg.conversation_id
            ? msg.conversation_id === currentConv.conversation_id
            : (currentConv.type === 'team' && msg.chat_type === 'team' && (
                msg.team_id === currentConv.target_id ||
                msg.target_id === currentConv.target_id ||
                (currentConv.title && msg.team_name && currentConv.title.toLowerCase() === msg.team_name.toLowerCase())
              )) ||
              (currentConv.type === 'direct' && msg.chat_type === 'direct' && (
                (myKeys.includes(String(msg.sender_id).toLowerCase()) && String(currentConv.target_id).toLowerCase() === String(msg.receiver_id).toLowerCase()) ||
                (myKeys.includes(String(msg.receiver_id).toLowerCase()) && String(currentConv.target_id).toLowerCase() === String(msg.sender_id).toLowerCase())
              ));

          if (isCurrentConv) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            setTimeout(() => scrollToBottom(true), 50);
          }
        }

        // Update conversation preview snippet strictly for matching conversation
        setConversations((prev) =>
          prev.map((c) => {
            const matches = msg.conversation_id
              ? c.conversation_id === msg.conversation_id
              : (c.type === 'team' &&
                  msg.chat_type === 'team' &&
                  (c.target_id === (msg.team_id || msg.target_id) ||
                    (c.title && msg.team_name && c.title.toLowerCase() === msg.team_name.toLowerCase()))) ||
                (c.type === 'direct' &&
                  msg.chat_type === 'direct' &&
                  ((myKeys.includes(String(msg.sender_id).toLowerCase()) && String(c.target_id).toLowerCase() === String(msg.receiver_id).toLowerCase()) ||
                   (myKeys.includes(String(msg.receiver_id).toLowerCase()) && String(c.target_id).toLowerCase() === String(msg.sender_id).toLowerCase())));
            if (matches) {
              const isActive = activeConversationRef.current?.conversation_id === c.conversation_id;
              return {
                ...c,
                last_message: msg.content || (msg.attachments?.length ? 'Shared an attachment' : ''),
                last_message_sender: msg.sender_name,
                last_message_at: msg.created_at,
                unread_count: isActive ? 0 : (c.unread_count || 0) + 1,
              };
            }
            return c;
          })
        );
      } else if (event.type === 'message_edited') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.message_id
              ? { ...m, content: event.content, is_edited: true, updated_at: event.updated_at }
              : m
          )
        );
      } else if (event.type === 'reaction_updated') {
        setMessages((prev) =>
          prev.map((m) => (m.id === event.message_id ? { ...m, reactions: event.reactions } : m))
        );
      } else if (event.type === 'pin_updated') {
        setMessages((prev) =>
          prev.map((m) => (m.id === event.message_id ? { ...m, is_pinned: event.is_pinned } : m))
        );
      } else if (event.type === 'message_deleted') {
        setMessages((prev) => prev.filter((m) => m.id !== event.message_id));
      } else if (event.type === 'new_team' && event.team) {
        setTeams((prev) => [event.team, ...prev]);
        loadInitialData();
      } else if (event.type === 'user_profile_updated') {
        const { user_id, employee_id, photo_url, profile_photo, name } = event;
        const photo = profile_photo || photo_url;
        const matchesUser = (item) => {
          if (!item) return false;
          const target = String(item.target_id || '').trim().toLowerCase();
          const title = String(item.title || '').trim().toLowerCase();
          const uId = String(user_id || '').trim().toLowerCase();
          const eId = String(employee_id || '').trim().toLowerCase();
          const n = String(name || '').trim().toLowerCase();
          return (
            (uId && (target === uId || title === uId)) ||
            (eId && (target === eId || title === eId)) ||
            (n && (target === n || title === n))
          );
        };

        setConversations((prev) =>
          prev.map((c) => {
            if (c.type === 'direct' && matchesUser(c)) {
              return {
                ...c,
                title: name || c.title,
                profile_photo: photo !== undefined ? photo : c.profile_photo,
                photo_url: photo !== undefined ? photo : c.photo_url,
                avatar: name ? name.charAt(0).toUpperCase() : c.avatar,
              };
            }
            return c;
          })
        );

        setActiveConversation((prev) => {
          if (prev && prev.type === 'direct' && matchesUser(prev)) {
            return {
              ...prev,
              title: name || prev.title,
              profile_photo: photo !== undefined ? photo : prev.profile_photo,
              photo_url: photo !== undefined ? photo : prev.photo_url,
              avatar: name ? name.charAt(0).toUpperCase() : prev.avatar,
            };
          }
          return prev;
        });

        setContacts((prev) =>
          prev.map((ct) => {
            const ctId = String(ct.id || '').trim().toLowerCase();
            const ctEmpId = String(ct.employee_id || '').trim().toLowerCase();
            const uId = String(user_id || '').trim().toLowerCase();
            const eId = String(employee_id || '').trim().toLowerCase();
            if ((uId && ctId === uId) || (eId && ctEmpId === eId)) {
              return {
                ...ct,
                name: name || ct.name,
                profile_photo: photo !== undefined ? photo : ct.profile_photo,
                photo_url: photo !== undefined ? photo : ct.photo_url,
                avatar: name ? name.charAt(0).toUpperCase() : ct.avatar,
              };
            }
            return ct;
          })
        );
      } else if (event.type === 'typing') {
        const currentConv = activeConversationRef.current;
        if (currentConv && event.target_id === currentConv.target_id.toLowerCase()) {
          setTypingUsers((prev) => ({
            ...prev,
            [event.sender_name]: event.is_typing,
          }));
          if (event.is_typing) {
            setTimeout(() => {
              setTypingUsers((prev) => {
                const next = { ...prev };
                delete next[event.sender_name];
                return next;
              });
            }, 3000);
          }
        }
      }
    };

    const cleanupWs = chatService.connectWebSocket(handleWsEvent);

    // Light polling interval (every 4 seconds) to ensure synchronization
    const pollInterval = setInterval(() => {
      const currentConv = activeConversationRef.current;
      if (currentConv) {
        chatService
          .getMessages(currentConv.type, currentConv.target_id, 60, currentConv.conversation_id)
          .then((fresh) => {
            if (activeConversationRef.current?.conversation_id !== currentConv.conversation_id) {
              return;
            }
            if (Array.isArray(fresh)) {
              setMessages((prev) => {
                if (
                  fresh.length !== prev.length ||
                  fresh[fresh.length - 1]?.id !== prev[prev.length - 1]?.id ||
                  fresh.some((m, idx) => m.content !== prev[idx]?.content)
                ) {
                  return fresh;
                }
                return prev;
              });
            }
          })
          .catch(() => {});
      }
    }, 4000);

    return () => {
      cleanupWs();
      clearInterval(pollInterval);
    };
  }, [loadInitialData]);

  // Re-sync chat data when tab or window gains focus to reflect updated profiles
  useEffect(() => {
    const handleFocus = () => {
      loadInitialData();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadInitialData]);

  // Handle typing notification
  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    if (activeConversation) {
      chatService.sendTyping(activeConversation.type, activeConversation.target_id, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        chatService.sendTyping(activeConversation.type, activeConversation.target_id, false);
      }, 1500);
    }
  };

  // File upload selection
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File exceeds the maximum limit of 10MB.');
      return;
    }

    try {
      setIsUploading(true);
      const res = await chatService.uploadAttachment(file);
      setAttachedFile(res);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to upload attachment.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Start editing a message
  const handleStartEdit = (msg) => {
    setEditingMessage(msg);
    setInputMessage(msg.content);
    setReplyingTo(null);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setEditingMessage(null);
    setInputMessage('');
  };

  // Start voice recording from microphone
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Voice recording is not supported in this browser.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error starting audio recording:', err);
      alert('Microphone permission is required to record voice messages. Please grant microphone access.');
    }
  };

  // Cancel and discard voice recording
  const cancelRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      } catch {}
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
  };

  // Stop recording and send voice message
  const stopAndSendVoiceMessage = async () => {
    if (!mediaRecorderRef.current || !activeConversation) return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const durationSec = recordingDuration;
    const min = Math.floor(durationSec / 60);
    const sec = durationSec % 60;
    const timeStr = `${min}:${sec < 10 ? '0' : ''}${sec}`;

    setIsSendingVoice(true);

    const recorder = mediaRecorderRef.current;
    recorder.onstop = async () => {
      try {
        recorder.stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        if (audioBlob.size === 0) {
          setIsRecording(false);
          setIsSendingVoice(false);
          return;
        }

        let voiceAttachment = null;
        try {
          const file = new File([audioBlob], `Voice_Message_${Date.now()}.webm`, { type: 'audio/webm' });
          const uploaded = await chatService.uploadAttachment(file);
          voiceAttachment = {
            ...uploaded,
            is_audio: true,
            filename: `Voice Message (${timeStr})`,
          };
        } catch (uploadErr) {
          console.warn('Attachment upload failed, encoding as DataURL:', uploadErr);
          const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(audioBlob);
          });
          voiceAttachment = {
            url: dataUrl,
            filename: `Voice Message (${timeStr})`,
            file_size: audioBlob.size,
            is_image: false,
            is_audio: true,
            content_type: 'audio/webm',
          };
        }

        const created = await chatService.sendMessage({
          chatType: activeConversation.type,
          targetId: activeConversation.target_id,
          conversationId: activeConversation.conversation_id,
          content: `🎤 Voice message (${timeStr})`,
          attachments: [voiceAttachment],
        });

        if (activeConversationRef.current?.conversation_id === activeConversation.conversation_id) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === created.id)) return prev;
            return [...prev, created];
          });
          setTimeout(() => scrollToBottom(true), 80);
        }
      } catch (sendErr) {
        console.error('Failed to send voice message:', sendErr);
        alert('Failed to send voice message. Please try again.');
      } finally {
        setIsRecording(false);
        setRecordingDuration(0);
        setIsSendingVoice(false);
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
      }
    };

    recorder.stop();
  };

  // Send message or Save Edit
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const cleanContent = inputMessage.trim();
    if ((!cleanContent && !attachedFile) || !activeConversation || isSending) return;

    // Handle Edit Mode
    if (editingMessage) {
      try {
        setIsSending(true);
        await chatService.editMessage(editingMessage.id, cleanContent);
        setMessages((prev) =>
          prev.map((m) => (m.id === editingMessage.id ? { ...m, content: cleanContent, is_edited: true } : m))
        );
        setEditingMessage(null);
        setInputMessage('');
      } catch (err) {
        alert(err.response?.data?.detail || 'Failed to edit message.');
      } finally {
        setIsSending(false);
      }
      return;
    }

    // Normal Send Mode
    try {
      setIsSending(true);
      setInputMessage('');
      const replyData = replyingTo
        ? {
            id: replyingTo.id,
            sender_name: replyingTo.sender_name,
            content_snippet: replyingTo.content.substring(0, 80),
          }
        : null;

      setReplyingTo(null);
      const toSendAttachment = attachedFile ? [attachedFile] : [];
      setAttachedFile(null);

      const created = await chatService.sendMessage({
        chatType: activeConversation.type,
        targetId: activeConversation.target_id,
        conversationId: activeConversation.conversation_id,
        content: cleanContent || (toSendAttachment.length ? `Shared: ${toSendAttachment[0].filename}` : ''),
        attachments: toSendAttachment,
        replyTo: replyData,
      });

      if (activeConversationRef.current?.conversation_id === activeConversation.conversation_id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === created.id)) return prev;
          return [...prev, created];
        });
        setTimeout(() => scrollToBottom(true), 50);
      }

      // Refresh conversations list snippet
      setConversations((prev) =>
        prev.map((c) =>
          c.conversation_id === activeConversation.conversation_id
            ? {
                ...c,
                last_message: cleanContent || (toSendAttachment.length ? toSendAttachment[0].filename : ''),
                last_message_at: new Date().toISOString(),
              }
            : c
        )
      );
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  };

  // Keyboard shortcut: Enter to send, Shift+Enter for newline, Esc to cancel edit
  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && editingMessage) {
      handleCancelEdit();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Quick reaction toggle
  const handleToggleReaction = async (messageId, emoji) => {
    try {
      const res = await chatService.toggleReaction(messageId, emoji);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: res.reactions } : m))
      );
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
    }
  };

  // Toggle pin
  const handleTogglePin = async (messageId) => {
    try {
      const res = await chatService.togglePin(messageId);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_pinned: res.is_pinned } : m))
      );
    } catch (err) {
      console.error('Failed to pin message:', err);
    }
  };

  // Delete message
  const handleDeleteMessage = async (messageId) => {
    if (window.confirm('Delete this message for everyone?')) {
      try {
        await chatService.deleteMessage(messageId);
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } catch (err) {
        console.error('Failed to delete message:', err);
      }
    }
  };

  // Start new conversation from modal (Contact)
  const handleStartChatWithContact = (contact) => {
    const targetCanonical = getCanonicalId(contact.employee_id || contact.id);
    const photo = contact.profile_photo || contact.photo_url || null;
    const existing = conversations.find(
      (c) =>
        c.type === 'direct' &&
        (c.target_id.toLowerCase() === String(contact.id).toLowerCase() ||
          (contact.employee_id && c.target_id.toLowerCase() === String(contact.employee_id).toLowerCase()) ||
          getCanonicalId(c.target_id) === targetCanonical)
    );
    if (existing) {
      const updatedExisting = {
        ...existing,
        title: contact.name || existing.title,
        profile_photo: photo || existing.profile_photo,
        photo_url: photo || existing.photo_url,
        avatar: contact.name ? contact.name.charAt(0).toUpperCase() : existing.avatar,
      };
      setConversations((prev) =>
        prev.map((c) => (c.conversation_id === existing.conversation_id ? updatedExisting : c))
      );
      setActiveConversation(updatedExisting);
    } else {
      const myCanonical = getCanonicalId(myPrimaryId);
      const pair = [myCanonical, targetCanonical].sort();
      const newConv = {
        conversation_id: `dm_${pair[0]}_${pair[1]}`,
        type: 'direct',
        target_id: contact.employee_id || contact.id,
        title: contact.name,
        subtitle: `${contact.designation || 'Staff'} • ${contact.department || 'Operations'}`,
        avatar: contact.name ? contact.name.charAt(0).toUpperCase() : (contact.avatar || 'U'),
        profile_photo: photo,
        photo_url: photo,
        is_online: contact.is_online,
        last_message: '',
        unread_count: 0,
      };
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversation(newConv);
    }
    setIsNewChatOpen(false);
  };

  // Select team channel
  const handleSelectTeamChannel = (team) => {
    const existing = conversations.find((c) => c.type === 'team' && c.target_id === String(team.id));
    if (existing) {
      setActiveConversation(existing);
    } else {
      const newConv = {
        conversation_id: `team_${team.id}`,
        type: 'team',
        target_id: String(team.id),
        title: team.name,
        subtitle: `${team.department || 'Company'} • ${team.member_count || 0} members`,
        avatar: '#',
        last_message: '',
        unread_count: 0,
      };
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversation(newConv);
    }
    setIsNewChatOpen(false);
  };

  // Create team group channel
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) {
      alert('Please enter a team group name.');
      return;
    }

    try {
      setIsCreatingGroup(true);
      const created = await chatService.createGroup({
        name: newGroupName.trim(),
        description: newGroupDescription.trim(),
        memberIds: selectedGroupMembers,
      });

      const newConv = {
        conversation_id: `team_${created.id}`,
        type: 'team',
        target_id: String(created.id),
        title: created.name,
        subtitle: `Custom Group • ${created.members?.length || 1} members`,
        avatar: '#',
        last_message: 'Group created',
        last_message_at: created.created_at,
        unread_count: 0,
      };
      setTeams((prev) => [created, ...prev]);
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversation(newConv);

      setIsNewChatOpen(false);
      setNewGroupName('');
      setNewGroupDescription('');
      setSelectedGroupMembers([]);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create group.');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  // Toggle group member selection for new group
  const handleToggleMemberSelection = (id) => {
    setSelectedGroupMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  // Add member to current group
  const handleAddMemberToCurrentGroup = async () => {
    if (!selectedAddMemberId || !activeConversation || activeConversation.type !== 'team') return;
    try {
      const res = await chatService.addGroupMember(activeConversation.target_id, selectedAddMemberId);
      setTeams((prev) =>
        prev.map((t) =>
          String(t.id) === activeConversation.target_id
            ? { ...t, members: res.members, member_count: res.members.length }
            : t
        )
      );
      setSelectedAddMemberId('');
      setShowAddMemberSelect(false);
      loadMessages(activeConversation);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add member.');
    }
  };

  // Remove member or leave group
  const handleRemoveMemberFromGroup = async (userId) => {
    if (!activeConversation || activeConversation.type !== 'team') return;
    const isSelf = userId.toLowerCase() === myPrimaryId.toLowerCase();
    const promptMsg = isSelf
      ? 'Are you sure you want to leave this group channel?'
      : `Remove employee ${userId} from this group?`;

    if (!window.confirm(promptMsg)) return;

    try {
      const res = await chatService.removeGroupMember(activeConversation.target_id, userId);
      if (isSelf) {
        setConversations((prev) => prev.filter((c) => c.conversation_id !== activeConversation.conversation_id));
        setActiveConversation(null);
      } else {
        setTeams((prev) =>
          prev.map((t) =>
            String(t.id) === activeConversation.target_id
              ? { ...t, members: res.members, member_count: res.members.length }
              : t
          )
        );
        loadMessages(activeConversation);
      }
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to remove member.');
    }
  };

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'direct' && c.type === 'direct') ||
      (activeTab === 'teams' && c.type === 'team') ||
      (activeTab === 'unread' && (c.unread_count || 0) > 0);
    const matchesQuery =
      !searchQuery ||
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.last_message && c.last_message.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTab && matchesQuery;
  });

  const pinnedMessage = messages.find((m) => m.is_pinned);
  const typingNames = Object.keys(typingUsers).filter((name) => typingUsers[name]);

  // Active channel team object if active is a team
  const currentTeamObj =
    activeConversation?.type === 'team'
      ? teams.find((t) => String(t.id) === activeConversation.target_id)
      : null;

  // List of shared attachments in the active conversation
  const sharedAttachments = messages
    .flatMap((m) => m.attachments || [])
    .filter(Boolean);

  return (
    <div className="teams-chat-container animate-fade-in">
      {/* Hidden File Input for Attachments */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.doc,.xlsx,.xls,.txt,.csv,.zip,.webm,.mp3,.wav,.ogg,.m4a"
      />

      {/* Conversations & Channels List (Direct 3-column layout matching screenshot) */}
      <div className="teams-conversations-sidebar">
        {/* Header with Title "Chat" and "+ New Chat" Button */}
        <div className="teams-sidebar-top">
          <div className="teams-sidebar-header-row">
            <h2 className="teams-sidebar-title">
              <span>Chat</span>
            </h2>
            <button
              type="button"
              className="teams-new-chat-btn"
              onClick={() => {
                setModalTab('direct');
                setIsNewChatOpen(true);
              }}
              title="Compose new message or create group"
            >
              <Plus size={15} />
              <span>New Chat</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="teams-search-box">
            <Search size={15} className="teams-search-icon" />
            <input
              type="text"
              placeholder="Search chats..."
              className="teams-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="teams-search-clear"
                onClick={() => setSearchQuery('')}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs matching Screenshot: All, Direct, Groups */}
        <div className="teams-filter-tabs">
          <button
            type="button"
            className={`teams-filter-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`teams-filter-tab ${activeTab === 'direct' ? 'active' : ''}`}
            onClick={() => setActiveTab('direct')}
          >
            Direct
          </button>
          <button
            type="button"
            className={`teams-filter-tab ${activeTab === 'teams' ? 'active' : ''}`}
            onClick={() => setActiveTab('teams')}
          >
            Groups
          </button>
        </div>

        {/* Scrollable Conversation List */}
        <div className="teams-conversations-list">
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b', fontSize: '0.85rem' }}>
              <Loader2 className="animate-spin" size={20} style={{ margin: '0 auto 8px auto', color: '#713DE5' }} />
              Loading conversations...
            </div>
          ) : filteredConversations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', fontSize: '0.82rem' }}>
              No conversations found. Click <strong>New</strong> to start chatting!
            </div>
          ) : (
            filteredConversations.map((c) => {
              const isSelected = activeConversation?.conversation_id === c.conversation_id;
              return (
                <div
                  key={c.conversation_id}
                  className={`teams-conv-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    if (activeConversation?.conversation_id !== c.conversation_id) {
                      setActiveConversation(c);
                    }
                  }}
                >
                  <div className="teams-avatar-wrap">
                    {c.type === 'team' ? (
                      <div className="teams-avatar team">
                        <Hash size={18} />
                      </div>
                    ) : (
                      <>
                        <div className={`teams-avatar ${c.avatar === 'A' ? 'admin' : 'employee'}`}>
                          {c.profile_photo || c.photo_url ? (
                            <img
                              src={c.profile_photo || c.photo_url}
                              alt={c.title || 'Profile'}
                              className="teams-avatar-img"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fb = e.currentTarget.parentElement?.querySelector('.teams-avatar-initial');
                                if (fb) fb.style.display = 'block';
                              }}
                            />
                          ) : null}
                          <span
                            className="teams-avatar-initial"
                            style={{ display: (c.profile_photo || c.photo_url) ? 'none' : 'block' }}
                          >
                            {c.avatar || c.title?.charAt(0)?.toUpperCase() || 'U'}
                          </span>
                        </div>
                        <div className={`teams-presence-dot ${c.is_online ? 'online' : 'offline'}`} />
                      </>
                    )}
                  </div>

                  <div className="teams-conv-content">
                    <div className="teams-conv-row">
                      <span className="teams-conv-title">{c.title}</span>
                      {c.last_message_at && (
                        <span className="teams-conv-time">
                          {formatChatTime(c.last_message_at)}
                        </span>
                      )}
                    </div>
                    <div className="teams-conv-row">
                      <span className="teams-conv-snippet">
                        {c.last_message_sender ? `${c.last_message_sender}: ` : ''}
                        {c.last_message || 'No messages yet'}
                      </span>
                      {c.unread_count > 0 && (
                        <span className="teams-unread-badge">
                          {c.unread_count > 99 ? '99+' : c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. Center Main Chat Window */}
      {activeConversation ? (
        <div className="teams-main-chat">
          {/* Chat Header */}
          {/* Active Chat Header matching Screenshot (No call/video options) */}
          <div className="teams-chat-header">
            <div className="teams-chat-header-info">
              <div className="teams-avatar-wrap">
                {activeConversation.type === 'team' ? (
                  <div className="teams-avatar team">
                    <Users size={18} />
                  </div>
                ) : (
                  <>
                    <div className={`teams-avatar ${activeConversation.avatar === 'A' ? 'admin' : 'employee'}`}>
                      {activeConversation.profile_photo || activeConversation.photo_url ? (
                        <img
                          src={activeConversation.profile_photo || activeConversation.photo_url}
                          alt={activeConversation.title || 'Profile'}
                          className="teams-avatar-img"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const fb = e.currentTarget.parentElement?.querySelector('.teams-avatar-initial');
                            if (fb) fb.style.display = 'block';
                          }}
                        />
                      ) : null}
                      <span
                        className="teams-avatar-initial"
                        style={{ display: (activeConversation.profile_photo || activeConversation.photo_url) ? 'none' : 'block' }}
                      >
                        {activeConversation.avatar || activeConversation.title?.charAt(0)?.toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div className={`teams-presence-dot ${activeConversation.is_online ? 'online' : 'offline'}`} />
                  </>
                )}
              </div>
              <div>
                <div className="teams-chat-header-title">{activeConversation.title}</div>
                <div className="teams-chat-header-subtitle">
                  {activeConversation.type === 'team' ? (
                    <>
                      <span>{activeConversation.subtitle || '12 members | Development'}</span>
                      <span className="teams-header-active-dot" />
                      <span style={{ color: '#22C55E', fontWeight: 600 }}>Active now</span>
                    </>
                  ) : activeConversation.is_online ? (
                    <>
                      <span className="teams-header-active-dot" />
                      <span style={{ color: '#22C55E', fontWeight: 600 }}>Active now</span>
                    </>
                  ) : (
                    <span>Offline</span>
                  )}
                </div>
              </div>
            </div>

            {/* Header actions: Search & Group Info (No Call or Video) */}
            <div className="teams-chat-header-actions">
              <button
                type="button"
                className="teams-header-btn"
                title="Search messages in conversation"
              >
                <Search size={17} />
              </button>
              <button
                type="button"
                className={`teams-header-btn ${isDetailsOpen && activeConversation.type === 'team' ? 'active' : ''}`}
                onClick={() => {
                  if (activeConversation.type === 'team') {
                    setIsDetailsOpen((prev) => !prev);
                  }
                }}
                title={activeConversation.type === 'team' ? "Group Information" : "More options"}
              >
                <MoreVertical size={17} />
              </button>
            </div>
          </div>

          {/* Pinned Message Banner if Any */}
          {pinnedMessage && (
            <div className="teams-pinned-banner">
              <Pin size={14} color="#713DE5" />
              <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <strong>Pinned by {pinnedMessage.sender_name}:</strong> {pinnedMessage.content}
              </div>
              <button
                type="button"
                className="teams-action-icon-btn"
                onClick={() => handleTogglePin(pinnedMessage.id)}
                title="Unpin"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div className="teams-messages-area">
            {isMessagesLoading ? (
              <div className="teams-empty-messages">
                <Loader2 size={32} className="animate-spin" color="#713DE5" />
                <p style={{ marginTop: '10px', color: '#88839F' }}>Loading conversation...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="teams-empty-messages">
                <div className="teams-empty-messages-icon">
                  {activeConversation.type === 'team' ? <Hash size={40} /> : <MessageSquare size={40} />}
                </div>
                <h3>Welcome to #{activeConversation.title}!</h3>
                <p>This is the start of your real-time conversation. Send a message to get started.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = myKeys.includes(String(msg.sender_id).trim().toLowerCase());

                return (
                  <div
                    key={msg.id}
                    className={`teams-msg-row ${isMine ? 'outgoing' : 'incoming'} ${
                      msg.sender_role === 'system' ? 'system-msg-row' : ''
                    }`}
                  >
                    {!isMine && msg.sender_role !== 'system' && (
                      <div className="teams-msg-avatar">
                        {msg.sender_avatar || msg.sender_name?.[0] || 'U'}
                      </div>
                    )}

                    <div className="teams-msg-body">
                      {msg.sender_role === 'system' ? (
                        <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.78rem', margin: '4px 0', fontStyle: 'italic' }}>
                          ⚙️ {msg.content}
                        </div>
                      ) : (
                        <>
                          <div className="teams-msg-header">
                            <span className="teams-msg-sender">{msg.sender_name}</span>
                            {msg.sender_role === 'admin' ? (
                              <span className="teams-role-pill admin">ADMIN</span>
                            ) : (
                              <span className="teams-role-pill employee">STAFF</span>
                            )}
                            <span className="teams-msg-timestamp">
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {msg.is_edited && <span className="teams-msg-edited-tag">(edited)</span>}
                            {msg.is_pinned && <Pin size={12} color="#713DE5" />}
                          </div>

                          {/* Quoted Reply if any */}
                          {msg.reply_to && (
                            <div className="teams-quote-box">
                              <div className="teams-quote-author">{msg.reply_to.sender_name}</div>
                              <div className="teams-quote-text">{msg.reply_to.content_snippet}</div>
                            </div>
                          )}

                          {/* Main Message Bubble */}
                          <div className="teams-msg-bubble">
                            {msg.content}

                            {/* Render Attachments */}
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="teams-attachment-container">
                                {msg.attachments.map((att, aIdx) =>
                                  att.is_image ? (
                                    <div
                                      key={aIdx}
                                      className="teams-attachment-img-wrap"
                                      onClick={() => setLightboxImage(att.url)}
                                      title="Click to view full image"
                                    >
                                      <img src={att.url} alt={att.filename} className="teams-attachment-img" />
                                    </div>
                                  ) : (att.is_audio || att.content_type?.startsWith('audio/') || (att.filename && (att.filename.toLowerCase().includes('voice') || att.filename.toLowerCase().endsWith('.webm') || att.filename.toLowerCase().endsWith('.mp3') || att.filename.toLowerCase().endsWith('.wav')))) ? (
                                    <div
                                      key={aIdx}
                                      className="teams-voice-note-card"
                                      style={{
                                        marginTop: '6px',
                                        padding: '8px 12px',
                                        borderRadius: '12px',
                                        backgroundColor: isMine ? 'rgba(255, 255, 255, 0.18)' : '#F0ECFA',
                                        border: isMine ? '1px solid rgba(255, 255, 255, 0.28)' : '1px solid #E9E1F5',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px',
                                        minWidth: '220px',
                                        maxWidth: '300px',
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700, color: isMine ? '#ffffff' : '#713DE5' }}>
                                        <Volume2 size={15} />
                                        <span>{att.filename || 'Voice Message'}</span>
                                      </div>
                                      <audio
                                        controls
                                        src={att.url}
                                        controlsList="nodownload"
                                        style={{ width: '100%', height: '32px', outline: 'none' }}
                                      />
                                    </div>
                                  ) : (
                                    <a
                                      key={aIdx}
                                      href={att.url}
                                      download={att.filename}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="teams-attachment-card"
                                    >
                                      {(() => {
                                        const fname = (att.filename || '').toLowerCase();
                                        const isPdf = fname.endsWith('.pdf');
                                        const isCodeOrZip = fname.endsWith('.zip') || fname.endsWith('.rar') || fname.endsWith('.js') || fname.endsWith('.json');
                                        return (
                                          <div
                                            className="teams-attachment-card-icon"
                                            style={{
                                              backgroundColor: isPdf ? '#fee2e2' : isCodeOrZip ? '#dbeafe' : '#e0e7ff',
                                              color: isPdf ? '#dc2626' : isCodeOrZip ? '#2563eb' : '#4f46e5',
                                              fontWeight: 800,
                                              fontSize: '0.68rem',
                                              borderRadius: '6px',
                                              minWidth: '34px',
                                              height: '34px',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                            }}
                                          >
                                            {isPdf ? 'PDF' : isCodeOrZip ? '</>' : <FileText size={16} />}
                                          </div>
                                        );
                                      })()}
                                      <div className="teams-attachment-card-info">
                                        <span className="teams-attachment-card-name">{att.filename}</span>
                                        <span className="teams-attachment-card-size">
                                          {(att.file_size / 1024).toFixed(1)} KB
                                        </span>
                                      </div>
                                      <Download size={15} style={{ marginLeft: 'auto', color: '#64748b' }} />
                                    </a>
                                  )
                                )}
                              </div>
                            )}
                          </div>

                          {/* Reactions Pills */}
                          {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                            <div className="teams-msg-reactions">
                              {Object.entries(msg.reactions).map(([emoji, usersList]) => {
                                const hasReacted = usersList.includes(myPrimaryId);
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className={`teams-reaction-pill ${hasReacted ? 'reacted' : ''}`}
                                    onClick={() => handleToggleReaction(msg.id, emoji)}
                                    title={`Reacted by: ${usersList.join(', ')}`}
                                  >
                                    <span>{emoji}</span>
                                    <span>{usersList.length}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Delivery status */}
                          {isMine && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                marginTop: '2px',
                                color: '#94a3b8',
                                fontSize: '0.7rem',
                              }}
                            >
                              <CheckCheck size={13} color="#713DE5" />
                              <span>Delivered</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Hover Reaction & Actions Menu */}
                    {msg.sender_role !== 'system' && (
                      <div className="teams-msg-actions-hover">
                        {EMOJIS.slice(0, 4).map((em) => (
                          <button
                            key={em}
                            type="button"
                            className="teams-action-icon-btn"
                            onClick={() => handleToggleReaction(msg.id, em)}
                            title={`React with ${em}`}
                          >
                            {em}
                          </button>
                        ))}

                        <button
                          type="button"
                          className="teams-action-icon-btn"
                          onClick={() => {
                            setReplyingTo(msg);
                            setEditingMessage(null);
                            if (textareaRef.current) textareaRef.current.focus();
                          }}
                          title="Reply to message"
                        >
                          <Reply size={13} />
                        </button>

                        {(isMine || isAdmin) && (
                          <button
                            type="button"
                            className="teams-action-icon-btn"
                            onClick={() => handleStartEdit(msg)}
                            title="Edit message"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}

                        <button
                          type="button"
                          className="teams-action-icon-btn"
                          onClick={() => handleTogglePin(msg.id)}
                          title={msg.is_pinned ? 'Unpin' : 'Pin message'}
                        >
                          <Pin size={13} />
                        </button>

                        {(isMine || isAdmin) && (
                          <button
                            type="button"
                            className="teams-action-icon-btn"
                            onClick={() => handleDeleteMessage(msg.id)}
                            title="Delete message"
                            style={{ color: '#ef4444' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Typing Indicator Bar */}
          {typingNames.length > 0 && (
            <div className="teams-typing-bar">
              <div className="teams-typing-dots">
                <span className="teams-typing-dot" />
                <span className="teams-typing-dot" />
                <span className="teams-typing-dot" />
              </div>
              <span>
                {typingNames.join(', ')} {typingNames.length > 1 ? 'are' : 'is'} typing...
              </span>
            </div>
          )}

          {/* Input & Formatter Area */}
          <div className="teams-input-container">
            {/* Quick Replies Row */}
            <div className="teams-quick-replies">
              {QUICK_REPLIES.map((qr, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="teams-quick-chip"
                  onClick={() => setInputMessage(qr)}
                >
                  {qr}
                </button>
              ))}
            </div>

            {/* Quoting Preview if User Clicked Reply */}
            {replyingTo && (
              <div className="teams-replying-bar">
                <div>
                  <strong>Replying to {replyingTo.sender_name}:</strong>{' '}
                  <span style={{ opacity: 0.85 }}>{replyingTo.content.substring(0, 60)}...</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Editing Message Banner */}
            {editingMessage && (
              <div className="teams-editing-bar">
                <div>
                  <strong>Editing message</strong> • Press Esc to cancel
                </div>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Attached file preview chip in composer */}
            {attachedFile && (
              <div className="teams-composer-attachment-preview">
                {attachedFile.is_image ? <ImageIcon size={16} /> : <FileText size={16} />}
                <span style={{ fontWeight: 600 }}>{attachedFile.filename}</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.75 }}>
                  ({(attachedFile.file_size / 1024).toFixed(1)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => setAttachedFile(null)}
                  style={{
                    marginLeft: 'auto',
                    background: 'transparent',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                  }}
                  title="Remove attachment"
                >
                  <X size={15} />
                </button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="teams-input-box">
              <textarea
                ref={textareaRef}
                rows={2}
                className="teams-textarea"
                placeholder={
                  editingMessage
                    ? 'Edit your message...'
                    : `Type a message to ${activeConversation.title}... (Shift+Enter for newline)`
                }
                value={inputMessage}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
              />

              <div className="teams-input-toolbar">
                {isRecording ? (
                  <div
                    className="teams-voice-recording-bar"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      padding: '4px 6px',
                      borderRadius: '8px',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontWeight: 700, fontSize: '0.85rem' }}>
                      <span className="voice-record-pulse" style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }} />
                      <span>Recording voice note... {Math.floor(recordingDuration / 60)}:{recordingDuration % 60 < 10 ? '0' : ''}{recordingDuration % 60}</span>
                    </div>

                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={cancelRecording}
                        className="teams-tool-btn"
                        style={{ color: '#ef4444' }}
                        title="Discard voice recording"
                        disabled={isSendingVoice}
                      >
                        <Trash2 size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={stopAndSendVoiceMessage}
                        className="teams-send-btn"
                        style={{ height: '32px' }}
                        title="Send voice note"
                        disabled={isSendingVoice}
                      >
                        {isSendingVoice ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <>
                            <Send size={14} />
                            <span>Send</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="teams-toolbar-left">
                      <button
                        type="button"
                        className="teams-tool-btn"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        title="Insert Emoji"
                      >
                        <Smile size={18} />
                      </button>

                      <button
                        type="button"
                        className="teams-tool-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        title="Attach file (Images, PDF, Word, Excel)"
                      >
                        {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
                      </button>

                      {/* Voice message button matching user's Image 2 */}
                      <button
                        type="button"
                        className="teams-tool-btn voice-mic-btn"
                        onClick={startRecording}
                        title="Record and send voice message"
                      >
                        <Mic size={18} />
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={(!inputMessage.trim() && !attachedFile) || isSending}
                      className="teams-send-btn"
                    >
                      {isSending ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : editingMessage ? (
                        <span>Save</span>
                      ) : (
                        <>
                          <Send size={15} />
                          <span>Send</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </form>

            {/* Quick Floating Emoji Picker */}
            {showEmojiPicker && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '90px',
                  left: '24px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '8px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  display: 'flex',
                  gap: '8px',
                  zIndex: 20,
                }}
              >
                {EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      fontSize: '1.25rem',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                    onClick={() => {
                      setInputMessage((prev) => prev + em);
                      setShowEmojiPicker(false);
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
          Select or start a conversation
        </div>
      )}

      {/* 4. Right Side Details Drawer: Group Information (Only for team channels when explicitly toggled, never for direct chats) */}
      {isDetailsOpen && activeConversation && activeConversation.type === 'team' && (
        <div className="teams-details-drawer">
          <div className="teams-drawer-header">
            <h4 className="teams-drawer-title">Group Information</h4>
            <button
              type="button"
              onClick={() => setIsDetailsOpen(false)}
              style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
              title="Close panel"
            >
              <X size={18} />
            </button>
          </div>

          <div className="teams-profile-card">
            <div className="teams-profile-avatar-big">
              {activeConversation.type === 'team' ? <Users size={32} /> : activeConversation.avatar || 'U'}
            </div>
            <div className="teams-profile-name" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <span>{activeConversation.title}</span>
              {activeConversation.type === 'team' && (
                <Edit2 size={13} style={{ cursor: 'pointer', color: '#88839F' }} title="Edit group name" />
              )}
            </div>
            <div className="teams-profile-role" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <span>{activeConversation.type === 'team' ? (activeConversation.subtitle || '12 members | Development') : 'Direct Chat'}</span>
              <span>•</span>
              <span className="teams-header-active-dot" />
              <span style={{ color: '#22C55E', fontWeight: 600 }}>Active now</span>
            </div>

            {/* Quick Actions (Call & Video options removed per instruction) */}
            <div className="teams-drawer-actions-grid" style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: '16px' }}>
              {activeConversation.type === 'team' && (
                <button
                  type="button"
                  className="teams-info-action-btn"
                  onClick={() => setShowAddMemberSelect(!showAddMemberSelect)}
                  title="Add members to group"
                >
                  <div className="teams-info-action-icon">
                    <UserPlus size={16} />
                  </div>
                  <span>Add Members</span>
                </button>
              )}

              <button
                type="button"
                className="teams-info-action-btn"
                onClick={() => setIsMuted(!isMuted)}
                title={isMuted ? 'Unmute notifications' : 'Mute notifications'}
              >
                <div className="teams-info-action-icon">
                  {isMuted ? <BellOff size={16} /> : <Bell size={16} />}
                </div>
                <span>{isMuted ? 'Muted' : 'Mute'}</span>
              </button>
            </div>
          </div>

          {/* About Section */}
          <div className="teams-details-section" style={{ borderBottom: '1px solid #E9E1F5', paddingBottom: '14px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div className="teams-details-section-title" style={{ margin: 0 }}>About</div>
              <Edit2 size={12} style={{ color: '#88839F', cursor: 'pointer' }} />
            </div>
            <div style={{ fontSize: '0.82rem', color: '#88839F', lineHeight: 1.45 }}>
              {currentTeamObj?.description || 'Discuss product development, tasks, updates and releases.'}
            </div>
          </div>

          {/* Group Information Tabs: Members | Shared Files | Pinned Messages */}
          <div className="teams-drawer-tabs" style={{ display: 'flex', borderBottom: '1px solid #E9E1F5', marginBottom: '14px' }}>
            <button
              type="button"
              className={`teams-drawer-tab ${detailsTab === 'members' ? 'active' : ''}`}
              onClick={() => setDetailsTab('members')}
              style={{
                flex: 1,
                padding: '8px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: detailsTab === 'members' ? '2.5px solid #713DE5' : '2.5px solid transparent',
                color: detailsTab === 'members' ? '#713DE5' : '#88839F',
                fontWeight: detailsTab === 'members' ? 700 : 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Members ({currentTeamObj?.members?.length || 12})
            </button>
            <button
              type="button"
              className={`teams-drawer-tab ${detailsTab === 'files' ? 'active' : ''}`}
              onClick={() => setDetailsTab('files')}
              style={{
                flex: 1,
                padding: '8px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: detailsTab === 'files' ? '2.5px solid #713DE5' : '2.5px solid transparent',
                color: detailsTab === 'files' ? '#713DE5' : '#88839F',
                fontWeight: detailsTab === 'files' ? 700 : 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Shared Files
            </button>
            <button
              type="button"
              className={`teams-drawer-tab ${detailsTab === 'pinned' ? 'active' : ''}`}
              onClick={() => setDetailsTab('pinned')}
              style={{
                flex: 1,
                padding: '8px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: detailsTab === 'pinned' ? '2.5px solid #713DE5' : '2.5px solid transparent',
                color: detailsTab === 'pinned' ? '#713DE5' : '#88839F',
                fontWeight: detailsTab === 'pinned' ? 700 : 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Pinned
            </button>
          </div>

          {/* Tab 1: Members List */}
          {detailsTab === 'members' && (
            <div className="teams-details-section">
              {showAddMemberSelect && (
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', marginBottom: '12px', border: '1px solid #e2e8f0' }}>
                  <select
                    value={selectedAddMemberId}
                    onChange={(e) => setSelectedAddMemberId(e.target.value)}
                    style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', marginBottom: '8px' }}
                  >
                    <option value="">Select Employee to add...</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.employee_id || c.id}>
                        {c.name} ({c.department})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddMemberToCurrentGroup}
                    disabled={!selectedAddMemberId}
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: 'linear-gradient(135deg, #6739E8 0%, #A43CE0 100%)',
                      color: '#ffffff',
                      borderRadius: '6px',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                    }}
                  >
                    Confirm Add to Group
                  </button>
                </div>
              )}

              {/* Members List with Presence Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {((currentTeamObj?.members && currentTeamObj.members.length > 0)
                  ? currentTeamObj.members.map((mId) => {
                      const c = contacts.find((ct) => ct.id === mId || ct.employee_id === mId || ct.email === mId);
                      return {
                        id: mId,
                        name: c?.name || mId,
                        role: mId === currentTeamObj?.leader ? 'Admin' : 'Member',
                        status: c?.is_online ? 'Online' : 'Offline',
                        photo: c?.profile_photo || c?.photo_url || null,
                      };
                    })
                  : [
                      { id: '1', name: 'John Doe', role: 'Admin', status: 'Online' },
                      { id: '2', name: 'Priya Sharma', role: 'Member', status: 'Online' },
                      { id: '3', name: 'Rahul Mehta', role: 'Member', status: 'In a meeting' },
                      { id: '4', name: 'Sneha Iyer', role: 'Member', status: 'Online' },
                      { id: '5', name: 'Arjun Nair', role: 'Member', status: 'Away' },
                    ]
                ).map((mem, idx) => {
                  const isOnline = mem.status === 'Online';
                  const isMeeting = mem.status === 'In a meeting';
                  const isAway = mem.status === 'Away';
                  const statusColor = isOnline ? '#22C55E' : isMeeting ? '#ef4444' : isAway ? '#f59e0b' : '#94a3b8';

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 4px',
                        fontSize: '0.82rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: '#e2e8f0',
                            color: '#1e293b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            overflow: 'hidden',
                          }}
                        >
                          {mem.photo ? (
                            <img
                              src={mem.photo}
                              alt={mem.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            mem.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{mem.name}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>{mem.role}</span>
                            <span>•</span>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: statusColor, display: 'inline-block' }} />
                            <span>{mem.status}</span>
                          </div>
                        </div>
                      </div>

                      <MoreVertical size={14} style={{ color: '#94a3b8', cursor: 'pointer' }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 2: Shared Files */}
          {detailsTab === 'files' && (
            <div className="teams-details-section">
              {sharedAttachments.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>
                  No shared files yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sharedAttachments.map((att, aIdx) => (
                    <a
                      key={aIdx}
                      href={att.url}
                      download={att.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        fontSize: '0.78rem',
                        color: '#1e293b',
                      }}
                    >
                      <FileText size={16} color="#713DE5" />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {att.filename}
                      </span>
                      <Download size={13} color="#88839F" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Pinned Messages */}
          {detailsTab === 'pinned' && (
            <div className="teams-details-section">
              {pinnedMessage ? (
                <div style={{ padding: '10px', backgroundColor: '#FAF7FF', borderRadius: '8px', border: '1px solid #E9E1F5', fontSize: '0.8rem' }}>
                  <div style={{ fontWeight: 700, color: '#713DE5', marginBottom: '4px' }}>
                    {pinnedMessage.sender_name}
                  </div>
                  <div>{pinnedMessage.content}</div>
                </div>
              ) : (
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>
                  No pinned messages.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 5. "New Chat" & "New Group" Modal */}
      {isNewChatOpen && (
        <div className="teams-modal-backdrop" onClick={() => setIsNewChatOpen(false)}>
          <div className="teams-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="teams-modal-header">
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                New Message or Group
              </h3>
              <button
                type="button"
                onClick={() => setIsNewChatOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Tabs: Direct Chat vs Create Team Channel */}
            <div className="teams-modal-tabs">
              <button
                type="button"
                className={`teams-modal-tab-btn ${modalTab === 'direct' ? 'active' : ''}`}
                onClick={() => setModalTab('direct')}
              >
                Direct Message
              </button>
              <button
                type="button"
                className={`teams-modal-tab-btn ${modalTab === 'group' ? 'active' : ''}`}
                onClick={() => setModalTab('group')}
              >
                Create Team Group
              </button>
            </div>

            <div className="teams-modal-body" style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {modalTab === 'direct' ? (
                <>
                  {/* Team Channels Section */}
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      marginBottom: '8px',
                    }}
                  >
                    Existing Team Channels
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '18px' }}>
                    {teams.map((t) => (
                      <div key={t.id} className="teams-modal-item" onClick={() => handleSelectTeamChannel(t)}>
                        <div
                          className="teams-avatar team"
                          style={{ width: '32px', height: '32px', borderRadius: '8px' }}
                        >
                          <Hash size={16} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>{t.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {t.department} &bull; {t.member_count} members
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Individual Contacts Section */}
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      marginBottom: '8px',
                    }}
                  >
                    Direct Message (Employees & Admins)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {contacts.map((c) => (
                      <div key={c.id} className="teams-modal-item" onClick={() => handleStartChatWithContact(c)}>
                        <div className="teams-avatar-wrap" style={{ width: '32px', height: '32px' }}>
                          <div
                            className={`teams-avatar ${c.role}`}
                            style={{ width: '32px', height: '32px', borderRadius: '8px', fontSize: '0.85rem' }}
                          >
                            {c.profile_photo || c.photo_url ? (
                              <img
                                src={c.profile_photo || c.photo_url}
                                alt={c.name || 'User'}
                                className="teams-avatar-img"
                                style={{ borderRadius: '8px' }}
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const fb = e.currentTarget.parentElement?.querySelector('.teams-avatar-initial');
                                  if (fb) fb.style.display = 'block';
                                }}
                              />
                            ) : null}
                            <span
                              className="teams-avatar-initial"
                              style={{ display: (c.profile_photo || c.photo_url) ? 'none' : 'block' }}
                            >
                              {c.avatar || c.name?.charAt(0)?.toUpperCase() || 'U'}
                            </span>
                          </div>
                          <div className={`teams-presence-dot ${c.is_online ? 'online' : 'offline'}`} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>
                            {c.name} {c.role === 'admin' ? '(Admin)' : ''}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {c.designation} &bull; {c.department}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                /* Group Creation Form */
                <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Group Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Engineering Team, Project Titan"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.88rem',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Purpose of this group conversation..."
                      value={newGroupDescription}
                      onChange={(e) => setNewGroupDescription(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.88rem',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Add Members ({selectedGroupMembers.length} selected)
                    </label>
                    <input
                      type="text"
                      placeholder="Search employees..."
                      value={groupMemberSearch}
                      onChange={(e) => setGroupMemberSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        fontSize: '0.8rem',
                        marginBottom: '8px',
                      }}
                    />

                    <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px' }}>
                      {contacts
                        .filter(
                          (c) =>
                            !groupMemberSearch ||
                            c.name.toLowerCase().includes(groupMemberSearch.toLowerCase()) ||
                            c.department.toLowerCase().includes(groupMemberSearch.toLowerCase())
                        )
                        .map((c) => {
                          const isSelected = selectedGroupMembers.includes(c.employee_id || c.id);
                          return (
                            <div
                              key={c.id}
                              onClick={() => handleToggleMemberSelection(c.employee_id || c.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                backgroundColor: isSelected ? '#F0E9FF' : 'transparent',
                              }}
                            >
                              <div
                                style={{
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '4px',
                                  border: isSelected ? '1px solid #713DE5' : '1px solid #E9E1F5',
                                  backgroundColor: isSelected ? '#713DE5' : '#ffffff',
                                  color: '#ffffff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {isSelected && <Check size={12} />}
                              </div>
                              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#24213B' }}>{c.name}</span>
                              <span style={{ fontSize: '0.72rem', color: '#88839F', marginLeft: 'auto' }}>
                                {c.department}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!newGroupName.trim() || isCreatingGroup}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: 'linear-gradient(135deg, #6739E8 0%, #A43CE0 100%)',
                      color: '#ffffff',
                      borderRadius: '8px',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    {isCreatingGroup ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    <span>Create Group Channel</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Fullscreen Image Lightbox Modal */}
      {lightboxImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '24px',
          }}
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
            }}
          >
            <X size={28} />
          </button>
          <img
            src={lightboxImage}
            alt="Preview"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px', objectFit: 'contain' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
