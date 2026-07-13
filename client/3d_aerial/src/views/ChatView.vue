<script setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import ConfigurableIcon from '@shared/ConfigurableIcon.vue';
import { usePageRegistry } from '@shared-composables/usePageRegistry.js';

const { t } = useI18n();
const { registerPage, unregisterPage } = usePageRegistry();

const router = useRouter();

const sessions = ref([
  { id: 1, title: t('chatview.flight_plan_1'), preview: 'Adjust altitude to 120m', active: true },
  { id: 2, title: t('chatview.mission_control'), preview: 'Route confirmed', active: false },
  { id: 3, title: t('chatview.support'), preview: 'Camera gimbal calibration', active: false },
]);

const messages = ref([
  {
    id: 1,
    sender: 'system',
    text: t('chatview.connected'),
    time: '10:00 AM',
  },
  {
    id: 2,
    sender: 'user',
    text: t('chatview.patrol_request'),
    time: '10:02 AM',
  },
  {
    id: 3,
    sender: 'bot',
    text: t('chatview.patrol_response'),
    time: '10:02 AM',
  },
  {
    id: 4,
    sender: 'bot',
    image: 'https://placehold.co/400x200/3b82f6/ffffff?text=Route+Preview',
    text: '',
    time: '10:03 AM',
  },
]);

const input = ref('');
const messagesRef = ref(null);

function goBack() {
  router.push('/');
}

function selectSession(id) {
  sessions.value = sessions.value.map((s) => ({ ...s, active: s.id === id }));
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  messages.value.push({
    id: Date.now(),
    sender: 'user',
    text,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });
  input.value = '';

  await nextTick();
  scrollToBottom();

  // Simulated assistant reply
  setTimeout(() => {
    messages.value.push({
      id: Date.now() + 1,
      sender: 'bot',
      text: t('chatview.acknowledged'),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    nextTick().then(scrollToBottom);
  }, 800);
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function scrollToBottom() {
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
  }
}

onMounted(() => {
  registerPage({ id: 'aerial', nameKey: 'aerialview.page_aerial', route: '/' });
  registerPage({ id: 'map', nameKey: 'aerialview.page_map', route: '/map' });
  registerPage({ id: 'satellite', nameKey: 'aerialview.page_satellite', route: '/satellite' });
  registerPage({ id: 'chat', nameKey: 'aerialview.page_chat', route: '/chat' });
});

onUnmounted(() => {
  unregisterPage('aerial');
  unregisterPage('map');
  unregisterPage('satellite');
  unregisterPage('chat');
});
</script>

<template>
  <div class="chat">
    <!-- Left navigation / history panel -->
    <aside class="chat-sidebar">
      <div class="chat-sidebar-header">
        <button class="icon-btn" :title="t('chatview.back_to_dashboard')" @click="goBack">
          <ConfigurableIcon name="CHAT_BACK" :size="22" />
        </button>
        <h2 class="chat-sidebar-title">{{ t('chatview.conversations') }}</h2>
      </div>

      <div class="sessions">
        <button
          v-for="session in sessions"
          :key="session.id"
          class="session-item"
          :class="{ 'session-item--active': session.active }"
          @click="selectSession(session.id)"
        >
          <span class="session-title">{{ session.title }}</span>
          <span class="session-preview">{{ session.preview }}</span>
        </button>
      </div>
    </aside>

    <!-- Main chat area -->
    <main class="chat-main">
      <header class="chat-header">
        <h1 class="chat-header-title">{{ t('chatview.mission_control') }}</h1>
        <span class="chat-status">{{ t('chatview.online') }}</span>
      </header>

      <div ref="messagesRef" class="messages">
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="message-wrapper"
          :class="`message-wrapper--${msg.sender}`"
        >
          <div class="message-bubble" :class="`message-bubble--${msg.sender}`">
            <p v-if="msg.text" class="message-text">{{ msg.text }}</p>
            <img
              v-if="msg.image"
              :src="msg.image"
              alt="Shared image"
              class="message-image"
            />
            <span class="message-time">{{ msg.time }}</span>
          </div>
        </div>
      </div>

      <footer class="chat-inputbar">
        <button class="icon-btn" :title="t('chatview.attach_file')">
          <ConfigurableIcon name="CHAT_ATTACHMENT" :size="22" />
        </button>
        <textarea
          v-model="input"
          class="chat-input"
          :placeholder="t('chatview.type_a_message')"
          rows="1"
          @keydown="handleKeydown"
        />
        <button class="send-btn" :title="t('chatview.send')" @click="sendMessage">
          <ConfigurableIcon name="CHAT_SEND" :size="18" />
        </button>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  color: #1f2937;
  overflow: hidden;
  pointer-events: auto;
}

.chat-sidebar {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(229, 231, 235, 0.8);
  background: rgba(249, 250, 251, 0.85);
}

.chat-sidebar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.8);
}

.chat-sidebar-title {
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0;
}

.sessions {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
  width: 100%;
  text-align: left;
  padding: 14px 16px;
  border-radius: 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-item:hover {
  background: rgba(229, 231, 235, 0.6);
}

.session-item--active {
  background: rgba(59, 130, 246, 0.1);
}

.session-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: #111827;
}

.session-preview {
  font-size: 0.8rem;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.8);
  background: rgba(255, 255, 255, 0.7);
}

.chat-header-title {
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0;
}

.chat-status {
  font-size: 0.75rem;
  font-weight: 600;
  color: #16a34a;
  display: flex;
  align-items: center;
  gap: 6px;
}

.chat-status::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-wrapper {
  display: flex;
  width: 100%;
}

.message-wrapper--user {
  justify-content: flex-end;
}

.message-wrapper--bot,
.message-wrapper--system {
  justify-content: flex-start;
}

.message-bubble {
  max-width: 60%;
  padding: 12px 16px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message-bubble--user {
  background: #3b82f6;
  color: white;
  border-bottom-right-radius: 4px;
}

.message-bubble--bot {
  background: #f3f4f6;
  color: #1f2937;
  border-bottom-left-radius: 4px;
}

.message-bubble--system {
  background: #dbeafe;
  color: #1e40af;
  border-radius: 999px;
  padding: 8px 16px;
  max-width: max-content;
  margin: 0 auto;
}

.message-text {
  margin: 0;
  line-height: 1.5;
  font-size: 0.95rem;
}

.message-image {
  max-width: 100%;
  max-height: 240px;
  border-radius: 10px;
  object-fit: cover;
}

.message-time {
  font-size: 0.7rem;
  opacity: 0.7;
  align-self: flex-end;
}

.chat-inputbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid rgba(229, 231, 235, 0.8);
  background: rgba(255, 255, 255, 0.7);
}

.chat-input {
  flex: 1;
  resize: none;
  padding: 12px 18px;
  border-radius: 24px;
  border: 1px solid rgba(209, 213, 219, 0.8);
  background: #f9fafb;
  font-size: 0.95rem;
  line-height: 1.4;
  outline: none;
  min-height: 24px;
  max-height: 120px;
}

.chat-input:focus {
  border-color: #3b82f6;
  background: white;
}

.icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(209, 213, 219, 0.8);
  background: white;
  color: #4b5563;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease;
  flex-shrink: 0;
}

.icon-btn:hover {
  background: #f3f4f6;
}

.send-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: #3b82f6;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease;
  flex-shrink: 0;
}

.send-btn:hover {
  background: #2563eb;
}

@media (max-width: 768px) {
  .chat-sidebar {
    width: 240px;
  }

  .message-bubble {
    max-width: 80%;
  }
}
</style>
