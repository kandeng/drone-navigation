import { createRouter, createWebHistory } from 'vue-router';
import AerialView from '@/views/AerialView.vue';
import Map2DView from '@/views/Map2DView.vue';
import Satellite2DView from '@/views/Satellite2DView.vue';
import ChatView from '@/views/ChatView.vue';

const routes = [
  {
    path: '/',
    name: 'Aerial',
    component: AerialView,
  },
  {
    path: '/map',
    name: 'Map2D',
    component: Map2DView,
  },
  {
    path: '/satellite',
    name: 'Satellite2D',
    component: Satellite2DView,
  },
  {
    path: '/chat',
    name: 'Chat',
    component: ChatView,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
