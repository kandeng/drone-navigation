<script setup>
import { RouterView } from 'vue-router';
</script>

<template>
  <RouterView />
</template>

<style>
/* Reset that keeps the Vue overlay and Cesium canvas aligned. */
#app {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none; /* let the active view decide where it captures input */
  font-family: Calibri, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
</style>
