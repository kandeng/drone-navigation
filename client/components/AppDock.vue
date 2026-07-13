<script setup>
import DockButton from './DockButton.vue';

const props = defineProps({
  position: {
    type: String,
    default: 'left',
    validator: (value) => ['left', 'right'].includes(value),
  },
  items: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['itemClick']);

function handleItemClick(item) {
  if (item.disabled) return;
  if (typeof item.onClick === 'function') {
    item.onClick();
  }
  emit('itemClick', item.id);
}
</script>

<template>
  <aside
    class="app-dock"
    :class="position === 'left' ? 'app-dock--left' : 'app-dock--right'"
  >
    <div class="app-dock__inner">
      <DockButton
        v-for="item in items"
        :key="item.id"
        :icon="item.icon"
        :title="item.title"
        :active="item.active"
        :disabled="item.disabled"
        @click="handleItemClick(item)"
      />
    </div>
  </aside>
</template>

<style scoped>
.app-dock {
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 72px;
  padding: 8px 0;
  z-index: 10;
  pointer-events: auto;
}

.app-dock--left {
  align-items: flex-start;
}

.app-dock--right {
  align-items: flex-end;
}

.app-dock__inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

@media (max-width: 768px) {
  .app-dock {
    width: 56px;
  }
}
</style>
