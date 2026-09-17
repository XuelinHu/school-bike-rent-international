<template>
  <!-- 悬浮球：只对登录用户显示（后端 /ai/chat 也要求登录，露出来只会让人点了吃 401） -->
  <button
    v-if="auth.user"
    class="chat-ball"
    type="button"
    :aria-label="t('aiTitle')"
    @click="ai.open ? ai.closePanel() : ai.openPanel()"
  >
    <span class="chat-ball-icon">{{ ai.open ? '×' : '💬' }}</span>
  </button>

  <Teleport to="body">
    <section v-if="ai.open && auth.user" class="chat-panel" role="dialog" aria-modal="false">
      <header class="chat-head">
        <strong>{{ t('aiTitle') }}</strong>

        <select
          class="chat-model"
          :value="ai.model"
          :disabled="ai.streaming"
          :title="t('aiModel')"
          @change="ai.setModel($event.target.value)"
        >
          <option v-if="!ai.flatModels.length" value="">{{ t('aiNoModel') }}</option>
          <optgroup v-for="g in ai.groups" :key="g.id" :label="g.label">
            <option v-for="m in g.models" :key="m.id" :value="m.id">{{ label(m) }}</option>
          </optgroup>
        </select>

        <!-- 语音对话开关。不支持的环境（公网 HTTP 入口）这里置灰，title 里说明原因，
             而不是让用户点了没反应 -->
        <button
          class="chat-icon-btn"
          type="button"
          :class="{ active: dialogOn, disabled: !voiceReady }"
          :disabled="!voiceReady"
          :title="voiceReady ? t('aiDialog') : t(voiceBlockReason)"
          @click="toggleDialog"
        >{{ dialogOn ? '🎙' : '🎤' }}</button>

        <button
          class="chat-icon-btn"
          type="button"
          :class="{ active: ai.voiceEnabled }"
          :title="t('aiVoice')"
          @click="toggleVoice"
        >{{ ai.voiceEnabled ? '🔊' : '🔇' }}</button>

        <button class="chat-icon-btn" type="button" :title="t('aiClear')" @click="ai.reset()">🗑</button>
        <button class="chat-icon-btn" type="button" :title="t('close')" @click="ai.closePanel()">×</button>
      </header>

      <div ref="listEl" class="chat-body">
        <!-- 目录拉不到（后端没起/未登录）时要说出来，否则下拉是空的、用户不知道为什么 -->
        <p v-if="ai.catalogError" class="chat-note err">{{ t('aiFailed') }}</p>
        <p v-if="ai.error" class="chat-note err">{{ t(ai.error) }}</p>
        <p v-if="voiceError" class="chat-note err">{{ t(voiceError) }}</p>

        <!-- 对话状态条：麦克风开着却看不出在听还是在想，用户会以为坏了 -->
        <div v-if="dialogOn" class="chat-voice">
          <span class="chat-mic-dot" :class="voiceState"></span>
          <span>{{ t(voiceStateKey) }}</span>
        </div>

        <!-- 空状态：告诉用户这个助手能干什么，而不是干瞪眼一个输入框 -->
        <div v-if="!ai.messages.length" class="chat-empty">
          <p class="muted">{{ t('aiIntro') }}</p>
          <ul class="chat-caps">
            <li v-for="c in ai.capabilities" :key="c">{{ c }}</li>
          </ul>
          <div class="chat-suggests">
            <button
              v-for="s in suggestions"
              :key="s"
              class="chat-suggest"
              type="button"
              @click="ai.send(s)"
            >{{ s }}</button>
          </div>
        </div>

        <div
          v-for="(m, i) in ai.messages"
          :key="i"
          class="chat-msg"
          :class="m.role"
        >
          <div class="chat-bubble">
            <!-- 工具调用做成一枚小 chip，用户能看出"它在查库"而不是"它在瞎编" -->
            <div v-if="m.tools?.length" class="chat-tools">
              <span
                v-for="(tool, ti) in m.tools"
                :key="ti"
                class="chat-tool"
                :class="{ failed: tool.done && !tool.ok }"
              >
                {{ tool.done ? (tool.ok ? '✓' : '✕') : '⋯' }} {{ t('tool_' + tool.name) }}
              </span>
            </div>

            <p v-if="m.content" class="chat-text">{{ m.content }}</p>
            <p v-if="m.stopped" class="chat-note muted">{{ t('aiStopped') }}</p>
            <!-- m.error 要么是 i18n key（aiFailed…），要么是后端给的原话。
                 t() 查不到时会原样回显 key，所以两种都能正确显示，不用分支 -->
            <p v-if="m.error" class="chat-note err">{{ t(m.error) }}</p>
          </div>
        </div>

        <!-- 等首 token：模型冷加载要几十秒，必须把"等了多久"摆出来 -->
        <div v-if="waiting" class="chat-waiting muted">
          <span class="chat-dots"><i></i><i></i><i></i></span>
          {{ ai.status === 'connecting' ? t('aiConnecting') : t('aiThinking') }}
          <template v-if="ai.waited >= 3">（{{ ai.waited }}s）</template>
        </div>
      </div>

      <footer class="chat-foot">
        <textarea
          ref="inputEl"
          v-model="draft"
          class="chat-input"
          rows="1"
          :placeholder="t('aiPlaceholder')"
          :disabled="ai.streaming"
          @keydown.enter.exact.prevent="submit"
        ></textarea>
        <button
          v-if="ai.streaming"
          class="btn chat-send stop"
          type="button"
          @click="ai.stop()"
        >{{ t('aiStop') }}</button>
        <button
          v-else
          class="btn chat-send"
          type="button"
          :disabled="!draft.trim()"
          @click="submit"
        >{{ t('aiSend') }}</button>
      </footer>
    </section>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { aiStore as ai } from '../stores/ai.js';
import { authStore as auth } from '../stores/auth.js';
import { t } from '../i18n/index.js';
import { speak, stopSpeaking, capabilities } from '../services/voice.js';
import { createDialogController, bindBridgeCallbacks } from '../services/dialog.js';

const draft = ref('');
const listEl = ref(null);
const inputEl = ref(null);

const waiting = computed(() => ai.status === 'connecting' || ai.status === 'waiting');

// ── 语音对话 ──
const caps = capabilities();
const voiceReady = caps.stt;
const dialogOn = ref(false);
/** 当前对话状态，用于按钮高亮与状态提示 */
const voiceState = ref('idle');
const voiceError = ref('');
/** 懒创建：没点开麦克风就没必要碰 SpeechRecognition，也不注册桥回调 */
let dialog = null;

const voiceBlockReason = computed(() => (
  caps.reason === 'insecure-context' ? 'voiceInsecure' : 'voiceNoSR'
));

/** 'listening' → 'voiceListening'，与 dialog.js 的 stateKey 规则保持一致 */
const voiceStateKey = computed(
  () => 'voice' + voiceState.value.charAt(0).toUpperCase() + voiceState.value.slice(1)
);

function ensureDialog() {
  if (dialog) return dialog;
  dialog = createDialogController({
    onTranscript: (text) => {
      // 识别出来直接走正常问答链路：用户消息上屏、流式回答、工具 chip 全都复用
      ai.send(text);
      dialog.thinking();
    },
    onState: (s) => { voiceState.value = s; },
    onError: (code) => {
      voiceError.value = code === 'too-many-restarts' ? 'voiceTooManyRestarts' : 'voiceFailed';
      dialogOn.value = false;
    }
  });
  bindBridgeCallbacks(dialog);
  return dialog;
}

function toggleDialog() {
  if (dialogOn.value) {
    dialog?.stop();
    dialogOn.value = false;
    return;
  }
  voiceError.value = '';
  // 语音对话天然需要把回答念出来，否则用户只能盯着屏幕 —— 自动把播报打开
  if (!ai.voiceEnabled) ai.setVoice(true);
  ensureDialog().start();
  dialogOn.value = true;
}

/** 模型下拉里显示短名字：qwen3:14b 而不是 ollama:qwen3:14b */
function label(m) {
  return m.label || m.name || m.id;
}

const suggestions = computed(() => {
  const zh = (localStorage.getItem('lang') || 'zh-CN') === 'zh-CN';
  return zh
    ? ['租一辆车要多少钱？', '现在哪些站点有车？', '我的当前订单是什么？']
    : ['How much does renting cost?', 'Which stations have bikes now?', 'What is my current order?'];
});

function submit() {
  const text = draft.value.trim();
  if (!text || ai.streaming) return;
  draft.value = '';
  ai.send(text);
}

function toggleVoice() {
  ai.setVoice(!ai.voiceEnabled);
  // 关掉开关时把正在念的立刻掐掉，否则会出现"明明关了还在念"
  if (!ai.voiceEnabled) stopSpeaking();
}

/** 每次消息变化都滚到底；用 nextTick 是因为要等 DOM 把新内容渲染出来 */
watch(
  () => ai.messages.map((m) => m.content.length).join(',') + '|' + ai.messages.length,
  async () => {
    await nextTick();
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
  }
);

/**
 * 语音播报：只播**最后一条助手消息**，且必须等这一轮真的结束（status 回到 ''）。
 * 不能边流边播——分片是半句话，逐片朗读会念成一堆断句。
 */
watch(
  () => ai.status,
  (now, before) => {
    if (now || !before) return;
    const last = ai.messages[ai.messages.length - 1];

    // 语音对话中这一轮失败了：不能继续听。停在 listening 会让用户对着一个
    // 永远不会回答的助手反复说话，不如直接退出对话并给出提示。
    if (last?.role === 'assistant' && (last.error || !last.content)) {
      if (dialogOn.value) {
        voiceError.value = 'voiceFailed';
        dialog?.fail();
        dialogOn.value = false;
      }
      return;
    }

    if (!ai.voiceEnabled) return;
    if (last?.role !== 'assistant') return;
    // 对话中交给状态机（它要等念完再开麦，且是句子级边流边念）；
    // 非对话状态下直接整段念，没有开麦的时序问题
    if (dialogOn.value) dialog?.finish(last.content || '');
    else if (last.content) speak(last.content);
  }
);

/**
 * 语音对话里边流边念：每多一个字就喂给状态机，它攒够一个完整句就开口。
 * 不这么做的话，这台机器上要听完 20 秒的静默才开始出声 —— 语音场景里用户
 * 没有文字可看，"安静"和"卡死"是分不出来的。
 */
watch(
  () => ai.messages[ai.messages.length - 1]?.content || '',
  (text) => {
    if (!dialogOn.value || !text) return;
    dialog?.feed(text);
  }
);

// 关掉面板必须停掉麦克风。热着麦克风而界面不可见是最不能接受的隐私问题
watch(
  () => ai.open,
  (open) => {
    if (!open && dialogOn.value) {
      dialog?.stop();
      dialogOn.value = false;
    }
  }
);

// 清空会话 = 结束这轮对话，否则状态机会停在一个再也等不到回答的 thinking 上
watch(
  () => ai.messages.length,
  (len) => {
    if (!len && dialogOn.value) {
      dialog?.stop();
      dialogOn.value = false;
    }
  }
);

watch(
  () => ai.open,
  async (open) => {
    if (open) {
      await nextTick();
      inputEl.value?.focus();
    }
  }
);

// 语音能力只在开发期提示一次，避免控制台噪音；真正的降级在 services/voice.js 里
if (import.meta.env.DEV && !capabilities().tts) {
  console.info('[ai] 本环境不支持语音合成，语音播报会自动降级为静默');
}
</script>
