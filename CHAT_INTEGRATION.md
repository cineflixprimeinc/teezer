# Chat Integration Guide - Teezer Real-Time Messaging

## Overview

This guide shows how to integrate the new **Socket.IO + WebRTC chat server** with your existing Messages page frontend.

## Architecture Summary

```
Frontend (Next.js)
    ↓
[REST API] /api/conversations, /api/upload → Chat Server
[WebSocket] Socket.IO events (messages, calls) → Chat Server
    ↓
Chat Server (Node.js)
    ├── MySQL (persistence)
    ├── Redis (online status, typing, cache)
    ├── Cloudflare R2 (attachments)
    ├── Firebase FCM (push notifications)
    └── Coturn (WebRTC NAT fallback)
```

## Current State

Your **Messages page** (`frontend/src/features/messages/messages-page.tsx`) currently:
- ✅ Uses localStorage for persistence (client-side only)
- ✅ Has UI for conversations, chat, calls
- ❌ No real-time sync (refresh page to see new messages)
- ❌ No actual WebRTC calling
- ❌ No push notifications
- ❌ No database persistence

## Integration Steps

### 1. Install Socket.IO Client

```bash
cd frontend
npm install socket.io-client
```

### 2. Configure Environment

In `frontend/.env.local`:

```env
NEXT_PUBLIC_CHAT_SERVER_URL=https://api.teezer.live
NEXT_PUBLIC_FIREBASE_CONFIG={"apiKey":"...","authDomain":"...","projectId":"..."}
```

### 3. Update Messages Page to Use Real Chat

**File:** `frontend/src/features/messages/messages-page.tsx`

Replace the dummy data section with real API + Socket.IO:

```tsx
'use client';

import { useChat } from '@/hooks/useChat';
import { chatService } from '@/services/chat';
import { useEffect, useState } from 'react';

export function MessagesPage() {
  const { user, isAuthenticated, openAuthModal } = useAuthStore();
  const { socket, isConnected, sendMessage, initiateCall } = useChat();

  const [convos, setConvos] = useState([]);
  const [msgMap, setMsgMap] = useState({});
  const [activeId, setActiveId] = useState(null);

  /* ── Load initial data ── */
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    async function load() {
      const conversations = await chatService.listConversations();
      setConvos(conversations);
      
      if (conversations.length > 0) {
        setActiveId(conversations[0].id);
      }
    }

    load();
  }, [isAuthenticated, user?.id]);

  /* ── Load message history when conversation opens ── */
  useEffect(() => {
    if (!activeId) return;

    async function loadHistory() {
      const { data } = await chatService.getMessageHistory(activeId, null, 30);
      setMsgMap(prev => ({ ...prev, [activeId]: data }));
    }

    loadHistory();
  }, [activeId]);

  /* ── Listen to new messages via Socket.IO ── */
  useEffect(() => {
    if (!socket) return;

    socket.on('message:new', (msg) => {
      setMsgMap(prev => ({
        ...prev,
        [msg.conversation_id]: [...(prev[msg.conversation_id] || []), msg]
      }));

      // Update conversation last message
      setConvos(prev =>
        prev.map(c =>
          c.id === msg.conversation_id
            ? { ...c, lastMessage: msg.content, lastTime: new Date() }
            : c
        )
      );
    });

    socket.on('typing:user', (data) => {
      // Show typing indicator
      console.log(`${data.username} is typing...`);
    });

    socket.on('message:read-receipt', (data) => {
      // Update read status
      console.log(`Message ${data.message_id} read by ${data.user_id}`);
    });

    socket.on('call:incoming', (data) => {
      // Show incoming call modal
      showIncomingCallModal(data);
    });

    return () => {
      socket.off('message:new');
      socket.off('typing:user');
      socket.off('message:read-receipt');
      socket.off('call:incoming');
    };
  }, [socket]);

  /* ── Send message ── */
  const handleSendMessage = async () => {
    if (!msgInput.trim() || !activeId) return;

    try {
      await sendMessage(activeId, msgInput);
      setMsgInput('');
    } catch (err) {
      console.error('Send failed:', err);
    }
  };

  /* ── Initiate call ── */
  const handleInitiateCall = async (type: 'audio' | 'video') => {
    try {
      initiateCall(activeId, type, (ack) => {
        if (ack.error) {
          alert(`Call failed: ${ack.error}`);
        } else {
          // Show outgoing call UI
          console.log(`Call ${ack.call_id} initiated (${type})`);
        }
      });
    } catch (err) {
      console.error('Call initiate failed:', err);
    }
  };

  // ... rest of component remains the same, but uses real data
}
```

### 4. Enable Push Notifications

**File:** `frontend/src/services/firebase.ts` (create new)

```typescript
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = JSON.parse(
  process.env.NEXT_PUBLIC_FIREBASE_CONFIG || '{}'
);

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

export async function registerForPushNotifications(uid: number) {
  try {
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FCM_VAPID_KEY
    });

    // Save token to backend
    await fetch('/api/chat/push-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: 'web', user_id: uid })
    });
  } catch (err) {
    console.error('Push notification setup failed:', err);
  }
}

export function listenForPushNotifications() {
  onMessage(messaging, (payload) => {
    console.log('Message received:', payload);
    // Show notification
    if (payload.notification) {
      new Notification(payload.notification.title, {
        body: payload.notification.body,
        icon: payload.notification.icon
      });
    }
  });
}
```

Call in Messages page:

```tsx
useEffect(() => {
  if (!isAuthenticated || !user?.id) return;

  registerForPushNotifications(user.id);
  listenForPushNotifications();
}, [isAuthenticated, user?.id]);
```

### 5. Implement WebRTC Call UI

**File:** `frontend/src/components/webrtc-call.tsx` (create new)

```tsx
import { useEffect, useRef } from 'react';
import { useChat } from '@/hooks/useChat';

interface WebRTCCallProps {
  callId: number;
  remoteUserId: number;
  type: 'audio' | 'video';
  onEnd: () => void;
}

export function WebRTCCall({ callId, remoteUserId, type, onEnd }: WebRTCCallProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const { sendWebRTCSignal, endCall } = useChat();

  useEffect(() => {
    initializeWebRTC();

    return () => {
      peerConnectionRef.current?.close();
    };
  }, []);

  async function initializeWebRTC() {
    const config = {
      iceServers: [
        { urls: ['stun:teezer.live:3478'] },
        {
          urls: ['turn:teezer.live:3478'],
          username: 'admin',
          credential: 'password'
        }
      ]
    };

    const peerConnection = new RTCPeerConnection(config);
    peerConnectionRef.current = peerConnection;

    // Add local stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video'
    });

    if (type === 'video' && localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    stream.getTracks().forEach(track => {
      peerConnection.addTrack(track, stream);
    });

    // Handle remote stream
    peerConnection.addEventListener('track', (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    });

    // Send ICE candidates
    peerConnection.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        sendWebRTCSignal(callId, remoteUserId, 'ice-candidate', event.candidate);
      }
    });

    // Create and send offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendWebRTCSignal(callId, remoteUserId, 'offer', offer);
  }

  const handleEndCall = () => {
    peerConnectionRef.current?.close();
    endCall(callId);
    onEnd();
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center gap-4">
      <div className="relative w-96 h-96">
        <video
          ref={localVideoRef}
          autoPlay
          muted
          className="w-full h-full bg-black rounded-lg object-cover"
        />
        <span className="absolute bottom-2 left-2 text-white text-sm">You</span>
      </div>

      <div className="relative w-96 h-96">
        <video
          ref={remoteVideoRef}
          autoPlay
          className="w-full h-full bg-black rounded-lg object-cover"
        />
        <span className="absolute bottom-2 left-2 text-white text-sm">Remote</span>
      </div>

      <button
        onClick={handleEndCall}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-8 py-3 text-white font-bold hover:bg-red-700"
      >
        End Call
      </button>
    </div>
  );
}
```

### 6. Backend REST Endpoint (Optional)

If you want to add an endpoint for push token storage:

**File:** `chat-server/routes/settings.js`

```javascript
router.post('/push-token', async (req, res) => {
  const { token, platform } = req.body;
  const uid = req.user.id;

  try {
    await db.query(
      'INSERT INTO chat_push_tokens (user_id, token, platform) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE updated_at = NOW()',
      [uid, token, platform]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

## Deployment Checklist

- [ ] Deploy chat-server to VPS (see `DEPLOYMENT.md`)
- [ ] Run database migrations
- [ ] Configure R2 credentials
- [ ] Set up Firebase project + credentials
- [ ] Install Coturn STUN/TURN server
- [ ] Update Nginx reverse proxy
- [ ] Update frontend `.env.local`
- [ ] Test Socket.IO connection
- [ ] Test sending messages
- [ ] Test audio/video calls
- [ ] Test push notifications
- [ ] Monitor logs for errors

## Performance Notes

- **Messages:** First load fetches last 30 messages, then pagination on scroll
- **Typing:** Debounced, short TTL (3s) in Redis
- **Calls:** P2P WebRTC (no server bandwidth), STUN first, TURN fallback
- **Push:** Only for offline users, respects mute settings

## Security Checklist

- [ ] All endpoints require Sanctum token
- [ ] Rate limiting enabled (100 req/min)
- [ ] CORS whitelist configured
- [ ] Helmet security headers enabled
- [ ] R2 uploads presigned per user
- [ ] Chat blocks enforced on message send
- [ ] Privacy settings enforced (who_can_message)

## Next: Future Enhancements

Once stable:
- [ ] Group video calls (use LiveKit)
- [ ] Message search
- [ ] File/document sharing
- [ ] Message threading
- [ ] Status indicators (online, away, do not disturb)
- [ ] Screen sharing in calls

