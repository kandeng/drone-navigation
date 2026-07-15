<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import DockButton from './DockButton.vue';
import PageMenu from './PageMenu.vue';
import { useWaypointPicker } from '@shared-composables/useWaypointPicker.js';

const props = defineProps({
  icon: { type: String, required: true },
  title: { type: String, default: '' },
  titleKey: { type: String, default: '' },
  pages: { type: Array, default: () => [] },
  onBeforeOpen: { type: Function, default: null },
});

const emit = defineEmits(['navigate']);

const isOpen = ref(false);
const wrapperRef = ref(null);

const { stopPicking, closePanel } = useWaypointPicker();

function toggleMenu() {
  if (!isOpen.value) {
    if (props.onBeforeOpen) {
      props.onBeforeOpen();
    }
    // Opening the page menu cancels waypoint picking and hides the waypoint panel.
    stopPicking();
    closePanel();
  }
  isOpen.value = !isOpen.value;
}

function handleClickOutside(e) {
  if (wrapperRef.value && !wrapperRef.value.contains(e.target)) {
    isOpen.value = false;
  }
}

function handleNavigate(page) {
  isOpen.value = false;
  emit('navigate', page);
}

onMounted(() => {
  document.addEventListener('pointerdown', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleClickOutside);
});
</script>

<template>
  <div ref="wrapperRef" class="dock-menu-wrapper">
    <DockButton
      :icon="icon"
      :title="title"
      :title-key="titleKey"
      :active="isOpen"
      @click="toggleMenu"
    />
    <Transition name="menu-fade">
      <PageMenu
        v-if="isOpen"
        :pages="pages"
        @navigate="handleNavigate"
      />
    </Transition>
  </div>
</template>

<style scoped>
.dock-menu-wrapper {
  position: relative;
}

.dock-menu-wrapper > :deep(.page-menu) {
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  z-index: 100;
}

.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 0.15s ease;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
}
</style>
