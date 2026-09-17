<template>
  <Teleport to="body">
    <div v-if="open" class="modal-mask" @click.self="onMaskClick">
      <div class="modal" :style="{ maxWidth: width }" role="dialog" aria-modal="true">
        <header class="modal-head">
          <h3>{{ title }}</h3>
          <button class="modal-x" type="button" :aria-label="t('close')" @click="close">×</button>
        </header>

        <div class="modal-body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="modal-foot">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { watch, onBeforeUnmount } from 'vue';
import { t } from '../i18n/index.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: String, default: '480px' },
  closeOnMask: { type: Boolean, default: true }
});
const emit = defineEmits(['close']);

function close() {
  emit('close');
}

function onMaskClick() {
  if (props.closeOnMask) close();
}

function onKeydown(e) {
  if (e.key === 'Escape') close();
}

/**
 * 打开时锁背景滚动并监听 ESC。
 * 必须在这里手动加/移除 document 上的监听：Teleport 出去的节点不在组件树内，
 * 靠事件冒泡拿不到 ESC。同时组件卸载时要摘掉，否则弹框销毁后 ESC 仍然响应。
 */
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKeydown);
    document.body.style.overflow = 'hidden';
  } else {
    document.removeEventListener('keydown', onKeydown);
    document.body.style.overflow = '';
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';
});
</script>
