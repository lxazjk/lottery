<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(path, i) in paths" :key="i" :d="path" />
  </svg>
</template>
<script setup>
import { computed } from "vue";
const props = defineProps({ name: String });
const icons = {
  sparkle: ["M12 2 14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5Z"],
  crown: ["m3 7 4.5 4L12 4l4.5 7L21 7l-2 12H5Z", "M7 22h10"],
  trophy: [
    "M8 3h8v7a4 4 0 0 1-8 0Z",
    "M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 14v6m-4 1h8",
  ],
  medal: [
    "M8 3H4l5 8m7-8h4l-5 8",
    "M16 3H8l4 8",
    "M17 16a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z",
  ],
  star: [
    "m12 3 2.8 5.7L21 9.6 16.5 14l1.1 6.2L12 17.3l-5.6 2.9L7.5 14 3 9.6l6.2-.9Z",
  ],
  arrow: ["M5 12h14m-5-5 5 5-5 5"],
  play: ["m9 5 10 7-10 7Z"],
  gift: [
    "M3 8h18v4H3ZM5 12v9h14v-9M12 8v13",
    "M12 8H8.5A2.5 2.5 0 1 1 11 5.5L12 8Zm0 0h3.5A2.5 2.5 0 1 0 13 5.5L12 8Z",
  ],
  stop: ["M6 6h12v12H6Z"],
  list: ["M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"],
  music: [
    "M9 18V5l12-2v13M9 8l12-2",
    "M9 18c0 1.7-1.6 3-3.5 3S2 20 2 18.5 3.6 16 5.5 16 9 16.7 9 18Zm12-2c0 1.7-1.6 3-3.5 3S14 18 14 16.5s1.6-2.5 3.5-2.5 3.5.7 3.5 2Z",
  ],
  mute: ["M9 5 5 9H2v6h3l4 4Zm6 4 6 6m0-6-6 6"],
  full: ["M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"],
  close: ["m6 6 12 12M18 6 6 18"],
  download: ["M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"],
  reset: ["M3 10a9 9 0 1 1 1 7M3 4v6h6"],
  check: ["m5 12 4 4L19 6"],
  shield: ["M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7Z", "m8 12 3 3 5-6"],
};
const paths = computed(() => icons[props.name] || icons.sparkle);
</script>
